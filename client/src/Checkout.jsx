
import { useState } from "react";
import { startCheckout } from "./lib/checkout";
import api from "./lib/api";
import "./Checkout.css";

export default function Checkout({ cart, onCartUpdated }) {
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [completedOrder, setCompletedOrder] = useState(null);

  async function handleCheckout(event) {
    event.preventDefault();

    if (loading) return;

    setLoading(true);
    setMessage("");
    setCompletedOrder(null);

    try {
      await startCheckout({
        cart,
        deliveryAddress,

        onSuccess: async (result) => {
          setCompletedOrder(result.orderId);
          setMessage("Payment verified successfully!");
          setMessageType("success");

          try {
            const response = await api.get("/cart");

            if (onCartUpdated) {
              onCartUpdated(response.data.cart);
            }
          } catch (error) {
            console.error(
              "Payment succeeded, but refreshing the cart failed:",
              error.message
            );
          }
        },

        onError: (errorMessage) => {
          setMessage(errorMessage);
          setMessageType("error");
        },
      });
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          error.message ||
          "Unable to start checkout."
      );
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }

  const items = cart?.items || [];
  const totalAmount = Number(cart?.totalAmount || 0);

  return (
    <main className="checkout-page">
      <div className="checkout-layout">
        <section className="checkout-card">
          <div className="checkout-heading">
            <div className="checkout-icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="5" width="18" height="14" rx="3" />
                <path d="M3 10h18M7 15h3" />
              </svg>
            </div>

            <p className="checkout-eyebrow">
              ALMOST TIME TO EAT
            </p>

            <h1>Checkout</h1>

            <p className="checkout-description">
              A few details, then your favourite food is on its way.
            </p>
          </div>

          <div className="checkout-step">
            <span className="checkout-step-number">1</span>
            <div>
              <h2>Delivery details</h2>
              <p>Where should we bring your order?</p>
            </div>
          </div>

          <form onSubmit={handleCheckout}>
            <label
              className="checkout-label"
              htmlFor="deliveryAddress"
            >
              Full delivery address
            </label>

            <textarea
              id="deliveryAddress"
              className="checkout-address"
              value={deliveryAddress}
              onChange={(event) =>
                setDeliveryAddress(event.target.value)
              }
              placeholder="House number, street, area, city, PIN code"
              minLength={5}
              maxLength={500}
              required
              rows={4}
              disabled={loading || Boolean(completedOrder)}
            />

            <p className="checkout-field-hint">
              Include a nearby landmark to help your delivery partner
              find you.
            </p>

            <div className="checkout-security">
              <span className="checkout-security-icon" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="4" y="10" width="16" height="11" rx="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
                </svg>
              </span>

              <div>
                <strong>Secure payment</strong>
                <p>
                  Payments use Razorpay Test Mode. No real-money
                  payment is intended.
                </p>
              </div>
            </div>

            <button
              className="pay-button"
              type="submit"
              disabled={loading || Boolean(completedOrder)}
            >
              <span>
                {loading
                  ? "Processing your order..."
                  : completedOrder
                    ? "Payment confirmed"
                    : "Continue to payment"}
              </span>

              {!loading && !completedOrder && (
                <span className="checkout-button-arrow" aria-hidden="true">
                  →
                </span>
              )}
            </button>
          </form>

          {message && (
            <div
              className={`checkout-message ${messageType}`}
              role="status"
              aria-live="polite"
            >
              <span aria-hidden="true">
                {messageType === "success"
                  ? "✓"
                  : messageType === "error"
                    ? "!"
                    : "i"}
              </span>
              {message}
            </div>
          )}

          {completedOrder && (
            <div className="order-confirmation">
              <div className="confirmation-check" aria-hidden="true">
                ✓
              </div>

              <div>
                <h2>Order confirmed!</h2>
                <p>Your payment has been verified successfully.</p>
              </div>

              <div className="order-id">
                <span>ORDER REFERENCE</span>
                <strong>{completedOrder}</strong>
              </div>
            </div>
          )}
        </section>

        <aside className="checkout-aside">
          <div className="checkout-aside-art" aria-hidden="true">
            <span className="checkout-art-circle" />
            <span className="checkout-art-spark checkout-art-spark-one">✦</span>
            <span className="checkout-art-spark checkout-art-spark-two">✦</span>
            <span className="checkout-art-emoji">🍽️</span>
          </div>

          <p className="checkout-aside-eyebrow">GOOD FOOD, GOOD MOOD</p>
          <h2>Your next favourite meal is just moments away.</h2>
          <p className="checkout-aside-description">
            Freshly prepared, carefully packed, and delivered to your door.
          </p>

          <div className="checkout-summary">
            <div className="checkout-summary-heading">
              <h3>Order summary</h3>
              <span>{items.length} {items.length === 1 ? "item" : "items"}</span>
            </div>

            {items.length > 0 ? (
              <div className="checkout-summary-items">
                {items.map((item, index) => (
                  <div
                    className="checkout-summary-item"
                    key={item.menuItemId || item._id || index}
                  >
                    <span className="checkout-summary-item-name">
                      {item.name || item.menuItem?.name || "Food item"}
                      <small> × {item.quantity || 1}</small>
                    </span>
                    {item.subtotal != null && (
                      <span>
                        ₹{Number(item.subtotal).toFixed(2)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="checkout-summary-empty">
                Your selected items will appear here.
              </p>
            )}

            <div className="checkout-summary-total">
              <span>Total amount</span>
              <strong>₹{totalAmount.toFixed(2)}</strong>
            </div>
            <p className="checkout-summary-footnote">
              Final payment details are shown during checkout.
            </p>
          </div>

          <div className="checkout-help">
            <span aria-hidden="true">♡</span>
            <p>
              Made with care.
              <br />
              Delivered with love.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
