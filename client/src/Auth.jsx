
import { useState } from "react";
import api from "./lib/api";
import "./Auth.css";

export default function Auth({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isLogin = mode === "login";

  async function handleSubmit(event) {
    event.preventDefault();

    if (loading) return;

    setLoading(true);
    setMessage("");

    try {
      const endpoint = isLogin ? "/auth/login" : "/auth/register";

      const payload = isLogin
        ? { email, password }
        : { name, email, password };

      const response = await api.post(endpoint, payload);

      onLogin(response.data.user);
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          "Unable to continue. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  function toggleMode() {
    setMode((current) =>
      current === "login" ? "register" : "login"
    );
    setMessage("");
    setShowPassword(false);
  }

  return (
    <main className="auth-page">
      <div className="auth-layout">
        <section className="auth-card">
          <div className="auth-brand-icon" aria-hidden="true">
            <span>🍊</span>
          </div>

          <p className="auth-eyebrow">
            {isLogin ? "WELCOME BACK" : "YOUR FOOD JOURNEY STARTS HERE"}
          </p>

          <h1>
            {isLogin ? (
              <>Good food. <span>Good to see you.</span></>
            ) : (
              <>Join the table. <span>Enjoy every bite.</span></>
            )}
          </h1>

          <p className="auth-description">
            {isLogin
              ? "Log in to discover delicious meals and pick up where you left off."
              : "Create your account and get ready to discover your next favourite meal."}
          </p>

          <div className="auth-mode-switch" role="group" aria-label="Account action">
            <button
              type="button"
              className={`auth-mode-button ${isLogin ? "active" : ""}`}
              onClick={() => {
                if (!isLogin) toggleMode();
              }}
              aria-pressed={isLogin}
            >
              Log in
            </button>

            <button
              type="button"
              className={`auth-mode-button ${!isLogin ? "active" : ""}`}
              onClick={() => {
                if (isLogin) toggleMode();
              }}
              aria-pressed={!isLogin}
            >
              Create account
            </button>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {!isLogin && (
              <div className="auth-field">
                <label htmlFor="auth-name">Your name</label>
                <input
                  id="auth-name"
                  type="text"
                  autoComplete="name"
                  placeholder="Enter your full name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  minLength={2}
                  maxLength={80}
                  required
                  disabled={loading}
                />
              </div>
            )}

            <div className="auth-field">
              <label htmlFor="auth-email">Email address</label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={254}
                required
                disabled={loading}
              />
            </div>

            <div className="auth-field">
              <div className="auth-password-label">
                <label htmlFor="auth-password">Password</label>
                <span>At least 8 characters</span>
              </div>

              <div className="auth-password-wrap">
                <input
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  maxLength={72}
                  required
                  disabled={loading}
                />

                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  disabled={loading}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {message && (
              <div className="auth-error" role="alert">
                <span aria-hidden="true">!</span>
                <p>{message}</p>
              </div>
            )}

            <button
              className="auth-submit"
              type="submit"
              disabled={loading}
            >
              <span>
                {loading
                  ? "Please wait..."
                  : isLogin
                    ? "Log in to your account"
                    : "Create my account"}
              </span>
              {!loading && <span aria-hidden="true">→</span>}
            </button>
          </form>

          <div className="auth-trust-note">
            <span aria-hidden="true">🔒</span>
            Your account details are submitted securely to your app.
          </div>

          <p className="auth-mobile-switch">
            {isLogin ? "New to the table?" : "Already have an account?"}{" "}
            <button type="button" onClick={toggleMode}>
              {isLogin ? "Create an account" : "Log in"}
            </button>
          </p>
        </section>

        <aside className="auth-visual">
          <div className="auth-visual-top">
            <span className="auth-visual-logo">bite<span>.</span></span>
            <span className="auth-visual-pill">
              <span className="auth-status-dot" />
              MADE FOR FOOD LOVERS
            </span>
          </div>

          <div className="auth-food-art" aria-hidden="true">
            <div className="auth-food-orbit auth-food-orbit-one" />
            <div className="auth-food-orbit auth-food-orbit-two" />
            <span className="auth-food-spark auth-food-spark-one">✦</span>
            <span className="auth-food-spark auth-food-spark-two">✧</span>
            <span className="auth-food-emoji">🍔</span>
            <span className="auth-food-side-emoji">🍟</span>
            <span className="auth-food-drink-emoji">🥤</span>
          </div>

          <div className="auth-visual-copy">
            <p className="auth-visual-eyebrow">A LITTLE HAPPINESS, DELIVERED</p>
            <h2>Cravings don't wait.<br />Neither should you.</h2>
            <p>
              Find something delicious, order with ease, and make your day
              a little tastier.
            </p>
          </div>

          <div className="auth-visual-footer">
            <span>Fresh picks. Happy bites.</span>
            <span aria-hidden="true">✳</span>
          </div>
        </aside>
      </div>
    </main>
  );
}
