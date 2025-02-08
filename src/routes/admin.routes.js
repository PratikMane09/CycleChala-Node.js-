import express from "express";
import { auth } from "../middleware/auth.js";
import { checkRole } from "../middleware/roleCheck.js";
// import { adminController } from "../controllers/adminController.js";
import multer from "multer";
import { categoryController } from "../controllers/categoryController.js";
import { productController } from "../controllers/productController.js";
import { orderController } from "../controllers/orderController.js";
import { reviewController } from "../controllers/reviewController.js";
import { adminController } from "../controllers/adminController.js";
// import { upload } from "../middleware/upload.js";
const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();
const adminOnly = [auth, checkRole(["admin"])];
// Cache Middleware
const cacheMiddleware = (duration) => {
  return (req, res, next) => {
    // Convert duration to seconds for header
    res.set("Cache-Control", `public, max-age=${duration}`);
    next();
  };
};

// Memory cache implementation (for development/testing)
const cache = new Map();

const memoryCache = (duration) => {
  return (req, res, next) => {
    const key = req.originalUrl;
    const cachedResponse = cache.get(key);

    if (cachedResponse) {
      const { data, timestamp } = cachedResponse;
      if (Date.now() - timestamp < duration * 1000) {
        return res.json(data);
      }
      cache.delete(key);
    }

    // Store the original res.json function
    const originalJson = res.json.bind(res);

    // Override res.json to cache the response
    res.json = (data) => {
      cache.set(key, {
        data,
        timestamp: Date.now(),
      });
      return originalJson(data);
    };

    next();
  };
};

// Product Routes
router.get("/products", adminController.getAdminProducts);
router.get(
  "/products/:slug",
  memoryCache(300), // Cache for 5 minutes
  productController.getProductDetails
);
// router.get("/products/:id", productController.getProduct);
router.post(
  "/products",
  [...adminOnly, upload.array("images")],
  productController.createProduct
);
router.put(
  "/products/:id",
  [...adminOnly, upload.array("images")],
  productController.updateProduct
);
router.delete("/products/:id", adminOnly, productController.deleteProduct);

// Category Routes
router.get("/categories", categoryController.getCategories);
router.get("/categories/:id", categoryController.getCategory);
router.post(
  "/categories",
  [...adminOnly, upload.single("image")],
  categoryController.createCategory
);
router.put(
  "/categories/:id",
  [...adminOnly, upload.single("image")],
  categoryController.updateCategory
);

router.delete("/categories/:id", adminOnly, categoryController.deleteCategory);

// Admin Order Management Routes
router.get("/orders", adminOnly, orderController.getOrders);
router.get("/orders/:orderId", adminOnly, orderController.getOrderDetails);
router.put(
  "/orders/:orderId/status",
  adminOnly,
  orderController.updateOrderStatus
);

// Admin Review Management Routes
router.get("/reviews", adminOnly, reviewController.getAllReviews);
router.put(
  "/reviews/:reviewId/status",
  adminOnly,
  reviewController.updateReviewStatus
);
router.delete("/reviews/:reviewId", adminOnly, reviewController.deleteReview);

export default router;
