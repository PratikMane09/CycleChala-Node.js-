// orderController.js
import Order from "../models/Order.js";
import Cart from "../models/Cart.js";
import {
  sendOrderConfirmation,
  sendOrderStatusUpdate,
} from "../services/email.service.js";
import { emailService } from "../../config/mailer.js";
import { User } from "../models/User.js";
import mongoose from "mongoose";

const validateAddress = (address) => {
  if (!address) throw new Error("Address is required");

  const requiredFields = ["street", "city", "state", "country", "zipCode"];
  for (const field of requiredFields) {
    if (!address[field]) {
      throw new Error(`${field} is required in address`);
    }
  }
  return true;
};

// Helper functions outside the controller
const sendOrderConfirmationEmail = async (user, order, cartItems) => {
  const emailData = {
    name: user.name,
    orderId: order._id,
    items: cartItems.map((item) => ({
      name: item.product.name,
      quantity: item.quantity,
      price: item.price.finalPrice,
    })),
    summary: order.summary,
    billing: {
      name: order.billing.name,
      address: order.billing.address,
    },
    shipping: {
      address: order.shipping.address,
      method: order.shipping.method,
    },
  };

  try {
    await emailService.sendOrderConfirmation(user.email, emailData);
  } catch (error) {
    console.error("Error sending order confirmation email:", error);
  }
};

const sendOrderUpdateNotificationEmail = async (order) => {
  const emailData = {
    orderId: order._id,
    billing: order.billing,
    shipping: order.shipping,
    updateType: "address_update",
  };

  try {
    await emailService.sendOrderUpdateNotification(
      order.billing.email,
      emailData
    );
  } catch (error) {
    console.error("Error sending order update notification:", error);
  }
};

// Controller implementation with explicit function declarations
const createNewOrder = async (req, res) => {
  const { billingAddress, shippingAddress } = req.body;
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const cart = await Cart.findOne({ user: req.user._id })
        .populate("items.product")
        .session(session);

      const user = await User.findById(req.user._id).session(session);

      if (!cart || cart.items.length === 0) {
        throw new Error("Cart is empty");
      }

      // Destructure and structure billing address
      const { street, city, state, country, zipCode, name, email, phone } =
        billingAddress;
      const formattedBillingAddress = {
        address: {
          street,
          city,
          state,
          country,
          zipCode,
        },
        name,
        email: email || user.email, // Fallback to user email if not provided
        phone,
      };

      // Destructure and structure shipping address
      const {
        street: shipStreet,
        city: shipCity,
        state: shipState,
        country: shipCountry,
        zipCode: shipZipCode,
      } = shippingAddress;

      const formattedShippingAddress = {
        address: {
          street: shipStreet,
          city: shipCity,
          state: shipState,
          country: shipCountry,
          zipCode: shipZipCode,
        },
        method: shippingAddress.method || "standard",
      };

      // Validate product availability
      for (const item of cart.items) {
        if (
          !item.product.inventory.inStock ||
          item.quantity > item.product.inventory.quantity
        ) {
          throw new Error(
            `Product ${item.product.name} is not available in requested quantity`
          );
        }
      }

      const orderItems = cart.items.map((item) => ({
        product: item.product._id,
        quantity: item.quantity,
        price: {
          basePrice: item.price.basePrice,
          discount: item.price.discount,
          finalPrice: item.price.finalPrice,
        },
        specifications: item.selectedSpecs,
      }));

      const order = new Order({
        user: req.user._id,
        items: orderItems,
        payment: {
          method: "cod",
          status: "cod_pending",
          codDetails: {
            verificationCode: Math.random()
              .toString(36)
              .substring(2, 8)
              .toUpperCase(),
          },
        },
        billing: formattedBillingAddress,
        shipping: formattedShippingAddress,
        metadata: {
          source: req.headers["user-agent"] ? "website" : "mobile_app",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });

      await order.calculateTotals();

      if (order.summary.total > 50000) {
        throw new Error(
          "Order total exceeds maximum limit for Cash on Delivery"
        );
      }

      await order.save({ session });

      // Update product stock
      for (const item of cart.items) {
        await item.product.updateStock(-item.quantity, session);
      }

      // Clear cart
      await cart.clear();
      await cart.save({ session });

      // Send email confirmation
      await sendOrderConfirmationEmail(user, order, cart.items);

      return res.json({
        success: true,
        message: "Order placed successfully",
        data: order,
      });
    });
  } catch (error) {
    throw error;
  } finally {
    session.endSession();
  }
};

