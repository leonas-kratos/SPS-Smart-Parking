import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { getStatus } from "../controllers/sensorController.js";

const router = Router();
router.get("/status", authenticate, getStatus);

export default router;
