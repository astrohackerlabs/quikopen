import { describe, expect, test } from "bun:test";
import { bindRuntimePort } from "./runtime-port.ts";

describe("runtime HTTP ports", () => {
  test("retains real listeners, retries, wraps, exhausts and reuses", async () => {
    const servers: ReturnType<typeof Bun.serve>[] = [];
    const start = (port: number): ReturnType<typeof Bun.serve> =>
      Bun.serve({
        hostname: "127.0.0.1",
        port,
        fetch: () => new Response("owned"),
      });
    try {
      const first = bindRuntimePort(start);
      servers.push(first);
      const port = first.port;
      if (!port) throw new Error("Missing bound port");
      expect(port).toBeGreaterThanOrEqual(24000);
      expect(port).toBeLessThanOrEqual(24999);
      expect(
        await (await fetch(`http://127.0.0.1:${String(port)}`)).text(),
      ).toBe("owned");
      expect(() => bindRuntimePort(start, port, port, 0)).toThrow("exhausted");
      // Start on the occupied upper endpoint, then wrap to the lower one.
      if (port > 24000) {
        const wrapped = bindRuntimePort(start, port - 1, port, 1);
        servers.push(wrapped);
        expect(wrapped.port).toBe(port - 1);
        expect(() => bindRuntimePort(start, port - 1, port, 0)).toThrow(
          "exhausted",
        );
      }
      await first.stop(true);
      const reused = bindRuntimePort(start, port, port, 0);
      servers.push(reused);
      expect(reused.port).toBe(port);
    } finally {
      for (const server of servers) await server.stop(true);
    }
  });
  test("non-collision errors propagate without retry", () => {
    let calls = 0;
    const error = new Error("initialization failed");
    expect(() =>
      bindRuntimePort(() => {
        calls++;
        throw error;
      }),
    ).toThrow(error);
    expect(calls).toBe(1);
  });
  test("invalid bounds fail before starting", () => {
    expect(() =>
      bindRuntimePort(
        () => {
          throw new Error("called");
        },
        2,
        1,
      ),
    ).toThrow("Invalid");
  });
});
