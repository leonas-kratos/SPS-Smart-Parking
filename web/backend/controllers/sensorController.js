import { parkingState } from "../config/mqtt.js";
import SensorState from "../models/SensorState.js";

// GET /api/sensors/status - trả về trạng thái parking hiện tại
export async function getStatus(req, res) {
  // Lấy gas/flood từ DB nếu parkingState chưa được cập nhật (server mới restart)
  if (parkingState.gasStatus === "No gas" || parkingState.floodStatus === "No flood") {
    const [gas, flood] = await Promise.all([
      SensorState.findOne({ key: "gasStatus" }),
      SensorState.findOne({ key: "floodStatus" }),
    ]);
    if (gas) parkingState.gasStatus = gas.value;
    if (flood) parkingState.floodStatus = flood.value;
  }

  res.json({
    slots: parkingState.slots,
    isFull: parkingState.isFull,
    gasStatus: parkingState.gasStatus,
    floodStatus: parkingState.floodStatus,
  });
}
