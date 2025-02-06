// src/routes/category.routes.js
import express from "express";
import multer from "multer";
import { categoryController } from "../controllers/categoryController";
import { auth, checkRole } from "../middleware";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post(
  "/categories",
  auth,
  checkRole(["admin"]),
  upload.single("image"),
  categoryController.create
);

router.put(
  "/categories/:id",
  auth,
  checkRole(["admin"]),
  upload.single("image"),
  categoryController.update
);

router.get("/categories", categoryController.list);

export default router;
