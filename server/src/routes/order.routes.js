
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

import {
  createOrder,
  getMyOrders,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  getMyAssignedOrders,
  getDeliveryPartners,
  assignOrderToDeliveryPartner,
} from "../controllers/order.controller.js";

import {
  createRazorpayPaymentOrder,
  verifyRazorpayPayment,
} from "../controllers/payment.controller.js";

import {
  refundOrder,
  checkRefundStatus,
} from "../controllers/refund.controller.js";

const router = Router();

// All routes require authentication.
router.use(requireAuth);

// Customer orders
router.post("/", createOrder);
router.get("/my", getMyOrders);

// Razorpay payment routes
router.post("/:id/payment", createRazorpayPaymentOrder);
router.post("/:id/verify-payment", verifyRazorpayPayment);

// Admin order routes
router.get("/admin", getAllOrders);
router.get("/admin/delivery-partners", getDeliveryPartners);

// Refund routes — admin role is checked inside each controller.
router.post("/:id/refund", refundOrder);
router.get("/:id/refund-status", checkRefundStatus);

router.patch("/:id/status", updateOrderStatus);
router.patch("/:id/assign-delivery", assignOrderToDeliveryPartner);

// Delivery partner routes
router.get("/delivery/assigned", getMyAssignedOrders);

// Keep the generic order route last.
router.get("/:id", getOrderById);

export default router;
