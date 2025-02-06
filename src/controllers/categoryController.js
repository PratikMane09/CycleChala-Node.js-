import Category from "../models/Category.js";
import mongoose from "mongoose";
import { processImage } from "../utils/imageProcessor.js";

export const categoryController = {
  async getCategory(req, res) {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: "Invalid category ID" });
      }

      const category = await Category.findById(req.params.id)
        .populate("parent")
        .populate("ancestors._id");

      if (!category) {
        return res.status(404).json({ error: "Category not found" });
      }

      res.json(category);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async getCategories(req, res) {
    try {
      const {
        parent,
        search,
        limit = 10,
        page = 1,
        categoryType,
        ageGroup,
        gender,
        professionalLevel,
        featured,
      } = req.query;

      const query = {};

      // Base filters
      if (parent) {
        if (!mongoose.Types.ObjectId.isValid(parent)) {
          return res.status(400).json({ error: "Invalid parent category ID" });
        }
        query.parent = new mongoose.Types.ObjectId(parent);
      }

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }

      // New filters
      if (categoryType) {
        query.categoryType = categoryType;
      }

      if (ageGroup) {
        const [minAge, maxAge] = ageGroup.split(",").map(Number);
        if (!isNaN(minAge) && !isNaN(maxAge)) {
          query["ageGroup.minAge"] = { $gte: minAge };
          query["ageGroup.maxAge"] = { $lte: maxAge };
        }
      }

      if (gender) {
        query.gender = gender;
      }

      if (professionalLevel) {
        query.professionalLevel = professionalLevel;
      }

      if (featured !== undefined) {
        query.featured = featured === "true";
      }

      const [categories, total] = await Promise.all([
        Category.find(query)
          .populate("parent")
          .populate("ancestors._id")
          .sort({ "metadata.displayOrder": 1, createdAt: -1 })
          .limit(parseInt(limit))
          .skip((parseInt(page) - 1) * parseInt(limit)),
        Category.countDocuments(query),
      ]);

      res.json({
        categories,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async createCategory(req, res) {
    try {
      // Parse ageGroup from request body if it exists
      const ageGroup = req.body.ageGroup
        ? JSON.parse(req.body.ageGroup)
        : undefined;

      // Process the image if provided
      const processedImage = req.file
        ? await processImage(req.file.buffer)
        : null;

      // Parse specifications from request body
      const specifications = req.body.metadata?.specifications
        ? JSON.parse(req.body.metadata.specifications)
        : undefined;

      // Prepare category data
      const categoryData = {
        ...req.body,
        // Include the parsed ageGroup data
        ...(ageGroup && { ageGroup }),
        metadata: {
          ...JSON.parse(req.body.metadata || "{}"),
          ...(specifications && { specifications }),
        },
        ...(processedImage && {
          image: {
            data: processedImage,
            contentType: "image/webp",
            filename: req.file.originalname,
            size: processedImage.length,
            alt: req.body.imageAlt,
          },
        }),
      };
      // If there's a parent category, set up ancestors
      if (req.body.parent) {
        const parentCategory = await Category.findById(req.body.parent);
        if (parentCategory) {
          categoryData.ancestors = [
            ...parentCategory.ancestors,
            {
              _id: parentCategory._id,
              name: parentCategory.name,
              slug: parentCategory.slug,
            },
          ];
        }
      }

      const category = new Category(categoryData);
      await category.save();

      // Update product count
      await Category.updateProductCount(category._id);

      res.status(201).json(category);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async updateCategory(req, res) {
    try {
      const category = await Category.findById(req.params.id);
      if (!category) {
        return res.status(404).json({ error: "Category not found" });
      }

      // Process new image if provided
      if (req.file) {
        const processedImage = await processImage(req.file.buffer);
        category.image = {
          data: processedImage,
          contentType: "image/webp",
          filename: req.file.originalname,
          size: processedImage.length,
          alt: req.body.imageAlt || category.image?.alt,
        };
      }

      // Parse and update specifications
      if (req.body.metadata?.specifications) {
        const specifications = JSON.parse(req.body.metadata.specifications);
        req.body.metadata = {
          ...JSON.parse(req.body.metadata),
          specifications,
        };
      }

      // Handle parent category change and update ancestors
      if (req.body.parent && req.body.parent !== category.parent?.toString()) {
        const parentCategory = await Category.findById(req.body.parent);
        if (parentCategory) {
          category.ancestors = [
            ...parentCategory.ancestors,
            {
              _id: parentCategory._id,
              name: parentCategory.name,
              slug: parentCategory.slug,
            },
          ];
        }
      }

      // Update category fields
      Object.assign(category, req.body);
      await category.save();

      // Update product count
      await Category.updateProductCount(category._id);

      // Fetch and return updated category with populated references
      const updatedCategory = await Category.findById(category._id)
        .populate("parent")
        .populate("ancestors._id");

      res.json(updatedCategory);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async deleteCategory(req, res) {
    try {
      // Check for child categories
      const childCategories = await Category.find({ parent: req.params.id });
      if (childCategories.length > 0) {
        return res.status(400).json({
          error:
            "Cannot delete category with child categories. Please delete or move child categories first.",
        });
      }

      // Check for associated products
      const productCount = await mongoose
        .model("Product")
        .countDocuments({ category: req.params.id });

      if (productCount > 0) {
        return res.status(400).json({
          error:
            "Cannot delete category with associated products. Please delete or move products first.",
        });
      }

      const category = await Category.findByIdAndDelete(req.params.id);
      if (!category) {
        return res.status(404).json({ error: "Category not found" });
      }

      res.json({ message: "Category deleted successfully" });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async list(req, res) {
    try {
      const { categoryType, featured, isActive } = req.query;

      const query = {};

      if (categoryType) {
        query.categoryType = categoryType;
      }

      if (featured !== undefined) {
        query.featured = featured === "true";
      }

      if (isActive !== undefined) {
        query["metadata.isActive"] = isActive === "true";
      }

      const categories = await Category.find(query)
        .populate("parent")
        .populate("ancestors._id")
        .sort({ "metadata.displayOrder": 1, createdAt: -1 });

      res.json(categories);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
};
