import Wishlist from "../models/Wishlist.js";
import Product from "../models/Product.js";
import Cart from "../models/Cart.js";

class WishlistController {
  // Get user's wishlist
  static async getWishlist(req, res) {
    try {
      let wishlist = await Wishlist.findOne({ user: req.user._id }).populate({
        path: "products.product",
        select:
          "name price.base metadata.slug price.discount images specifications brand",
      });

      if (!wishlist) {
        wishlist = new Wishlist({ user: req.user._id });
        await wishlist.save();
      }

      res.status(200).json({
        success: true,
        data: wishlist,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching wishlist",
        error: error.message,
      });
    }
  }

  // Add product to wishlist
  static async addToWishlist(req, res) {
    try {
      const { productId } = req.params;

      // Verify product exists
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      let wishlist = await Wishlist.findOne({ user: req.user._id });
      if (!wishlist) {
        wishlist = new Wishlist({ user: req.user._id });
      }

      wishlist.addProduct(productId);
      await wishlist.save();

      res.status(200).json({
        success: true,
        message: "Product added to wishlist",
        data: wishlist,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error adding to wishlist",
        error: error.message,
      });
    }
  }

  // Remove product from wishlist
  static async removeFromWishlist(req, res) {
    try {
      const { productId } = req.params;
      const wishlist = await Wishlist.findOne({ user: req.user._id });

      if (!wishlist) {
        return res.status(404).json({
          success: false,
          message: "Wishlist not found",
        });
      }

      wishlist.removeProduct(productId);
      await wishlist.save();

      res.status(200).json({
        success: true,
        message: "Product removed from wishlist",
        data: wishlist,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error removing from wishlist",
        error: error.message,
      });
    }
  }

  // Clear entire wishlist
  static async clearWishlist(req, res) {
    try {
      const wishlist = await Wishlist.findOne({ user: req.user._id });

      if (!wishlist) {
        return res.status(404).json({
          success: false,
          message: "Wishlist not found",
        });
      }

      wishlist.products = [];
      await wishlist.save();

      res.status(200).json({
        success: true,
        message: "Wishlist cleared",
        data: wishlist,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error clearing wishlist",
        error: error.message,
      });
    }
  }

  // Update notification settings for a product
  static async updateNotificationSettings(req, res) {
    try {
      const { productId } = req.params;
      const { priceDrops, backInStock } = req.body;

      const wishlist = await Wishlist.findOne({ user: req.user._id });
      if (!wishlist) {
        return res.status(404).json({
          success: false,
          message: "Wishlist not found",
        });
      }

      const productItem = wishlist.products.find(
        (item) => item.product.toString() === productId
      );

      if (!productItem) {
        return res.status(404).json({
          success: false,
          message: "Product not found in wishlist",
        });
      }

      productItem.notifications = {
        priceDrops: priceDrops ?? productItem.notifications.priceDrops,
        backInStock: backInStock ?? productItem.notifications.backInStock,
      };

      await wishlist.save();

      res.status(200).json({
        success: true,
        message: "Notification settings updated",
        data: wishlist,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error updating notification settings",
        error: error.message,
      });
    }
  }

  // Move product from wishlist to cart
  static async moveToCart(req, res) {
    try {
      const { productId } = req.params;

      // Get wishlist and verify product exists in it
      const wishlist = await Wishlist.findOne({ user: req.user._id });
      if (!wishlist || !wishlist.hasProduct(productId)) {
        return res.status(404).json({
          success: false,
          message: "Product not found in wishlist",
        });
      }

      // Add to cart
      let cart = await Cart.findOne({ user: req.user._id });

      if (!cart) {
        cart = new Cart({ user: req.user._id });
      }

      await cart.addItem(productId, 1); // Add 1 quantity by default

      // Remove from wishlist
      wishlist.removeProduct(productId);
      await wishlist.save();

      res.status(200).json({
        success: true,
        message: "Product moved to cart",
        data: {
          wishlist,
          cart,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error moving product to cart",
        error: error.message,
      });
    }
  }
}

export default WishlistController;
