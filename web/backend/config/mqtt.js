import mqtt from "mqtt";
import VehicleLog from "../models/VehicleLog.js";
import SensorState from "../models/SensorState.js";

// Trạng thái parking lưu trong bộ nhớ (RAM) để trả API nhanh
export const parkingState = {
  slots: [],         // [{ id, isOccupied, isBookedWeb, bookId }]
  isFull: false,
  gasStatus: "No gas",
  floodStatus: "No flood",
};

export function startMqttClient() {
  const client = mqtt.connect(process.env.MQTT_URL, {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
  });

  client.on("connect", () => {
    console.log("Backend MQTT connected");
    client.subscribe(["parking/slots", "parking/rfid", "warning/gas", "warning/flood"]);
  });

  client.on("message", async (topic, message) => {
    try {
      const data = JSON.parse(message.toString());

      // --- Cập nhật trạng thái slot ---
      if (topic === "parking/slots") {
        if (data.slots) {
          parkingState.slots = data.slots;
          parkingState.isFull = data.slots.every((s) => s.isOccupied);
        }
      }

      // --- Lưu log check-in / check-out vào MongoDB ---
      if (topic === "parking/rfid" && data.id) {
        if (data.type === "in") {
          // Tạo log mới khi xe vào
          await VehicleLog.create({
            vehicleId: data.id,
            type: "in",
            slot: data.slot !== undefined ? String(data.slot) : null,
            date: data.date,
            checkin: data.checkin,
          });
        } else if (data.type === "out") {
          // Cập nhật log gần nhất của xe này (chưa có checkout)
          const log = await VehicleLog.findOne({
            vehicleId: data.id,
            type: "in",
            checkout: null,
          }).sort({ createdAt: -1 });

          if (log) {
            log.type = "out";
            log.checkout = data.checkout;
            if (data.price !== undefined) log.price = data.price;
            await log.save();
          } else {
            // Fallback: tạo log out mới nếu không tìm thấy log in
            await VehicleLog.create({
              vehicleId: data.id,
              type: "out",
              slot: data.slot !== undefined ? String(data.slot) : null,
              date: data.date,
              checkin: data.checkin,
              checkout: data.checkout,
              price: data.price || 0,
            });
          }
        }
      }

      // --- Cập nhật trạng thái cảnh báo ---
      if (topic === "warning/gas") {
        parkingState.gasStatus = data.warning || "No gas";
        await SensorState.findOneAndUpdate(
          { key: "gasStatus" },
          { value: data.warning },
          { upsert: true }
        );
      }

      if (topic === "warning/flood") {
        parkingState.floodStatus = data.warning || "No flood";
        await SensorState.findOneAndUpdate(
          { key: "floodStatus" },
          { value: data.warning },
          { upsert: true }
        );
      }
    } catch (err) {
      console.error("MQTT message error:", err.message);
    }
  });

  client.on("error", (err) => {
    console.error("MQTT error:", err.message);
  });

  return client;
}
