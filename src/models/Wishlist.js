import mongoose from "mongoose";

const wishlistSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    products: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
        notifications: {
          priceDrops: {
            type: Boolean,
            default: true,
          },
          backInStock: {
            type: Boolean,
            default: true,
          },
        },
      },
    ],
    metadata: {
      lastModified: {
        type: Date,
        default: Date.now,
      },
      productCount: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
wishlistSchema.index({ user: 1, "products.product": 1 });

// Update product count and last modified date before save
wishlistSchema.pre("save", function (next) {
  this.metadata.productCount = this.products.length;
  this.metadata.lastModified = new Date();
  next();
});

// Method to check if product exists in wishlist
wishlistSchema.methods.hasProduct = function (productId) {
  return this.products.some(
    (item) => item.product.toString() === productId.toString()
  );
};

// Method to add product to wishlist
wishlistSchema.methods.addProduct = function (productId) {
  if (!this.hasProduct(productId)) {
    this.products.push({
      product: productId,
      addedAt: new Date(),
    });
  }
  return this;
};

// Method to remove product from wishlist
wishlistSchema.methods.removeProduct = function (productId) {
  this.products = this.products.filter(
    (item) => item.product.toString() !== productId.toString()
  );
  return this;
};

export default mongoose.model("Wishlist", wishlistSchema);
