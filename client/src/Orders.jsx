
import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "./lib/api";
import { retryOrderPayment } from "./lib/checkout";
import { io } from "socket.io-client";
import "./Food.css";

const deliverySteps = [
  { status: "confirmed", label: "Confirmed" },
  { status: "preparing", label: "Preparing" },
  { status: "out_for_delivery", label: "Out for delivery" },
  { status: "delivered", label: "Delivered" },
];

function normalizeStatus(status) {
  return String(status || "").toLowerCase().replace(/[\s-]+/g, "_");
}

function formatStatus(status) {
  const normalized = normalizeStatus(status);

  if (normalized === "out_for_delivery") return "Out for delivery";
  if (normalized === "cancelled" || normalized === "canceled") {
    return "Cancelled";
  }

  return normalized
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ") || "Pending";
}

function formatDateTime(value) {
  if (!value) return "Date unavailable";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatPrice(amount) {
  return `₹${Number(amount || 0).toFixed(2)}`;
}

function getOrderItems(order) {
  return order.items || order.orderItems || [];
}

function getItemName(item) {
  return item.name || item.menuItem?.name || item.menuItemName || "Food item";
}

function getItemQuantity(item) {
  return Number(item.quantity || 1);
}

function getItemPrice(item) {
  return Number(item.price ?? item.menuItem?.price ?? 0);
}

function getOrderTotal(order) {
  return Number(
    order.totalAmount ??
      order.total ??
      order.amount ??
      getOrderItems(order).reduce(
        (sum, item) => sum + getItemPrice(item) * getItemQuantity(item),
        0
      )
  );
}

function isCancelled(order) {
  const status = normalizeStatus(order.status);
  return status === "cancelled" || status === "canceled";
}

function isDelivered(order) {
  return normalizeStatus(order.status) === "delivered";
}

function isActive(order) {
  return !isCancelled(order) && !isDelivered(order);
}

function OrderTracker({ status }) {
  const normalized = normalizeStatus(status);

  if (normalized === "cancelled" || normalized === "canceled") {
    return (
      <div className="orders-cancelled-notice" role="status">
        <span className="orders-cancelled-icon" aria-hidden="true">×</span>
        <div>
          <strong>This order is cancelled</strong>
          <p>No further delivery updates are expected for this order.</p>
        </div>
      </div>
    );
  }

  const currentIndex = deliverySteps.findIndex(
    (step) => step.status === normalized
  );

  return (
    <div className="orders-tracker">
      <div className="orders-tracker-heading">
        <h3>Delivery progress</h3>
        <span className={`orders-status-pill status-${normalized || "pending"}`}>
          {formatStatus(status)}
        </span>
      </div>

      <div className="orders-progress" aria-label={`Order status: ${formatStatus(status)}`}>
        {deliverySteps.map((step, index) => {
          const completed =
            normalized === "delivered" ||
            (currentIndex >= 0 && index <= currentIndex);

          return (
            <div
              className={`orders-progress-step ${completed ? "is-complete" : ""} ${
                index === currentIndex ? "is-current" : ""
              }`}
              key={step.status}
            >
              <span className="orders-progress-marker" aria-hidden="true">
                {completed ? "✓" : index + 1}
              </span>
              <span className="orders-progress-label">{step.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyOrderId, setBusyOrderId] = useState(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [notice, setNotice] = useState("");

  const fetchOrders = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);

    try {
      const response = await api.get("/orders/my");
      const data = response.data;
      const nextOrders = Array.isArray(data)
        ? data
        : data.orders || data.data || [];

      setOrders(nextOrders);
      setError("");
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "We couldn't load your orders. Please try again."
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders(true);

    const socket = io("http://localhost:5000");

    socket.on("connect", () => {
      socket.emit("join", { role: "customer" });
    });

    socket.on("orderUpdated", () => fetchOrders());
    socket.on("orderStatusUpdated", () => fetchOrders());
    socket.on("orderCancelled", () => fetchOrders());

    const intervalId = setInterval(() => fetchOrders(), 10000);

    return () => {
      clearInterval(intervalId);
      socket.disconnect();
    };
  }, [fetchOrders]);

  const counts = useMemo(() => ({
    all: orders.length,
    active: orders.filter(isActive).length,
    delivered: orders.filter(isDelivered).length,
    cancelled: orders.filter(isCancelled).length,
  }), [orders]);

  const filteredOrders = useMemo(() => {
    const filtered = orders.filter((order) => {
      if (activeFilter === "active") return isActive(order);
      if (activeFilter === "delivered") return isDelivered(order);
      if (activeFilter === "cancelled") return isCancelled(order);
      return true;
    });

    return [...filtered].sort((a, b) => {
      const dateA = new Date(a.createdAt || a.updatedAt || 0).getTime();
      const dateB = new Date(b.createdAt || b.updatedAt || 0).getTime();
      return dateB - dateA;
    });
  }, [orders, activeFilter]);

  async function cancelOrder(order) {
    const status = normalizeStatus(order.status);

    if (
      !window.confirm("Are you sure you want to cancel this order?")
    ) {
      return;
    }

    setBusyOrderId(order._id);
    setNotice("");
    setError("");

    try {
      await api.patch(`/orders/${order._id}/status`, {
        status: "cancelled",
      });

      setNotice("Your cancellation request was submitted.");
      await fetchOrders();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "We couldn't cancel this order. Please try again."
      );
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleRetryPayment(order) {
    setBusyOrderId(order._id);
    setNotice("");
    setError("");

    try {
      await retryOrderPayment(order);
      await fetchOrders();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "We couldn't retry the payment. Please try again."
      );
    } finally {
      setBusyOrderId(null);
    }
  }

  const filters = [
    { key: "all", label: "All orders", count: counts.all },
    { key: "active", label: "Active", count: counts.active },
    { key: "delivered", label: "Delivered", count: counts.delivered },
    { key: "cancelled", label: "Cancelled", count: counts.cancelled },
  ];

  return (
    <main className="food-page orders-page">
      <header className="orders-page-header">
        <div>
          <p className="food-eyebrow">YOUR FOOD JOURNEY</p>
          <h1>My Orders</h1>
          <p className="food-subtitle">
            Follow your deliveries and revisit your past orders.
          </p>
        </div>

        <button
          type="button"
          className="orders-refresh-button"
          onClick={() => fetchOrders(true)}
          disabled={loading}
        >
          <span aria-hidden="true">↻</span>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      <section className="orders-overview" aria-label="Order overview">
        <div className="orders-overview-card">
          <span className="orders-overview-icon" aria-hidden="true">📦</span>
          <div>
            <span className="orders-overview-label">Total orders</span>
            <strong>{counts.all}</strong>
          </div>
        </div>

        <div className="orders-overview-card">
          <span className="orders-overview-icon" aria-hidden="true">🛵</span>
          <div>
            <span className="orders-overview-label">In progress</span>
            <strong>{counts.active}</strong>
          </div>
        </div>

        <div className="orders-overview-card">
          <span className="orders-overview-icon" aria-hidden="true">✓</span>
          <div>
            <span className="orders-overview-label">Delivered</span>
            <strong>{counts.delivered}</strong>
          </div>
        </div>
      </section>

      <nav className="orders-filter-tabs" aria-label="Filter orders">
        {filters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            className={`orders-filter-tab ${
              activeFilter === filter.key ? "is-selected" : ""
            }`}
            aria-pressed={activeFilter === filter.key}
            onClick={() => setActiveFilter(filter.key)}
          >
            <span>{filter.label}</span>
            <span className="orders-filter-count">{filter.count}</span>
          </button>
        ))}
      </nav>

      {notice && (
        <div className="orders-notice" role="status">
          {notice}
        </div>
      )}

      {error && (
        <div className="orders-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => fetchOrders(true)}>
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <div className="orders-state-card" role="status">
          <span className="orders-loading-icon" aria-hidden="true">🍽️</span>
          <h2>Loading your orders…</h2>
          <p>Just a moment while we get everything ready.</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="orders-state-card">
          <span className="orders-loading-icon" aria-hidden="true">
            {activeFilter === "cancelled" ? "✓" : "🛍️"}
          </span>
          <h2>
            {activeFilter === "all"
              ? "No orders yet"
              : activeFilter === "active"
                ? "No active orders"
                : activeFilter === "delivered"
                  ? "No delivered orders yet"
                  : "No cancelled orders"}
          </h2>
          <p>
            {activeFilter === "all"
              ? "When you place an order, its updates will appear here."
              : "There are no orders in this category right now."}
          </p>
          {activeFilter !== "all" && (
            <button
              type="button"
              className="orders-empty-action"
              onClick={() => setActiveFilter("all")}
            >
              View all orders
            </button>
          )}
        </div>
      ) : (
        <section className="orders-list" aria-label="Your orders">
          {filteredOrders.map((order) => {
            const items = getOrderItems(order);
            const status = normalizeStatus(order.status);
            const paymentStatus = normalizeStatus(
              order.paymentStatus || order.payment?.status || ""
            );
            const isBusy = busyOrderId === order._id;

            const canCancel =
              !isCancelled(order) &&
              !isDelivered(order) &&
              !["out_for_delivery", "out_for_delivery"].includes(status);

            const paymentFailed = [
              "failed",
              "pending",
              "created",
            ].includes(paymentStatus);

            return (
              <article className="orders-card" key={order._id}>
                <div className="orders-card-header">
                  <div className="orders-card-identity">
                    <span className="orders-order-icon" aria-hidden="true">
                      🍴
                    </span>
                    <div>
                      <p className="orders-order-reference">
                        ORDER #{String(order._id || "").slice(-8).toUpperCase()}
                      </p>
                      <p className="orders-order-date">
                        Placed {formatDateTime(order.createdAt)}
                      </p>
                    </div>
                  </div>

                  <span className={`orders-status-pill status-${status || "pending"}`}>
                    {formatStatus(order.status)}
                  </span>
                </div>

                <OrderTracker status={order.status} />

                <div className="orders-card-content">
                  <section className="orders-items-section">
                    <h3>Order items</h3>
                    <ul className="orders-item-list">
                      {items.map((item, index) => (
                        <li key={item._id || item.menuItemId || index}>
                          <span className="orders-item-quantity">
                            {getItemQuantity(item)}×
                          </span>
                          <span className="orders-item-name">
                            {getItemName(item)}
                          </span>
                          <strong>
                            {formatPrice(
                              getItemPrice(item) * getItemQuantity(item)
                            )}
                          </strong>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section className="orders-payment-section">
                    <div className="orders-payment-row">
                      <span>Order total</span>
                      <strong className="orders-order-total">
                        {formatPrice(getOrderTotal(order))}
                      </strong>
                    </div>
                    <div className="orders-payment-row">
                      <span>Payment</span>
                      <span className={`orders-payment-pill payment-${paymentStatus || "unknown"}`}>
                        {formatStatus(order.paymentStatus || order.payment?.status || "Unknown")}
                      </span>
                    </div>
                    {order.paymentMethod && (
                      <div className="orders-payment-row">
                        <span>Method</span>
                        <span>{formatStatus(order.paymentMethod)}</span>
                      </div>
                    )}
                  </section>
                </div>

                {(order.deliveryAddress || order.address) && (
                  <div className="orders-delivery-address">
                    <span aria-hidden="true">📍</span>
                    <div>
                      <strong>Delivery address</strong>
                      <p>
                        {typeof (order.deliveryAddress || order.address) === "string"
                          ? order.deliveryAddress || order.address
                          : [
                              (order.deliveryAddress || order.address).line1,
                              (order.deliveryAddress || order.address).line2,
                              (order.deliveryAddress || order.address).city,
                              (order.deliveryAddress || order.address).postalCode,
                            ].filter(Boolean).join(", ")}
                      </p>
                    </div>
                  </div>
                )}

                {(canCancel || paymentFailed) && (
                  <div className="orders-card-actions">
                    {canCancel && (
                      <button
                        type="button"
                        className="orders-cancel-button"
                        disabled={isBusy}
                        onClick={() => cancelOrder(order)}
                      >
                        {isBusy ? "Please wait…" : "Cancel order"}
                      </button>
                    )}

                    {paymentFailed && !isCancelled(order) && (
                      <button
                        type="button"
                        className="orders-retry-button"
                        disabled={isBusy}
                        onClick={() => handleRetryPayment(order)}
                      >
                        {isBusy ? "Please wait…" : "Retry payment"}
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

