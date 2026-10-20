
import { useCallback, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import api from "./lib/api";
import "./Food.css";

function formatStatus(status) {
  return (status || "pending")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(dateValue) {
  if (!dateValue) return "Date unavailable";

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SummaryCard({ title, count, icon }) {
  return (
    <article className="food-card" style={{ padding: "1rem" }}>
      <p style={{ margin: 0 }}>{icon} {title}</p>
      <h2 style={{ fontSize: "2rem", margin: "0.5rem 0 0" }}>
        {count}
      </h2>
    </article>
  );
}

export default function DeliveryDashboard() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [liveConnected, setLiveConnected] = useState(false);
  const [lastChecked, setLastChecked] = useState(null);

  const loadOrders = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError("");

    try {
      const response = await api.get("/orders/delivery/assigned");
      setOrders(response.data.orders || []);
      setLastChecked(new Date());
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to load assigned orders. Please check your delivery account."
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();

    const intervalId = setInterval(() => {
      loadOrders(false);
    }, 10000);

    return () => clearInterval(intervalId);
  }, [loadOrders]);

  useEffect(() => {
    const socket = io("http://localhost:5000", {
      withCredentials: true,
    });

    function handleConnect() {
      setLiveConnected(true);
    }

    function handleDisconnect() {
      setLiveConnected(false);
    }

    function handleOrderUpdate() {
      loadOrders(false);
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("orderStatusUpdated", handleOrderUpdate);
    socket.on("orderAssigned", handleOrderUpdate);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("orderStatusUpdated", handleOrderUpdate);
      socket.off("orderAssigned", handleOrderUpdate);
      socket.disconnect();
    };
  }, [loadOrders]);

  async function updateDeliveryStatus(order, status) {
    setError("");
    setMessage("");
    setUpdatingId(order._id);

    try {
      await api.patch(`/orders/${order._id}/status`, { status });

      setMessage(
        status === "out_for_delivery"
          ? "Delivery started successfully."
          : "Order marked as delivered successfully."
      );

      await loadOrders(false);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to update delivery progress."
      );
    } finally {
      setUpdatingId("");
    }
  }

  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      return (
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime()
      );
    });
  }, [orders]);

  const summary = useMemo(() => ({
    total: orders.length,
    waiting: orders.filter((order) =>
      ["confirmed", "preparing"].includes(order.status)
    ).length,
    outForDelivery: orders.filter(
      (order) => order.status === "out_for_delivery"
    ).length,
    delivered: orders.filter(
      (order) => order.status === "delivered"
    ).length,
  }), [orders]);

  return (
    <main className="food-page">
      <h1>Delivery Partner Dashboard</h1>
      <p>View your assigned orders and update delivery progress.</p>

      <p role="status" aria-live="polite">
        Live updates: {liveConnected ? "Connected" : "Connecting..."}
      </p>

      {lastChecked && (
        <p>
          Last checked:{" "}
          {lastChecked.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </p>
      )}

      <button
        type="button"
        onClick={() => loadOrders()}
        disabled={loading}
      >
        {loading ? "Loading..." : "Refresh assigned orders"}
      </button>

      <h2 style={{ marginTop: "1.5rem" }}>Delivery Summary</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <SummaryCard title="Assigned orders" count={summary.total} icon="📋" />
        <SummaryCard title="Waiting to start" count={summary.waiting} icon="⏳" />
        <SummaryCard title="Out for delivery" count={summary.outForDelivery} icon="🚚" />
        <SummaryCard title="Delivered" count={summary.delivered} icon="✅" />
      </div>

      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}

      {loading ? (
        <p>Loading assigned orders...</p>
      ) : sortedOrders.length === 0 ? (
        <article className="food-card">
          <h2>No assigned orders yet</h2>
          <p>
            When an administrator assigns an order to you, it will appear here.
          </p>
        </article>
      ) : (
        <div className="food-grid">
          {sortedOrders.map((order) => {
            const isFinal = ["delivered", "cancelled"].includes(
              order.status
            );

            const canStart =
              order.paymentStatus === "paid" &&
              ["confirmed", "preparing"].includes(order.status);

            const canComplete =
              order.paymentStatus === "paid" &&
              order.status === "out_for_delivery";

            return (
              <article className="food-card" key={order._id}>
                <h2>{order.restaurant?.name || "Restaurant"}</h2>

                <p>
                  <strong>Order ID:</strong> {order._id}
                </p>

                <p>
                  <strong>Customer:</strong>{" "}
                  {order.customer?.name || "Customer"}
                </p>

                <p>
                  <strong>Delivery address:</strong>{" "}
                  {order.deliveryAddress?.trim() ||
                    "Address not available"}
                </p>

                <p>
                  <strong>Order placed:</strong>{" "}
                  {formatDate(order.createdAt)}
                </p>

                <p><strong>Items:</strong></p>
                <ul>
                  {(order.items || []).map((item, index) => (
                    <li key={`${item.menuItem || item.name}-${index}`}>
                      {item.name} × {item.quantity}
                    </li>
                  ))}
                </ul>

                <p>
                  <strong>Total:</strong> ₹
                  {Number(order.totalAmount || 0).toFixed(2)}
                </p>

                <p>
                  <strong>Payment:</strong>{" "}
                  {formatStatus(order.paymentStatus)}
                </p>

                <p>
                  <strong>Delivery status:</strong>{" "}
                  {formatStatus(order.status)}
                </p>

                {canStart && (
                  <button
                    type="button"
                    disabled={Boolean(updatingId)}
                    onClick={() =>
                      updateDeliveryStatus(order, "out_for_delivery")
                    }
                  >
                    {updatingId === order._id
                      ? "Updating..."
                      : "Start delivery"}
                  </button>
                )}

                {canComplete && (
                  <button
                    type="button"
                    disabled={Boolean(updatingId)}
                    onClick={() =>
                      updateDeliveryStatus(order, "delivered")
                    }
                  >
                    {updatingId === order._id
                      ? "Updating..."
                      : "Mark as delivered"}
                  </button>
                )}

                {order.paymentStatus !== "paid" && !isFinal && (
                  <p>
                    Delivery progress is disabled until payment is confirmed.
                  </p>
                )}

                {order.status === "delivered" && (
                  <p>✅ This order has been delivered.</p>
                )}

                {order.status === "cancelled" && (
                  <p>This order was cancelled.</p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
