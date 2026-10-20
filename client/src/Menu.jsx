
import { useEffect, useState } from "react";
import api from "./lib/api";

export default function Menu({ restaurant, onBack, onCartUpdated }) {
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addingId, setAddingId] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError("");

    api
      .get(`/restaurants/${restaurant._id}/menu`)
      .then((response) => {
        if (active) {
          setMenuItems(response.data.menuItems || []);
        }
      })
      .catch(() => {
        if (active) setError("Unable to load this menu.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [restaurant._id]);

  async function addToCart(item) {
    setAddingId(item._id);
    setMessage("");

    try {
      const response = await api.post("/cart/items", {
        menuItemId: item._id,
        quantity: 1,
      });

      setMessage(`${item.name} added to cart.`);
      onCartUpdated?.(response.data.cart);
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          "Unable to add this item to your cart."
      );
    } finally {
      setAddingId(null);
    }
  }

  return (
    <main className="food-page menu-page">
      <button className="food-button menu-back-button" onClick={onBack}>
        <span aria-hidden="true">←</span> Back to restaurants
      </button>

      <section className="menu-hero">
        <p className="food-eyebrow">EXPLORE THE MENU</p>
        <h1>{restaurant.name}</h1>
        <p className="food-subtitle">
          {restaurant.description || "Discover something delicious today."}
        </p>

        <div className="menu-hero-tag">
          <span aria-hidden="true">✦</span> Made for your cravings
        </div>
      </section>

      {message && (
        <p role="status" className="checkout-message info menu-feedback">
          {message}
        </p>
      )}

      <section className="menu-section">
        <div className="menu-section-heading">
          <div>
            <p className="food-eyebrow">FRESH FROM THE KITCHEN</p>
            <h2>Our menu</h2>
            <p className="food-subtitle">
              Find your favorite dish and add it to your cart.
            </p>
          </div>

          {!loading && !error && menuItems.length > 0 && (
            <span className="menu-item-count">
              {menuItems.length} {menuItems.length === 1 ? "item" : "items"}
            </span>
          )}
        </div>

        {loading && (
          <div className="menu-state-card">
            <span className="menu-state-icon">🍲</span>
            <h3>Preparing the menu...</h3>
            <p>Please wait while we fetch the dishes.</p>
          </div>
        )}

        {error && (
          <div className="menu-state-card" role="alert">
            <span className="menu-state-icon">😕</span>
            <h3>We couldn't load this menu</h3>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && menuItems.length === 0 && (
          <div className="menu-state-card">
            <span className="menu-state-icon">🍽️</span>
            <h3>No dishes available yet</h3>
            <p>Please check back later for this restaurant's menu.</p>
          </div>
        )}

        {!loading && !error && menuItems.length > 0 && (
          <div className="menu-list">
            {menuItems.map((item) => (
              <article className="menu-item" key={item._id}>
                <div className="menu-item-details">
                  <div className="menu-item-title-row">
                    <h3>{item.name}</h3>

                    {item.isVegetarian && (
                      <span
                        className="menu-veg-indicator"
                        title="Vegetarian"
                        aria-label="Vegetarian"
                      >
                        <span />
                      </span>
                    )}
                  </div>

                  <p className="menu-item-description">
                    {item.description || "A delicious dish from our kitchen."}
                  </p>

                  <p className="menu-price">
                    ₹{Number(item.price).toFixed(2)}
                  </p>

                  <div className="menu-item-meta">
                    <span className="menu-category">
                      {item.category || "Chef's selection"}
                    </span>

                    {item.isVegetarian && (
                      <span className="menu-vegetarian-label">
                        🥬 Vegetarian
                      </span>
                    )}
                  </div>
                </div>

                <div className="menu-item-action">
                  <button
                    className="food-button menu-add-button"
                    disabled={addingId === item._id}
                    onClick={() => addToCart(item)}
                  >
                    {addingId === item._id ? (
                      "Adding..."
                    ) : (
                      <>
                        <span aria-hidden="true">+</span> Add
                      </>
                    )}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
