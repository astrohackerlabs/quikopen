import { describe, expect, test } from "bun:test";

import {
  detectIdentityFlag,
  formatVersionLine,
  HELP_FIRST_LINE,
  helpOutput,
  resolveProductVersion,
  tryHandleIdentity,
  versionOutput,
} from "./product-identity.ts";

describe("resolveProductVersion / formatVersionLine", () => {
  test("ASTROHACKER_VERSION env wins over embed and fallback", () => {
    expect(
      resolveProductVersion({ ASTROHACKER_VERSION: "9.9.9" }, "1.2.3", "0.0.1"),
    ).toBe("9.9.9");
  });

  test("embedded version used when ASTROHACKER_VERSION unset", () => {
    expect(resolveProductVersion({}, "1.2.3", "0.0.1")).toBe("1.2.3");
  });

  test("package fallback when env and embed unset", () => {
    // Explicit empty embed (undefined would re-apply QUIK_EMBEDDED_VERSION default)
    expect(resolveProductVersion({}, "", "0.0.1")).toBe("0.0.1");
  });

  test("explicit embedded arg is used when env unset", () => {
    expect(resolveProductVersion({}, "2.3.4", "0.0.1")).toBe("2.3.4");
  });

  test("trims whitespace from env", () => {
    expect(
      resolveProductVersion({ ASTROHACKER_VERSION: "  0.1.50  " }, "x"),
    ).toBe("0.1.50");
  });

  test("formatVersionLine is Quikopen <version>", () => {
    expect(formatVersionLine("9.9.9")).toBe("Quikopen 9.9.9");
  });
});

describe("detectIdentityFlag", () => {
  test("detects --version and -V", () => {
    expect(detectIdentityFlag(["quik", "--version"])).toBe("version");
    expect(detectIdentityFlag(["quik", "-V"])).toBe("version");
  });

  test("detects --help and -h", () => {
    expect(detectIdentityFlag(["quik", "--help"])).toBe("help");
    expect(detectIdentityFlag(["quik", "-h"])).toBe("help");
  });

  test("null when no identity flags", () => {
    expect(detectIdentityFlag(["quik"])).toBe(null);
    expect(detectIdentityFlag(["quik", "--browser"])).toBe(null);
  });

  test("identity before other args still wins", () => {
    expect(detectIdentityFlag(["quik", "--version", "--browser"])).toBe(
      "version",
    );
  });
});

describe("tryHandleIdentity (shipped dispatch)", () => {
  test("writes version first line and returns true", () => {
    const chunks: string[] = [];
    const handled = tryHandleIdentity(
      ["quik", "--version"],
      { ASTROHACKER_VERSION: "9.9.9" },
      (s) => chunks.push(s),
    );
    expect(handled).toBe(true);
    const text = chunks.join("");
    expect(text.split("\n")[0]).toBe("Quikopen 9.9.9");
    expect(versionOutput("9.9.9")).toBe(text);
  });

  test("writes help first line starting with Quikopen", () => {
    const chunks: string[] = [];
    const handled = tryHandleIdentity(
      ["quik", "--help"],
      { ASTROHACKER_VERSION: "1.0.0" },
      (s) => chunks.push(s),
    );
    expect(handled).toBe(true);
    const text = chunks.join("");
    expect(text.split("\n")[0]).toBe(HELP_FIRST_LINE);
    expect(text.startsWith("Quikopen")).toBe(true);
    expect(text).toContain("quikopen <svg-path>");
    expect(text).not.toContain("  quik <svg-path>");
    expect(helpOutput("1.0.0")).toBe(text);
  });

  test("returns false when not identity (does not write)", () => {
    const chunks: string[] = [];
    expect(tryHandleIdentity(["quik"], {}, (s) => chunks.push(s))).toBe(false);
    expect(chunks).toEqual([]);
  });
});
