import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    images: [
      {
        url: String,
        caption: String,
      },
    ],
    pros: [
      {
        type: String,
        trim: true,
      },
    ],
    cons: [
      {
        type: String,
        trim: true,
      },
    ],
    verified: {
      type: Boolean,
      default: false,
    },
    helpful: {
      count: {
        type: Number,
        default: 0,
      },
      users: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      ],
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    adminComment: String,
    metadata: {
      edited: Boolean,
      lastEditedAt: Date,
      moderatedAt: Date,
      moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      purchaseDate: Date,
      deviceInfo: String,
    },
  },
  { timestamps: true }
);

// Indexes
reviewSchema.index({ product: 1, createdAt: -1 });
reviewSchema.index({ rating: 1 });
reviewSchema.index({ status: 1 });

// Static method to calculate product rating
reviewSchema.statics.calculateProductRating = async function (productId) {
  const result = await this.aggregate([
    { $match: { product: productId, status: "approved" } },
    {
      $group: {
        _id: "$product",
        averageRating: { $avg: "$rating" },
        totalReviews: { $sum: 1 },
      },
    },
  ]);

  if (result.length > 0) {
    await mongoose.model("Product").findByIdAndUpdate(productId, {
      "ratings.average": result[0].averageRating,
      "ratings.count": result[0].totalReviews,
    });
  }
};

// Post-save middleware to update product rating
reviewSchema.post("save", function () {
  this.constructor.calculateProductRating(this.product);
});

export default mongoose.model("Review", reviewSchema);
