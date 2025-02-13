import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import mongoSanitize from "express-mongo-sanitize";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import mongoose from "mongoose";

// Routes
import adminRoutes from "./src/routes/admin.routes.js";
import authRoutes from "./src/routes/auth.routes.js";
import initializeAdmin from "./config/initAdmin.js";
// import productRoutes from "./src/routes/product.routes.js";
// import orderRoutes from "./src/routes/order.routes.js";
// import cartRoutes from "./src/routes/cart.routes.js";
// import reviewRoutes from "./src/routes/review.routes.js";
import userRoutes from "./src/routes/user.routes.js";

// Middleware
// import { errorHandler } from "./src/middleware/errorHandler.js";

dotenv.config();

const app = express();

// Security Middleware
app.use(helmet());
app.use(mongoSanitize());
app.use(
  cors({
    origin:
      process.env.FRONTEND_URL ||
      "http://localhost:3000" ||
      "https://www.cyclechala.in" ||
      "https://cyclechala-node-js.onrender.com",
    credentials: true,
  })
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use("/api/", limiter);

// Basic Middleware
app.use(morgan("dev"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(compression());

// Database Connection

mongoose.connect(process.env.MONGODB_URI).then(() => {
  console.log("Connected to MongoDB");
  initializeAdmin();
});
// Health Check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date() });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
// app.use("/api/products", productRoutes);
// app.use("/api/orders", orderRoutes);
// app.use("/api/cart", cartRoutes);
// app.use("/api/reviews", reviewRoutes);
app.use("/api/users", userRoutes);

// Error Handling
// app.use(errorHandler);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : {},
  });
});

const PORT = process.env.PORT || 5000;

// Graceful Shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully.");
  server.close(() => {
    console.log("Process terminated.");
    mongoose.connection.close();
  });
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
