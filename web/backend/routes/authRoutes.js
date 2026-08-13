import { Router } from "express";
import { login, seed } from "../controllers/authController.js";

const router = Router();
router.post("/login", login);
router.post("/seed", seed); // chỉ dùng lần đầu

export default router;
