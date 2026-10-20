
import { useEffect, useState } from "react";
import Auth from "./Auth";
import Restaurants from "./Restaurants";
import Menu from "./Menu";
import Cart from "./Cart";
import Checkout from "./Checkout";
import Orders from "./Orders";
import AdminOrders from "./AdminOrders";
import DeliveryDashboard from "./DeliveryDashboard";
import api from "./lib/api";
import "./Food.css";

function getInitialTheme() {
  try {
    const savedTheme = localStorage.getItem("food-app-theme");

    if (savedTheme === "light" || savedTheme === "dark") {
      return savedTheme;
    }
  } catch {
    // Fall back to light mode if storage is unavailable.
  }

  return "light";
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const [showAdminOrders, setShowAdminOrders] = useState(false);
  const [showDeliveryDashboard, setShowDeliveryDashboard] =
    useState(false);
  const [theme, setTheme] = useState(getInitialTheme);

  const [cart, setCart] = useState({
    items: [],
    totalAmount: 0,
    restaurant: null,
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;

    try {
      localStorage.setItem("food-app-theme", theme);
    } catch {
      // The selected theme still works for the current session.
    }
  }, [theme]);

  useEffect(() => {
    api
      .get("/auth/me")
      .then((response) => setUser(response.data.user))
      .catch(() => setUser(null))
      .finally(() => setCheckingSession(false));
  }, []);

  useEffect(() => {
    if (!user) {
      setCart({
        items: [],
        totalAmount: 0,
        restaurant: null,
      });
      return;
    }

    api
      .get("/cart")
      .then((response) => setCart(response.data.cart))
      .catch((error) =>
        console.error("Unable to load cart:", error.message)
      );
  }, [user]);

  if (checkingSession) {
    return (
      <main className="app-loading">
        <span className="loading-mark">F</span>
        <p>Preparing something delicious...</p>
      </main>
    );
  }

  if (!user) {
    return <Auth onLogin={setUser} />;
  }

  const cartCount = cart.items.reduce(
    (total, item) => total + item.quantity,
    0
  );

  function closeOtherPages() {
    setSelectedRestaurant(null);
    setShowCart(false);
    setShowCheckout(false);
    setShowOrders(false);
    setShowAdminOrders(false);
    setShowDeliveryDashboard(false);
  }

  async function openCart() {
    try {
      const response = await api.get("/cart");
      setCart(response.data.cart);
      closeOtherPages();
      setShowCart(true);
    } catch (error) {
      console.error("Unable to load cart:", error.message);
      alert("Unable to load your cart. Please try again.");
    }
  }

  function openRestaurants() {
    closeOtherPages();
  }

  function openCheckout() {
    closeOtherPages();
    setShowCheckout(true);
  }

  function openOrders() {
    closeOtherPages();
    setShowOrders(true);
  }

  function openAdminOrders() {
    closeOtherPages();
    setShowAdminOrders(true);
  }

  function openDeliveryDashboard() {
    closeOtherPages();
    setShowDeliveryDashboard(true);
  }

  async function handleLogout() {
    try {
      await api.post("/auth/logout");
    } catch (error) {
      console.error("Logout request failed:", error.message);
    } finally {
      setUser(null);
      setSelectedRestaurant(null);
      setShowCart(false);
      setShowCheckout(false);
      setShowOrders(false);
      setShowAdminOrders(false);
      setShowDeliveryDashboard(false);

      setCart({
        items: [],
        totalAmount: 0,
        restaurant: null,
      });
    }
  }

  const roleLabel =
    user.role === "admin"
      ? "Administrator"
      : user.role === "delivery"
        ? "Delivery partner"
        : "Food lover";

  return (
    <div className="app-shell">
      <header className="app-header">
        <button
          type="button"
          className="brand"
          onClick={openRestaurants}
          aria-label="Go to restaurants"
        >
          <span className="brand-mark" aria-hidden="true">
            f
          </span>
          <span className="brand-copy">
            <span className="brand-name">foodie</span>
            <span className="brand-tagline">GOOD FOOD. GOOD MOOD.</span>
          </span>
        </button>

        <nav className="app-nav" aria-label="Main navigation">
          {user.role !== "delivery" && (
            <>
              <button
                type="button"
                className={
                  !showCart &&
                  !showCheckout &&
                  !showOrders &&
                  !showAdminOrders &&
                  !showDeliveryDashboard &&
                  !selectedRestaurant
                    ? "nav-link active"
                    : "nav-link"
                }
                onClick={openRestaurants}
              >
                Discover
              </button>

              <button
                type="button"
                className={showOrders ? "nav-link active" : "nav-link"}
                onClick={openOrders}
              >
                My orders
              </button>

              <button
                type="button"
                className="nav-link cart-nav-link"
                onClick={openCart}
              >
                <span aria-hidden="true">🛍</span>
                Cart
                <span className="cart-count">{cartCount}</span>
              </button>
            </>
          )}

          {user.role === "admin" && (
            <button
              type="button"
              className={showAdminOrders ? "nav-link active" : "nav-link"}
              onClick={openAdminOrders}
            >
              Admin orders
            </button>
          )}

          {user.role === "delivery" && (
            <button
              type="button"
              className={
                showDeliveryDashboard ? "nav-link active" : "nav-link"
              }
              onClick={openDeliveryDashboard}
            >
              Delivery dashboard
            </button>
          )}
        </nav>

        <div className="header-actions">
          <button
            type="button"
            className="theme-toggle"
            onClick={() =>
              setTheme((current) =>
                current === "light" ? "dark" : "light"
              )
            }
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            <span aria-hidden="true">
              {theme === "light" ? "☾" : "☀"}
            </span>
            <span className="theme-toggle-label">
              {theme === "light" ? "Dark" : "Light"}
            </span>
          </button>

          <div className="user-chip" title={roleLabel}>
            <span className="user-avatar" aria-hidden="true">
              {(user.name || "U").trim().charAt(0).toUpperCase()}
            </span>
            <span className="user-copy">
              <span className="user-greeting">Welcome back</span>
              <span className="user-name">{user.name}</span>
            </span>
          </div>

          <button
            type="button"
            className="logout-button"
            onClick={handleLogout}
          >
            Log out
          </button>
        </div>
      </header>

      <main className="app-content">
        {showAdminOrders && user.role === "admin" ? (
          <AdminOrders />
        ) : showDeliveryDashboard && user.role === "delivery" ? (
          <DeliveryDashboard />
        ) : showOrders && user.role !== "delivery" ? (
          <Orders />
        ) : showCart && user.role !== "delivery" ? (
          <Cart
            cart={cart}
            onCartUpdated={setCart}
            onCheckout={openCheckout}
          />
        ) : showCheckout && user.role !== "delivery" ? (
          <Checkout cart={cart} onCartUpdated={setCart} />
        ) : selectedRestaurant && user.role !== "delivery" ? (
          <Menu
            restaurant={selectedRestaurant}
            onBack={() => setSelectedRestaurant(null)}
            onCartUpdated={setCart}
          />
        ) : (
          user.role !== "delivery" && (
            <Restaurants
              onSelect={(restaurant) => {
                closeOtherPages();
                setSelectedRestaurant(restaurant);
              }}
            />
          )
        )}
      </main>
    </div>
  );
}