const updateOrder = async (req, res) => {
  const { billingAddress, shippingAddress, orderId } = req.body;
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const order = await Order.findOne({
        _id: orderId,
        user: req.user._id,
      })
        .populate("items.product")
        .session(session);

      if (!order) {
        throw new Error("Order not found");
      }

      if (!["pending", "confirmed"].includes(order.status)) {
        throw new Error("Order cannot be updated in current status");
      }

      // Format billing address like in createOrder
      if (billingAddress) {
        const { street, city, state, country, zipCode, name, email, phone } =
          billingAddress;
        const formattedBillingAddress = {
          address: {
            street,
            city,
            state,
            country,
            zipCode,
          },
          name,
          email: email || order.billing.email, // Fallback to existing email
          phone,
        };
        order.billing = formattedBillingAddress;
      }

      // Format shipping address like in createOrder
      if (shippingAddress) {
        const {
          street: shipStreet,
          city: shipCity,
          state: shipState,
          country: shipCountry,
          zipCode: shipZipCode,
          method,
        } = shippingAddress;

        const formattedShippingAddress = {
          address: {
            street: shipStreet,
            city: shipCity,
            state: shipState,
            country: shipCountry,
            zipCode: shipZipCode,
          },
          method: method || order.shipping.method, // Fallback to existing method
        };
        order.shipping = formattedShippingAddress;
      }

      // Revalidate product availability if needed
      for (const item of order.items) {
        if (
          !item.product.inventory.inStock ||
          item.quantity > item.product.inventory.quantity
        ) {
          throw new Error(
            `Product ${item.product.name} is not available in requested quantity`
          );
        }
      }

      // Recalculate totals
      await order.calculateTotals();

      // Validate COD limit like in createOrder
      if (order.payment.method === "cod" && order.summary.total > 50000) {
        throw new Error(
          "Order total exceeds maximum limit for Cash on Delivery"
        );
      }

      // Update metadata
      order.metadata = {
        ...order.metadata,
        lastUpdated: new Date(),
        updatedFrom: req.headers["user-agent"] ? "website" : "mobile_app",
        updateIpAddress: req.ip,
        updateUserAgent: req.headers["user-agent"],
      };

      await order.save({ session });

      // Send email notification
      await sendOrderUpdateNotificationEmail(
        await User.findById(req.user._id),
        order
      );

      return res.json({
        success: true,
        message: "Order updated successfully",
        data: order,
      });
    });
  } catch (error) {
    throw error;
  } finally {
    session.endSession();
  }
};
export const orderController = {
  // Create new order

  async createOrUpdateOrder(req, res) {
    try {
      const { billingAddress, shippingAddress, orderId } = req.body;

      // Validate addresses
      try {
        validateAddress(billingAddress);
        validateAddress(shippingAddress);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }

      // If orderId exists, update existing order
      if (orderId) {
        return await updateOrder(req, res, orderId);
      }

      // Create new order
      return await createNewOrder(req, res);
    } catch (error) {
      console.error("Order operation error:", error);
      return res.status(500).json({
        success: false,
        message: "Error processing order",
        error: error.message,
      });
    }
  },

  // Update order delivery status (delivery agent)
  async updateDeliveryStatus(req, res) {
    try {
      const { orderId } = req.params;
      const { deliveryStatus, verificationCode, notes } = req.body;

      const order = await Order.findById(orderId);

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      // Add delivery attempt
      order.shipping.deliveryAttempts.push({
        date: new Date(),
        status: deliveryStatus,
        notes: notes || "",
      });

      // Handle successful delivery
      if (deliveryStatus === "delivered" && verificationCode) {
        if (order.payment.codDetails.verificationCode !== verificationCode) {
          return res.status(400).json({
            success: false,
            message: "Invalid verification code",
          });
        }

        order.status = "delivered";
        order.payment.status = "cod_collected";
        order.payment.codDetails.collectionDate = new Date();
        order.payment.codDetails.collectedBy = req.user._id;
      }
      // Handle failed delivery attempt
      else if (deliveryStatus === "failed") {
        if (order.shipping.deliveryAttempts.length >= 3) {
          order.status = "cancelled";
          // Restore product stock
          for (const item of order.items) {
            await item.product.updateStock(item.quantity);
          }
        }
      }

      await order.save();
      await sendOrderStatusUpdate(order);

      res.json({
        success: true,
        message: "Delivery status updated successfully",
        data: order,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error updating delivery status",
        error: error.message,
      });
    }
  },

  // Get all orders (admin) or user orders
  async getOrders(req, res) {
    try {
      const isAdmin = req.user.role === "admin";
      const query = isAdmin ? {} : { user: req.user._id };

      // Parse query parameters
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const sortBy = req.query.sortBy || "-createdAt";
      const status = req.query.status;

      if (status) {
        query.status = status;
      }

      const orders = await Order.find(query)
        .populate("items.product", "name images price")
        .populate("user", "name email")
        .sort(sortBy)
        .skip((page - 1) * limit)
        .limit(limit);

      const total = await Order.countDocuments(query);

      res.json({
        success: true,
        data: {
          orders,
          pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching orders",
        error: error.message,
      });
    }
  },

  // Get single order details
  async getOrderById(req, res) {
    try {
      const isAdmin = req.user.role === "admin";
      const query = {
        _id: req.params.orderId,
        ...(isAdmin ? {} : { user: req.user._id }),
      };

      const order = await Order.findOne(query)
        .populate("items.product")
        .populate("user", "name email phone");

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      res.json({
        success: true,
        data: order,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching order",
        error: error.message,
      });
    }
  },

  // Update order status (admin only)
  async updateOrderStatus(req, res) {
    try {
      const { orderId } = req.params;
      const { status, trackingNumber, estimatedDelivery } = req.body;

      const order = await Order.findById(orderId);

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      // Validate status transition for COD orders
      const validTransitions = {
        pending: ["confirmed", "cancelled"],
        confirmed: ["processing", "cancelled"],
        processing: ["shipped", "cancelled"],
        shipped: ["delivered", "cancelled"],
        delivered: ["returned"],
        cancelled: [],
        returned: [],
      };

      if (!validTransitions[order.status].includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Cannot transition order from ${order.status} to ${status}`,
        });
      }

      if (status === "shipped" && !trackingNumber) {
        return res.status(400).json({
          success: false,
          message: "Tracking number is required for shipped status",
        });
      }

      order.status = status;
      if (trackingNumber) order.shipping.trackingNumber = trackingNumber;
      if (estimatedDelivery)
        order.shipping.estimatedDelivery = estimatedDelivery;

      if (status === "cancelled") {
        // Restore product stock for cancelled orders
        for (const item of order.items) {
          await item.product.updateStock(item.quantity);
        }
      }

      await order.save();
      await sendOrderStatusUpdate(order);

      res.json({
        success: true,
        message: "Order status updated successfully",
        data: order,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error updating order status",
        error: error.message,
      });
    }
  },
  // Cancel order (user)
  async cancelOrder(req, res) {
    try {
      const order = await Order.findOne({
        _id: req.params.orderId,
        user: req.user._id,
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      if (!["pending", "confirmed"].includes(order.status)) {
        return res.status(400).json({
          success: false,
          message: "Order cannot be cancelled at this stage",
        });
      }

      order.status = "cancelled";

      // Process refund if payment was completed
      if (order.payment.status === "completed") {
        const refundResult = await processRefund(order.payment.transactionId);
        order.payment.status = "refunded";
        order.payment.refundId = refundResult.refundId;
      }

      // Restore product stock
      for (const item of order.items) {
        await item.product.updateStock(item.quantity);
      }

      await order.save();

      // Send cancellation email
      await sendOrderStatusUpdate(order);

      res.json({
        success: true,
        message: "Order cancelled successfully",
        data: order,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error cancelling order",
        error: error.message,
      });
    }
  },
  async getUserOrders(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      // Build filter object
      const filter = { user: req.user._id };

      // Add status filter if provided
      if (req.query.status) {
        filter.status = req.query.status;
      }

      // Add date range filter if provided
      if (req.query.startDate && req.query.endDate) {
        filter.createdAt = {
          $gte: new Date(req.query.startDate),
          $lte: new Date(req.query.endDate),
        };
      }

      // Get total count for pagination
      const totalOrders = await Order.countDocuments(filter);

      // Fetch orders with pagination
      const orders = await Order.find(filter)
        .select("-payment.codDetails.verificationCode")
        .populate("items.product", "name images price")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      // Transform orders to include relevant information
      const transformedOrders = orders.map((order) => ({
        orderId: order._id,
        orderDate: order.createdAt,
        status: order.status,
        items: order.items.map((item) => ({
          productName: item.product?.name || "Product Not Found",
          quantity: item.quantity,
          price: item.price,
          specifications: item.specifications,
        })),
        summary: order.summary,
        shipping: {
          address: order.shipping.address,
          method: order.shipping.method,
          trackingNumber: order.shipping.trackingNumber,
          estimatedDelivery: order.shipping.estimatedDelivery,
          deliveryAttempts: order.shipping.deliveryAttempts,
        },
      }));

      return res.json({
        success: true,
        data: {
          orders: transformedOrders,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(totalOrders / limit),
            totalOrders,
            hasNextPage: page * limit < totalOrders,
            hasPrevPage: page > 1,
          },
        },
      });
    } catch (error) {
      console.error("Error fetching user orders:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching orders",
        error: error.message,
      });
    }
  },

  async getOrderDetails(req, res) {
    try {
      const { orderId } = req.params;

      // Validate orderId is a valid ObjectId
      if (!mongoose.isValidObjectId(orderId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID format",
        });
      }

      const order = await Order.findOne({
        _id: orderId,
        user: req.user._id,
      })
        .populate("items.product", "name images price description metadata")
        .select("-payment.codDetails.verificationCode");

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }
      console.log("order", order);

      // Transform order data for response
      const orderDetails = {
        orderId: order._id,
        orderDate: order.createdAt,
        status: order.status,
        items: order.items.map((item) => ({
          product: item.product
            ? {
                id: item.product._id,
                name: item.product.name,
                images: item.product.images,
                description: item.product.description,
                slug: item.product.metadata.slug || "",
              }
            : {
                id: null,
                name: "Product Not Found",
                images: [],
                description: "",
              },
          quantity: item.quantity,
          price: item.price,
          specifications: item.specifications,
        })),
        summary: order.summary,
        billing: {
          name: order.billing.name,
          address: order.billing.address,
          phone: order.billing.phone,
        },
        shipping: {
          address: order.shipping.address,
          method: order.shipping.method,
          trackingNumber: order.shipping.trackingNumber,
          estimatedDelivery: order.shipping.estimatedDelivery,
          deliveryAttempts: order.shipping.deliveryAttempts,
        },
        payment: {
          method: order.payment.method,
          status: order.payment.status,
        },
      };

      return res.json({
        success: true,
        data: orderDetails,
      });
    } catch (error) {
      console.error("Error fetching order details:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching order details",
        error: error.message,
      });
    }
  },
};
