import { Router } from "express";

import {
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
  clearCart,
} from "../controllers/cart.controller.js";

import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Every cart endpoint requires a logged-in customer.
router.use(requireAuth);

router.get("/", getCart);
router.post("/items", addCartItem);
router.patch("/items/:menuItemId", updateCartItem);
router.delete("/items/:menuItemId", removeCartItem);
router.delete("/", clearCart);

export default router;