import { describe, expect, it } from "vitest";
import { mapAiError } from "../src/errors.js";

describe("mapAiError", () => {
  it("memetakan timeout", () => {
    expect(mapAiError({ name: "APIConnectionTimeoutError" }).code).toBe("AI_TIMEOUT");
  });

  it("memetakan model yang tidak ditemukan", () => {
    expect(mapAiError({ status: 404, message: "model not found" }).code).toBe(
      "AI_MODEL_NOT_FOUND"
    );
  });

  it("memetakan router tidak tersedia", () => {
    expect(mapAiError(new Error("connection refused")).code).toBe("AI_UNAVAILABLE");
  });
});
