import jwt from "jsonwebtoken";
import { User } from "../models/User.js";

export const auth = async (req, res, next) => {
  try {
    const authHeader = req.header("Authorization");

    if (!authHeader) {
      return res.status(401).json({
        message: "No Authorization header found",
        debug: { headerPresent: false },
      });
    }

    // Check Bearer format
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Invalid Authorization format",
        debug: { format: "Missing 'Bearer ' prefix" },
      });
    }

    const token = authHeader.replace("Bearer ", "").trim();

    if (!token) {
      return res.status(401).json({
        message: "Empty token provided",
        debug: { tokenPresent: false },
      });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const user = await User.findById(decoded.userId).select("-password");

      if (!user) {
        return res.status(401).json({
          message: "User not found",
          debug: { userId: decoded.userId },
        });
      }

      req.user = user;
      next();
    } catch (jwtError) {
      return res.status(401).json({
        message: "Token verification failed",
        debug: {
          error: jwtError.name,
          reason: jwtError.message,
        },
      });
    }
  } catch (error) {
    res.status(500).json({
      message: "Authentication error",
      debug: { error: error.message },
    });
  }
};
