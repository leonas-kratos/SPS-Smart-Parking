import jwt from "jsonwebtoken";
import User from "../models/User.js";

// POST /api/auth/login
export async function login(req, res) {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ message: "Missing credentials" });

  const user = await User.findOne({ username });
  if (!user) return res.status(401).json({ message: "Invalid account" });

  const match = await user.comparePassword(password);
  if (!match) return res.status(401).json({ message: "Invalid password" });

  const token = jwt.sign(
    { id: user._id, role: user.role, vehicleId: user.vehicleId },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );

  res.json({
    token,
    role: user.role,
    username: user.username,
    vehicleId: user.vehicleId,
    vehicleNumber: user.vehicleNumber,
  });
}

// POST /api/auth/seed  (chỉ dùng lần đầu để tạo tài khoản mẫu)
export async function seed(req, res) {
  const users = [
    { username: "admin",             password: "0",   role: "admin" },
    { username: "Customer_579B8125", password: "5",   role: "customer", vehicleId: "579B8125", vehicleNumber: "Number_579B8125" },
    { username: "Customer_1A022F35", password: "1",   role: "customer", vehicleId: "1A022F35", vehicleNumber: "Number_1A022F35" },
    { username: "Customer_C7CEF2A2", password: "C",   role: "customer", vehicleId: "C7CEF2A2", vehicleNumber: "Number_C7CEF2A2" },
    { username: "Customer_07006DA3", password: "0",   role: "customer", vehicleId: "07006DA3", vehicleNumber: "Number_07006DA3" },
    { username: "Customer_A",        password: "a",   role: "customer", vehicleId: "A",        vehicleNumber: "Number_A" },
  ];

  await User.deleteMany({});
  for (const u of users) {
    const user = new User(u);
    await user.save();
  }
  res.json({ message: "Seeded successfully" });
}
