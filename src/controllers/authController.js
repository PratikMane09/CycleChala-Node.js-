// authController.js
import { User } from "../models/User.js";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { emailService } from "../../config/mailer.js";
import { client } from "../../config/google.js";
dotenv.config();
// Updated transporter configuration
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD, // Use App Password instead of regular password
  },
  tls: {
    rejectUnauthorized: false,
  },
});

// Verify transporter connection
const verifyTransporter = async () => {
  try {
    await transporter.verify();
    console.log("SMTP connection established");
  } catch (error) {
    console.error("SMTP connection failed:", error);
    throw error;
  }
};

// Store pending registrations with better error handling
const pendingRegistrations = new Map();

export const initiateRegister = async (req, res) => {
  try {
    await verifyTransporter();
    const { name, email, password, phone } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    // const hashedPassword = await bcrypt.hash(password, 10);

    pendingRegistrations.set(email, {
      name,
      email,
      password,
      phone,
      otp,
      timestamp: Date.now(),
    });

    const emailSent = await emailService.sendVerificationEmail(email, {
      name: name,
      otp: otp,
    });

    setTimeout(() => pendingRegistrations.delete(email), 600000);

    res.status(200).json({ message: "Verification code sent" });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      message: "Failed to initiate registration",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
export const verifyAndRegister = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const registration = pendingRegistrations.get(email);

    if (!registration || registration.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (Date.now() - registration.timestamp > 600000) {
      pendingRegistrations.delete(email);
      return res.status(400).json({ message: "OTP expired" });
    }

    // Create and save user only after OTP verification
    const user = new User({
      name: registration.name,
      email: registration.email,
      password: registration.password,
      phone: registration.phone,
      isVerified: true,
    });

    await user.save();
    pendingRegistrations.delete(email);
    await emailService.sendWelcomeEmail(email, {
      name: registration.name,
    });
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.status(201).json({ token, message: "Registration successful" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// login controller
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!user.isVerified) {
      return res
        .status(401)
        .json({ message: "Please verify your email first" });
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      token,
      user: { name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// auth middleware
export const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};

// forgot password
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    const emailSent = await emailService.sendPasswordResetEmail(email, {
      otp: otp,
    });

    res.json({ message: "Password reset OTP sent" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// reset password
export const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    const user = await User.findOne({
      email,
      otp,
      otpExpiry: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    user.password = newPassword;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    res.json({ message: "Password reset successful" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const googleAuthController = {
  // Generate Google OAuth URL
  getGoogleAuthURL: (req, res) => {
    const url = client.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
    });
    res.json({ url });
  },

  // Handle Google OAuth callback
  async handleGoogleCallback(req, res) {
    try {
      const { code } = req.query;
      const { tokens } = await client.getToken(code);
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const { email, name, picture } = ticket.getPayload();

      // Find or create user
      let user = await User.findOne({ email });

      if (!user) {
        const randomPassword = Math.random().toString(36).slice(-8);
        user = await User.create({
          email,
          name,
          password: randomPassword,
          isVerified: true,
          phone: "",
        });

        // Send welcome email with temporary password
        await emailService.sendWelcomeEmail(email, {
          name,
          email,
          password: randomPassword,
          websiteUrl: process.env.WEBSITE_URL,
        });
      }
      // Generate JWT token
      const token = jwt.sign(
        { userId: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.redirect(`${process.env.FRONTEND_URL}/auth/success?token=${token}`);
    } catch (error) {
      console.error("Google auth error:", error);
      res.redirect(`${process.env.FRONTEND_URL}/auth/error`);
    }
  },

  // Verify Google ID token (for mobile/frontend direct integration)
  async verifyGoogleToken(req, res) {
    try {
      const { idToken } = req.body;

      const ticket = await client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const { email, name, picture } = ticket.getPayload();

      // Find or create user
      let user = await User.findOne({ email });

      if (!user) {
        const randomPassword = Math.random().toString(36).slice(-8);
        user = await User.create({
          email,
          name,
          password: randomPassword,
          isVerified: true,
          phone: "",
        });
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );
      res.json({
        success: true,
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error) {
      console.error("Google token verification error:", error);
      res.status(400).json({
        success: false,
        message: "Invalid Google token",
      });
    }
  },
};
