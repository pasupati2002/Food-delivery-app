
import "dotenv/config";
import mongoose from "mongoose";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { connectDB } from "./src/config/db.js";
import User from "./src/models/User.js";

const rl = readline.createInterface({ input, output });

try {
  await connectDB();

  const email = (
    await rl.question("Enter the NEW account's registered email: ")
  ).trim().toLowerCase();

  const user = await User.findOne({ email });

  if (!user) {
    console.log("No account found with that email. No changes made.");
  } else if (user.role === "admin") {
    console.log("This account is an admin. No changes made.");
  } else if (user.role === "delivery") {
    console.log("This account is already a delivery partner.");
  } else {
    user.role = "delivery";
    await user.save();
    console.log("Success! This account is now a delivery partner.");
  }
} catch (error) {
  console.error("Could not update the account:", error.message);
} finally {
  rl.close();
  await mongoose.disconnect();
}
