import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    description: {
      type: String,
      required: true,
      maxLength: 1000,
    },
    categoryType: {
      type: String,
      required: true,
      enum: ["general", "age-group", "gender", "professional"],
    },
    ageGroup: {
      minAge: {
        type: Number,
        min: 0,
        required: function () {
          return this.categoryType === "age-group";
        },
      },
      maxAge: {
        type: Number,
        required: function () {
          return this.categoryType === "age-group";
        },
      },
    },
    gender: {
      type: String,
      enum: ["male", "female", "unisex"],
      required: function () {
        return this.categoryType === "gender";
      },
    },
    professionalLevel: {
      type: String,
      enum: ["beginner", "intermediate", "professional", "expert"],
      required: function () {
        return this.categoryType === "professional";
      },
    },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    ancestors: [
      {
        _id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Category",
        },
        name: String,
        slug: String,
      },
    ],
    image: {
      data: {
        type: Buffer,
      },
      contentType: {
        type: String,
      },
      alt: String,
      filename: String,
      size: Number,
    },
    featured: {
      type: Boolean,
      default: false,
    },
    metadata: {
      productCount: {
        type: Number,
        default: 0,
      },
      isActive: {
        type: Boolean,
        default: true,
      },
      displayOrder: {
        type: Number,
        default: 0,
      },
      specifications: {
        frameSize: [String],
        wheelSize: [String],
        recommended: {
          height: {
            min: Number,
            max: Number,
          },
          weight: {
            min: Number,
            max: Number,
          },
        },
      },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
categorySchema.index({ parent: 1 });
categorySchema.index({ "metadata.displayOrder": 1 });
categorySchema.index({ categoryType: 1 });
categorySchema.index({ "ageGroup.minAge": 1, "ageGroup.maxAge": 1 });
categorySchema.index({ gender: 1 });
categorySchema.index({ professionalLevel: 1 });

// Update product count method
categorySchema.statics.updateProductCount = async function (categoryId) {
  try {
    const productCount = await mongoose
      .model("Product")
      .countDocuments({ category: categoryId });

    await this.findByIdAndUpdate(categoryId, {
      "metadata.productCount": productCount,
    });

    const category = await this.findById(categoryId);
    if (category?.ancestors?.length) {
      await Promise.all(
        category.ancestors.map(async (ancestor) => {
          const descendantIds = await this.find({
            "ancestors._id": ancestor._id,
          }).distinct("_id");

          const ancestorProductCount = await mongoose
            .model("Product")
            .countDocuments({
              $or: [
                { category: ancestor._id },
                { category: { $in: descendantIds } },
              ],
            });

          await this.findByIdAndUpdate(ancestor._id, {
            "metadata.productCount": ancestorProductCount,
          });
        })
      );
    }
  } catch (error) {
    console.error("Error updating product count:", error);
    throw error;
  }
};

export default mongoose.model("Category", categorySchema);
