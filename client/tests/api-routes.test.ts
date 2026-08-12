import { describe, expect, it } from "vitest";
import { GET as healthGet } from "../src/app/api/health/route.js";
import { POST as chatPost } from "../src/app/api/chat/route.js";

describe("Next.js API Route Handlers", () => {
  it("GET /api/health mengembalikan status response", async () => {
    const res = await healthGet();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("status");
    expect(data).toHaveProperty("ai");
  });

  it("POST /api/chat melempar 400 jika payload tidak valid", async () => {
    const req = new Request("http://localhost:3000/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [] })
    });
    const res = await chatPost(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe("VALIDATION_ERROR");
  });
});
