// config/email.config.js
import dotenv from "dotenv";
dotenv.config();

export const emailConfig = {
  // SMTP Configuration
  smtp: {
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
    tls: {
      rejectUnauthorized: false,
      ciphers: "SSLv3",
    },
    pool: {
      maxConnections: 5,
      maxMessages: 100,
      rateDelta: 1000,
      rateLimit: 5,
    },
  },

  // Sender Configuration
  sender: {
    name: process.env.EMAIL_FROM_NAME || "Cycle Store",
    email: process.env.EMAIL_USER,
    replyTo: process.env.EMAIL_REPLY_TO || process.env.EMAIL_USER,
  },

  // Template Configuration
  templates: {
    baseDir: "views/emails",
    options: {
      cache: process.env.NODE_ENV === "production",
      rmWhitespace: true,
    },
    defaults: {
      layout: "email-layout",
      companyInfo: {
        name: "Cycle Store",
        address: "123 Bike Street, Cycle City",
        phone: "1-800-CYCLE",
        website: process.env.WEBSITE_URL,
        support: {
          email: "support@cyclestore.com",
          phone: "1-800-CYCLE",
          hours: "24/7",
        },
      },
      social: {
        facebook: process.env.SOCIAL_FACEBOOK,
        instagram: process.env.SOCIAL_INSTAGRAM,
        twitter: process.env.SOCIAL_TWITTER,
      },
    },
  },

  // Email Types Configuration
  emailTypes: {
    orderConfirmation: {
      subject: "Order Confirmation - Cycle Store",
      template: "order-confirmation.ejs",
      priority: "high",
    },
    welcome: {
      subject: "🎉 Welcome to Cycle Store - Your Adventure Begins!",
      template: "welcome.ejs",
      priority: "normal",
    },
    verification: {
      subject: "Verify Your Email - Cycle Store",
      template: "verification.ejs",
      priority: "high",
    },
    passwordReset: {
      subject: "Reset Your Password - Cycle Store",
      template: "reset-password.ejs",
      priority: "high",
    },
  },

  // Retry Configuration
  retry: {
    attempts: 3,
    delay: 1000, // milliseconds
    backoff: 2, // exponential backoff factor
  },

  // Rate Limiting
  rateLimiting: {
    enabled: true,
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
  },
};
