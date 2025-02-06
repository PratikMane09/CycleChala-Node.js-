// reviewController.js
import Review from "../models/Review.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";

export const reviewController = {
  // Create new review
  async createReview(req, res) {
    try {
      const { productId } = req.params;
      const { rating, title, content, pros, cons, images } = req.body;

      // Validate rating
      if (rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: "Rating must be between 1 and 5",
        });
      }

      // Check if user has purchased the product
      const order = await Order.findOne({
        user: req.user._id,
        "items.product": productId,
        status: "delivered",
      });

      if (!order) {
        return res.status(403).json({
          success: false,
          message: "You can only review products you have purchased",
        });
      }

      // Check if user has already reviewed
      const existingReview = await Review.findOne({
        user: req.user._id,
        product: productId,
      });

      if (existingReview) {
        return res.status(400).json({
          success: false,
          message: "You have already reviewed this product",
        });
      }

      const review = new Review({
        user: req.user._id,
        product: productId,
        order: order._id,
        rating,
        title,
        content,
        pros,
        cons,
        images,
        verified: true,
        status: "pending", // Reviews need approval by default
        metadata: {
          purchaseDate: order.createdAt,
          deviceInfo: req.headers["user-agent"],
        },
      });

      await review.save();

      // Update product rating
      await updateProductRating(productId);

      res.json({
        success: true,
        message: "Review submitted successfully and awaiting approval",
        data: review,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error creating review",
        error: error.message,
      });
    }
  },

  // Update existing review
  async updateReview(req, res) {
    try {
      const { reviewId } = req.params;
      const { rating, title, content, pros, cons, images } = req.body;

      const review = await Review.findOne({
        _id: reviewId,
        user: req.user._id,
      });

      if (!review) {
        return res.status(404).json({
          success: false,
          message: "Review not found",
        });
      }

      // Validate rating
      if (rating && (rating < 1 || rating > 5)) {
        return res.status(400).json({
          success: false,
          message: "Rating must be between 1 and 5",
        });
      }

      review.rating = rating || review.rating;
      review.title = title || review.title;
      review.content = content || review.content;
      review.pros = pros || review.pros;
      review.cons = cons || review.cons;
      if (images) review.images = images;

      review.metadata.edited = true;
      review.metadata.lastEditedAt = new Date();
      review.status = "pending"; // Edited reviews need re-approval

      await review.save();

      // Update product rating
      await updateProductRating(review.product);

      res.json({
        success: true,
        message: "Review updated successfully and awaiting approval",
        data: review,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error updating review",
        error: error.message,
      });
    }
  },

  // Get reviews for a product
  async getProductReviews(req, res) {
    try {
      const { productId } = req.params;
      const {
        sort = "-createdAt",
        page = 1,
        limit = 10,
        rating,
        verified,
      } = req.query;

      const query = {
        product: productId,
        status: "approved",
        ...(rating && { rating }),
        ...(verified === "true" && { verified: true }),
      };

      const reviews = await Review.find(query)
        .populate("user", "name avatar")
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(Number(limit));

      const total = await Review.countDocuments(query);

      // Get rating statistics
      const stats = await Review.aggregate([
        { $match: { product: productId, status: "approved" } },
        {
          $group: {
            _id: "$rating",
            count: { $sum: 1 },
          },
        },
      ]);

      res.json({
        success: true,
        data: {
          reviews,
          stats,
          pagination: {
            total,
            page: Number(page),
            pages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching reviews",
        error: error.message,
      });
    }
  },

  // Mark review as helpful
  async markReviewHelpful(req, res) {
    try {
      const { reviewId } = req.params;

      const review = await Review.findById(reviewId);

      if (!review) {
        return res.status(404).json({
          success: false,
          message: "Review not found",
        });
      }

      const userIndex = review.helpful.users.indexOf(req.user._id);

      if (userIndex === -1) {
        review.helpful.users.push(req.user._id);
        review.helpful.count++;
      } else {
        review.helpful.users.splice(userIndex, 1);
        review.helpful.count--;
      }

      await review.save();

      res.json({
        success: true,
        message: "Review helpful status updated",
        data: review,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error updating review helpful status",
        error: error.message,
      });
    }
  },

  // Admin: Get all reviews
  async getAllReviews(req, res) {
    try {
      const {
        sort = "-createdAt",
        page = 1,
        limit = 10,
        status,
        rating,
        verified,
      } = req.query;

      const query = {
        ...(status && { status }),
        ...(rating && { rating }),
        ...(verified === "true" && { verified: true }),
      };

      const reviews = await Review.find(query)
        .populate("user", "name email")
        .populate("product", "name")
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(Number(limit));

      const total = await Review.countDocuments(query);

      res.json({
        success: true,
        data: {
          reviews,
          pagination: {
            total,
            page: Number(page),
            pages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching reviews",
        error: error.message,
      });
    }
  },

  // Admin: Update review status
  async updateReviewStatus(req, res) {
    try {
      const { reviewId } = req.params;
      const { status, adminComment } = req.body;

      if (!["pending", "approved", "rejected"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid review status",
        });
      }

      const review = await Review.findById(reviewId);

      if (!review) {
        return res.status(404).json({
          success: false,
          message: "Review not found",
        });
      }

      review.status = status;
      if (adminComment) {
        review.adminComment = adminComment;
      }
      review.metadata.moderatedAt = new Date();
      review.metadata.moderatedBy = req.user._id;

      await review.save();

      // Update product rating if review status changed
      await updateProductRating(review.product);

      res.json({
        success: true,
        message: "Review status updated successfully",
        data: review,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error updating review status",
        error: error.message,
      });
    }
  },

  // Admin: Delete review
  async deleteReview(req, res) {
    try {
      const { reviewId } = req.params;

      const review = await Review.findById(reviewId);

      if (!review) {
        return res.status(404).json({
          success: false,
          message: "Review not found",
        });
      }

      const productId = review.product;

      await review.remove();

      // Update product rating after review deletion
      await updateProductRating(productId);

      res.json({
        success: true,
        message: "Review deleted successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error deleting review",
        error: error.message,
      });
    }
  },
};

// Helper function to update product rating
async function updateProductRating(productId) {
  const stats = await Review.aggregate([
    {
      $match: {
        product: productId,
        status: "approved",
      },
    },
    {
      $group: {
        _id: null,
        averageRating: { $avg: "$rating" },
        totalReviews: { $sum: 1 },
        ratingCounts: {
          $push: {
            rating: "$rating",
          },
        },
      },
    },
  ]);

  if (stats.length > 0) {
    const ratingDistribution = Array(5).fill(0);
    stats[0].ratingCounts.forEach((r) => ratingDistribution[r.rating - 1]++);

    await Product.findByIdAndUpdate(productId, {
      "rating.average": Math.round(stats[0].averageRating * 10) / 10,
      "rating.count": stats[0].totalReviews,
      "rating.distribution": ratingDistribution,
    });
  } else {
    // No reviews - reset rating
    await Product.findByIdAndUpdate(productId, {
      "rating.average": 0,
      "rating.count": 0,
      "rating.distribution": [0, 0, 0, 0, 0],
    });
  }
}
