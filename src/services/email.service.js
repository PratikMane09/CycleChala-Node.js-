import nodemailer from "nodemailer";
import path from "path";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

export const sendOrderConfirmation = async (order) => {
  try {
    const emailContent = `
      <h2>Order Confirmation - #${order._id}</h2>
      <p>Dear ${order.billing.name},</p>
      <p>Thank you for your order. We're pleased to confirm that we've received your order.</p>
      
      <h3>Order Details:</h3>
      <ul>
        ${order.items
          .map(
            (item) => `
          <li>${item.product.name} x ${item.quantity} - ₹${
              item.price.finalPrice * item.quantity
            }</li>
        `
          )
          .join("")}
      </ul>
      
      <h3>Order Summary:</h3>
      <p>Subtotal: ₹${order.summary.subtotal}</p>
      <p>Shipping: ₹${order.summary.shipping}</p>
      <p>Tax: ₹${order.summary.tax}</p>
      <p>Discount: ₹${order.summary.discount}</p>
      <p><strong>Total: ₹${order.summary.total}</strong></p>
      
      ${
        order.payment.method === "cod"
          ? `<p><strong>Payment Method: Cash on Delivery</strong></p>
             <p>Please keep the exact amount of ₹${order.summary.total} ready at the time of delivery.</p>`
          : `<p>Payment Method: ${order.payment.method}</p>
             <p>Transaction ID: ${order.payment.transactionId}</p>`
      }
      
      <h3>Shipping Address:</h3>
      <p>${order.shipping.address.street}</p>
      <p>${order.shipping.address.city}, ${order.shipping.address.state}</p>
      <p>${order.shipping.address.country} - ${
      order.shipping.address.zipCode
    }</p>
      
      <p>We will notify you once your order has been shipped.</p>
      
      <p>Thank you for shopping with us!</p>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: order.billing.email,
      subject: `Order Confirmation #${order._id}`,
      html: emailContent,
    });

    return true;
  } catch (error) {
    console.error("Error sending order confirmation email:", error);
    throw error;
  }
};

export const sendOrderStatusUpdate = async (order) => {
  try {
    let statusMessage = "";
    switch (order.status) {
      case "confirmed":
        statusMessage = "Your order has been confirmed and is being processed.";
        break;
      case "processing":
        statusMessage = "Your order is currently being processed.";
        break;
      case "shipped":
        statusMessage = `Your order has been shipped. Track your order with tracking number: ${order.shipping.trackingNumber}`;
        break;
      case "delivered":
        statusMessage = "Your order has been delivered successfully.";
        break;
      case "cancelled":
        statusMessage = "Your order has been cancelled.";
        break;
      case "refunded":
        statusMessage = "Your order has been refunded.";
        break;
      default:
        statusMessage = `Your order status has been updated to: ${order.status}`;
    }

    const emailContent = `
      <h2>Order Status Update - #${order._id}</h2>
      <p>Dear ${order.billing.name},</p>
      
      <p>${statusMessage}</p>
      
      ${
        order.status === "shipped"
          ? `
        <h3>Tracking Information:</h3>
        <p>Tracking Number: ${order.shipping.trackingNumber}</p>
        <p>Estimated Delivery: ${new Date(
          order.shipping.estimatedDelivery
        ).toLocaleDateString()}</p>
      `
          : ""
      }
      
      ${
        order.status === "cancelled" || order.status === "refunded"
          ? `
        <h3>Refund Information:</h3>
        <p>Refund ID: ${order.payment.refundId}</p>
        <p>The refund will be processed to your original payment method.</p>
      `
          : ""
      }
      
      <h3>Order Summary:</h3>
      <ul>
        ${order.items
          .map(
            (item) => `
          <li>${item.product.name} x ${item.quantity} - ₹${
              item.price.finalPrice * item.quantity
            }</li>
        `
          )
          .join("")}
      </ul>
      
      <p>If you have any questions, please don't hesitate to contact us.</p>
      
      <p>Thank you for shopping with us!</p>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: order.billing.email,
      subject: `Order Status Update #${order._id}`,
      html: emailContent,
    });

    return true;
  } catch (error) {
    console.error("Error sending order status update email:", error);
    throw error;
  }
};
