import mongoose from "mongoose";
import slugify from "slugify";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxLength: 100,
    },
    brand: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    description: {
      type: String,
      required: true,
      maxLength: 2000,
    },
    price: {
      base: {
        type: Number,
        required: true,
        min: 0,
      },
      discount: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },
      currency: {
        type: String,
        default: "INR",
      },
    },
    specifications: {
      colors: {
        available: [
          {
            name: { type: String, required: true },
            hexCode: { type: String, required: true },
          },
        ],
        // primary: {
        //   name: { type: String },
        //   hexCode: { type: String },
        // },
      },
      frame: {
        material: { type: String },
        size: { type: String },
        weight: { type: Number },
      },
      drivetrain: {
        type: { type: String },
        gearSystem: { type: String },
        speeds: { type: Number },
      },
      brakes: {
        type: { type: String },
        position: { type: String },
      },
      wheels: {
        size: { type: String },
        type: { type: String },
        tireSize: { type: String },
      },
      suspension: {
        type: { type: String },
        travel: { type: String },
      },
      handlebar: {
        type: { type: String },
        material: { type: String },
      },
    },
    features: [String],
    images: [
      {
        color: {
          name: String,
          hexCode: String,
        },
        data: {
          type: Buffer,
          required: true,
        },
        contentType: {
          type: String,
          required: true,
        },
        alt: String,
        filename: String,
        size: Number,
        isPrimary: Boolean,
      },
    ],
    inventory: {
      inStock: {
        type: Boolean,
        default: true,
      },
      quantity: {
        type: Number,
        required: true,
        min: 0,
      },
      reservedQuantity: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
    rating: {
      average: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
      },
      count: {
        type: Number,
        default: 0,
      },
      distribution: {
        type: [Number],
        default: [0, 0, 0, 0, 0],
      },
    },
    warranty: {
      duration: String,
      terms: String,
    },
    additionalInfo: {
      assembly: {
        required: Boolean,
        instructions: String,
      },
      maintenance: [String],
      includedAccessories: [String],
    },
    metadata: {
      isPublished: {
        type: Boolean,
        default: false,
      },
      slug: {
        type: String,
        unique: true,
      },
      searchTags: [String],
      createdAt: {
        type: Date,
        default: Date.now,
      },
      updatedAt: {
        type: Date,
        default: Date.now,
      },
    },
  },
  {
    timestamps: true,
  }
);
productSchema.methods.updateStock = async function (quantityChange) {
  const currentQuantity = this.inventory.quantity;
  const newQuantity = currentQuantity + quantityChange;

  if (newQuantity < 0) {
    throw new Error(`Insufficient stock for product ${this.name}`);
  }

  this.inventory.quantity = newQuantity;
  this.inventory.inStock = newQuantity > 0;

  // If stock is being decreased (negative quantityChange),
  // update reserved quantity for pending orders
  if (quantityChange < 0) {
    this.inventory.reservedQuantity = Math.max(
      0,
      this.inventory.reservedQuantity - Math.abs(quantityChange)
    );
  }

  return this.save();
};

// Indexes
productSchema.pre("save", async function (next) {
  this.metadata.updatedAt = new Date();
  if (!this.metadata.slug) {
    let slug = slugify(this.name, { lower: true });
    let counter = 1;

    while (await mongoose.model("Product").exists({ "metadata.slug": slug })) {
      slug = slugify(`${this.name}-${counter}`, { lower: true });
      counter++;
    }
    this.metadata.slug = slug;
  }
  next();
});

productSchema.post("save", function () {
  mongoose.model("Category").updateProductCount(this.category);
});

productSchema.pre("deleteOne", { document: true, query: false }, function () {
  mongoose.model("Category").updateProductCount(this.category);
});

productSchema.post("remove", function () {
  mongoose.model("Category").updateProductCount(this.category);
});

productSchema.pre("deleteMany", async function () {
  const products = await this.model.find(this.getFilter());
  const categoryIds = [...new Set(products.map((p) => p.category))];

  await Promise.all(
    categoryIds.map((categoryId) =>
      mongoose.model("Category").updateProductCount(categoryId)
    )
  );
});
productSchema.index({ name: "text", "metadata.searchTags": "text" });

productSchema.index({ category: 1 });
productSchema.index({ "price.base": 1 });
productSchema.index({ "ratings.average": -1 });
productSchema.post("save", async function () {
  await mongoose.model("Category").updateProductCount(this.category);
});

productSchema.post("remove", async function () {
  await mongoose.model("Category").updateProductCount(this.category);
});

// For bulk operations
productSchema.post("deleteMany", async function (result) {
  const affectedCategories = await mongoose
    .model("Product")
    .distinct("category", this.getFilter());
  for (const categoryId of affectedCategories) {
    await mongoose.model("Category").updateProductCount(categoryId);
  }
});
// Pre-save hook to update timestamps
productSchema.pre("save", function (next) {
  this.metadata.updatedAt = new Date();
  next();
});

export default mongoose.model("Product", productSchema);
