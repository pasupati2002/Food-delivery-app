
import { createHmac, timingSafeEqual } from "node:crypto";
import mongoose from "mongoose";
import Order from "../models/Order.js";

function verifyWebhookSignature(rawBody, signature, secret) {
  if (
    !Buffer.isBuffer(rawBody) ||
    typeof signature !== "string" ||
    !/^[a-f0-9]{64}$/i.test(signature) ||
    !secret
  ) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(rawBody)
    .digest();

  const received = Buffer.from(signature, "hex");

  return (
    received.length === expected.length &&
    timingSafeEqual(received, expected)
  );
}

function emitRefundUpdate(req, order) {
  const io = req.app.get("io");
  if (!io) return;

  const payload = {
    orderId: order._id.toString(),
    status: order.status,
    paymentStatus: order.paymentStatus,
    refundStatus: order.refundStatus,
  };

  io.to(`user:${order.customer.toString()}`).emit(
    "orderStatusUpdated",
    payload
  );

  io.to("admins").emit("orderStatusUpdated", payload);
}

async function findOrderForRefund(refund) {
  const paymentId = refund?.payment_id;
  const appOrderId = refund?.notes?.appOrderId;

  if (!paymentId || !refund?.id) {
    return null;
  }

  // The appOrderId note allows matching even when the webhook
  // arrives before the refund ID has been saved locally.
  if (mongoose.isValidObjectId(appOrderId)) {
    const order = await Order.findOne({
      _id: appOrderId,
      paymentMethod: "razorpay",
      razorpayPaymentId: paymentId,
    });

    if (order) return order;
  }

  // Fallback for refunds whose ID is already stored.
  return Order.findOne({
    paymentMethod: "razorpay",
    razorpayPaymentId: paymentId,
    razorpayRefundId: refund.id,
  });
}

function refundMatchesOrder(refund, order) {
  const expectedAmount = Math.round(order.totalAmount * 100);

  return (
    refund?.id &&
    refund.payment_id === order.razorpayPaymentId &&
    Number.isSafeInteger(expectedAmount) &&
    expectedAmount > 0 &&
    refund.amount === expectedAmount &&
    refund.currency === "INR" &&
    (
      !order.razorpayRefundId ||
      order.razorpayRefundId === refund.id
    )
  );
}

async function applyRefundEvent(req, eventName, refund) {
  const order = await findOrderForRefund(refund);

  if (!order) {
    // Acknowledge unrelated refunds so Razorpay does not retry
    // indefinitely for orders that do not belong to this app.
    console.warn(
      "Refund webhook did not match an order:",
      refund?.id
    );
    return { matched: false };
  }

  if (!refundMatchesOrder(refund, order)) {
    console.error(
      "Refund webhook did not match the expected order amount or payment:",
      refund.id
    );
    return { matched: false };
  }

  const refundId = refund.id;

  // Use conditional database updates to protect against duplicate
  // deliveries and older events arriving after newer events.
  let filter = {
    _id: order._id,
    paymentMethod: "razorpay",
    razorpayPaymentId: refund.payment_id,
    $or: [
      { razorpayRefundId: null },
      { razorpayRefundId: refundId },
    ],
  };

  let update;

  if (eventName === "refund.created") {
    // Never downgrade a failed or processed refund to pending.
    filter.refundStatus = { $nin: ["failed", "processed"] };

    update = {
      $set: {
        razorpayRefundId: refundId,
        refundStatus: "pending",
      },
    };
  } else if (eventName === "refund.failed") {
    // A late failed event must not overwrite a completed refund.
    filter.refundStatus = { $ne: "processed" };

    update = {
      $set: {
        razorpayRefundId: refundId,
        refundStatus: "failed",
      },
    };
  } else if (eventName === "refund.processed") {
    // A confirmed processed event is the final successful state.
    update = {
      $set: {
        razorpayRefundId: refundId,
        refundStatus: "processed",
        paymentStatus: "refunded",
      },
    };
  } else {
    return { matched: true, ignored: true };
  }

  const updatedOrder = await Order.findOneAndUpdate(
    filter,
    update,
    { new: true, runValidators: true }
  );

  if (updatedOrder) {
    emitRefundUpdate(req, updatedOrder);

    return {
      matched: true,
      updated: true,
      refundStatus: updatedOrder.refundStatus,
    };
  }

  // If another webhook or request changed the order concurrently,
  // inspect its latest state instead of overwriting it.
  const latestOrder = await Order.findById(order._id);

  if (
    latestOrder &&
    latestOrder.razorpayPaymentId === refund.payment_id &&
    latestOrder.razorpayRefundId === refundId
  ) {
    return {
      matched: true,
      updated: false,
      refundStatus: latestOrder.refundStatus,
    };
  }

  console.warn(
    "Refund webhook was not applied because the order state changed:",
    refundId
  );

  return { matched: false };
}

export async function handleRazorpayWebhook(req, res) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.get("x-razorpay-signature");

  if (!secret) {
    console.error("RAZORPAY_WEBHOOK_SECRET is not configured.");
    return res.status(500).json({
      message: "Webhook configuration is incomplete.",
    });
  }

  if (
    !verifyWebhookSignature(
      req.body,
      signature,
      secret
    )
  ) {
    return res.status(401).json({
      message: "Invalid webhook signature.",
    });
  }

  let event;

  try {
    event = JSON.parse(req.body.toString("utf8"));
  } catch {
    return res.status(400).json({
      message: "Invalid webhook JSON.",
    });
  }

  const supportedEvents = new Set([
    "refund.created",
    "refund.processed",
    "refund.failed",
  ]);

  if (!supportedEvents.has(event.event)) {
    return res.status(200).json({
      received: true,
      ignored: true,
    });
  }

  const refund = event.payload?.refund?.entity;

  if (!refund?.id || !refund?.payment_id) {
    return res.status(400).json({
      message: "Refund event payload is incomplete.",
    });
  }

  try {
    const result = await applyRefundEvent(
      req,
      event.event,
      refund
    );

    return res.status(200).json({
      received: true,
      matched: result.matched,
      ...(result.refundStatus
        ? { refundStatus: result.refundStatus }
        : {}),
    });
  } catch (error) {
    // A 5xx response allows the provider to retry a temporary
    // database or processing failure.
    console.error(
      "Razorpay webhook processing failed:",
      error.message
    );

    return res.status(500).json({
      message: "Unable to process refund webhook.",
    });
  }
}
