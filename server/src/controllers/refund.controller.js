
import mongoose from "mongoose";
import Order from "../models/Order.js";
import { getRazorpayClient } from "../services/razorpay.service.js";

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

function sendRefundResult(res, order, message, statusCode = 200) {
  return res.status(statusCode).json({
    message,
    orderId: order._id,
    refundId: order.razorpayRefundId,
    refundStatus: order.refundStatus,
    paymentStatus: order.paymentStatus,
  });
}

async function saveProviderRefundState(req, order, refund) {
  const expectedAmount = Math.round(order.totalAmount * 100);

  if (
    !refund?.id ||
    refund.payment_id !== order.razorpayPaymentId ||
    refund.amount !== expectedAmount ||
    refund.currency !== "INR"
  ) {
    throw new Error("Razorpay refund does not match the order.");
  }

  order.razorpayRefundId = refund.id;

  if (refund.status === "processed") {
    order.refundStatus = "processed";
    order.paymentStatus = "refunded";
  } else if (refund.status === "failed") {
    order.refundStatus = "failed";
  } else {
    order.refundStatus = "pending";
  }

  await order.save();
  emitRefundUpdate(req, order);

  return order;
}

async function findMatchingProviderRefund(razorpay, order) {
  if (order.razorpayRefundId) {
    return razorpay.payments.fetchRefund(
      order.razorpayPaymentId,
      order.razorpayRefundId
    );
  }

  const result = await razorpay.payments.fetchMultipleRefund(
    order.razorpayPaymentId
  );

  const refunds = Array.isArray(result?.items)
    ? result.items
    : [];

  return (
    refunds.find(
      (item) =>
        item.notes?.appOrderId === order._id.toString()
    ) || null
  );
}

// POST /api/orders/:id/refund
// Admin-only. Never automatically retries an uncertain refund.
export async function refundOrder(req, res) {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({
        message: "Only administrators can request refunds.",
      });
    }

    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid order ID.",
      });
    }

    let order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({
        message: "Order not found.",
      });
    }

    if (
      order.paymentMethod !== "razorpay" ||
      !order.razorpayPaymentId
    ) {
      return res.status(400).json({
        message:
          "A verified Razorpay payment is required for a refund.",
      });
    }

    if (
      order.refundStatus === "processed" ||
      order.paymentStatus === "refunded"
    ) {
      return sendRefundResult(
        res,
        order,
        "This order has already been refunded."
      );
    }

    const razorpay = getRazorpayClient();

    // Reconcile an existing pending attempt rather than starting
    // another refund.
    if (order.refundStatus === "pending") {
      let refund;

      try {
        refund = await findMatchingProviderRefund(
          razorpay,
          order
        );
      } catch (error) {
        console.error(
          "Refund reconciliation error:",
          error.message
        );

        return sendRefundResult(
          res,
          order,
          "Could not confirm the refund status. Check Razorpay's dashboard before taking further action.",
          502
        );
      }

      if (!refund) {
        return sendRefundResult(
          res,
          order,
          "No matching refund was found. The order remains pending; check Razorpay's dashboard before retrying.",
          409
        );
      }

      try {
        await saveProviderRefundState(req, order, refund);
      } catch (error) {
        console.error(
          "Could not save reconciled refund:",
          error.message
        );

        return sendRefundResult(
          res,
          order,
          "The provider refund could not be safely reconciled. Check Razorpay's dashboard.",
          502
        );
      }

      return sendRefundResult(
        res,
        order,
        order.refundStatus === "processed"
          ? "Razorpay confirms the refund was processed."
          : order.refundStatus === "failed"
            ? "Razorpay reports that the refund failed. No automatic retry was made."
            : "The refund is still pending with Razorpay."
      );
    }

    // A failed attempt requires investigation before a new attempt.
    if (order.refundStatus === "failed") {
      return sendRefundResult(
        res,
        order,
        "The previous refund failed. Verify its final state in Razorpay before considering another attempt.",
        409
      );
    }

    if (order.paymentStatus !== "paid") {
      return res.status(409).json({
        message: "Only paid orders can be refunded.",
      });
    }

    const expectedAmount = Math.round(
      order.totalAmount * 100
    );

    if (
      !Number.isSafeInteger(expectedAmount) ||
      expectedAmount <= 0
    ) {
      return res.status(400).json({
        message: "The order amount is invalid for a refund.",
      });
    }

    const payment = await razorpay.payments.fetch(
      order.razorpayPaymentId
    );

    if (
      payment.id !== order.razorpayPaymentId ||
      payment.amount !== expectedAmount ||
      payment.currency !== "INR" ||
      payment.status !== "captured"
    ) {
      return res.status(409).json({
        message:
          "Razorpay has not confirmed a matching captured payment.",
      });
    }

    // Atomically reserve the attempt so concurrent requests
    // cannot both start a refund for the same order.
    const reservedOrder = await Order.findOneAndUpdate(
      {
        _id: order._id,
        paymentStatus: "paid",
        paymentMethod: "razorpay",
        razorpayPaymentId: order.razorpayPaymentId,
        refundStatus: "none",
      },
      {
        $set: {
          refundStatus: "pending",
          refundRequestedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!reservedOrder) {
      order = await Order.findById(id);

      if (!order) {
        return res.status(404).json({
          message: "Order not found.",
        });
      }

      return sendRefundResult(
        res,
        order,
        "The order state changed or another request reserved the refund. Check its status before taking further action.",
        409
      );
    }

    order = reservedOrder;

    // Once reserved, do not reset the state on a timeout.
    // Razorpay may have received the request.
    let refund;

    try {
      refund = await razorpay.payments.refund(
        order.razorpayPaymentId,
        {
          amount: expectedAmount,
          speed: "normal",
          notes: {
            appOrderId: order._id.toString(),
            requestedBy: req.user._id.toString(),
          },
        }
      );
    } catch (error) {
      console.error(
        "Razorpay refund request error:",
        error.message
      );

      return sendRefundResult(
        res,
        order,
        "The refund outcome is uncertain. Check Razorpay's dashboard and reconcile before taking further action.",
        502
      );
    }

    try {
      await saveProviderRefundState(req, order, refund);
    } catch (error) {
      console.error(
        "Could not save Razorpay refund response:",
        error.message
      );

      return sendRefundResult(
        res,
        order,
        "The refund response could not be fully saved. Reconcile with Razorpay before taking further action.",
        502
      );
    }

    return sendRefundResult(
      res,
      order,
      order.refundStatus === "processed"
        ? "Refund processed successfully."
        : order.refundStatus === "failed"
          ? "Razorpay reports that the refund failed. No automatic retry was made."
          : "Refund requested. Check its status before taking further action."
    );
  } catch (error) {
    console.error("Refund order error:", error.message);

    return res.status(500).json({
      message:
        "Unable to process the refund request. Check the order and Razorpay dashboard before retrying.",
    });
  }
}

