
import mongoose from "mongoose";
import Order from "../models/Order.js";
import User from "../models/User.js";
import MenuItem from "../models/MenuItem.js";

const MAX_QUANTITY_PER_ITEM = 50;
const MAX_LINE_ITEMS = 50;
const MAX_ADDRESS_LENGTH = 500;

const allowedStatuses = [
  "confirmed",
  "preparing",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

const validStatusTransitions = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered"],
  delivered: [],
  cancelled: [],
};

// Create an order using prices stored in the database.
export async function createOrder(req, res) {
  try {
    const { restaurant, items, deliveryAddress } = req.body;

    if (
      !restaurant ||
      !mongoose.isValidObjectId(restaurant) ||
      !Array.isArray(items) ||
      items.length === 0 ||
      typeof deliveryAddress !== "string" ||
      !deliveryAddress.trim()
    ) {
      return res.status(400).json({
        message:
          "A valid restaurant, items, and delivery address are required",
      });
    }

    if (items.length > MAX_LINE_ITEMS) {
      return res.status(400).json({
        message: `An order cannot contain more than ${MAX_LINE_ITEMS} line items`,
      });
    }

    const address = deliveryAddress.trim();

    if (address.length > MAX_ADDRESS_LENGTH) {
      return res.status(400).json({
        message: `Delivery address cannot exceed ${MAX_ADDRESS_LENGTH} characters`,
      });
    }

    const quantitiesByItemId = new Map();

    for (const item of items) {
      if (
        !item ||
        typeof item !== "object" ||
        !mongoose.isValidObjectId(item.menuItem) ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > MAX_QUANTITY_PER_ITEM
      ) {
        return res.status(400).json({
          message:
            "Each item must have a valid menu item ID and quantity between 1 and 50",
        });
      }

      const itemId = item.menuItem.toString();
      const combinedQuantity =
        (quantitiesByItemId.get(itemId) || 0) + item.quantity;

      if (combinedQuantity > MAX_QUANTITY_PER_ITEM) {
        return res.status(400).json({
          message:
            "The combined quantity of a menu item cannot exceed 50",
        });
      }

      quantitiesByItemId.set(itemId, combinedQuantity);
    }

    const menuItemIds = [...quantitiesByItemId.keys()];

    const menuItems = await MenuItem.find({
      _id: { $in: menuItemIds },
      restaurant,
      isAvailable: true,
    }).select("_id name price restaurant isAvailable");

    if (menuItems.length !== menuItemIds.length) {
      return res.status(400).json({
        message:
          "One or more items are unavailable or do not belong to this restaurant",
      });
    }

    const menuItemById = new Map(
      menuItems.map((item) => [item._id.toString(), item])
    );

    const orderItems = [];
    let totalAmount = 0;

    for (const [itemId, quantity] of quantitiesByItemId) {
      const menuItem = menuItemById.get(itemId);

      if (
        !menuItem ||
        !Number.isFinite(menuItem.price) ||
        menuItem.price < 0
      ) {
        return res.status(400).json({
          message: "A menu item has an invalid price",
        });
      }

      totalAmount += menuItem.price * quantity;

      orderItems.push({
        menuItem: menuItem._id,
        name: menuItem.name,
        price: menuItem.price,
        quantity,
      });
    }

    totalAmount =
      Math.round((totalAmount + Number.EPSILON) * 100) / 100;

    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return res.status(400).json({
        message: "The order total must be greater than zero",
      });
    }

    const order = await Order.create({
      customer: req.user._id,
      restaurant,
      items: orderItems,
      deliveryAddress: address,
      totalAmount,
      status: "pending",
      paymentStatus: "pending",
      paymentMethod: "razorpay",
    });

    return res.status(201).json({
      message: "Order created successfully",
      order,
    });
  } catch (error) {
    console.error("Create order failed:", error.message);

    return res.status(500).json({
      message: "Unable to create order",
    });
  }
}

// Get the logged-in customer's orders.
export async function getMyOrders(req, res) {
  try {
    const orders = await Order.find({ customer: req.user._id })
      .populate("restaurant", "name")
      .sort({ createdAt: -1 });

    return res.status(200).json({ orders });
  } catch (error) {
    console.error("Get my orders failed:", error.message);

    return res.status(500).json({
      message: "Unable to fetch your orders",
    });
  }
}

// Get all orders. Admin only.
export async function getAllOrders(req, res) {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        message: "Only admins can view all orders",
      });
    }

    const orders = await Order.find()
      .populate("restaurant", "name")
      .populate("customer", "name email")
      .populate("deliveryPartner", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({ orders });
  } catch (error) {
    console.error("Get all orders failed:", error.message);

    return res.status(500).json({
      message: "Unable to fetch orders",
    });
  }
}

// Get orders assigned to the logged-in delivery partner.
export async function getMyAssignedOrders(req, res) {
  try {
    if (req.user.role !== "delivery") {
      return res.status(403).json({
        message: "Only delivery partners can view assigned orders",
      });
    }

    const orders = await Order.find({
      deliveryPartner: req.user._id,
    })
      .populate("restaurant", "name")
      .populate("customer", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({ orders });
  } catch (error) {
    console.error("Get assigned orders failed:", error.message);

    return res.status(500).json({
      message: "Unable to fetch orders",
    });
  }
}

// Get one order if the user owns it, administers it, or is assigned to it.
export async function getOrderById(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }

    const order = await Order.findById(id)
      .populate("restaurant", "name")
      .populate("customer", "name email")
      .populate("deliveryPartner", "name email");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const isAdmin = req.user.role === "admin";
    const isCustomer =
      order.customer?._id.toString() === req.user._id.toString();
    const isAssignedDeliveryPartner =
      order.deliveryPartner?._id.toString() === req.user._id.toString();

    if (!isAdmin && !isCustomer && !isAssignedDeliveryPartner) {
      return res.status(403).json({
        message: "You are not allowed to view this order",
      });
    }

    return res.status(200).json({ order });
  } catch (error) {
    console.error("Get order failed:", error.message);

    return res.status(500).json({
      message: "Unable to fetch order",
    });
  }
}

