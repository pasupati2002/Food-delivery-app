import mongoose from "mongoose";
import Cart from "../models/Cart.js";
import Restaurant from "../models/Restaurant.js";
import MenuItem from "../models/MenuItem.js";

function formatCart(cart) {
  const items = cart.items.map((item) => {
    const menuItem = item.menuItem;

    return {
      menuItemId: menuItem._id,
      name: menuItem.name,
      price: menuItem.price,
      image: menuItem.image,
      isAvailable: menuItem.isAvailable,
      quantity: item.quantity,
      subtotal: menuItem.price * item.quantity,
    };
  });

  const totalAmount = items.reduce(
    (total, item) => total + item.subtotal,
    0
  );

  return {
    id: cart._id,
    restaurant: cart.restaurant,
    items,
    totalAmount,
  };
}

// GET /api/cart
export async function getCart(req, res) {
  try {
    const cart = await Cart.findOne({
      customer: req.user._id,
    }).populate("items.menuItem", "name price image isAvailable");

    if (!cart) {
      return res.json({
        cart: {
          items: [],
          totalAmount: 0,
        },
      });
    }

    return res.json({ cart: formatCart(cart) });
  } catch (error) {
    console.error("Get cart error:", error.message);

    return res.status(500).json({
      message: "Unable to fetch cart",
    });
  }
}

// POST /api/cart/items
export async function addCartItem(req, res) {
  try {
    const { menuItemId, quantity = 1 } = req.body;

    if (
      typeof menuItemId !== "string" ||
      !mongoose.isValidObjectId(menuItemId)
    ) {
      return res.status(400).json({
        message: "A valid menu item ID is required",
      });
    }

    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 50
    ) {
      return res.status(400).json({
        message: "Quantity must be an integer from 1 to 50",
      });
    }

    const menuItem = await MenuItem.findById(menuItemId);

    if (!menuItem || !menuItem.isAvailable) {
      return res.status(404).json({
        message: "Menu item not found or unavailable",
      });
    }

    const restaurant = await Restaurant.findOne({
      _id: menuItem.restaurant,
      isActive: true,
      isOpen: true,
    });

    if (!restaurant) {
      return res.status(400).json({
        message: "This restaurant is currently unavailable",
      });
    }

    let cart = await Cart.findOne({
      customer: req.user._id,
    });

    if (!cart) {
      cart = await Cart.create({
        customer: req.user._id,
        restaurant: restaurant._id,
        items: [{ menuItem: menuItem._id, quantity }],
      });
    } else {
      if (
        cart.restaurant &&
        cart.restaurant.toString() !== restaurant._id.toString()
      ) {
        return res.status(400).json({
          message:
            "Your cart contains items from another restaurant. Clear your cart before switching restaurants.",
        });
      }

      const existingItem = cart.items.find(
        (item) => item.menuItem.toString() === menuItem._id.toString()
      );

      if (existingItem) {
        if (existingItem.quantity + quantity > 50) {
          return res.status(400).json({
            message: "An item cannot exceed a quantity of 50",
          });
        }

        existingItem.quantity += quantity;
      } else {
        cart.items.push({
          menuItem: menuItem._id,
          quantity,
        });
      }

      cart.restaurant = restaurant._id;
      await cart.save();
    }

    cart = await Cart.findById(cart._id).populate(
      "items.menuItem",
      "name price image isAvailable"
    );

    return res.status(200).json({
      message: "Item added to cart",
      cart: formatCart(cart),
    });
  } catch (error) {
    console.error("Add cart item error:", error.message);

    return res.status(500).json({
      message: "Unable to add item to cart",
    });
  }
}

// PATCH /api/cart/items/:menuItemId
export async function updateCartItem(req, res) {
  try {
    const { menuItemId } = req.params;
    const { quantity } = req.body;

    if (!mongoose.isValidObjectId(menuItemId)) {
      return res.status(400).json({
        message: "Invalid menu item ID",
      });
    }

    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 50
    ) {
      return res.status(400).json({
        message: "Quantity must be an integer from 1 to 50",
      });
    }

    const cart = await Cart.findOne({
      customer: req.user._id,
    });

    if (!cart) {
      return res.status(404).json({
        message: "Cart not found",
      });
    }

    const item = cart.items.find(
      (entry) => entry.menuItem.toString() === menuItemId
    );

    if (!item) {
      return res.status(404).json({
        message: "Item not found in cart",
      });
    }

    item.quantity = quantity;
    await cart.save();

    const updatedCart = await Cart.findById(cart._id).populate(
      "items.menuItem",
      "name price image isAvailable"
    );

    return res.json({
      message: "Cart quantity updated",
      cart: formatCart(updatedCart),
    });
  } catch (error) {
    console.error("Update cart error:", error.message);

    return res.status(500).json({
      message: "Unable to update cart",
    });
  }
}

// DELETE /api/cart/items/:menuItemId
export async function removeCartItem(req, res) {
  try {
    const { menuItemId } = req.params;

    if (!mongoose.isValidObjectId(menuItemId)) {
      return res.status(400).json({
        message: "Invalid menu item ID",
      });
    }

    const cart = await Cart.findOne({
      customer: req.user._id,
    });

    if (!cart) {
      return res.status(404).json({
        message: "Cart not found",
      });
    }

    const originalCount = cart.items.length;

    cart.items = cart.items.filter(
      (item) => item.menuItem.toString() !== menuItemId
    );

    if (cart.items.length === originalCount) {
      return res.status(404).json({
        message: "Item not found in cart",
      });
    }

    if (cart.items.length === 0) {
      cart.restaurant = null;
    }

    await cart.save();

    const updatedCart = await Cart.findById(cart._id).populate(
      "items.menuItem",
      "name price image isAvailable"
    );

    return res.json({
      message: "Item removed from cart",
      cart: formatCart(updatedCart),
    });
  } catch (error) {
    console.error("Remove cart item error:", error.message);

    return res.status(500).json({
      message: "Unable to remove item from cart",
    });
  }
}

// DELETE /api/cart
export async function clearCart(req, res) {
  try {
    await Cart.findOneAndUpdate(
      { customer: req.user._id },
      { $set: { items: [], restaurant: null } }
    );

    return res.json({
      message: "Cart cleared",
    });
  } catch (error) {
    console.error("Clear cart error:", error.message);

    return res.status(500).json({
      message: "Unable to clear cart",
    });
  }
}