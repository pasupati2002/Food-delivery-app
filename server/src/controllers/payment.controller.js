
import crypto from "node:crypto";
import mongoose from "mongoose";
import Cart from "../models/Cart.js";
import Order from "../models/Order.js";
import { getRazorpayClient } from "../services/razorpay.service.js";

const getAmountInPaise = (amount) => Math.round(amount * 100);

// POST /api/orders/:id/payment
export async function createRazorpayPaymentOrder(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid order ID",
      });
    }

    const order = await Order.findOne({
      _id: id,
      customer: req.user._id,
    });

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    if (order.paymentStatus === "paid") {
      return res.status(400).json({
        message: "This order has already been paid",
      });
    }

    if (order.status === "cancelled") {
      return res.status(400).json({
        message: "Cancelled orders cannot be paid",
      });
    }

    if (
      !Number.isFinite(order.totalAmount) ||
      order.totalAmount <= 0
    ) {
      return res.status(400).json({
        message: "Order amount must be greater than zero",
      });
    }

    const amountInPaise = getAmountInPaise(order.totalAmount);

    if (!Number.isSafeInteger(amountInPaise) || amountInPaise <= 0) {
      return res.status(400).json({
        message: "Invalid order amount",
      });
    }

    const razorpay = getRazorpayClient();

    // Reuse an existing Razorpay order only if its details match.
    if (order.razorpayOrderId) {
      const existingPaymentOrder = await razorpay.orders.fetch(
        order.razorpayOrderId
      );

      if (
        existingPaymentOrder.status === "created" &&
        existingPaymentOrder.amount === amountInPaise &&
        existingPaymentOrder.currency === "INR"
      ) {
        return res.status(200).json({
          message: "Payment order already exists",
          payment: {
            keyId: process.env.RAZORPAY_KEY_ID,
            razorpayOrderId: existingPaymentOrder.id,
            amount: existingPaymentOrder.amount,
            currency: existingPaymentOrder.currency,
            orderId: order._id,
          },
        });
      }

      return res.status(409).json({
        message:
          "The existing payment order is no longer available. Please contact support.",
      });
    }

    const paymentOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: order._id.toString(),
      notes: {
        appOrderId: order._id.toString(),
        customerId: req.user._id.toString(),
      },
    });

    if (
      paymentOrder.amount !== amountInPaise ||
      paymentOrder.currency !== "INR"
    ) {
      return res.status(502).json({
        message: "Payment provider returned unexpected order details",
      });
    }

    order.razorpayOrderId = paymentOrder.id;
    order.paymentStatus = "pending";
    order.paymentMethod = "razorpay";

    await order.save();

    return res.status(201).json({
      message: "Razorpay payment order created",
      payment: {
        keyId: process.env.RAZORPAY_KEY_ID,
        razorpayOrderId: paymentOrder.id,
        amount: paymentOrder.amount,
        currency: paymentOrder.currency,
        orderId: order._id,
      },
    });
  } catch (error) {
    console.error("Create payment order error:", error.message);

    return res.status(500).json({
      message: "Unable to create payment order",
    });
  }
}

// POST /api/orders/:id/verify-payment
export async function verifyRazorpayPayment(req, res) {
  try {
    const { id } = req.params;

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid order ID",
      });
    }

    if (
      typeof razorpay_order_id !== "string" ||
      !/^order_[a-zA-Z0-9]+$/.test(razorpay_order_id) ||
      typeof razorpay_payment_id !== "string" ||
      !/^pay_[a-zA-Z0-9]+$/.test(razorpay_payment_id) ||
      typeof razorpay_signature !== "string" ||
      !/^[a-f0-9]{64}$/i.test(razorpay_signature)
    ) {
      return res.status(400).json({
        message: "Invalid payment verification details",
      });
    }

    const order = await Order.findOne({
      _id: id,
      customer: req.user._id,
    }).select("+razorpaySignature");

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    // Idempotent retries are accepted only for the same recorded payment.
    if (order.paymentStatus === "paid") {
      if (
        order.razorpayOrderId === razorpay_order_id &&
        order.razorpayPaymentId === razorpay_payment_id
      ) {
        return res.status(200).json({
          message: "This payment has already been verified",
          paymentStatus: "paid",
          orderStatus: order.status,
          orderId: order._id,
        });
      }

      return res.status(409).json({
        message: "This order has already been paid using another payment",
      });
    }

    if (order.status === "cancelled") {
      return res.status(400).json({
        message: "Cancelled orders cannot be paid",
      });
    }

    if (
      !order.razorpayOrderId ||
      order.razorpayOrderId !== razorpay_order_id
    ) {
      return res.status(400).json({
        message: "Payment order does not match this food order",
      });
    }

    if (
      !Number.isFinite(order.totalAmount) ||
      order.totalAmount <= 0
    ) {
      return res.status(400).json({
        message: "Invalid order amount",
      });
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;

    if (!secret || secret === "placeholder") {
      return res.status(500).json({
        message: "Payment verification is not configured",
      });
    }

    // Verify Razorpay's checkout signature using the server-side secret.
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const expectedBuffer = Buffer.from(expectedSignature, "hex");
    const receivedBuffer = Buffer.from(razorpay_signature, "hex");

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      return res.status(400).json({
        message: "Payment signature verification failed",
      });
    }

    // Confirm the payment directly with Razorpay.
    const razorpay = getRazorpayClient();
    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    const expectedAmount = getAmountInPaise(order.totalAmount);

    if (
      payment.order_id !== order.razorpayOrderId ||
      payment.amount !== expectedAmount ||
      payment.currency !== "INR"
    ) {
      return res.status(400).json({
        message: "Payment details do not match the order",
      });
    }

    // Only a captured payment can mark an order as paid.
    if (payment.status !== "captured") {
      return res.status(409).json({
        message:
          "Payment has not been captured yet. Please wait and try again.",
        paymentStatus: payment.status,
      });
    }

    // Preserve the existing order lifecycle.
    if (order.status !== "pending") {
      return res.status(409).json({
        message:
          "The order status has changed. Please contact support before retrying payment verification.",
      });
    }

    order.paymentStatus = "paid";
    order.razorpayPaymentId = razorpay_payment_id;
    order.razorpaySignature = razorpay_signature;
    order.status = "confirmed";

    await order.save();

    // Clear the cart only after successful payment verification.
    await Cart.findOneAndUpdate(
      { customer: req.user._id },
      { $set: { items: [], restaurant: null } }
    );

    // Notify customer, admin, and assigned delivery partner if present.
    const io = req.app.get("io");

    if (io) {
      const payload = {
        orderId: order._id.toString(),
        status: order.status,
        paymentStatus: order.paymentStatus,
      };

      io.to(`user:${order.customer.toString()}`).emit(
        "orderStatusUpdated",
        payload
      );

      if (order.deliveryPartner) {
        io.to(`user:${order.deliveryPartner.toString()}`).emit(
          "orderStatusUpdated",
          payload
        );
      }

      io.to("admins").emit("orderStatusUpdated", payload);
    }

    return res.status(200).json({
      message: "Payment verified successfully",
      paymentStatus: order.paymentStatus,
      orderStatus: order.status,
      orderId: order._id,
    });
  } catch (error) {
    console.error("Verify payment error:", error.message);

    return res.status(500).json({
      message: "Unable to verify payment",
    });
  }
}
