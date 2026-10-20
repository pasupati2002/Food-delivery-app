import { useCallback, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import api from "./lib/api";
import "./Food.css";

const ORDER_STATUSES = [
  "confirmed",
  "preparing",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

const STATUS_OPTIONS = [
  { value: "all", label: "All orders" },
  { value: "confirmed", label: "Confirmed" },
  { value: "preparing", label: "Preparing" },
  { value: "out_for_delivery", label: "Out for delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

function formatStatus(status = "") {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatOrderDate(date) {
  if (!date) return "Date unavailable";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Date unavailable";
  }

  return parsedDate.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatOrderTime(date) {
  if (!date) return "";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return parsedDate.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function SummaryCard({ label, value, icon, detail }) {
  return (
    <div className="admin-summary-card">
      <div className="admin-summary-top">
        <span className="admin-summary-label">{label}</span>
        <span className="admin-summary-icon" aria-hidden="true">
          {icon}
        </span>
      </div>

      <div className="admin-summary-value">{value}</div>

      {detail && <div className="admin-summary-detail">{detail}</div>}
    </div>
  );
}

function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [deliveryPartners, setDeliveryPartners] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);
  const [error, setError] = useState("");
  const [actionMessages, setActionMessages] = useState({});
  const [busyActions, setBusyActions] = useState({});

  const loadOrders = useCallback(async () => {
    try {
      setError("");

      const response = await api.get("/orders/admin");
      setOrders(response.data.orders || response.data || []);
    } catch (err) {
      setError(
        err.response?.data?.message || "Unable to load orders. Please try again."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadDeliveryPartners = useCallback(async () => {
    try {
      const response = await api.get("/orders/admin/delivery-partners");
      const partners = response.data.deliveryPartners || response.data || [];

      setDeliveryPartners(partners);

      setAssignments((current) => {
        const next = { ...current };

        partners.forEach((partner) => {
          if (partner._id && next[partner._id] === undefined) {
            next[partner._id] = "";
          }
        });

        return next;
      });
    } catch (err) {
      console.error("Unable to load delivery partners:", err);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    loadDeliveryPartners();
  }, [loadOrders, loadDeliveryPartners]);

  useEffect(() => {
    const socket = io("http://localhost:5000", {
      withCredentials: true,
    });

    socket.on("connect", () => setLiveConnected(true));
    socket.on("disconnect", () => setLiveConnected(false));

    const refreshOrders = () => {
      loadOrders();
    };

    socket.on("orderStatusUpdated", refreshOrders);
    socket.on("orderAssigned", refreshOrders);

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("orderStatusUpdated", refreshOrders);
      socket.off("orderAssigned", refreshOrders);
      socket.disconnect();
    };
  }, [loadOrders]);

  const runAction = async (key, action) => {
    setBusyActions((current) => ({ ...current, [key]: true }));
    setActionMessages((current) => ({ ...current, [key]: "" }));

    try {
      await action();
    } finally {
      setBusyActions((current) => ({ ...current, [key]: false }));
    }
  };

  const updateStatus = async (orderId, status) => {
    const key = `status-${orderId}`;

    await runAction(key, async () => {
      try {
        await api.patch(`/orders/${orderId}/status`, { status });

        setActionMessages((current) => ({
          ...current,
          [key]: "Order status updated.",
        }));

        await loadOrders();
      } catch (err) {
        setActionMessages((current) => ({
          ...current,
          [key]:
            err.response?.data?.message || "Could not update order status.",
        }));
      }
    });
  };

  const assignDeliveryPartner = async (order) => {
    const key = `assign-${order._id}`;
    const deliveryPartnerId = assignments[order._id] || "";

    if (!deliveryPartnerId) {
      setActionMessages((current) => ({
        ...current,
        [key]: "Please select a delivery partner first.",
      }));
      return;
    }

    await runAction(key, async () => {
      try {
        await api.patch(`/orders/${order._id}/assign-delivery`, {
          deliveryPartnerId,
        });

        setActionMessages((current) => ({
          ...current,
          [key]: "Delivery partner assigned successfully.",
        }));

        await loadOrders();
      } catch (err) {
        setActionMessages((current) => ({
          ...current,
          [key]:
            err.response?.data?.message ||
            "Could not assign the delivery partner.",
        }));
      }
    });
  };

  const checkRefundStatus = async (order) => {
    const key = `refund-${order._id}`;

    await runAction(key, async () => {
      try {
        const response = await api.get(
          `/orders/${order._id}/refund-status`
        );

        const message =
          response.data.message ||
          `Refund status: ${formatStatus(
            response.data.refundStatus || response.data.status || "unknown"
          )}`;

        setActionMessages((current) => ({
          ...current,
          [key]: message,
        }));

        await loadOrders();
      } catch (err) {
        setActionMessages((current) => ({
          ...current,
          [key]:
            err.response?.data?.message || "Could not check refund status.",
        }));
      }
    });
  };

  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      return (
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime()
      );
    });
  }, [orders]);

  const summary = useMemo(() => {
    return {
      total: orders.length,
      confirmed: orders.filter((order) => order.status === "confirmed").length,
      preparing: orders.filter((order) => order.status === "preparing").length,
      outForDelivery: orders.filter(
        (order) => order.status === "out_for_delivery"
      ).length,
      delivered: orders.filter((order) => order.status === "delivered").length,
      cancelled: orders.filter((order) => order.status === "cancelled").length,
    };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();

    return sortedOrders.filter((order) => {
      const matchesStatus =
        statusFilter === "all" || order.status === statusFilter;

      const customerName =
        order.user?.name || order.customer?.name || order.userName || "";

      const restaurantName =
        order.restaurant?.name || order.restaurantName || "";

      const orderId = order._id || order.id || "";

      const matchesSearch =
        !query ||
        String(orderId).toLowerCase().includes(query) ||
        String(customerName).toLowerCase().includes(query) ||
        String(restaurantName).toLowerCase().includes(query) ||
        String(order.status || "").toLowerCase().includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [sortedOrders, statusFilter, search]);

  const getOrderTotal = (order) => {
    const total =
      order.totalAmount ??
      order.total ??
      order.grandTotal ??
      order.amount ??
      0;

    return Number(total).toLocaleString(undefined, {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    });
  };

  const getCustomerName = (order) =>
    order.user?.name ||
    order.customer?.name ||
    order.userName ||
    "Customer";

  const getRestaurantName = (order) =>
    order.restaurant?.name || order.restaurantName || "Restaurant";

  const getOrderItems = (order) =>
    order.items || order.orderItems || order.products || [];

  const getItemName = (item) =>
    item.name || item.menuItem?.name || item.product?.name || "Menu item";

  const getItemQuantity = (item) =>
    item.quantity ?? item.qty ?? 1;

  const getAssignedPartner = (order) =>
    order.deliveryPartner || order.deliveryBoy || order.assignedTo || null;

  const getRefundStatus = (order) =>
    order.refundStatus ||
    order.refund?.status ||
    order.payment?.refundStatus ||
    "";

  const getPaymentStatus = (order) =>
    order.paymentStatus ||
    order.payment?.status ||
    order.paymentInfo?.status ||
    "";

  const getOrderReference = (order) =>
    String(order._id || order.id || "").slice(-8).toUpperCase();

  const isRefundRelevant = (order) => {
    const status = String(order.status || "").toLowerCase();
    const paymentStatus = String(getPaymentStatus(order)).toLowerCase();
    const refundStatus = String(getRefundStatus(order)).toLowerCase();

    return (
      status === "cancelled" ||
      paymentStatus.includes("refund") ||
      refundStatus.length > 0
    );
  };

  return (
    <main className="page-container admin-orders-page">
      <header className="admin-orders-header">
        <div>
          <div className="admin-orders-eyebrow">
            <span className="admin-eyebrow-mark">✦</span>
            ADMINISTRATION
          </div>

          <h1>Order management</h1>

          <p className="admin-orders-subtitle">
            Monitor incoming orders, manage delivery assignments, and keep
            every order moving.
          </p>
        </div>

        <div className="admin-header-actions">
          <div
            className={`admin-live-indicator ${
              liveConnected ? "is-connected" : "is-disconnected"
            }`}
          >
            <span className="admin-live-dot" />
            {liveConnected ? "Live updates connected" : "Live updates offline"}
          </div>

          <button
            type="button"
            className="btn btn-secondary admin-refresh-button"
            disabled={refreshing}
            onClick={() => {
              setRefreshing(true);
              loadOrders();
              loadDeliveryPartners();
            }}
          >
            <span aria-hidden="true">{refreshing ? "↻" : "⟳"}</span>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {error && (
        <div className="admin-notice admin-notice-error" role="alert">
          <span aria-hidden="true">!</span>
          <span>{error}</span>
          <button
            type="button"
            className="admin-notice-action"
            onClick={() => {
              setLoading(true);
              loadOrders();
            }}
          >
            Try again
          </button>
        </div>
      )}

      <section className="admin-summary-grid" aria-label="Order summary">
        <SummaryCard
          label="Total orders"
          value={summary.total}
          icon="▤"
          detail="All orders received"
        />
        <SummaryCard
          label="Confirmed"
          value={summary.confirmed}
          icon="✓"
          detail="Ready for preparation"
        />
        <SummaryCard
          label="Preparing"
          value={summary.preparing}
          icon="◷"
          detail="Being prepared"
        />
        <SummaryCard
          label="Out for delivery"
          value={summary.outForDelivery}
          icon="➤"
          detail="On the way"
        />
        <SummaryCard
          label="Delivered"
          value={summary.delivered}
          icon="✦"
          detail="Successfully completed"
        />
        <SummaryCard
          label="Cancelled"
          value={summary.cancelled}
          icon="×"
          detail="Cancelled orders"
        />
      </section>

      <section className="admin-toolbar" aria-label="Search and filter orders">
        <div className="admin-search-wrap">
          <span className="admin-search-icon" aria-hidden="true">
            ⌕
          </span>

          <input
            type="search"
            aria-label="Search orders"
            placeholder="Search by order ID, customer, restaurant…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          {search && (
            <button
              type="button"
              className="admin-clear-search"
              aria-label="Clear search"
              onClick={() => setSearch("")}
            >
              ×
            </button>
          )}
        </div>

        <div className="admin-filter-wrap">
          <label htmlFor="admin-order-status-filter">Status</label>
          <select
            id="admin-order-status-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <div className="admin-results-line">
        <div>
          <strong>
            {statusFilter === "all"
              ? "All orders"
              : formatStatus(statusFilter)}
          </strong>
          <span className="admin-results-count">
            {filteredOrders.length}{" "}
            {filteredOrders.length === 1 ? "order" : "orders"}
          </span>
        </div>

        {(search || statusFilter !== "all") && (
          <button
            type="button"
            className="admin-reset-filters"
            onClick={() => {
              setSearch("");
              setStatusFilter("all");
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="admin-empty-state">
          <div className="admin-loading-spinner" />
          <h3>Loading orders</h3>
          <p>Getting the latest order information…</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="admin-empty-state">
          <div className="admin-empty-icon" aria-hidden="true">
            ▤
          </div>
          <h3>{orders.length ? "No matching orders" : "No orders yet"}</h3>
          <p>
            {orders.length
              ? "Try another search or change the selected status filter."
              : "New customer orders will appear here."}
          </p>

          {(search || statusFilter !== "all") && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <section className="admin-orders-list" aria-label="Orders">
          {filteredOrders.map((order) => {
            const orderId = order._id || order.id;
            const statusKey = `status-${orderId}`;
            const assignKey = `assign-${orderId}`;
            const refundKey = `refund-${orderId}`;
            const items = getOrderItems(order);
            const assignedPartner = getAssignedPartner(order);
            const refundStatus = getRefundStatus(order);
            const paymentStatus = getPaymentStatus(order);
            const currentStatus = ORDER_STATUSES.includes(order.status)
              ? order.status
              : "confirmed";

            return (
              <article className="admin-order-card" key={orderId}>
                <div className="admin-order-card-header">
                  <div className="admin-order-title-row">
                    <div className="admin-order-icon" aria-hidden="true">
                      ◈
                    </div>

                    <div>
                      <div className="admin-order-reference">
                        ORDER #{getOrderReference(order)}
                      </div>
                      <h2 className="admin-order-restaurant">
                        {getRestaurantName(order)}
                      </h2>
                      <div className="admin-order-date">
                        {formatOrderDate(order.createdAt)}
                        {formatOrderTime(order.createdAt) &&
                          ` · ${formatOrderTime(order.createdAt)}`}
                      </div>
                    </div>
                  </div>

                  <div className="admin-order-header-right">
                    <span
                      className={`admin-status-badge status-${String(
                        order.status || "unknown"
                      ).toLowerCase()}`}
                    >
                      <span className="admin-status-dot" />
                      {formatStatus(order.status || "unknown")}
                    </span>

                    <div className="admin-order-total">
                      <span className="admin-order-total-label">
                        Order total
                      </span>
                      <strong>{getOrderTotal(order)}</strong>
                    </div>
                  </div>
                </div>

                <div className="admin-order-body">
                  <div className="admin-order-section">
                    <h3 className="admin-section-heading">
                      <span aria-hidden="true">♙</span>
                      Customer details
                    </h3>

                    <div className="admin-order-detail-grid">
                      <div className="admin-order-detail">
                        <span className="admin-order-detail-label">Name</span>
                        <span className="admin-order-detail-value">
                          {getCustomerName(order)}
                        </span>
                      </div>

                      <div className="admin-order-detail">
                        <span className="admin-order-detail-label">
                          Payment
                        </span>
                        <span className="admin-order-detail-value">
                          {paymentStatus
                            ? formatStatus(paymentStatus)
                            : "Not specified"}
                        </span>
                      </div>

                      {(order.user?.email || order.customer?.email) && (
                        <div className="admin-order-detail">
                          <span className="admin-order-detail-label">
                            Email
                          </span>
                          <span className="admin-order-detail-value admin-break-word">
                            {order.user?.email || order.customer?.email}
                          </span>
                        </div>
                      )}

                      {(order.phone ||
                        order.user?.phone ||
                        order.customer?.phone) && (
                        <div className="admin-order-detail">
                          <span className="admin-order-detail-label">
                            Phone
                          </span>
                          <span className="admin-order-detail-value">
                            {order.phone ||
                              order.user?.phone ||
                              order.customer?.phone}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="admin-order-section">
                    <h3 className="admin-section-heading">
                      <span aria-hidden="true">☷</span>
                      Order items
                      <span className="admin-section-count">
                        {items.length}
                      </span>
                    </h3>

                    {items.length > 0 ? (
                      <div className="admin-order-items">
                        {items.map((item, index) => (
                          <div
                            className="admin-order-item"
                            key={item._id || item.id || `${orderId}-${index}`}
                          >
                            <span className="admin-order-item-name">
                              {getItemName(item)}
                            </span>
                            <span className="admin-order-item-quantity">
                              × {getItemQuantity(item)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="admin-muted-copy">
                        Item details are not available for this order.
                      </p>
                    )}
                  </div>

                  <div className="admin-order-section">
                    <h3 className="admin-section-heading">
                      <span aria-hidden="true">➤</span>
                      Delivery assignment
                    </h3>

                    {assignedPartner ? (
                      <div className="admin-assigned-partner">
                        <span className="admin-partner-avatar" aria-hidden="true">
                          {(
                            assignedPartner.name ||
                            assignedPartner.user?.name ||
                            "D"
                          )
                            .charAt(0)
                            .toUpperCase()}
                        </span>

                        <div>
                          <span className="admin-order-detail-label">
                            Currently assigned
                          </span>
                          <strong>
                            {assignedPartner.name ||
                              assignedPartner.user?.name ||
                              "Delivery partner"}
                          </strong>
                          {(assignedPartner.phone ||
                            assignedPartner.user?.phone) && (
                            <span className="admin-partner-phone">
                              {assignedPartner.phone ||
                                assignedPartner.user?.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="admin-muted-copy">
                        No delivery partner assigned yet.
                      </p>
                    )}

                    <div className="admin-order-control">
                      <label htmlFor={`partner-${orderId}`}>
                        {assignedPartner
                          ? "Change delivery partner"
                          : "Choose a delivery partner"}
                      </label>

                      <div className="admin-control-row">
                        <select
                          id={`partner-${orderId}`}
                          value={assignments[orderId] || ""}
                          onChange={(event) =>
                            setAssignments((current) => ({
                              ...current,
                              [orderId]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Select a delivery partner</option>

                          {deliveryPartners.map((partner) => (
                            <option key={partner._id} value={partner._id}>
                              {partner.name ||
                                partner.user?.name ||
                                partner.email ||
                                partner._id}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          className="btn btn-primary admin-action-button"
                          disabled={
                            busyActions[assignKey] ||
                            !assignments[orderId] ||
                            deliveryPartners.length === 0
                          }
                          onClick={() => assignDeliveryPartner(order)}
                        >
                          {busyActions[assignKey]
                            ? "Saving…"
                            : assignedPartner
                              ? "Reassign"
                              : "Assign partner"}
                        </button>
                      </div>

                      {deliveryPartners.length === 0 && (
                        <p className="admin-field-hint">
                          No delivery partners are currently available.
                        </p>
                      )}

                      {actionMessages[assignKey] && (
                        <p
                          className="admin-action-message"
                          role="status"
                        >
                          {actionMessages[assignKey]}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="admin-order-section admin-order-management-section">
                    <h3 className="admin-section-heading">
                      <span aria-hidden="true">⚙</span>
                      Manage order
                    </h3>

                    <div className="admin-order-control">
                      <label htmlFor={`status-${orderId}`}>
                        Update order status
                      </label>

                      <div className="admin-control-row">
                        <select
                          id={`status-${orderId}`}
                          value={currentStatus}
                          onChange={(event) =>
                            updateStatus(orderId, event.target.value)
                          }
                          disabled={busyActions[statusKey]}
                        >
                          {ORDER_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {formatStatus(status)}
                            </option>
                          ))}
                        </select>

                        {busyActions[statusKey] && (
                          <span className="admin-saving-label">
                            Saving…
                          </span>
                        )}
                      </div>

                      {actionMessages[statusKey] && (
                        <p
                          className="admin-action-message"
                          role="status"
                        >
                          {actionMessages[statusKey]}
                        </p>
                      )}
                    </div>

                    {isRefundRelevant(order) && (
                      <div className="admin-refund-panel">
                        <div className="admin-refund-info">
                          <span className="admin-refund-icon" aria-hidden="true">
                            ↺
                          </span>

                          <div>
                            <strong>Refund information</strong>
                            <span>
                              {refundStatus
                                ? `Current status: ${formatStatus(refundStatus)}`
                                : "Check the latest refund status"}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn btn-secondary admin-action-button"
                          disabled={busyActions[refundKey]}
                          onClick={() => checkRefundStatus(order)}
                        >
                          {busyActions[refundKey]
                            ? "Checking…"
                            : "Check refund"}
                        </button>

                        {actionMessages[refundKey] && (
                          <p
                            className="admin-action-message admin-refund-message"
                            role="status"
                          >
                            {actionMessages[refundKey]}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

export default AdminOrders;