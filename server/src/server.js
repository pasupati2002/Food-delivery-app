
import "dotenv/config";
import http from "node:http";
import jwt from "jsonwebtoken";
import cookie from "cookie";
import { Server } from "socket.io";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import User from "./models/User.js";

const PORT = process.env.PORT || 5000;

async function startServer() {
  await connectDB();

  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const cookies = cookie.parse(
        socket.handshake.headers.cookie || ""
      );
      const token = cookies.token;

      if (!token) {
        return next(new Error("Authentication required"));
      }

      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(payload.sub);

      if (!user) {
        return next(new Error("User account not found"));
      }

      socket.user = user;
      next();
    } catch {
      next(new Error("Invalid or expired session"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.user._id.toString();

    // Every authenticated user joins their own private room.
    socket.join(`user:${userId}`);

    // Only administrators can join the admin updates room.
    if (socket.user.role === "admin") {
      socket.join("admins");
    }

    console.log(`Authenticated socket connected: ${socket.id}`);

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  app.set("io", io);

  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log("Authenticated Socket.IO is ready.");
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error.message);
  process.exit(1);
});
