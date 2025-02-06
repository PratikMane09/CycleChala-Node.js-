import mongoose from "mongoose";

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1,
  },
  selectedSpecs: {
    frameSize: String,
    color: String,
    additionalAccessories: [String],
  },
  price: {
    basePrice: {
      type: Number,
      required: true,
    },
    discount: {
      type: Number,
      default: 0,
    },
    finalPrice: {
      type: Number,
      required: true,
    },
  },
  addedAt: {
    type: Date,
    default: Date.now,
  },
});

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    items: [cartItemSchema],
    summary: {
      subtotal: {
        type: Number,
        default: 0,
      },
      discount: {
        type: Number,
        default: 0,
      },
      shipping: {
        type: Number,
        default: 0,
      },
      tax: {
        type: Number,
        default: 0,
      },
      total: {
        type: Number,
        default: 0,
      },
    },
    appliedCoupon: {
      code: String,
      discountPercentage: Number,
      expiresAt: Date,
    },
    metadata: {
      lastUpdated: {
        type: Date,
        default: Date.now,
      },
      itemCount: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance

cartSchema.index({ "items.product": 1 });
cartSchema.index({ updatedAt: 1 });

// Method to calculate cart totals
cartSchema.methods.calculateTotals = async function () {
  let subtotal = 0;
  let totalDiscount = 0;

  this.items.forEach((item) => {
    subtotal += item.price.basePrice * item.quantity;
    totalDiscount += item.price.discount * item.quantity;
  });

  // Apply coupon discount if valid
  if (this.appliedCoupon && this.appliedCoupon.expiresAt > new Date()) {
    const couponDiscount =
      (subtotal * this.appliedCoupon.discountPercentage) / 100;
    totalDiscount += couponDiscount;
  }

  // Calculate shipping (example logic)
  const shipping = subtotal > 1000 ? 0 : 50;

  // Calculate tax (example: 10%)
  const tax = (subtotal - totalDiscount) * 0.1;

  this.summary = {
    subtotal,
    discount: totalDiscount,
    shipping,
    tax,
    total: subtotal - totalDiscount + shipping + tax,
  };

  this.metadata.itemCount = this.items.reduce(
    (sum, item) => sum + item.quantity,
    0
  );
  this.metadata.lastUpdated = new Date();
};

// Method to add item to cart
cartSchema.methods.addItem = async function (
  productId,
  quantity = 1,
  selectedSpecs = {}
) {
  const Product = mongoose.model("Product");
  const product = await Product.findById(productId);

  if (!product) {
    throw new Error("Product not found");
  }

  if (product.inventory.quantity < quantity) {
    throw new Error("Not enough stock available");
  }

  const existingItem = this.items.find(
    (item) => item.product.toString() === productId.toString()
  );

  if (existingItem) {
    existingItem.quantity += quantity;
    existingItem.selectedSpecs = {
      ...existingItem.selectedSpecs,
      ...selectedSpecs,
    };
  } else {
    this.items.push({
      product: productId,
      quantity,
      selectedSpecs,
      price: {
        basePrice: product.price.base,
        discount: product.price.discount,
        finalPrice: product.price.base * (1 - product.price.discount / 100),
      },
    });
  }

  await this.calculateTotals();
  return this;
};

// Method to update item quantity
cartSchema.methods.updateItemQuantity = async function (productId, quantity) {
  const item = this.items.find(
    (item) => item.product.toString() === productId.toString()
  );

  if (!item) {
    throw new Error("Item not found in cart");
  }

  const Product = mongoose.model("Product");
  const product = await Product.findById(productId);

  if (product.inventory.quantity < quantity) {
    throw new Error("Not enough stock available");
  }

  item.quantity = quantity;
  await this.calculateTotals();
  return this;
};

// Method to remove item from cart
cartSchema.methods.removeItem = async function (productId) {
  this.items = this.items.filter(
    (item) => item.product.toString() !== productId.toString()
  );
  await this.calculateTotals();
  return this;
};

// Method to clear cart
cartSchema.methods.clear = async function () {
  this.items = [];
  this.appliedCoupon = null;
  await this.calculateTotals();
  return this;
};

// Pre-save middleware to ensure totals are calculated
cartSchema.pre("save", async function (next) {
  await this.calculateTotals();
  next();
});

export default mongoose.model("Cart", cartSchema);
