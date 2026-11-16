import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import Home from "@/app/page";

afterEach(() => {
  cleanup();
});

test("見出しと準備中の表示がある", () => {
  render(<Home />);
  expect(screen.getByRole("heading", { level: 1, name: "SELECAO Media" })).toBeTruthy();
  expect(screen.getByText("準備中です。")).toBeTruthy();
});