// GET /api/orders/:id/refund-status
// Admin-only. Checks provider status; never initiates a refund.
export async function checkRefundStatus(req, res) {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({
        message: "Only administrators can check refund status.",
      });
    }

    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid order ID.",
      });
    }

    let order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({
        message: "Order not found.",
      });
    }

    if (
      order.paymentMethod !== "razorpay" ||
      !order.razorpayPaymentId
    ) {
      return res.status(400).json({
        message:
          "No Razorpay payment is linked to this order.",
      });
    }

    if (
      order.refundStatus === "none" &&
      !order.razorpayRefundId
    ) {
      return res.status(200).json({
        orderId: order._id,
        refundStatus: "none",
        paymentStatus: order.paymentStatus,
        message: "No refund has been recorded for this order.",
      });
    }

    if (
      order.refundStatus === "processed" ||
      order.paymentStatus === "refunded"
    ) {
      return res.status(200).json({
        orderId: order._id,
        refundId: order.razorpayRefundId,
        refundStatus: order.refundStatus,
        paymentStatus: order.paymentStatus,
        message: "The refund is already recorded as processed.",
      });
    }

    const razorpay = getRazorpayClient();
    let refund;

    try {
      refund = await findMatchingProviderRefund(
        razorpay,
        order
      );
    } catch (error) {
      console.error(
        "Check refund status provider error:",
        error.message
      );

      return res.status(502).json({
        orderId: order._id,
        refundStatus: order.refundStatus,
        paymentStatus: order.paymentStatus,
        message:
          "Could not confirm refund status with Razorpay. Try the status check again later.",
      });
    }

    if (!refund) {
      return res.status(409).json({
        orderId: order._id,
        refundStatus: order.refundStatus,
        paymentStatus: order.paymentStatus,
        message:
          "No matching refund was found. The local status remains unchanged. Check Razorpay's dashboard before retrying.",
      });
    }

    try {
      await saveProviderRefundState(req, order, refund);
    } catch (error) {
      console.error(
        "Could not save checked refund status:",
        error.message
      );

      return res.status(502).json({
        orderId: order._id,
        refundStatus: order.refundStatus,
        paymentStatus: order.paymentStatus,
        message:
          "The provider refund could not be safely reconciled.",
      });
    }

    return res.status(200).json({
      orderId: order._id,
      refundId: order.razorpayRefundId,
      refundStatus: order.refundStatus,
      paymentStatus: order.paymentStatus,
      providerRefundStatus: refund.status,
      message: "Refund status checked and saved.",
    });
  } catch (error) {
    console.error(
      "Check refund status error:",
      error.message
    );

    return res.status(502).json({
      message:
        "Could not check refund status. Check the provider dashboard before taking further action.",
    });
  }
}
