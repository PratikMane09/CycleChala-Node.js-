// cartController.js
import mongoose from "mongoose";
import Cart from "../models/Cart.js";
import Product from "../models/Product.js";

export const cartController = {
  // Get cart with populated product details
  async getCart(req, res) {
    try {
      const cart = await Cart.findOne({ user: req.user._id })
        .populate({
          path: "items.product",
          select: "name price images inventory specifications brand category",
          populate: {
            path: "category",
            select: "name",
          },
        })
        .lean();

      if (!cart) {
        return res.status(404).json({
          success: false,
          message: "Cart not found",
        });
      }

      res.json({
        success: true,
        data: cart,
      });
    } catch (error) {
      console.error("Get cart error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching cart",
        error: error.message,
      });
    }
  },

  // Add item to cart
  async addToCart(req, res) {
    try {
      const { productId, quantity, specifications } = req.body;

      // Validate request body
      if (!productId || !Number.isInteger(quantity) || quantity < 1) {
        return res.status(400).json({
          success: false,
          message: "Invalid request parameters",
        });
      }

      // Check product exists and is in stock
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      if (!product.inventory.inStock || product.inventory.quantity < quantity) {
        return res.status(400).json({
          success: false,
          message: "Product is out of stock or insufficient quantity",
        });
      }

      let cart = await Cart.findOne({ user: req.user._id });
      if (!cart) {
        cart = new Cart({ user: req.user._id, items: [] });
      }

      await cart.addItem(productId, quantity, specifications);
      await cart.save();

      // Populate product details before sending response
      await cart.populate({
        path: "items.product",
        select: "name price images inventory specifications brand",
      });

      res.json({
        success: true,
        message: "Item added to cart successfully",
        data: cart,
      });
    } catch (error) {
      console.error("Add to cart error:", error);
      res.status(500).json({
        success: false,
        message: "Error adding item to cart",
        error: error.message,
      });
    }
  },

  // Update cart item

  async updateCartItem(req, res) {
    try {
      const { productId } = req.params;
      const { quantity, specifications } = req.body;

      // Validate productId
      if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid product ID",
        });
      }

      // Validate quantity
      if (!Number.isInteger(quantity) || quantity < 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid quantity",
        });
      }

      const cart = await Cart.findOne({ user: req.user._id });
      if (!cart) {
        return res.status(404).json({
          success: false,
          message: "Cart not found",
        });
      }

      // Check if product exists in cart
      const cartItem = cart.items.find(
        (item) => item.product && item.product.toString() === productId
      );

      if (!cartItem) {
        return res.status(404).json({
          success: false,
          message: "Product not found in cart",
        });
      }

      if (quantity === 0) {
        await cart.removeItem(productId);
      } else {
        await cart.updateItemQuantity(productId, quantity);
        if (specifications) {
          cartItem.selectedSpecs = {
            ...cartItem.selectedSpecs,
            ...specifications,
          };
        }
      }

      await cart.save();
      await cart.populate({
        path: "items.product",
        select: "name price images inventory specifications brand",
      });

      res.json({
        success: true,
        message: "Cart updated successfully",
        data: cart,
      });
    } catch (error) {
      console.error("Update cart error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating cart",
        error: error.message,
      });
    }
  },
  async removeFromCart(req, res) {
    try {
      const { productId } = req.params;
      const cart = await Cart.findOne({ user: req.user._id });

      if (!cart) {
        return res.status(404).json({
          success: false,
          message: "Cart not found",
        });
      }

      await cart.removeItem(productId);
      await cart.save();

      res.json({
        success: true,
        message: "Item removed from cart successfully",
        data: cart,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error removing item from cart",
        error: error.message,
      });
    }
  },

  async clearCart(req, res) {
    try {
      const cart = await Cart.findOne({ user: req.user._id });

      if (!cart) {
        return res.status(404).json({
          success: false,
          message: "Cart not found",
        });
      }

      await cart.clear();
      await cart.save();

      res.json({
        success: true,
        message: "Cart cleared successfully",
        data: cart,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error clearing cart",
        error: error.message,
      });
    }
  },
};
