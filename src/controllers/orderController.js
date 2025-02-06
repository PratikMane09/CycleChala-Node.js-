// orderController.js
import Order from "../models/Order.js";
import Cart from "../models/Cart.js";
import {
  sendOrderConfirmation,
  sendOrderStatusUpdate,
} from "../services/email.service.js";
import { emailService } from "../../config/mailer.js";
import { User } from "../models/User.js";

export const orderController = {
  // Create new order

  async createOrder(req, res) {
    try {
      const { billingAddress, shippingAddress } = req.body;

      const cart = await Cart.findOne({ user: req.user._id }).populate(
        "items.product"
      );
      const user = await User.findById(req.user._id); // Fixed user query

      if (!cart || cart.items.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Cart is empty",
        });
      }

      // Validate product availability and prices
      for (const item of cart.items) {
        if (
          !item.product.inventory.inStock ||
          item.quantity > item.product.inventory.quantity
        ) {
          return res.status(400).json({
            success: false,
            message: `Product ${item.product.name} is not available in requested quantity`,
          });
        }
      }

      // Create order items from cart
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
        billing: {
          ...billingAddress,
          email: user.email, // Use user.email instead of req.user.email
          phone: billingAddress.phone, // Use user.phone instead of req.user.phone
        },
        shipping: {
          ...shippingAddress,
          method: "standard",
        },
        metadata: {
          source: req.headers["user-agent"] ? "website" : "mobile_app",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });

      await order.calculateTotals();

      // Validate order total against COD limits
      if (order.summary.total > 50000) {
        return res.status(400).json({
          success: false,
          message: "Order total exceeds maximum limit for Cash on Delivery",
        });
      }

      await order.save();

      // Update product stock
      for (const item of cart.items) {
        await item.product.updateStock(-item.quantity);
      }

      // Clear cart after successful order
      await cart.clear();
      await cart.save();

      const emailData = {
        name: user.name,
        orderId: order._id,
        total: order.summary.subtotal,
        shipping: order.summary.shipping,
        items: cart.items.map((item) => ({
          name: item.product.name,
          quantity: item.quantity,
          price: item.price.finalPrice,
          // Add any other item details needed in the template
        })),
        summary: {
          subtotal: order.summary.subtotal,
          shipping: order.summary.shipping,
          tax: order.summary.tax,
          discount: order.summary.discount,
          total: order.summary.total,
        },
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
        const emailSent = await emailService.sendOrderConfirmation(
          user.email,
          emailData
        );
        if (!emailSent) {
          console.error("Failed to send order confirmation email");
          // Log the failure but don't stop the order process
        }
      } catch (emailError) {
        console.error("Error sending order confirmation email:", emailError);
        // Log the error but don't stop the order process
      }
      res.json({
        success: true,
        message: "Order placed successfully",
        data: order,
      });
    } catch (error) {
      console.error("Order creation error:", error);
      res.status(500).json({
        success: false,
        message: "Error creating order",
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
        .populate("items.product", "name images price description")
        .select("-payment.codDetails.verificationCode");

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

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
