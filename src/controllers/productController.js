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
        additionalInfo metadata images
      `);

      if (!product) {
        throw createError(404, "Product not found");
      }

      // Process colors and images to create a unified color representation
      const processedColors = [];
      const colorMap = new Map();

      // First, add colors from specifications
      if (product.specifications?.colors?.available) {
        product.specifications.colors.available.forEach((color) => {
          colorMap.set(color?.name?.toLowerCase(), {
            name: color.name,
            hexCode: color.hexCode,
            images: [],
          });
        });
      }

      // Then, process images and map them to colors
      if (product.images && product.images.length > 0) {
        product.images.forEach((image) => {
          if (image.color) {
            const colorKey = image.color?.name?.toLowerCase();

            if (!colorMap.has(colorKey)) {
              colorMap.set(colorKey, {
                name: image.color.name,
                hexCode: image.color.hexCode,
                images: [],
              });
            }

            colorMap.get(colorKey).images.push({
              data: image.data,
              contentType: image.contentType,
              alt: image.alt || `${product.name} in ${image.color.name}`,
              isPrimary: image.isPrimary || false,
            });
          }
        });
      }

      // Convert the map to an array and sort by primary images
      const availableColors = Array.from(colorMap.values())
        .filter((color) => color.images.length > 0)
        .map((color) => ({
          ...color,
          primaryImage:
            color.images.find((img) => img.isPrimary) || color.images[0],
        }));

      const response = {
        success: true,
        data: {
          ...product.toJSON(),
          colors: availableColors,
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

        // New color filters
        color, // Add color filter parameter
        imageColor, // Add image color filter parameter

        // Sorting and pagination
        sort = "createdAt",
        order = "desc",
        page = 1,
        limit = 24,

        // Additional options
        includeOutOfStock = false,
        includeCategoryInfo = true,
      } = req.query;

      // Add color filters
      if (color) {
        query["specifications.colors.available"] = {
          $elemMatch: {
            name: { $regex: color, $options: "i" },
          },
        };
      }

      if (imageColor) {
        query["images"] = {
          $elemMatch: {
            "color.name": { $regex: imageColor, $options: "i" },
          },
        };
      }

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

      if (categoryType) await applyCategoryFilter("categoryType", categoryType);
      if (ageGroup) await applyCategoryFilter("ageGroup", ageGroup);
      if (gender) await applyCategoryFilter("gender", gender);
      if (professionalLevel)
        await applyCategoryFilter("professionalLevel", professionalLevel);

      if (minPrice || maxPrice) {
        query["price.base"] = {};
        if (minPrice) query["price.base"].$gte = Number(minPrice);
        if (maxPrice) query["price.base"].$lte = Number(maxPrice);
      }

      if (brand) query.brand = { $in: Array.isArray(brand) ? brand : [brand] };
      if (frameMaterial) query["specifications.frame.material"] = frameMaterial;
      if (wheelSize) query["specifications.wheels.size"] = wheelSize;
      if (suspension) query["specifications.suspension.type"] = suspension;

      if (!includeOutOfStock) {
        query["inventory.inStock"] = true;
      } else if (inStock === "true" || inStock === "false") {
        query["inventory.inStock"] = inStock === "true";
      }

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { brand: { $regex: search, $options: "i" } },
          { "metadata.searchTags": { $regex: search, $options: "i" } },
        ];
      }

      const sortOptions = {};
      const validSortFields = {
        createdAt: { "metadata.createdAt": -1 },
        price: { "price.base": 1 },
        name: { name: 1 },
        rating: { "rating.average": -1 },
      };

      sortOptions[validSortFields[sort] ? sort : "createdAt"] =
        order === "desc" ? -1 : 1;

      const pageNum = parseInt(page) || 1;
      const pageLimit = parseInt(limit) || 24;
      const skip = (pageNum - 1) * pageLimit;

      const selectFields = {
        name: 1,
        brand: 1,
        price: 1,
        description: 1,
        "specifications.frame.material": 1,
        "specifications.wheels.size": 1,
        "specifications.colors": 1, // Added colors to selected fields
        "inventory.inStock": 1,
        rating: 1,
        "metadata.slug": 1,
        images: 1,
        ...(includeCategoryInfo ? { category: 1 } : {}),
      };

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
      if (!req.body.data) {
        return res.status(400).json({ error: "Product data is required" });
      }

      let productData;
      try {
        productData = JSON.parse(req.body.data);
      } catch (parseError) {
        return res.status(400).json({ error: "Invalid product data format" });
      }

      // Validate required fields
      if (!productData.name || !productData.category) {
        return res
          .status(400)
          .json({ error: "Name and category are required" });
      }

      // Parse image metadata once
      let allImageMetadata = [];
      try {
        allImageMetadata = JSON.parse(req.body.imageMetadata || "[]");
      } catch (e) {
        console.warn("Failed to parse image metadata:", e);
        allImageMetadata = [];
      }

      // Process images with enhanced metadata handling
      const processedImages = req.files?.length
        ? await Promise.all(
            req.files.map(async (file, index) => {
              const processed = await processImage(file.buffer);

              // Get metadata for this specific image
              const metadata = allImageMetadata[index] || {};
              console.log("color", metadata.color);
              return {
                data: processed,
                contentType: "image/webp",
                filename: metadata.filename || file.originalname,
                size: processed.length,
                isPrimary: metadata.isPrimary || false,
                alt: metadata.alt || `${productData.name} - Image ${index + 1}`,
                color: metadata.color || null, // This will now properly capture the color data
              };
            })
          )
        : [];

      // Rest of your code remains the same...
      const enrichedProductData = {
        ...productData,
        images: processedImages,
        metadata: {
          ...productData.metadata,
          createdAt: new Date(),
          updatedAt: new Date(),
          isPublished: productData.metadata?.isPublished ?? false,
        },
      };

      const product = new Product(enrichedProductData);
      await product.validate();
      await product.save();

      res.status(201).json({
        message: "Product created successfully",
        product: {
          _id: product._id,
          name: product.name,
          slug: product.metadata.slug,
        },
      });
    } catch (error) {
      console.error("Product creation error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error.message,
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

      // Parse and validate product data
      let productData;
      if (req.body.data) {
        try {
          productData = JSON.parse(req.body.data);
        } catch (parseError) {
          return res.status(400).json({ error: "Invalid product data format" });
        }
      }

      // Parse image metadata once
      let allImageMetadata = [];
      try {
        allImageMetadata = JSON.parse(req.body.imageMetadata || "[]");
      } catch (e) {
        console.warn("Failed to parse image metadata:", e);
        allImageMetadata = [];
      }

      // Process new images if they exist
      let processedImages = [];
      if (req.files?.length) {
        processedImages = await Promise.all(
          req.files.map(async (file, index) => {
            const processed = await processImage(file.buffer);

            // Get metadata for this specific image
            const metadata = allImageMetadata[index] || {};

            return {
              data: processed,
              contentType: "image/webp",
              filename: metadata.filename || file.originalname,
              size: processed.length,
              isPrimary: metadata.isPrimary || false,
              alt:
                metadata.alt ||
                `${productData.name || product.name} - Image ${index + 1}`,
              color: metadata.color || null,
            };
          })
        );
      }

      // Handle image updates based on keepExistingImages flag
      if (productData?.keepExistingImages) {
        productData.images = [...(product.images || []), ...processedImages];
      } else if (processedImages.length > 0) {
        productData.images = processedImages;
      }
      // If no new images and keepExistingImages is false, images will be cleared

      // Prepare the update data
      const enrichedProductData = {
        ...productData,
        metadata: {
          ...(product.metadata || {}),
          ...(productData?.metadata || {}),
          updatedAt: new Date(),
        },
      };

      // Update the product with the new data
      Object.assign(product, enrichedProductData);

      // Validate the updated product
      await product.validate();

      // Save the updated product
      await product.save();

      // Return success response
      res.json({
        message: "Product updated successfully",
        product: {
          _id: product._id,
          name: product.name,
          slug: product.metadata.slug,
        },
      });
    } catch (error) {
      console.error("Product update error:", error);
      if (error.name === "ValidationError") {
        return res.status(400).json({
          error: "Validation error",
          details: Object.values(error.errors).map((err) => err.message),
        });
      }
      res.status(500).json({
        error: "Internal server error",
        message: error.message,
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

export const homepageController = {
  async updateHomepageSettings(req, res) {
    try {
      const { productId } = req.params;
      const { isDisplayed, priority, section, startDate, endDate } = req.body;

      const product = await Product.findById(productId);

      if (!product) {
        throw createError(404, "Product not found");
      }

      // Update homepage display settings
      product.displaySettings = {
        homepage: {
          isDisplayed,
          priority: Math.min(Math.max(priority, 0), 100),
          section,
          startDate: startDate || new Date(),
          endDate: endDate || null,
        },
      };

      await product.save();

      return res.json({
        success: true,
        message: "Homepage display settings updated successfully",
        data: product.displaySettings,
      });
    } catch (error) {
      console.error("Homepage Settings Update Error:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || "Internal server error",
      });
    }
  },

  async getHomepageProducts(req, res) {
    try {
      const sections = ["featured", "bestseller", "new", "trending", "special"];
      const products = {};

      await Promise.all(
        sections.map(async (section) => {
          products[section] = await Product.getHomepageProducts({
            section,
            limit: section === "featured" ? 6 : 8,
          });
        })
      );

      return res.json({
        success: true,
        data: products,
      });
    } catch (error) {
      console.error("Homepage Products Error:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch homepage products",
      });
    }
  },
};
