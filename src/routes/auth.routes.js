// auth.routes.js
import express from "express";
import {
  initiateRegister,
  verifyAndRegister,
  login,
  forgotPassword,
  resetPassword,
  googleAuthController,
} from "../controllers/authController.js";

const router = express.Router();

router.post("/initiate-register", initiateRegister);
router.post("/verify-register", verifyAndRegister);
router.post("/login", login);

router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

router.get("/google", googleAuthController.getGoogleAuthURL);
router.get("/google/callback", googleAuthController.handleGoogleCallback);
router.post("/google/verify", googleAuthController.verifyGoogleToken);
export default router;
