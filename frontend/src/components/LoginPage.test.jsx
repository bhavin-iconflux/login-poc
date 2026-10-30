import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginPage } from "./LoginPage.jsx";
import { ApiError } from "../api.js";

function deferred() {
  /** @type {() => void} */
  let resolve = () => {};
  const promise = /** @type {Promise<void>} */ (new Promise((res) => {
    resolve = () => res(undefined);
  }));
  return { promise, resolve };
}

async function fillAndSubmit(email = "alice@example.com", password = "Password123!") {
  await userEvent.type(screen.getByLabelText("Email"), email);
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("LoginPage", () => {
  it("shows_inline_errors_and_sends_no_request_when_invalid", async () => {
    const onSubmit = vi.fn(() => Promise.resolve());
    render(<LoginPage onSubmit={onSubmit} />);
    await fillAndSubmit("nope", "short");
    expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
    expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("disables_button_and_shows_loading_while_in_flight", async () => {
    const pending = deferred();
    render(<LoginPage onSubmit={() => pending.promise} />);
    await fillAndSubmit();
    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
    expect(screen.getByLabelText("Email")).toBeDisabled();
    expect(screen.getByLabelText("Password")).toBeDisabled();
    pending.resolve();
  });

  it("shows_generic_message_on_401_not_under_a_field", async () => {
    render(<LoginPage onSubmit={() => Promise.reject(new ApiError(401))} />);
    await fillAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Password")).not.toHaveAttribute("aria-invalid", "true");
  });

  it("maps_400_fields_to_inline_errors", async () => {
    const message = "Password must be at least 8 characters";
    render(
      <LoginPage onSubmit={() => Promise.reject(new ApiError(400, { password: message }))} />,
    );
    await fillAndSubmit();
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows_retryable_message_on_network_error", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(0))
      .mockResolvedValueOnce(undefined);
    render(<LoginPage onSubmit={onSubmit} />);
    await fillAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong. Please try again.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("password_toggle_switches_input_type", async () => {
    render(<LoginPage onSubmit={() => Promise.resolve()} />);
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");
    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");
    const hide = screen.getByRole("button", { name: "Hide password" });
    expect(hide).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(hide);
    expect(input).toHaveAttribute("type", "password");
  });

  it("submits_normalized_email", async () => {
    const onSubmit = vi.fn(() => Promise.resolve());
    render(<LoginPage onSubmit={onSubmit} />);
    await fillAndSubmit(" Alice@Example.COM ");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      email: "alice@example.com",
      password: "Password123!",
    });
  });

  it("ignores_second_submit_while_in_flight", async () => {
    const pending = deferred();
    const onSubmit = vi.fn(() => pending.promise);
    const { container } = render(<LoginPage onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("Email"), "alice@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "Password123!");
    const form = container.querySelector("form");
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    pending.resolve();
  });

  it("clears_field_error_on_edit", async () => {
    render(<LoginPage onSubmit={() => Promise.resolve()} />);
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByText("Email is required")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Email"), "a");
    expect(screen.queryByText("Email is required")).not.toBeInTheDocument();
  });

  it("shows_notice_with_retry_button", async () => {
    const onRetry = vi.fn();
    render(
      <LoginPage onSubmit={() => Promise.resolve()} notice="Can't reach server" onRetry={onRetry} />,
    );
    expect(screen.getByText("Can't reach server")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
