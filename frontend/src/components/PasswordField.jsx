import { useState } from "react";

export function PasswordField({ id, value, onChange, disabled, error }) {
  const [visible, setVisible] = useState(false);
  const errorId = `${id}-error`;

  return (
    <div className="field">
      <label htmlFor={id}>Password</label>
      <div className="password-wrap">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete="current-password"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <button
          type="button"
          className="toggle"
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? "Hide password" : "Show password"}
        </button>
      </div>
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
