// user.routes.js
import express from "express";

import WishlistController from "../controllers/wishlistController.js";
import { auth } from "../middleware/auth.js";
import { orderController } from "../controllers/orderController.js";
import { cartController } from "../controllers/cartController.js";
import { reviewController } from "../controllers/reviewController.js";
import { productController } from "../controllers/productController.js";

const router = express.Router();

// Get user's wishlist
router.get("/wishlist", auth, WishlistController.getWishlist);

// Add product to wishlist
router.post("/products/:productId", auth, WishlistController.addToWishlist);
// Remove product from wishlist
router.delete(
  "/products/:productId",
  auth,
  WishlistController.removeFromWishlist
);

router.get("/products", productController.getProducts);

// Clear entire wishlist
router.delete("/", auth, WishlistController.clearWishlist);

// Toggle notification settings for a product
router.patch(
  "/products/:productId/notifications",
  auth,
  WishlistController.updateNotificationSettings
);

// Move product from wishlist to cart
router.post(
  "/products/:productId/move-to-cart",
  auth,
  WishlistController.moveToCart
);

// user cart controller
// router.get("/cart", auth, cartController.getCart);
// router.post("/addcart", auth, cartController.addToCart);
// router.put("/updatecart/:itemId", auth, cartController.updateCartItem);
// router.delete("/removecart/:itemId", auth, cartController.removeFromCart);
// router.delete("/clearcart", auth, cartController.clearCart);
// router.post("/checkoutcart", auth, cartController.checkout);

// Cart Routes
router.get("/cart", auth, cartController.getCart);
router.post("/cart/add", auth, cartController.addToCart);

router.delete("/cart/items/:productId", auth, cartController.removeFromCart);
router.put("/cart/items/:productId", auth, cartController.updateCartItem);
router.delete("/cart", auth, cartController.clearCart);

// Order Routes
router.post("/orders", auth, orderController.createOrder);
router.get("/orders", auth, orderController.getOrders);
router.get("/orders/:orderId", auth, orderController.getOrderById);
router.post("/orders/:orderId/cancel", auth, orderController.cancelOrder);
// Get user's order history with pagination and filters
router.get("/myorders", auth, orderController.getUserOrders);

// Get specific order details
router.get("/myorders/:orderId", auth, orderController.getOrderDetails);
// Review Routes
router.post(
  "/products/:productId/reviews",
  auth,
  reviewController.createReview
);
router.put("/reviews/:reviewId", auth, reviewController.updateReview);
router.get("/products/:productId/reviews", reviewController.getProductReviews);
router.post(
  "/reviews/:reviewId/helpful",
  auth,
  reviewController.markReviewHelpful
);

export default router;
