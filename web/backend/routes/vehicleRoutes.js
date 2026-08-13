import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { getVehicleLogs, getCurrentLog, getRevenue } from "../controllers/vehicleController.js";

const router = Router();
router.use(authenticate);

router.get("/", getVehicleLogs);               // lịch sử (admin: tất cả, customer: của mình)
router.get("/revenue", getRevenue);            // doanh thu 7 ngày (admin)
router.get("/current/:vehicleId", getCurrentLog); // trạng thái hiện tại

export default router;
