import { User } from "../models/User.js";

import bcrypt from "bcryptjs";
import crypto from "crypto";
import { emailService } from "../../config/mailer.js";

export const userController = {
  // Get user profile
  async getUserProfile(req, res) {
    try {
      const user = await User.findById(req.user._id).select(
        "-password -otp -otpExpiry"
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      res.status(200).json({
        success: true,
        user,
      });
    } catch (error) {
      console.error("Error in getUserProfile:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },

  // Update user profile
  async updateProfile(req, res) {
    try {
      const { name, phone } = req.body;
      const updateFields = {};

      if (name) updateFields.name = name;
      if (phone) updateFields.phone = phone;

      const user = await User.findByIdAndUpdate(
        req.user._id,
        { $set: updateFields },
        { new: true }
      ).select("-password -otp -otpExpiry");

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        user,
      });
    } catch (error) {
      console.error("Error in updateProfile:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },

  // Initialize password set process for Google OAuth users
  async initiateSetPassword(req, res) {
    try {
      const user = await User.findById(req.user._id);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Generate OTP
      const otp = crypto.randomInt(100000, 999999).toString();
      const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

      // Save OTP to user
      user.otp = otp;
      user.otpExpiry = otpExpiry;
      await user.save();

      // Send OTP email
      await emailService.sendPasswordResetEmail(user.email, {
        name: user.name,
        otp,
        expiryTime: "10 minutes",
      });

      res.status(200).json({
        success: true,
        message: "OTP sent to your email",
      });
    } catch (error) {
      console.error("Error in initiateSetPassword:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },

  // Verify OTP and set new password
  async verifyAndSetPassword(req, res) {
    try {
      const { otp, newPassword } = req.body;

      const user = await User.findById(req.user._id);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Verify OTP
      if (!user.otp || !user.otpExpiry || user.otp !== otp) {
        return res.status(400).json({
          success: false,
          message: "Invalid OTP",
        });
      }

      // Check OTP expiry
      if (user.otpExpiry < new Date()) {
        return res.status(400).json({
          success: false,
          message: "OTP has expired",
        });
      }

      // Password validation
      if (newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 8 characters long",
        });
      }

      // Set new password
      user.password = newPassword;
      user.otp = undefined;
      user.otpExpiry = undefined;
      await user.save();

      res.status(200).json({
        success: true,
        message: "Password set successfully",
      });
    } catch (error) {
      console.error("Error in verifyAndSetPassword:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },
  async getAllUsers(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const search = req.query.search || "";
      const role = req.query.role;
      const isVerified = req.query.isVerified;

      const query = {};

      // Add filters
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ];
      }
      if (role) query.role = role;
      if (isVerified !== undefined) query.isVerified = isVerified;

      const total = await User.countDocuments(query);
      const users = await User.find(query)
        .select("-password -otp -otpExpiry")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

      res.status(200).json({
        success: true,
        users,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit),
          limit,
        },
      });
    } catch (error) {
      console.error("Error in getAllUsers:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },

  // Get single user details
  async getUserDetails(req, res) {
    try {
      const user = await User.findById(req.params.userId).select(
        "-password -otp -otpExpiry"
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      res.status(200).json({
        success: true,
        user,
      });
    } catch (error) {
      console.error("Error in getUserDetails:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },

  // Create new user by admin
  async createUser(req, res) {
    try {
      const { name, email, password, phone, role, isVerified } = req.body;

      // Validate required fields
      if (!name || !email || !password) {
        return res.status(400).json({
          success: false,
          message: "Please provide all required fields",
        });
      }

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "User with this email already exists",
        });
      }

      // Create new user
      const user = await User.create({
        name,
        email,
        password,
        phone,
        role: role || "user",
        isVerified: isVerified || false,
      });

      // Send welcome email
      await emailService.sendWelcomeEmail(email, {
        name,
        password, // Only for admin-created accounts
      });

      res.status(201).json({
        success: true,
        message: "User created successfully",
        user: user.toObject({ hide: "password" }),
      });
    } catch (error) {
      console.error("Error in createUser:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },

  // Update user by admin
  async updateUser(req, res) {
    try {
      const { name, email, phone, role, isVerified } = req.body;
      const updateFields = {};

      if (name) updateFields.name = name;
      if (email) updateFields.email = email;
      if (phone) updateFields.phone = phone;
      if (role) updateFields.role = role;
      if (isVerified !== undefined) updateFields.isVerified = isVerified;

      const user = await User.findByIdAndUpdate(
        req.params.userId,
        { $set: updateFields },
        { new: true }
      ).select("-password -otp -otpExpiry");

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "User updated successfully",
        user,
      });
    } catch (error) {
      console.error("Error in updateUser:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },

  // Reset user password by admin
  async resetUserPassword(req, res) {
    try {
      const { newPassword } = req.body;

      if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 8 characters long",
        });
      }

      const user = await User.findById(req.params.userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      user.password = newPassword;
      await user.save();

      // Notify user about password reset
      // await emailService.sendPasswordChangedEmail(user.email, {
      //   name: user.name
      // });

      res.status(200).json({
        success: true,
        message: "User password reset successfully",
      });
    } catch (error) {
      console.error("Error in resetUserPassword:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },

  // Delete user
  async deleteUser(req, res) {
    try {
      const user = await User.findById(req.params.userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Prevent deleting the last admin
      if (user.role === "admin") {
        const adminCount = await User.countDocuments({ role: "admin" });
        if (adminCount <= 1) {
          return res.status(400).json({
            success: false,
            message: "Cannot delete the last admin user",
          });
        }
      }

      await user.deleteOne();

      res.status(200).json({
        success: true,
        message: "User deleted successfully",
      });
    } catch (error) {
      console.error("Error in deleteUser:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },
};
