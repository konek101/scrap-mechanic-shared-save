import { describe, expect, it } from "vitest";
import worker, { type Env } from "./index";

describe("coordination API", () => {
  it("does not accept Steam tickets before the server secret is configured", async () => {
    const response = await worker.fetch(
      new Request("https://worker.example/v1/sessions", { method: "POST", body: JSON.stringify({ steamTicket: "ticket" }) }),
      {} as Env
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Steam authentication is not configured" });
  });

  it("requires a bearer session for world routes", async () => {
    const response = await worker.fetch(
      new Request("https://worker.example/v1/worlds/00000000-0000-0000-0000-000000000000/status"),
      {} as Env
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });
});
