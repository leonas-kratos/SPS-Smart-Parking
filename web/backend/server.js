import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import { startMqttClient } from "./config/mqtt.js";
import authRoutes from "./routes/authRoutes.js";
import vehicleRoutes from "./routes/vehicleRoutes.js";
import sensorRoutes from "./routes/sensorRoutes.js";

const app = express();

app.use(cors());
app.use(express.json());

// Serve frontend tĩnh (optional - nếu muốn dùng 1 server)
// import path from "path";
// app.use(express.static(path.join(process.cwd(), "../frontend")));

app.use("/api/auth", authRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/sensors", sensorRoutes);

// Kết nối DB và khởi động server
connectDB().then(() => {
  app.listen(process.env.PORT || 5000, () => {
    console.log(`Server running on port ${process.env.PORT || 5000}`);
  });
  startMqttClient(); // Bắt đầu lắng nghe MQTT trên backend
});
