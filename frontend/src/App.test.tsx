import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "./App";

afterEach(() => {
  cleanup();
});

describe("Laterlight app shell", () => {
  it("renders the landing page and opens registration", () => {
    render(<App />);

    expect(
      screen.getByText(/Turn paperwork into decisions you can finish/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /start free/i })[0]);

    expect(
      screen.getByRole("heading", { name: /create your account/i }),
    ).toBeInTheDocument();

    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("switches from registration to login", () => {
    render(<App />);

    fireEvent.click(screen.getAllByRole("button", { name: /start free/i })[0]);

    expect(
      screen.getByRole("heading", { name: /create your account/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /^log in$/i })[1]);

    expect(
      screen.getByRole("heading", { name: /welcome back/i }),
    ).toBeInTheDocument();

    expect(screen.queryByLabelText(/full name/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("opens the login form when Log in is clicked", () => {
    render(<App />);

    fireEvent.click(screen.getAllByRole("button", { name: /^log in$/i })[0]);

    expect(
      screen.getByRole("heading", { name: /welcome back/i }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: /continue to dashboard/i }),
    ).toBeInTheDocument();
  });
});
