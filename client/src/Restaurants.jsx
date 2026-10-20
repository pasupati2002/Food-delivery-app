
import { useEffect, useState } from "react";
import api from "./lib/api";

export default function Restaurants({ onSelect }) {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/restaurants")
      .then((response) => {
        setRestaurants(response.data.restaurants || []);
      })
      .catch(() => setError("Unable to load restaurants. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="food-page restaurants-page">
        <div className="restaurant-loading card">
          <span className="restaurant-loading-icon">🍽️</span>
          <h2>Finding something delicious...</h2>
          <p>Loading restaurants for you.</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="food-page restaurants-page">
        <div className="restaurant-message card">
          <span className="restaurant-message-icon">😕</span>
          <h2>We couldn't load the restaurants</h2>
          <p>{error}</p>
          <button
            className="food-button"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="food-page restaurants-page">
      <section className="restaurants-hero">
        <div className="restaurants-hero-copy">
          <span className="food-eyebrow">
            <span className="restaurants-live-dot" />
            GOOD FOOD, DELIVERED
          </span>

          <h1>
            Your next
            <br />
            <span>favorite meal</span> awaits.
          </h1>

          <p className="food-subtitle">
            Discover great flavors, explore local favorites, and
            get delicious food delivered to your door.
          </p>

          <div className="restaurants-hero-points">
            <span>✦ Handpicked restaurants</span>
            <span>✦ Something for every craving</span>
          </div>
        </div>

        <div className="restaurants-hero-art" aria-hidden="true">
          <div className="restaurants-art-glow" />
          <div className="restaurants-art-plate">
            <span>🍕</span>
          </div>
          <span className="restaurants-art-float restaurants-art-float-one">
            🍔
          </span>
          <span className="restaurants-art-float restaurants-art-float-two">
            🍜
          </span>
          <span className="restaurants-art-float restaurants-art-float-three">
            🥗
          </span>
          <div className="restaurants-art-caption">
            <span>Made for your cravings</span>
            <strong>Good food. Good mood.</strong>
          </div>
        </div>
      </section>

      <section className="restaurants-listing">
        <div className="restaurants-section-heading">
          <div>
            <p className="food-eyebrow">EXPLORE YOUR OPTIONS</p>
            <h2>Restaurants near you</h2>
            <p className="food-subtitle">
              Pick your favorite spot and discover its menu.
            </p>
          </div>

          <span className="restaurants-count">
            {restaurants.length}{" "}
            {restaurants.length === 1 ? "restaurant" : "restaurants"}
          </span>
        </div>

        {restaurants.length === 0 ? (
          <div className="restaurant-message card">
            <span className="restaurant-message-icon">🍽️</span>
            <h2>Your next meal is waiting</h2>
            <p>No restaurants are available right now. Please check back soon.</p>
          </div>
        ) : (
          <div className="restaurant-grid">
            {restaurants.map((restaurant) => (
              <article
                className={`restaurant-card ${
                  !restaurant.isOpen ? "restaurant-card-closed" : ""
                }`}
                key={restaurant._id}
              >
                <div className="restaurant-card-image">
                  {restaurant.image ? (
                    <img
                      src={restaurant.image}
                      alt={restaurant.name}
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className="restaurant-placeholder"
                      aria-hidden="true"
                    >
                      🍽️
                    </div>
                  )}

                  <span
                    className={`restaurant-status ${
                      restaurant.isOpen
                        ? "restaurant-status-open"
                        : "restaurant-status-closed"
                    }`}
                  >
                    <span className="restaurant-status-dot" />
                    {restaurant.isOpen ? "Open now" : "Currently closed"}
                  </span>
                </div>

                <div className="restaurant-card-content">
                  <div className="restaurant-card-title-row">
                    <h2>{restaurant.name}</h2>
                    <span className="restaurant-card-sparkle">✦</span>
                  </div>

                  <p className="restaurant-description">
                    {restaurant.description ||
                      "Delicious food made for every craving."}
                  </p>

                  <div className="restaurant-meta">
                    <span className="restaurant-cuisine">
                      {restaurant.cuisine?.join(" · ") || "Popular food"}
                    </span>
                    {restaurant.deliveryTime && (
                      <span className="restaurant-delivery-time">
                        <span aria-hidden="true">◷</span>
                        {restaurant.deliveryTime}
                      </span>
                    )}
                  </div>

                  <button
                    className="food-button restaurant-menu-button"
                    disabled={!restaurant.isOpen}
                    onClick={() => onSelect(restaurant)}
                  >
                    <span>
                      {restaurant.isOpen ? "Explore menu" : "Currently closed"}
                    </span>
                    {restaurant.isOpen && <span aria-hidden="true">↗</span>}
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
