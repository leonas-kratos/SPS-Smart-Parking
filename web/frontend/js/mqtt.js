// ============================================================
// mqtt.js â€“ Real-time updates qua MQTT (browser WebSocket)
// Frontend váº«n subscribe MQTT Ä‘á»ƒ cáº­p nháº­t UI ngay láº­p tá»©c.
// Backend láº¯ng nghe MQTT Ä‘á»™c láº­p Ä‘á»ƒ lÆ°u DB.
// ============================================================
import { currentUser } from "./auth.js";
import { updateSlotsUI, updateWarnings, updateCurrentInfo, updateCameraSlot } from "./ui.js";
import { MQTT_WEBSOCKET_URL, MQTT_USERNAME, MQTT_PASSWORD } from "./config.js";

const SLOT_MAP = ["A1", "A2", "A3", "A4"];

const mqttOptions = {
  username: MQTT_USERNAME,
  password: MQTT_PASSWORD,
};
const mqttUrl = MQTT_WEBSOCKET_URL;

export const mqttClient = mqtt.connect(mqttUrl, mqttOptions);

mqttClient.on("connect", () => {
  console.log("Frontend MQTT connected");
  mqttClient.subscribe("parking/slots");
  mqttClient.subscribe("camera/slots");
  mqttClient.subscribe("parking/rfid");
  mqttClient.subscribe("warning/gas");
});

mqttClient.on("message", (topic, message) => {
  try {
    const data = JSON.parse(message.toString());

    if (topic === "parking/slots") {
      updateSlotsUI(data);
    }

    if (topic === "camera/slots") {
      updateCameraSlot(data);
    }
  
    if (topic === "parking/rfid") {
      // Cáº­p nháº­t UI náº¿u lÃ  user Ä‘ang Ä‘Äƒng nháº­p
      if (currentUser?.vehicleId && data.id === currentUser.vehicleId) {
        updateCurrentInfo(data);
      }
    }

    if (topic === "warning/gas") {
      updateWarnings(data);
    }
  } catch (err) {
    console.error("MQTT parse error:", err);
  }
});

// Publish booking (khÃ´ng Ä‘á»•i so vá»›i script_test.js)
export function publishBook(vehicleId, slotIndex, bookType) {
  mqttClient.publish(
    "parking/book",
    JSON.stringify({ id: vehicleId, slot: slotIndex, bookType })
  );
}

