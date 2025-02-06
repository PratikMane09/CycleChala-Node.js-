// src/routes/product.routes.js
import express from "express";
import multer from "multer";
import { productController } from "../controllers/productController";
import { auth, checkRole } from "../middleware";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post(
  "/products",
  auth,
  checkRole(["admin"]),
  upload.array("images", 5),
  productController.create
);

router.put(
  "/products/:id",
  auth,
  checkRole(["admin"]),
  upload.array("images", 5),
  productController.update
);

export default router;
