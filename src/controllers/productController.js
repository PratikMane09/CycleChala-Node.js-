// src/controllers/productController.js

import Category from "../models/Category.js";
import Product from "../models/Product.js";
import { processImage } from "../utils/imageProcessor.js";
import mongoose from "mongoose";
class AppError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

const createError = (statusCode, message, originalError = null) => {
  const error = new AppError(statusCode, message);
  if (originalError) {
    error.stack = originalError.stack;
    error.original = originalError;
  }
  return error;
};

// Helper function for related products
const getRelatedProducts = async (currentProductId, categoryId, limit = 4) => {
  try {
    return await Product.find({
      _id: { $ne: currentProductId },
      category: categoryId,
      "metadata.isPublished": true,
    })
      .select("name brand price.base metadata.slug images.data")
      .limit(limit);
  } catch (error) {
    console.error("Related Products Error:", error);
    return [];
  }
};

export const productController = {
  // Product Management
  async getProductDetails(req, res, next) {
    try {
      const { slug } = req.params;

      const product = await Product.findOne({
        "metadata.slug": slug,
        "metadata.isPublished": true,
      }).populate({
        path: "category",
        select: "name slug description categoryType metadata.specifications",
      }).select(`
        name brand description price specifications 
        features inventory.inStock rating warranty 
        additionalInfo metadata images.data 
        images.contentType images.alt
      `);

      if (!product) {
        throw createError(404, "Product not found");
      }

      const response = {
        success: true,
        data: {
          ...product.toJSON(),
          breadcrumb: [
            { name: "Home", path: "/" },
            {
              name: product.category.name,
              path: `/categories/${product.category.slug}`,
            },
            { name: product.name, path: `/products/${product.metadata.slug}` },
          ],
          seo: {
            title: `${product.name} | ${product.brand}`,
            description: product.description.substring(0, 160),
            canonical: `/products/${product.metadata.slug}`,
            metadata: {
              product: {
                name: product.name,
                brand: product.brand,
                price: product.price.base,
                currency: product.price.currency,
                availability: product.inventory.inStock
                  ? "in stock"
                  : "out of stock",
                category: product.category.name,
              },
            },
          },
          relatedProducts: await getRelatedProducts(
            product._id,
            product.category._id
          ),
        },
      };

      res.set({
        "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
        "Surrogate-Control": "max-age=3600",
      });

      return res.json(response);
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message,
        });
      }

      console.error("Product Detail Error:", error);

      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  async getProducts(req, res) {
    try {
      const {
        // Basic filters
        category,
        search,
        minPrice,
        maxPrice,
        brand,
        inStock,

        // Category-specific filters
        categoryType,
        ageGroup,
        gender,
        professionalLevel,

        // Product specifications
        frameMaterial,
        wheelSize,
        suspension,

        // Sorting and pagination
        sort = "createdAt",
        order = "desc",
        page = 1,
        limit = 24, // Increased default limit

        // Additional options
        includeOutOfStock = false,
        includeCategoryInfo = true, // Changed to true by default
      } = req.query;

      // Build the base query
      const query = {
        "metadata.isPublished": true,
      };

      // Comprehensive category handling
      if (category) {
        const categoryIds = Array.isArray(category)
          ? category
          : category.split(",");

        // Validate and find categories with descendants
        const categories = await Category.aggregate([
          {
            $match: {
              _id: {
                $in: categoryIds.map((id) => new mongoose.Types.ObjectId(id)),
              },
            },
          },
          {
            $graphLookup: {
              from: "categories",
              startWith: "$_id",
              connectFromField: "_id",
              connectToField: "parent",
              as: "descendants",
            },
          },
        ]);

        // Collect all category IDs including descendants
        const allCategoryIds = categories.flatMap((cat) => [
          cat._id,
          ...cat.descendants.map((d) => d._id),
        ]);

        query.category = { $in: allCategoryIds };
      }

      // Apply additional category-specific filters
      const applyCategoryFilter = async (filterField, filterValue) => {
        const filteredCategories = await Category.find({
          categoryType: filterField,
          [filterField]: filterValue,
        }).distinct("_id");

        if (query.category) {
          query.category.$in = query.category.$in.filter((id) =>
            filteredCategories.some((catId) => catId.equals(id))
          );
        } else {
          query.category = { $in: filteredCategories };
        }
      };

      // Apply filters if present
      if (categoryType) await applyCategoryFilter("categoryType", categoryType);
      if (ageGroup) await applyCategoryFilter("ageGroup", ageGroup);
      if (gender) await applyCategoryFilter("gender", gender);
      if (professionalLevel)
        await applyCategoryFilter("professionalLevel", professionalLevel);

      // Price range filter
      if (minPrice || maxPrice) {
        query["price.base"] = {};
        if (minPrice) query["price.base"].$gte = Number(minPrice);
        if (maxPrice) query["price.base"].$lte = Number(maxPrice);
      }

      // Additional filters
      if (brand) query.brand = { $in: Array.isArray(brand) ? brand : [brand] };
      if (frameMaterial) query["specifications.frame.material"] = frameMaterial;
      if (wheelSize) query["specifications.wheels.size"] = wheelSize;
      if (suspension) query["specifications.suspension.type"] = suspension;

      // Stock status handling
      if (!includeOutOfStock) {
        query["inventory.inStock"] = true;
      } else if (inStock === "true" || inStock === "false") {
        query["inventory.inStock"] = inStock === "true";
      }

      // Search functionality
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { brand: { $regex: search, $options: "i" } },
          { "metadata.searchTags": { $regex: search, $options: "i" } },
        ];
      }

      // Sorting configuration
      const sortOptions = {};
      const validSortFields = {
        createdAt: { "metadata.createdAt": -1 },
        price: { "price.base": 1 },
        name: { name: 1 },
        rating: { "rating.average": -1 },
      };

      sortOptions[validSortFields[sort] ? sort : "createdAt"] =
        order === "desc" ? -1 : 1;

      // Pagination
      const pageNum = parseInt(page) || 1;
      const pageLimit = parseInt(limit) || 24;
      const skip = (pageNum - 1) * pageLimit;

      // Select fields
      const selectFields = {
        name: 1,
        brand: 1,
        price: 1,
        description: 1,
        "specifications.frame.material": 1,
        "specifications.wheels.size": 1,
        "inventory.inStock": 1,
        rating: 1,
        "metadata.slug": 1,
        images: 1,
        ...(includeCategoryInfo ? { category: 1 } : {}),
      };

      // Execute main query
      const [products, total] = await Promise.all([
        Product.find(query)
          .select(selectFields)
          .populate(
            includeCategoryInfo
              ? {
                  path: "category",
                  select: "name slug categoryType",
                }
              : null
          )
          .sort(sortOptions)
          .skip(skip)
          .limit(pageLimit)
          .lean(),
        Product.countDocuments(query),
      ]);

      // Prepare response
      return res.json({
        success: true,
        data: {
          products,
          pagination: {
            total,
            page: pageNum,
            pages: Math.ceil(total / pageLimit),
            hasMore: skip + products.length < total,
          },
        },
      });
    } catch (error) {
      console.error("Product Query Error:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
        message: error.message,
      });
    }
  },
  async createProduct(req, res) {
    try {
      // Ensure req.body.data exists and is a string
      if (!req.body.data) {
        throw new Error("Product data is required");
      }

      // Parse the JSON data
      let productData;
      try {
        productData = JSON.parse(req.body.data);
      } catch (parseError) {
        console.error("JSON parsing error:", parseError);
        throw new Error("Invalid product data format");
      }

      // Process images if they exist
      const processedImages = req.files?.length
        ? await Promise.all(
            req.files.map(async (file, index) => {
              const processed = await processImage(file.buffer);

              // Safely parse image metadata
              let metadata = { isPrimary: false, filename: file.originalname };
              try {
                if (req.body[`imageMetadata[${index}]`]) {
                  metadata = JSON.parse(req.body[`imageMetadata[${index}]`]);
                }
              } catch (e) {
                console.warn(`Failed to parse metadata for image ${index}`);
              }

              return {
                data: processed,
                contentType: "image/webp",
                filename: metadata.filename,
                size: processed.length,
                isPrimary: metadata.isPrimary,
                alt: metadata.alt || "",
              };
            })
          )
        : [];

      // Create new product with the parsed data
      const product = new Product({
        ...productData,
        images: processedImages,
      });

      // Validate the product before saving
      const validationError = product.validateSync();
      if (validationError) {
        throw validationError;
      }

      await product.save();
      res.status(201).json(product);
    } catch (error) {
      console.error("Product creation error:", error);
      res.status(400).json({
        error: error.message,
        details: error.errors
          ? Object.values(error.errors).map((e) => e.message)
          : undefined,
      });
    }
  },

  async updateProduct(req, res) {
    try {
      // Find the existing product
      const product = await Product.findById(req.params.id);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      // Parse product data if it exists
      let productData = {};
      if (req.body.data) {
        try {
          productData = JSON.parse(req.body.data);
          // Remove images from productData to handle them separately
          delete productData.images;
        } catch (parseError) {
          console.error("JSON parsing error:", parseError);
          throw new Error("Invalid product data format");
        }
      }

      // Debug log to check files
      console.log("Received files:", req.files);

      // Process new images if they exist
      if (req.files && req.files.length > 0) {
        const processedImages = await Promise.all(
          req.files.map(async (file, index) => {
            console.log("Processing file:", file.originalname); // Debug log
            const processed = await processImage(file.buffer);

            // Safely parse image metadata
            let metadata = { isPrimary: false, filename: file.originalname };
            try {
              if (req.body[`imageMetadata[${index}]`]) {
                metadata = JSON.parse(req.body[`imageMetadata[${index}]`]);
              }
            } catch (e) {
              console.warn(`Failed to parse metadata for image ${index}`);
            }

            return {
              data: processed,
              contentType: "image/webp",
              filename: metadata.filename,
              size: processed.length,
              isPrimary: metadata.isPrimary,
              alt: metadata.alt || "",
            };
          })
        );

        // Handle image updates
        if (productData.keepExistingImages) {
          product.images = [...product.images, ...processedImages];
        } else {
          product.images = processedImages;
        }
      }

      // Update other product fields
      Object.assign(product, productData);

      // Validate the updated product
      const validationError = product.validateSync();
      if (validationError) {
        throw validationError;
      }

      // Save and return the updated product
      await product.save();
      res.json(product);
    } catch (error) {
      console.error("Product update error:", error);
      res.status(400).json({
        error: error.message,
        details: error.errors
          ? Object.values(error.errors).map((e) => e.message)
          : undefined,
      });
    }
  },

  async deleteProduct(req, res) {
    try {
      const product = await Product.findByIdAndDelete(req.params.id);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      res.json({ message: "Product deleted successfully" });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
};
