import mongoose from "mongoose";
import Category from "../models/Category.js";
import Product from "../models/Product.js";
import { User } from "../models/User.js";
// import { Order } from "../models/Order";
import { processImage } from "../utils/imageProcessor.js";

export const adminController = {
  // Product Management
  async getAdminProducts(req, res) {
    try {
      const {
        search,
        category,
        brand,
        minPrice,
        maxPrice,
        inStock,
        sort = "createdAt",
        order = "desc",
        page = 1,
        limit = 12,
      } = req.query;

      // Base query
      const query = {};

      // Search functionality
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { brand: { $regex: search, $options: "i" } },
          { "metadata.searchTags": { $regex: search, $options: "i" } },
        ];
      }

      // Category filter
      if (category) {
        query.category = mongoose.Types.ObjectId(category);
      }

      // Brand filter
      if (brand) {
        query.brand = { $in: Array.isArray(brand) ? brand : [brand] };
      }

      // Price range filter
      if (minPrice || maxPrice) {
        query["price.base"] = {};
        if (minPrice) query["price.base"].$gte = Number(minPrice);
        if (maxPrice) query["price.base"].$lte = Number(maxPrice);
      }

      // Stock status
      if (inStock === "true") {
        query["inventory.inStock"] = true;
      } else if (inStock === "false") {
        query["inventory.inStock"] = false;
      }

      // Sorting configuration
      const sortOptions = {};
      const validSortFields = {
        createdAt: "metadata.createdAt",
        price: "price.base",
        name: 1,
        brand: 1,
        stock: "inventory.quantity",
      };

      const sortField = validSortFields[sort] || "metadata.createdAt";
      sortOptions[sortField] = order === "desc" ? -1 : 1;

      // Pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Retrieve products with full population
      const products = await Product.find(query)
        .populate({
          path: "category",
          select: "name slug categoryType",
        })
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      // Total count
      const total = await Product.countDocuments(query);

      // Simple filters aggregation
      const filters = await Product.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            brands: { $addToSet: "$brand" },
            categories: { $addToSet: "$category" },
            priceRange: {
              $push: {
                min: { $min: "$price.base" },
                max: { $max: "$price.base" },
              },
            },
          },
        },
      ]);

      return res.json({
        success: true,
        data: {
          products,
          filters: filters[0] || {},
          pagination: {
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
            hasMore: skip + products.length < total,
          },
        },
      });
    } catch (error) {
      console.error("Admin Product Query Error:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
        message: error.message,
      });
    }
  },
  async createProduct(req, res) {
    try {
      const processedImages = req.files?.length
        ? await Promise.all(
            req.files.map(async (file, index) => {
              const processed = await processImage(file.buffer);
              return {
                data: processed,
                contentType: "image/webp",
                filename: file.originalname,
                size: processed.length,
                alt: req.body.imageAlts?.[index] || "",
                isPrimary: index === 0,
              };
            })
          )
        : [];

      const product = new Product({
        ...req.body,
        images: processedImages,
      });

      await product.save();
      res.status(201).json(product);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async updateProduct(req, res) {
    try {
      const product = await Product.findById(req.params.id);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      if (req.files?.length) {
        const processedImages = await Promise.all(
          req.files.map(async (file, index) => {
            const processed = await processImage(file.buffer);
            return {
              data: processed,
              contentType: "image/webp",
              filename: file.originalname,
              size: processed.length,
              alt: req.body.imageAlts?.[index] || "",
              isPrimary: index === 0,
            };
          })
        );
        product.images = processedImages;
      }

      Object.assign(product, req.body);
      await product.save();
      res.json(product);
    } catch (error) {
      res.status(400).json({ error: error.message });
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

  // User Management
  async listUsers(req, res) {
    try {
      const users = await User.find().select("-password");
      res.json(users);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async verifyUser(req, res) {
    try {
      const user = await User.findByIdAndUpdate(
        req.params.id,
        { isVerified: true },
        { new: true }
      ).select("-password");

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json(user);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Order Management
  async listOrders(req, res) {
    try {
      const orders = await Order.find()
        .populate("user", "name email")
        .populate("products.product");
      res.json(orders);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async updateOrderStatus(req, res) {
    try {
      const order = await Order.findByIdAndUpdate(
        req.params.id,
        { status: req.body.status },
        { new: true }
      );

      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      res.json(order);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Dashboard
  async getDashboardStats(req, res) {
    try {
      const [totalUsers, totalOrders, totalProducts, recentOrders] =
        await Promise.all([
          User.countDocuments({ role: "user" }),
          Order.countDocuments(),
          Product.countDocuments(),
          Order.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate("user", "name"),
        ]);

      res.json({
        statistics: {
          users: totalUsers,
          orders: totalOrders,
          products: totalProducts,
        },
        recentOrders,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
};
