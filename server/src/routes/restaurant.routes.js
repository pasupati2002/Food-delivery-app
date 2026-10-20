import { Router } from "express";

import {
  getRestaurants,
  getRestaurantById,
  getRestaurantMenu,
} from "../controllers/restaurant.controller.js";

const router = Router();

router.get("/", getRestaurants);
router.get("/:id/menu", getRestaurantMenu);
router.get("/:id", getRestaurantById);

export default router;