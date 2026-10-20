
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "./src/config/db.js";
import User from "./src/models/User.js";

try {
  await connectDB();

  const count = await User.countDocuments({ role: "delivery" });

  console.log(`Delivery-partner accounts found: ${count}`);

  if (count === 0) {
    console.log("No delivery-partner account exists yet.");
  } else {
    console.log("A delivery-partner account already exists.");
  }
} catch (error) {
  console.error("Could not check accounts:", error.message);
} finally {
  await mongoose.disconnect();
}
