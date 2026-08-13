import mongoose from "mongoose";

const vehicleLogSchema = new mongoose.Schema(
  {
    vehicleId: { type: String, required: true },  // RFID ID
    type: { type: String, enum: ["in", "out"] },
    slot: { type: String },
    date: { type: String },      // "dd/mm/yyyy"
    checkin: { type: String },   // "hh:mm:ss"
    checkout: { type: String, default: null },
    price: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("VehicleLog", vehicleLogSchema);
