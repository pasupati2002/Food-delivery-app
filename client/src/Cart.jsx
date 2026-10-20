
import React, { useState } from "react";
import api from "./lib/api";
import "./Food.css";

function formatPrice(amount) {
  return `₹${Number(amount || 0).toFixed(2)}`;
}

export default function Cart({ cart, onCartUpdated, onCheckout }) {
  const [busyId, setBusyId] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState("");

  const items = cart?.items || [];
  const totalAmount = Number(
    cart?.totalAmount ??
      items.reduce(
        (sum, item) =>
          sum + Number(item.price || 0) * Number(item.quantity || 0),
        0
      )
  );

  async function updateQuantity(item, quantity) {
    if (quantity < 1) return;

    setBusyId(item.menuItemId);
    setMessage("");

    try {
      const response = await api.patch(
        `/cart/items/${item.menuItemId}`,
        { quantity }
      );
      onCartUpdated(response.data.cart);
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          "Could not update the quantity. Please try again."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function removeItem(item) {
    setBusyId(item.menuItemId);
    setMessage("");

    try {
      const response = await api.delete(
        `/cart/items/${item.menuItemId}`
      );
      onCartUpdated(response.data.cart);
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          "Could not remove this item. Please try again."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function clearCart() {
    if (items.length === 0 || clearing) return;

    setClearing(true);
    setMessage("");

    try {
      await api.delete("/cart");
      onCartUpdated({ items: [], totalAmount: 0 });
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          "Could not clear your cart. Please try again."
      );
    } finally {
      setClearing(false);
    }
  }

  return (
    <main className="food-page cart-page">
      <header className="cart-page-header">
        <div>
          <p className="food-eyebrow">YOUR ORDER, YOUR WAY</p>
          <h1>Your Cart</h1>
          <p className="food-subtitle">
            Review your favourites before checking out.
          </p>
        </div>

        <div className="cart-item-count">
          <span className="cart-count-icon" aria-hidden="true">
            🛍️
          </span>
          <span>
            <strong>{items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)}</strong>
            <small>
              {items.length === 1 ? " item" : " items"}
            </small>
          </span>
        </div>
      </header>

      {message && (
        <div className="cart-message" role="alert">
          {message}
        </div>
      )}

      {items.length === 0 ? (
        <section className="cart-empty-state">
          <div className="cart-empty-icon" aria-hidden="true">
            🛒
          </div>
          <h2>Your cart is waiting for something delicious</h2>
          <p>
            Explore the menu and add your favourite dishes to get started.
          </p>
        </section>
      ) : (
        <div className="cart-layout">
          <section className="cart-items-panel" aria-label="Cart items">
            <div className="cart-panel-heading">
              <div>
                <h2>Your items</h2>
                <p>Check quantities and item prices below.</p>
              </div>

              <button
                type="button"
                className="cart-clear-button"
                onClick={clearCart}
                disabled={clearing || busyId !== null}
              >
                {clearing ? "Clearing…" : "Clear cart"}
              </button>
            </div>

            <div className="cart-items-list">
              {items.map((item) => {
                const itemBusy = busyId === item.menuItemId;
                const quantity = Number(item.quantity || 0);
                const lineTotal = Number(item.price || 0) * quantity;

                return (
                  <article
                    className="cart-line-item"
                    key={item.menuItemId}
                  >
                    <div className="cart-item-art" aria-hidden="true">
                      🍽️
                    </div>

                    <div className="cart-item-main">
                      <div className="cart-item-heading">
                        <div>
                          <h3>{item.name}</h3>
                          <p className="cart-item-unit-price">
                            {formatPrice(item.price)} <span>per item</span>
                          </p>
                        </div>

                        <strong className="cart-line-total">
                          {formatPrice(lineTotal)}
                        </strong>
                      </div>

                      {item.unavailable && (
                        <p className="cart-unavailable" role="status">
                          This item is currently unavailable.
                        </p>
                      )}

                      <div className="cart-item-actions">
                        <div
                          className="cart-quantity-control"
                          aria-label={`Quantity for ${item.name}`}
                        >
                          <button
                            type="button"
                            aria-label={`Decrease ${item.name} quantity`}
                            disabled={itemBusy || quantity <= 1}
                            onClick={() => updateQuantity(item, quantity - 1)}
                          >
                            −
                          </button>
                          <span aria-live="polite">{quantity}</span>
                          <button
                            type="button"
                            aria-label={`Increase ${item.name} quantity`}
                            disabled={itemBusy || Boolean(item.unavailable)}
                            onClick={() => updateQuantity(item, quantity + 1)}
                          >
                            +
                          </button>
                        </div>

                        <button
                          type="button"
                          className="cart-remove-button"
                          disabled={itemBusy}
                          onClick={() => removeItem(item)}
                        >
                          {itemBusy ? "Updating…" : "Remove"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <aside className="cart-summary-panel" aria-label="Order summary">
            <div className="cart-summary-top">
              <span className="cart-summary-kicker">THE FINAL TOUCH</span>
              <h2>Order summary</h2>
              <p>Everything looks good? You're nearly there.</p>
            </div>

            <div className="cart-summary-lines">
              <div>
                <span>Items ({items.length})</span>
                <strong>{formatPrice(totalAmount)}</strong>
              </div>
              <div>
                <span>Delivery fee</span>
                <span className="cart-fee-note">Calculated at checkout</span>
              </div>
            </div>

            <div className="cart-summary-total">
              <span>Cart total</span>
              <strong>{formatPrice(totalAmount)}</strong>
            </div>

            <button
              type="button"
              className="cart-checkout-button"
              onClick={onCheckout}
              disabled={
                typeof onCheckout !== "function" ||
                items.some((item) => item.unavailable) ||
                busyId !== null ||
                clearing
              }
            >
              Proceed to checkout
              <span aria-hidden="true">→</span>
            </button>

            {items.some((item) => item.unavailable) && (
              <p className="cart-checkout-note" role="status">
                Remove unavailable items before checking out.
              </p>
            )}

            <div className="cart-secure-note">
              <span aria-hidden="true">🔒</span>
              <span>Review your delivery details on the next step.</span>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
