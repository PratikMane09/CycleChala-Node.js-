// initAdmin.js

import bcrypt from "bcryptjs";
import { User } from "../src/models/User.js";

const initializeAdmin = async () => {
  try {
    const adminExists = await User.findOne({ role: "admin" });

    if (!adminExists) {
      const adminUser = new User({
        name: "Admin",
        email: "admin@cycleshop.com",
        password: "admin@123",
        phone: "1234567890",
        isVerified: true,
        role: "admin",
      });

      await adminUser.save();
      console.log("Admin user created successfully");
    }
  } catch (error) {
    console.error("Error creating admin:", error);
  }
};

export default initializeAdmin;
