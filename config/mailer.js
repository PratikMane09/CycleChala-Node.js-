// mailer.js
import nodemailer from "nodemailer";
import path from "path";
import ejs from "ejs";
import dotenv from "dotenv";
dotenv.config();

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  async verifyConnection() {
    try {
      await this.transporter.verify();
      console.log("📧 SMTP connection established successfully");
      return true;
    } catch (error) {
      console.error("SMTP connection failed:", error);
      return false;
    }
  }

  async sendVerificationEmail(to, data) {
    try {
      const template = await ejs.renderFile(
        path.join(process.cwd(), "views", "emails", "verification.ejs"),
        data
      );

      const mailOptions = {
        from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_USER}>`,
        to,
        subject: "Verify Your Email - CycleChala Store",
        html: template,
      };

      await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error("Error sending verification email:", error);
      return false;
    }
  }

  async sendPasswordResetEmail(to, data) {
    try {
      const template = await ejs.renderFile(
        path.join(process.cwd(), "views", "emails", "reset-password.ejs"),
        data
      );

      const mailOptions = {
        from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_USER}>`,
        to,
        subject: "Reset Your Password - CycleChala Store",
        html: template,
      };

      await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error("Error sending reset password email:", error);
      return false;
    }
  }
  async sendOrderConfirmation(to, data) {
    try {
      console.log("Sending order confirmation email with data:", data); // Debug log

      // Ensure all required template variables are present
      const templateData = {
        name: data.name,
        orderId: data.orderId,
        total: data.total || 0,
        shipping: data.shipping || 0,
        items: data.items || [],
        summary: data.summary || {},
        billing: data.billing || {},
        shipping: data.shipping || {},
        date: new Date().toLocaleDateString(),
      };

      const template = await ejs.renderFile(
        path.join(process.cwd(), "views", "emails", "order-confirmation.ejs"),
        templateData
      );

      const mailOptions = {
        from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_USER}>`,
        to,
        subject: "Order Confirmation - CycleChala Store",
        html: template,
      };

      await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error("Error sending order confirmation email:", error);
      return false;
    }
  }
  async sendWelcomeEmail(to, data) {
    try {
      const template = await ejs.renderFile(
        path.join(process.cwd(), "views", "emails", "welcomegoogle.ejs"),
        data
      );

      const mailOptions = {
        from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_USER}>`,
        to,
        subject: "Welcome to CycleChala Store - Your Account Details",
        html: template,
      };

      await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error("Error sending welcome email:", error);
      return false;
    }
  }
}

export const emailService = new EmailService();
