import { useRef, useState } from "react";
import { ApiError } from "../api.js";
import { normalizeEmail, validateEmail, validatePassword } from "../validation.js";
import { PasswordField } from "./PasswordField.jsx";

/**
 * @param {{
 *   onSubmit: (credentials: { email: string, password: string }) => Promise<void>,
 *   notice?: string,
 *   onRetry?: () => void,
 * }} props
 */
export function LoginPage({ onSubmit, notice, onRetry }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState(
    /** @type {{ email?: string, password?: string }} */ ({}),
  );
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  function edit(field, setter, value) {
    setter(value);
    setErrors((prev) => ({ ...prev, [field]: "" }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (inFlight.current) return;

    const normalized = normalizeEmail(email);
    const found = {
      email: validateEmail(normalized),
      password: validatePassword(password),
    };
    setErrors(found);
    setFormError("");
    if (found.email || found.password) return;

    inFlight.current = true;
    setSubmitting(true);
    try {
      await onSubmit({ email: normalized, password });
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && err.fields) {
        setErrors(err.fields);
      } else {
        setFormError(
          err instanceof ApiError && err.status === 401
            ? "Invalid email or password"
            : "Something went wrong. Please try again.",
        );
      }
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <form className="card" onSubmit={handleSubmit} noValidate>
        <h1>Sign in</h1>
        {notice && (
          <div className="notice" role="status">
            <span>{notice}</span>
            {onRetry && (
              <button type="button" onClick={onRetry}>
                Retry
              </button>
            )}
          </div>
        )}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            disabled={submitting}
            onChange={(e) => edit("email", setEmail, e.target.value)}
            aria-invalid={errors.email ? "true" : undefined}
            aria-describedby={errors.email ? "email-error" : undefined}
          />
          {errors.email && (
            <p id="email-error" className="field-error">
              {errors.email}
            </p>
          )}
        </div>
        <PasswordField
          id="password"
          value={password}
          onChange={(value) => edit("password", setPassword, value)}
          disabled={submitting}
          error={errors.password}
        />
        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>
    </main>
  );
}
