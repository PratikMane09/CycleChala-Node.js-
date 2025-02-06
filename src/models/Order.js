import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  price: {
    basePrice: Number,
    discount: Number,
    finalPrice: Number,
  },
  specifications: {
    frameSize: String,
    color: String,
    additionalAccessories: [String],
  },
});

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    items: [orderItemSchema],
    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
        "returned",
      ],
      default: "pending",
    },
    payment: {
      method: {
        type: String,
        enum: ["cod"],
        default: "cod",
        required: true,
      },
      status: {
        type: String,
        enum: ["cod_pending", "cod_collected", "cancelled"],
        default: "cod_pending",
      },
      codDetails: {
        verificationCode: {
          type: String,
          required: true,
        },
        collectionDate: Date,
        collectedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        attempts: [
          {
            date: Date,
            status: {
              type: String,
              enum: ["success", "failed", "rescheduled"],
            },
            reason: String,
          },
        ],
      },
    },
    billing: {
      address: {
        street: String,
        city: String,
        state: String,
        country: String,
        zipCode: String,
      },
      name: String,
      email: String,
      phone: {
        type: String,
        required: true, // Required for COD orders
      },
    },
    shipping: {
      address: {
        street: String,
        city: String,
        state: String,
        country: String,
        zipCode: String,
      },
      method: {
        type: String,
        enum: ["standard", "express", "priority"],
        default: "standard",
      },
      trackingNumber: String,
      estimatedDelivery: Date,
      deliveryAttempts: [
        {
          date: Date,
          status: {
            type: String,
            enum: ["pending", "delivered", "failed", "rescheduled"],
          },
          notes: String,
        },
      ],
    },
    summary: {
      subtotal: Number,
      shipping: Number,
      tax: Number,
      discount: Number,
      total: Number,
    },
    notes: String,
    metadata: {
      source: {
        type: String,
        enum: ["website", "mobile_app", "in_store"],
        default: "website",
      },
      ipAddress: String,
      userAgent: String,
    },
  },
  { timestamps: true }
);

// Indexes
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ "payment.status": 1 });
orderSchema.index({ "shipping.trackingNumber": 1 });
orderSchema.index({ "payment.codDetails.verificationCode": 1 });
orderSchema.index({ "billing.phone": 1 });

// Calculate order totals
orderSchema.methods.calculateTotals = function () {
  let subtotal = 0;
  let discount = 0;

  this.items.forEach((item) => {
    subtotal += item.price.basePrice * item.quantity;
    discount += (item.price.discount || 0) * item.quantity;
  });

  const shipping = this.shipping.method === "express" ? 100 : 50;
  const tax = (subtotal - discount) * 0.1; // 10% tax

  this.summary = {
    subtotal,
    shipping,
    tax,
    discount,
    total: subtotal - discount + shipping + tax,
  };

  return this;
};

// Pre-save middleware
orderSchema.pre("save", function (next) {
  if (this.isModified("items")) {
    this.calculateTotals();
  }
  next();
});

export default mongoose.model("Order", orderSchema);
