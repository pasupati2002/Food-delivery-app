
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import restaurantRoutes from "./routes/restaurant.routes.js";
import cartRoutes from "./routes/cart.routes.js";
import orderRoutes from "./routes/order.routes.js";
import authRoutes from "./routes/auth.routes.js";
import {
  handleRazorpayWebhook,
} from "./controllers/razorpayWebhook.controller.js";

const app = express();
app.set("trust proxy", 1);

app.use(helmet());

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  })
);

// Razorpay must be verified using the original raw request body.
// Register this route before express.json().
app.post(
  "/api/webhooks/razorpay",
  express.raw({
    type: "application/json",
    limit: "100kb",
  }),
  handleRazorpayWebhook
);

// Regular API routes use parsed JSON.
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Food delivery API is running",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/restaurants", restaurantRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);

export default app;
