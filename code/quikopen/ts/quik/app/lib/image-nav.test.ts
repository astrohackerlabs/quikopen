import { expect, test } from "bun:test";

import { keyDelta, step } from "./image-nav.ts";

test("step wraps at both ends", () => {
  expect(step(0, -1, 9)).toBe(8);
  expect(step(8, 1, 9)).toBe(0);
  expect(step(2, 3, 9)).toBe(5);
  expect(step(1, -11, 3)).toBe(2);
  expect(step(4, 1, 0)).toBe(0);
});

test("arrow keys map to steps per view", () => {
  const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter"];
  expect(keys.map((key) => keyDelta(key, "thumbs"))).toEqual([
    -1,
    1,
    -1,
    1,
    null,
  ]);
  expect(keys.map((key) => keyDelta(key, "single"))).toEqual([
    -1,
    1,
    null,
    null,
    null,
  ]);
  expect(keys.map((key) => keyDelta(key, "grid"))).toEqual([
    null,
    null,
    null,
    null,
    null,
  ]);
});
