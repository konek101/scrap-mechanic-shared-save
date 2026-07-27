import { describe, expect, it } from "vitest";
import worker, { type Env } from "./index";

describe("coordination API", () => {
  it("requires a bearer session for world routes", async () => {
    const response = await worker.fetch(
      new Request("https://worker.example/v1/worlds/00000000-0000-0000-0000-000000000000/status"),
      {} as Env
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });
});