// Update order status, including customer cancellation.
export async function updateOrderStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid order status" });
    }

    const isAdmin = req.user.role === "admin";
    const isDeliveryPartner = req.user.role === "delivery";
    const isCustomer = req.user.role === "customer";

    if (!isAdmin && !isDeliveryPartner && !isCustomer) {
      return res.status(403).json({
        message: "You are not allowed to update order status",
      });
    }

    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Customers can only cancel their own pending or confirmed unpaid orders.
    if (isCustomer) {
      if (order.customer.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          message: "You are not allowed to update this order",
        });
      }

      if (status !== "cancelled") {
        return res.status(403).json({
          message: "Customers can only cancel their own orders",
        });
      }

      if (!["pending", "confirmed"].includes(order.status)) {
        return res.status(400).json({
          message: "This order can no longer be cancelled",
        });
      }

      if (order.paymentStatus === "paid") {
        return res.status(400).json({
          message:
            "Paid orders cannot be cancelled here. Please contact support.",
        });
      }
    }

    // Delivery partners can only update orders assigned to them.
    if (
      isDeliveryPartner &&
      order.deliveryPartner?.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        message: "This order is not assigned to you",
      });
    }

    // Enforce the allowed order-status transitions.
    if (!validStatusTransitions[order.status]?.includes(status)) {
      return res.status(400).json({
        message: `Cannot change order status from ${order.status} to ${status}`,
      });
    }

    // Only paid orders may progress through preparation and delivery.
    if (status !== "cancelled" && order.paymentStatus !== "paid") {
      return res.status(400).json({
        message: "Only paid orders can progress through delivery",
      });
    }

    // Delivery partners cannot confirm, prepare, or cancel orders.
    if (
      isDeliveryPartner &&
      !["out_for_delivery", "delivered"].includes(status)
    ) {
      return res.status(403).json({
        message:
          "Delivery partners can only start delivery or mark orders as delivered",
      });
    }

    order.status = status;
    await order.save();

    // Notify customers, assigned delivery partners, and admins.
    const io = req.app.get("io");

    if (io) {
      const orderPayload = {
        orderId: order._id.toString(),
        status: order.status,
        paymentStatus: order.paymentStatus,
      };

      io.to(`user:${order.customer.toString()}`).emit(
        "orderStatusUpdated",
        orderPayload
      );

      if (order.deliveryPartner) {
        io.to(`user:${order.deliveryPartner.toString()}`).emit(
          "orderStatusUpdated",
          orderPayload
        );
      }

      io.to("admins").emit("orderStatusUpdated", orderPayload);
    }

    return res.status(200).json({
      message: "Order status updated successfully",
      order,
    });
  } catch (error) {
    console.error("Update order status failed:", error.message);

    return res.status(500).json({
      message: "Unable to update order status",
    });
  }
}

// List delivery partners. Admin only.
export async function getDeliveryPartners(req, res) {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        message: "Only admins can view delivery partners",
      });
    }

    const deliveryPartners = await User.find({
      role: "delivery",
    }).select("_id name email");

    return res.status(200).json({ deliveryPartners });
  } catch (error) {
    console.error("Get delivery partners failed:", error.message);

    return res.status(500).json({
      message: "Unable to fetch delivery partners",
    });
  }
}

// Assign or reassign an order to a delivery partner. Admin only.
export async function assignOrderToDeliveryPartner(req, res) {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        message: "Only admins can assign delivery partners",
      });
    }

    const { id } = req.params;
    const { deliveryPartnerId } = req.body;

    if (
      !mongoose.isValidObjectId(id) ||
      !mongoose.isValidObjectId(deliveryPartnerId)
    ) {
      return res.status(400).json({
        message: "Valid order and delivery partner IDs are required",
      });
    }

    const [order, deliveryPartner] = await Promise.all([
      Order.findById(id),
      User.findById(deliveryPartnerId).select("_id name email role"),
    ]);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (!deliveryPartner || deliveryPartner.role !== "delivery") {
      return res.status(400).json({
        message: "The selected user is not a delivery partner",
      });
    }

    if (["delivered", "cancelled"].includes(order.status)) {
      return res.status(400).json({
        message: "Completed or cancelled orders cannot be assigned",
      });
    }

    if (order.paymentStatus !== "paid") {
      return res.status(400).json({
        message: "Only paid orders can be assigned for delivery",
      });
    }

    order.deliveryPartner = deliveryPartner._id;
    await order.save();

    const io = req.app.get("io");

    if (io) {
      const payload = {
        orderId: order._id.toString(),
        deliveryPartnerId: deliveryPartner._id.toString(),
        status: order.status,
      };

      io.to(`user:${deliveryPartner._id.toString()}`).emit(
        "orderAssigned",
        payload
      );

      io.to(`user:${order.customer.toString()}`).emit(
        "orderAssigned",
        payload
      );

      io.to("admins").emit("orderAssigned", payload);
    }

    return res.status(200).json({
      message: "Delivery partner assigned successfully",
      order,
    });
  } catch (error) {
    console.error("Assign delivery partner failed:", error.message);

    return res.status(500).json({
      message: "Unable to assign delivery partner",
    });
  }
}
