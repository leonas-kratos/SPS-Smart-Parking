import mongoose from "mongoose";

const sensorStateSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: String },
});

export default mongoose.model("SensorState", sensorStateSchema);
