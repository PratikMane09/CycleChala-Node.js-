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
};
