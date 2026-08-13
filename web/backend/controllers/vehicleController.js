import VehicleLog from "../models/VehicleLog.js";
import User from "../models/User.js";

// Hàm tính giá (giống frontend)
function calculatePrice(checkin, checkout) {
  if (!checkin || !checkout) return 0;
  const [inH, inM, inS] = checkin.split(":").map(Number);
  const [outH, outM, outS] = checkout.split(":").map(Number);
  let diff = (outH + outM / 60 + outS / 3600) - (inH + inM / 60 + inS / 3600);
  if (diff < 0) diff += 24;
  // if (diff <= 0.05) return 0;
  if (diff <= 2) return 5000;
  if (diff <= 6) return 8000;
  return 12000;
}

const slotMap = ["A1", "A2", "A3", "A4"];

// GET /api/vehicles  (admin: tất cả | customer: chỉ của mình)
export async function getVehicleLogs(req, res) {
  const { date, vehicleId } = req.query;
  const filter = { checkout: { $ne: null } };

  if (req.user.role !== "admin") {
    filter.vehicleId = req.user.vehicleId;
  } else if (vehicleId) {
    filter.vehicleId = vehicleId;
  }

  if (date) filter.date = date; // "dd/mm/yyyy"

  const logs = await VehicleLog.find(filter).sort({ createdAt: -1 });

  // Enrich với thông tin user
  const users = await User.find({ role: "customer" });
  const idToUser = {};
  users.forEach((u) => { idToUser[u.vehicleId] = u; });

  const result = logs.map((log) => {
    const user = idToUser[log.vehicleId];
    const slotLabel = !isNaN(parseInt(log.slot)) ? slotMap[parseInt(log.slot)] : log.slot || "--";
    const price = log.price || calculatePrice(log.checkin, log.checkout);
    return {
      _id: log._id,
      vehicleId: log.vehicleId,
      name: user?.username || log.vehicleId,
      vehicleNumber: user?.vehicleNumber || "--",
      slot: slotLabel,
      date: log.date || "--",
      checkin: log.checkin || "--",
      checkout: log.checkout || "--",
      price,
    };
  });

  res.json(result);
}

// GET /api/vehicles/current/:vehicleId  - lấy trạng thái hiện tại (chưa checkout)
export async function getCurrentLog(req, res) {
  const { vehicleId } = req.params;

  // Chỉ cho xem của chính mình hoặc admin
  if (req.user.role !== "admin" && req.user.vehicleId !== vehicleId) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const log = await VehicleLog.findOne({
    vehicleId,
    checkout: null,
  }).sort({ createdAt: -1 });

  if (!log) return res.json(null);

  const slotLabel = !isNaN(parseInt(log.slot)) ? slotMap[parseInt(log.slot)] : log.slot || "--";
  res.json({ ...log.toObject(), slot: slotLabel });
}

// GET /api/vehicles/revenue  - doanh thu 7 ngày (admin only)
export async function getRevenue(req, res) {
  if (req.user.role !== "admin")
    return res.status(403).json({ message: "Forbidden" });

  const result = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const day   = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year  = d.getFullYear();
    const dateStr = `${day}/${month}/${year}`;

    const logs = await VehicleLog.find({ date: dateStr, checkout: { $ne: null } });
    const total = logs.reduce((sum, l) => {
      const price = l.price || calculatePrice(l.checkin, l.checkout);
      return sum + price;
    }, 0);
    result.push({ date: `${day}/${month}`, total });
  }
  res.json(result);
}
