import { expect, test } from "bun:test";
import * as net from "node:net";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { basename, resolve } from "node:path";
import { Buffer } from "node:buffer";
import { TermSurfClient } from "../app/cli/termsurf-client.ts";
import { RuntimeFixture, waitUntil } from "./runtime-fixture.ts";
import {
  chromium,
  expect as browserExpect,
  type Page,
  type Browser,
} from "@playwright/test";
import { IMAGE_MAX_BYTES } from "../app/cli/image-path.ts";

const root = resolve(import.meta.dir, "..");
const binary = resolve(root, "dist/quikopen");
const fixtureSvg = resolve(root, "fixtures/sample.svg");
if (!existsSync(binary))
  throw new Error("Build quikopen before integration tests");
if (!existsSync(fixtureSvg)) throw new Error("Missing fixtures/sample.svg");

const fixtureBytes = readFileSync(fixtureSvg);
const images = [
  {
    name: "sample.svg",
    mime: "image/svg+xml; charset=utf-8",
    width: 32,
    height: 32,
  },
  { name: "sample.jpg", mime: "image/jpeg", width: 32, height: 24 },
  { name: "sample.jpeg", mime: "image/jpeg", width: 32, height: 24 },
  { name: "oriented.jpg", mime: "image/jpeg", width: 24, height: 32 },
  { name: "transparent.png", mime: "image/png", width: 32, height: 24 },
  { name: "animated.gif", mime: "image/gif", width: 32, height: 24 },
  { name: "opaque.webp", mime: "image/webp", width: 32, height: 24 },
  { name: "transparent.webp", mime: "image/webp", width: 32, height: 24 },
  { name: "animated.webp", mime: "image/webp", width: 32, height: 24 },
  { name: "wide.png", mime: "image/png", width: 2000, height: 200 },
  { name: "tall.png", mime: "image/png", width: 200, height: 2000 },
  { name: "huge.png", mime: "image/png", width: 2000, height: 2000 },
];

async function openImage(
  owned: RuntimeFixture,
  file: string | string[],
  mode: "source" | "compiled",
): Promise<{
  child: Bun.Subprocess<"pipe", "pipe", "pipe">;
  url: URL;
  imageUrl: URL;
}> {
  const socket = `${owned.dir}/host-${String(owned.servers.length)}`;
  const fixture = await host(socket, owned);
  const cmd =
    mode === "source"
      ? [process.execPath, "--no-env-file", `${root}/cli.ts`]
      : [binary];
  const child = owned.spawn(
    [...cmd, ...(Array.isArray(file) ? file : [file])],
    {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      QUIK_PKG_ROOT: root,
      TERMSURF_SOCKET: socket,
      TERMSURF_PANE_ID: "fixture",
      QUIK_COLS: "80",
      QUIK_ROWS: "24",
    },
    root,
  );
  await until(
    () =>
      fixture.frames.length === 1 ||
      child.exitCode !== null ||
      child.signalCode !== null,
    "image overlay",
  );
  if (child.exitCode !== null || child.signalCode !== null)
    throw new Error(
      `Image process stopped (${child.signalCode ?? String(child.exitCode)}): ${owned.children.at(-1)?.output ?? ""}`,
    );
  const url = new URL(String(decode(fixture.frames[0])[6]));
  const imageUrl = new URL("/image", url);
  imageUrl.search = url.search;
  return { child, url, imageUrl };
}

for (const mode of ["source", "compiled"] as const) {
  test(`${mode} all image formats preserve bytes, MIME, identity and revalidation`, async () => {
    const owned = new RuntimeFixture();
    let failed = true;
    try {
      for (const item of images) {
        const name = `雪 "image" ${item.name.toUpperCase()}`;
        const file = resolve(owned.dir, name);
        const bytes = readFileSync(resolve(root, "fixtures", item.name));
        writeFileSync(file, bytes);
        const { child, url, imageUrl } = await openImage(owned, file, mode);
        expect(url.searchParams.get("name")).toBe(name);
        for (const method of ["GET", "HEAD"]) {
          const response = await fetch(imageUrl, { method });
          expect(response.status).toBe(200);
          expect(response.headers.get("content-type")).toBe(item.mime);
          expect(response.headers.get("x-content-type-options")).toBe(
            "nosniff",
          );
          expect(
            decodeURIComponent(
              response.headers
                .get("content-disposition")
                ?.split("UTF-8''")[1] ?? "",
            ),
          ).toBe(name);
          expect(Buffer.from(await response.arrayBuffer())).toEqual(
            method === "GET" ? bytes : Buffer.alloc(0),
          );
          for (const token of ["", "incorrect"]) {
            const invalid = new URL(imageUrl);
            invalid.search = token ? "?token=incorrect" : "";
            expect((await fetch(invalid, { method })).status).toBe(404);
          }
          const first = new URL(imageUrl);
          first.searchParams.set("i", "0");
          expect((await fetch(first, { method })).status).toBe(200);
          for (const index of ["1", "9", "-1", "x", ""]) {
            const outside = new URL(imageUrl);
            outside.searchParams.set("i", index);
            expect((await fetch(outside, { method })).status).toBe(404);
          }
        }
        unlinkSync(file);
        expect((await fetch(imageUrl)).status).toBe(404);
        writeFileSync(file, new Uint8Array(IMAGE_MAX_BYTES + 1));
        expect((await fetch(imageUrl)).status).toBe(404);
        writeFileSync(file, bytes);
        expect(
          Buffer.from(await (await fetch(imageUrl)).arrayBuffer()),
        ).toEqual(bytes);
        await child.stdin.write(new Uint8Array([27]));
        await child.stdin.flush();
        await until(() => child.exitCode !== null, "image exit");
        expect(await child.exited).toBe(0);
      }
      failed = false;
    } finally {
      await owned.close(failed);
    }
  }, 60000);
}

interface RevisionBody {
  ok: boolean;
  revisions: { revision: number; available: boolean; status?: string }[];
  nav: number;
}

async function revisionsOf(pageUrl: URL): Promise<RevisionBody> {
  const endpoint = new URL("/__quik/revision", pageUrl);
  endpoint.search = pageUrl.search;
  const response = await fetch(endpoint);
  expect(response.status).toBe(200);
  return (await response.json()) as RevisionBody;
}

/** One image's entry from the shared poll, flattened as `{ ok, ...entry }`. */
async function revisionOf(
  pageUrl: URL,
  index = 0,
): Promise<{
  ok: boolean;
  revision: number;
  available: boolean;
  status?: string;
}> {
  const body = await revisionsOf(pageUrl);
  const entry = body.revisions[index];
  if (!entry) throw new Error(`no revision for image ${String(index)}`);
  return { ok: body.ok, ...entry };
}

async function waitRevision(
  pageUrl: URL,
  ready: (body: {
    revision: number;
    available: boolean;
    status?: string;
  }) => boolean,
  index = 0,
): Promise<{ revision: number; available: boolean; status?: string }> {
  const deadline = Date.now() + 2000;
  let body = await revisionOf(pageUrl, index);
  while (!ready(body)) {
    if (Date.now() > deadline) {
      throw new Error(`revision stayed ${JSON.stringify(body)}`);
    }
    await Bun.sleep(20);
    body = await revisionOf(pageUrl, index);
  }
  return body;
}

for (const mode of ["source", "compiled"] as const) {
  test(`${mode} file watch refreshes revision without polling the disk`, async () => {
    const owned = new RuntimeFixture();
    let failed = true;
    try {
      const fileA = resolve(owned.dir, "drawing.svg");
      const fileB = resolve(owned.dir, "other.svg");
      const first = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#ff0000"/></svg>`,
      );
      const second = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#00ff00"/></svg>`,
      );
      const third = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#0000ff"/></svg>`,
      );
      writeFileSync(fileA, first);
      writeFileSync(fileB, first);
      const a = await openImage(owned, fileA, mode);
      const b = await openImage(owned, fileB, mode);
      expect(await revisionOf(a.url)).toEqual({
        ok: true,
        revision: 1,
        available: true,
      });
      expect(await revisionOf(b.url)).toEqual({
        ok: true,
        revision: 1,
        available: true,
      });
      const denied = new URL("/__quik/revision", a.url);
      denied.searchParams.set("token", "nope");
      expect((await fetch(denied)).status).toBe(404);

      const started = Date.now();
      for (let i = 0; i < 10; i++) {
        expect(await revisionOf(a.url)).toEqual({
          ok: true,
          revision: 1,
          available: true,
        });
      }
      expect(Date.now() - started).toBeLessThan(1000);

      writeFileSync(fileA, second);
      const edited = await waitRevision(a.url, (body) => body.revision > 1);
      const imageA = new URL("/image", a.url);
      imageA.search = a.url.search;
      const editedResponse = await fetch(imageA);
      expect(editedResponse.headers.get("cache-control")).toBe("no-store");
      expect(Buffer.from(await editedResponse.arrayBuffer())).toEqual(second);
      const versioned = new URL(imageA);
      versioned.searchParams.set("v", String(edited.revision));
      expect(Buffer.from(await (await fetch(versioned)).arrayBuffer())).toEqual(
        second,
      );
      const head = await fetch(imageA, { method: "HEAD" });
      expect(head.headers.get("cache-control")).toBe("no-store");
      expect(Buffer.from(await head.arrayBuffer())).toEqual(Buffer.alloc(0));

      writeFileSync(resolve(owned.dir, "sibling.svg"), first);
      await Bun.sleep(400);
      expect((await revisionOf(a.url)).revision).toBe(edited.revision);

      const renamed = resolve(owned.dir, "next.svg");
      writeFileSync(renamed, third);
      renameSync(renamed, fileA);
      const replaced = await waitRevision(
        a.url,
        (body) => body.revision > edited.revision && body.available,
      );
      expect(Buffer.from(await (await fetch(imageA)).arrayBuffer())).toEqual(
        third,
      );

      writeFileSync(fileA, second);
      await waitRevision(a.url, (body) => body.revision > replaced.revision);
      expect(await revisionOf(b.url)).toEqual({
        ok: true,
        revision: 1,
        available: true,
      });

      unlinkSync(fileA);
      const missing = await waitRevision(a.url, (body) => !body.available);
      expect(missing.status).toBe("missing");
      expect((await fetch(imageA)).status).toBe(404);
      writeFileSync(fileA, first);
      await waitRevision(a.url, (body) => body.available);
      expect(Buffer.from(await (await fetch(imageA)).arrayBuffer())).toEqual(
        first,
      );
      writeFileSync(fileA, Buffer.alloc(IMAGE_MAX_BYTES + 1));
      const huge = await waitRevision(
        a.url,
        (body) => body.status === "too-large",
      );
      expect(huge.available).toBe(false);

      // One process, two images: a change to image 1 bumps only revisions[1].
      const pairA = resolve(owned.dir, "pair-a.svg");
      const pairB = resolve(owned.dir, "pair-b.svg");
      writeFileSync(pairA, first);
      writeFileSync(pairB, first);
      const pair = await openImage(owned, [pairA, pairB], mode);
      const meta = new URL("/__quik/meta", pair.url);
      meta.search = pair.url.search;
      expect(await (await fetch(meta)).json()).toEqual({
        ok: true,
        images: [{ name: "pair-a.svg" }, { name: "pair-b.svg" }],
      });
      expect(await revisionsOf(pair.url)).toEqual({
        ok: true,
        revisions: [
          { revision: 1, available: true },
          { revision: 1, available: true },
        ],
        nav: 0,
      });
      writeFileSync(pairB, second);
      await waitRevision(pair.url, (body) => body.revision > 1, 1);
      await Bun.sleep(200);
      expect((await revisionOf(pair.url, 0)).revision).toBe(1);
      const pairImage = new URL("/image", pair.url);
      pairImage.search = pair.url.search;
      pairImage.searchParams.set("i", "1");
      expect(Buffer.from(await (await fetch(pairImage)).arrayBuffer())).toEqual(
        second,
      );
      pairImage.searchParams.set("i", "0");
      expect(Buffer.from(await (await fetch(pairImage)).arrayBuffer())).toEqual(
        first,
      );
      await pair.child.stdin.write(new Uint8Array([27]));
      await pair.child.stdin.flush();
      await until(() => pair.child.exitCode !== null, "pair watch exit");
      expect(await pair.child.exited).toBe(0);

      await a.child.stdin.write(new Uint8Array([27]));
      await a.child.stdin.flush();
      await until(() => a.child.exitCode !== null, "watch process exit");
      expect(await a.child.exited).toBe(0);
      expect((await revisionOf(b.url)).revision).toBe(1);
      await b.child.stdin.write(new Uint8Array([27]));
      await b.child.stdin.flush();
      await until(() => b.child.exitCode !== null, "second watch exit");
      expect(await b.child.exited).toBe(0);
      failed = false;
    } finally {
      await owned.close(failed);
    }
  }, 60000);
}

// Read pixels from an image-only screenshot: SpaceRain cannot satisfy these assertions.
async function renderedPixels(
  page: Page,
  path?: string,
): Promise<{ pixels: number[]; width: number }> {
  const png = await page
    .getByTestId("quik-image")
    .screenshot(path ? { path } : {});
  return await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Missing canvas context");
    context.drawImage(image, 0, 0);
    return {
      width: canvas.width,
      pixels: Array.from(
        context.getImageData(0, 0, canvas.width, canvas.height).data,
      ),
    };
  }, png.toString("base64"));
}

function centerPixel(
  pixels: number[],
  width: number,
): [number, number, number] {
  const height = pixels.length / 4 / width;
  const x = Math.floor(width / 2);
  const y = Math.floor(height / 2);
  const offset = (y * width + x) * 4;
  const red = pixels[offset];
  const green = pixels[offset + 1];
  const blue = pixels[offset + 2];
  if (red === undefined || green === undefined || blue === undefined) {
    throw new Error("center pixel is outside the screenshot");
  }
  return [red, green, blue];
}

test("browser compiled images decode, orient, animate, expose alpha and report corruption", async () => {
  const owned = new RuntimeFixture();
  let failed = true;
  const evidence = resolve(
    root,
    "../../../../dist/quikopen/image-formats/exp1",
  );
  mkdirSync(evidence, { recursive: true });
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage({
      viewport: { width: 1000, height: 800 },
      deviceScaleFactor: 1,
    });
    writeFileSync(resolve(evidence, "browser-version.txt"), browser.version());
    for (const item of images) {
      const { child, url } = await openImage(
        owned,
        resolve(root, "fixtures", item.name),
        "compiled",
      );
      await page.goto(url.href);
      await browserExpect(page).toHaveTitle("QuikOpen — Image Viewer");
      const image = page.getByTestId("quik-image");
      await browserExpect(image).toBeVisible();
      await browserExpect
        .poll(
          async () =>
            await image.evaluate((node) => {
              const img = node as HTMLImageElement;
              return [img.complete, img.naturalWidth, img.naturalHeight];
            }),
        )
        .toEqual([true, item.width, item.height]);
      await browserExpect(page.getByTestId("quik-image-error")).toHaveCount(0);
      if (item.name.startsWith("animated")) {
        const seen = new Set<string>();
        await browserExpect
          .poll(
            async () => {
              const { pixels, width } = await renderedPixels(page);
              const offset = (8 * width + 8) * 4;
              const rgb = pixels.slice(offset, offset + 3);
              if ((rgb[0] ?? 0) > 200 && (rgb[2] ?? 0) < 30) seen.add("red");
              if ((rgb[2] ?? 0) > 200 && (rgb[0] ?? 0) < 30) seen.add("blue");
              return seen.size;
            },
            { timeout: 5000, intervals: [80, 100, 130] },
          )
          .toBe(2);
        writeFileSync(
          resolve(evidence, `${item.name}-frames.json`),
          JSON.stringify([...seen]),
        );
      } else if (item.name.startsWith("transparent")) {
        for (const bg of ["dark", "bright", "checkered"]) {
          await page.getByTestId(`quik-bg-${bg}`).click();
          const { pixels, width } = await renderedPixels(
            page,
            resolve(evidence, `${item.name}-${bg}.png`),
          );
          const at = (x: number, y: number): number[] =>
            pixels.slice((y * width + x) * 4, (y * width + x) * 4 + 3);
          expect(at(4, 4)).toEqual([255, 0, 0]);
          if (bg === "dark") expect(at(24, 4)).toEqual([17, 18, 25]);
          if (bg === "bright") expect(at(24, 4)).toEqual([192, 202, 245]);
          if (bg === "checkered") expect(at(20, 4)).not.toEqual(at(28, 4));
        }
      } else if (item.name === "oriented.jpg") {
        const { pixels, width } = await renderedPixels(
          page,
          resolve(evidence, "oriented.png"),
        );
        const top = pixels.slice((8 * width + 8) * 4, (8 * width + 8) * 4 + 3);
        const bottom = pixels.slice(
          (24 * width + 12) * 4,
          (24 * width + 12) * 4 + 3,
        );
        expect(top[0]).toBeGreaterThan(200);
        expect(bottom.every((v) => v < 30)).toBe(true);
      } else if (item.width >= 2000 || item.height >= 2000) {
        const stageSizes = async (): Promise<{
          width: number;
          height: number;
          scrollWidth: number;
          scrollHeight: number;
          pageHeight: number;
          viewport: number;
        }> =>
          page.getByTestId("quik-stage").evaluate((el) => ({
            width: el.clientWidth,
            height: el.clientHeight,
            scrollWidth: el.scrollWidth,
            scrollHeight: el.scrollHeight,
            pageHeight: document.documentElement.scrollHeight,
            viewport: innerHeight,
          }));
        // Fit (default): the whole image fits the stage; nothing scrolls.
        await browserExpect(page.getByTestId("quik-zoom-percent")).toHaveText(
          "Fit",
        );
        const fitted = await stageSizes();
        expect(fitted.scrollWidth).toBe(fitted.width);
        expect(fitted.scrollHeight).toBe(fitted.height);
        expect(fitted.pageHeight).toBe(fitted.viewport);
        const box = await image.boundingBox();
        const stageBox = await page.getByTestId("quik-stage").boundingBox();
        if (box === null || stageBox === null) throw new Error("no box");
        expect(box.width).toBeLessThanOrEqual(stageBox.width);
        expect(box.height).toBeLessThanOrEqual(stageBox.height);
        await page.screenshot({
          path: resolve(evidence, `${item.name}-fit.png`),
        });
        // 100%: natural size scrolls inside the stage, not the page.
        await page.getByRole("button", { name: "Zoom in" }).click();
        await page.getByRole("button", { name: "Zoom out" }).click();
        await browserExpect(page.getByTestId("quik-zoom-percent")).toHaveText(
          "100%",
        );
        await browserExpect
          .poll(async () =>
            image.evaluate((node) => (node as HTMLImageElement).clientWidth),
          )
          .toBe(item.width);
        const sizes = await stageSizes();
        if (item.width >= 2000)
          expect(sizes.scrollWidth).toBeGreaterThan(sizes.width);
        if (item.height >= 2000)
          expect(sizes.scrollHeight).toBeGreaterThan(sizes.height);
        expect(sizes.pageHeight).toBe(sizes.viewport);
        await page.screenshot({
          path: resolve(evidence, `${item.name}-viewer.png`),
        });
      }
      await page.getByTestId("quik-exit").click();
      await until(() => child.exitCode !== null, "browser UI exit");
      expect(await child.exited).toBe(0);
    }
    for (const name of [
      "sample.jpg",
      "transparent.png",
      "animated.gif",
      "opaque.webp",
      "sample.svg",
    ]) {
      const file = resolve(owned.dir, `corrupt-${name}`);
      writeFileSync(
        file,
        readFileSync(resolve(root, "fixtures", name)).subarray(0, 8),
      );
      const { child, url } = await openImage(owned, file, "compiled");
      await page.goto(url.href);
      await browserExpect(page.getByTestId("quik-image-error")).toContainText(
        `Could not display corrupt-${name}`,
      );
      await page.getByTestId("quik-exit").click();
      await until(() => child.exitCode !== null, "corrupt UI exit");
      expect(await child.exited).toBe(0);
    }
    failed = false;
  } finally {
    try {
      await browser?.close();
    } finally {
      await owned.close(failed);
    }
  }
}, 120000);

test("browser compiled image refreshes when the file changes", async () => {
  const owned = new RuntimeFixture();
  let failed = true;
  const evidence = resolve(root, "../../../../dist/quikopen/file-refresh/exp1");
  mkdirSync(evidence, { recursive: true });
  let browser: Browser | undefined;
  const red = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#ff0000"/></svg>`;
  const blue = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#0000ff"/></svg>`;
  const green = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#00ff00"/></svg>`;
  try {
    const file = resolve(owned.dir, "live.svg");
    writeFileSync(file, red);
    const { child, url } = await openImage(owned, file, "compiled");
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage({
      viewport: { width: 1000, height: 800 },
      deviceScaleFactor: 1,
    });
    writeFileSync(resolve(evidence, "browser-version.txt"), browser.version());
    await page.goto(url.href);
    const image = page.getByTestId("quik-image");
    await browserExpect(image).toBeVisible();
    const stable = await image.getAttribute("src");
    expect(stable).not.toContain("v=");
    await page.waitForTimeout(500);
    expect(await image.getAttribute("src")).toBe(stable);
    await page.getByTestId("quik-bg-bright").click();
    await browserExpect(page.getByTestId("quik-stage")).toHaveAttribute(
      "data-bg",
      "bright",
    );
    const before = await renderedPixels(page, resolve(evidence, "before.png"));
    const beforeCenter = centerPixel(before.pixels, before.width);
    expect(beforeCenter[0]).toBeGreaterThan(200);
    expect(beforeCenter[2]).toBeLessThan(30);

    writeFileSync(file, blue);
    await browserExpect
      .poll(async () => await image.getAttribute("src"), { timeout: 5000 })
      .toContain("v=");
    await browserExpect
      .poll(
        async () => {
          const shot = await renderedPixels(
            page,
            resolve(evidence, "after.png"),
          );
          const [red, , blue] = centerPixel(shot.pixels, shot.width);
          return red < 30 && blue > 200;
        },
        { timeout: 5000 },
      )
      .toBe(true);
    await browserExpect(page.getByTestId("quik-stage")).toHaveAttribute(
      "data-bg",
      "bright",
    );

    unlinkSync(file);
    await browserExpect(page.getByTestId("quik-image-error")).toBeVisible();
    await browserExpect(page.getByTestId("quik-exit")).toBeVisible();
    writeFileSync(file, green);
    await browserExpect(image).toBeVisible();
    await browserExpect(page.getByTestId("quik-image-error")).toHaveCount(0);
    await page.getByTestId("quik-exit").click();
    await until(() => child.exitCode !== null, "refresh UI exit");
    expect(await child.exited).toBe(0);
    failed = false;
  } finally {
    try {
      await browser?.close();
    } finally {
      await owned.close(failed);
    }
  }
}, 60000);

test("browser compiled thumbnails refresh and fail per image", async () => {
  const owned = new RuntimeFixture();
  let failed = true;
  let browser: Browser | undefined;
  const svg = (fill: string): string =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="${fill}"/></svg>`;
  try {
    const files = ["first.svg", "second.svg"].map((name) =>
      resolve(owned.dir, name),
    );
    for (const file of files) writeFileSync(file, svg("#ff0000"));
    const { child, url } = await openImage(owned, files, "compiled");
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage({
      viewport: { width: 1000, height: 800 },
      deviceScaleFactor: 1,
    });
    await page.goto(url.href);
    const thumbImages = page.getByTestId("quik-thumb-image");
    await browserExpect(thumbImages).toHaveCount(2);
    await page.getByTestId("quik-thumb").nth(1).click();
    const stage = page.getByTestId("quik-image");
    await browserExpect(stage).toHaveAttribute("src", /i=1/);
    const firstSrc = await thumbImages.nth(0).getAttribute("src");

    const second = files[1] ?? "";
    writeFileSync(second, svg("#0000ff"));
    await browserExpect(thumbImages.nth(1)).toHaveAttribute("src", /v=/);
    await browserExpect(stage).toHaveAttribute("src", /i=1.*v=|v=.*i=1/);
    expect(await thumbImages.nth(1).getAttribute("src")).toBe(
      await stage.getAttribute("src"),
    );
    expect(await thumbImages.nth(0).getAttribute("src")).toBe(firstSrc);

    writeFileSync(second, "not an image");
    const thumbs = page.getByTestId("quik-thumb");
    await browserExpect(
      thumbs.nth(1).getByTestId("quik-thumb-error"),
    ).toHaveCount(1);
    await browserExpect(page.getByTestId("quik-image-error")).toBeVisible();
    await browserExpect(
      thumbs.nth(0).getByTestId("quik-thumb-error"),
    ).toHaveCount(0);
    await browserExpect(thumbs.nth(1)).toHaveAttribute("aria-current", "true");

    writeFileSync(second, svg("#00ff00"));
    await browserExpect(
      thumbs.nth(1).getByTestId("quik-thumb-image"),
    ).toHaveCount(1);
    await browserExpect(page.getByTestId("quik-image-error")).toHaveCount(0);
    await page.getByTestId("quik-exit").click();
    await until(() => child.exitCode !== null, "thumbnail refresh exit");
    expect(await child.exited).toBe(0);
    failed = false;
  } finally {
    try {
      await browser?.close();
    } finally {
      await owned.close(failed);
    }
  }
}, 60000);

test("browser compiled image zooms from the toolbar with Fit by default", async () => {
  const owned = new RuntimeFixture();
  let failed = true;
  const evidence = resolve(root, "../../../../dist/quikopen/zoom/exp1");
  mkdirSync(evidence, { recursive: true });
  let browser: Browser | undefined;
  try {
    const { child, url } = await openImage(
      owned,
      resolve(root, "fixtures/sample.svg"),
      "compiled",
    );
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage({
      viewport: { width: 1000, height: 800 },
      deviceScaleFactor: 1,
    });
    writeFileSync(resolve(evidence, "browser-version.txt"), browser.version());
    await page.goto(url.href);
    const image = page.getByTestId("quik-image");
    await browserExpect(image).toBeVisible();
    const natural = await image.evaluate(
      (node) => (node as HTMLImageElement).naturalWidth,
    );
    expect(natural).toBeGreaterThan(0);
    const painted = async (): Promise<number> =>
      image.evaluate((node) => (node as HTMLImageElement).clientWidth);
    const scaled = (percent: number): number =>
      Math.round((natural * percent) / 100);
    // Fit never enlarges: the 32px drawing stays at natural size.
    await browserExpect.poll(painted).toBe(natural);
    await page.getByTestId("quik-bg-bright").click();
    const before = await renderedPixels(page, resolve(evidence, "fit.png"));

    // One toolbar row: logo, filename, swatches, zoom and Exit share a centre.
    const toolbar = page.getByTestId("quik-toolbar");
    for (const id of [
      "quik-logo",
      "quik-filename",
      "quik-bg",
      "quik-zoom",
      "quik-exit",
    ]) {
      await browserExpect(toolbar.getByTestId(id)).toBeVisible();
    }
    await browserExpect(page.getByTestId("quik-filename")).toHaveText(
      "sample.svg",
    );
    const centres = await toolbar.evaluate((bar) =>
      Array.from(bar.children).map((node) => {
        const rect = node.getBoundingClientRect();
        return rect.top + rect.height / 2;
      }),
    );
    for (const centre of centres) {
      expect(Math.abs(centre - (centres[0] ?? 0))).toBeLessThanOrEqual(4);
    }

    const zoomIn = page.getByRole("button", { name: "Zoom in" });
    const zoomOut = page.getByRole("button", { name: "Zoom out" });
    const fit = page.getByTestId("quik-zoom-fit");
    const percent = page.getByTestId("quik-zoom-percent");
    await browserExpect(percent).toHaveText("Fit");
    await browserExpect(fit).toHaveAttribute("aria-pressed", "true");
    const percentWidth = async (): Promise<number> =>
      percent.evaluate((node) => node.getBoundingClientRect().width);
    const widthAtFit = await percentWidth();
    await zoomOut.click();
    await browserExpect(percent).toHaveText("75%");
    await browserExpect(fit).toHaveAttribute("aria-pressed", "false");
    await browserExpect.poll(painted).toBe(scaled(75));
    await zoomIn.click();
    await browserExpect(percent).toHaveText("100%");
    await browserExpect.poll(painted).toBe(scaled(100));
    const widthAt100 = await percentWidth();
    await zoomIn.click();
    await browserExpect.poll(painted).toBe(scaled(125));
    await browserExpect(page.getByTestId("quik-zoom")).toContainText("125%");
    await zoomIn.click();
    await browserExpect.poll(painted).toBe(scaled(150));
    await zoomOut.click();
    await browserExpect.poll(painted).toBe(scaled(125));

    for (let step = 0; step < 4; step += 1) await zoomOut.click();
    await browserExpect(zoomOut).toBeDisabled();
    await browserExpect(percent).toHaveText("25%");
    const widthAt25 = await percentWidth();
    expect(await painted()).toBe(scaled(25));
    for (let step = 0; step < 15; step += 1) await zoomIn.click();
    await browserExpect(zoomIn).toBeDisabled();
    await browserExpect(percent).toHaveText("400%");
    const widthAt400 = await percentWidth();
    expect(widthAt25).toBe(widthAt100);
    expect(widthAt400).toBe(widthAt100);
    expect(widthAtFit).toBe(widthAt100);
    expect(await painted()).toBe(scaled(400));
    await browserExpect(page.getByTestId("quik-stage")).toHaveAttribute(
      "data-bg",
      "bright",
    );
    const after = await renderedPixels(page, resolve(evidence, "400.png"));
    const beforeCenter = centerPixel(before.pixels, before.width);
    const afterCenter = centerPixel(after.pixels, after.width);
    expect(afterCenter[0]).toBeGreaterThan(200);
    expect(afterCenter[0]).toBe(beforeCenter[0]);
    await fit.click();
    await browserExpect(percent).toHaveText("Fit");
    await browserExpect.poll(painted).toBe(natural);
    await page.getByTestId("quik-exit").click();
    await until(() => child.exitCode !== null, "zoom UI exit");
    expect(await child.exited).toBe(0);
    failed = false;
  } finally {
    try {
      await browser?.close();
    } finally {
      await owned.close(failed);
    }
  }
}, 60000);

const nineFixtures = [
  "sample.svg",
  "sample.jpg",
  "transparent.png",
  "animated.gif",
  "opaque.webp",
  "wide.png",
  "tall.png",
  "huge.png",
  "a-very-long-quikopen-filename-that-needs-the-full-card-row.svg",
];

/** Page geometry every layout must hold: no page scroll, one toolbar row. */
async function assertLayout(page: Page): Promise<void> {
  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const bar = document.querySelector("[data-testid=quik-toolbar]");
    const centres = bar
      ? Array.from(bar.children).map((node) => {
          const rect = node.getBoundingClientRect();
          return { centre: rect.top + rect.height / 2, right: rect.right };
        })
      : [];
    return {
      scrollHeight: root.scrollHeight,
      scrollWidth: root.scrollWidth,
      width: innerWidth,
      height: innerHeight,
      centres,
    };
  });
  expect(layout.scrollHeight).toBe(layout.height);
  expect(layout.scrollWidth).toBe(layout.width);
  expect(layout.centres.length).toBeGreaterThan(3);
  const first = layout.centres[0]?.centre ?? 0;
  for (const child of layout.centres) {
    expect(Math.abs(child.centre - first)).toBeLessThanOrEqual(4);
    expect(child.right).toBeLessThanOrEqual(layout.width);
  }
}

/** Grid cells: equal sizes, inside the grid, captions ellipsised not spilled. */
async function gridGeometry(
  page: Page,
): Promise<{ cols: number; rows: number; captions: string[] }> {
  const grid = await page.getByTestId("quik-grid").evaluate((el) => {
    const outer = el.getBoundingClientRect();
    const cells = Array.from(
      el.querySelectorAll("[data-testid=quik-cell]"),
    ).map((cell) => {
      const rect = cell.getBoundingClientRect();
      const caption = cell.querySelector(
        "[data-testid=quik-caption]",
      ) as HTMLElement;
      const style = getComputedStyle(caption);
      return {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: rect.width,
        height: rect.height,
        inside:
          rect.left >= outer.left - 0.5 &&
          rect.top >= outer.top - 0.5 &&
          rect.right <= outer.right + 0.5 &&
          rect.bottom <= outer.bottom + 0.5,
        caption: caption.textContent,
        captionFits:
          caption.getBoundingClientRect().right <= rect.right + 0.5 &&
          (caption.scrollWidth <= caption.clientWidth ||
            style.textOverflow === "ellipsis"),
      };
    });
    return cells;
  });
  const first = grid[0];
  if (!first) throw new Error("grid has no cells");
  for (const cell of grid) {
    expect(Math.abs(cell.width - first.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(cell.height - first.height)).toBeLessThanOrEqual(1);
    expect(cell.inside).toBe(true);
    expect(cell.captionFits).toBe(true);
  }
  return {
    cols: new Set(grid.map((cell) => cell.x)).size,
    rows: new Set(grid.map((cell) => cell.y)).size,
    captions: grid.map((cell) => cell.caption),
  };
}

/**
 * Thumbnails view: sidebar beside the stage, equal tiles in one column,
 * previews inside their tiles, captions inside their buttons.
 */
async function assertThumbs(page: Page, names: string[]): Promise<void> {
  const thumbs = page.getByTestId("quik-thumb");
  await browserExpect(thumbs).toHaveCount(names.length);
  await browserExpect
    .poll(async () =>
      page
        .getByTestId("quik-thumb-image")
        .evaluateAll((nodes) =>
          nodes.every(
            (node) =>
              (node as HTMLImageElement).complete &&
              (node as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  const geometry = await page.evaluate(() => {
    const box = (el: Element | null): DOMRect => {
      if (!el) throw new Error("missing element");
      return el.getBoundingClientRect();
    };
    const mainEl = document.querySelector(".quik-main");
    if (!mainEl) throw new Error("missing main");
    const main = box(mainEl);
    const style = getComputedStyle(mainEl);
    const side = box(document.querySelector("[data-testid=quik-thumbs]"));
    const stage = box(document.querySelector("[data-testid=quik-stage]"));
    const buttons = Array.from(
      document.querySelectorAll("[data-testid=quik-thumb]"),
    );
    return {
      inner: {
        left: main.left + parseFloat(style.paddingLeft),
        right: main.right - parseFloat(style.paddingRight),
      },
      side: { left: side.left, right: side.right },
      stage: { left: stage.left, right: stage.right },
      indexes: buttons.map((b) => Number((b as HTMLElement).dataset.index)),
      labels: buttons.map((b) => b.getAttribute("aria-label") ?? ""),
      tiles: buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        const tile = box(button.querySelector("[data-testid=quik-thumb-tile]"));
        const img = button.querySelector("img")?.getBoundingClientRect();
        const caption = button.querySelector(".quik-thumb-caption");
        const name = button.querySelector(
          "[data-testid=quik-thumb-name]",
        ) as HTMLElement;
        return {
          x: rect.left,
          width: tile.width,
          height: tile.height,
          imageInside:
            img !== undefined &&
            img.left >= tile.left - 0.5 &&
            img.right <= tile.right + 0.5 &&
            img.top >= tile.top - 0.5 &&
            img.bottom <= tile.bottom + 0.5,
          captionInside: box(caption).right <= rect.right + 0.5,
          nameFits:
            name.offsetWidth === 0 ||
            name.scrollWidth <= name.clientWidth ||
            getComputedStyle(name).textOverflow === "ellipsis",
        };
      }),
    };
  });
  // The sidebar comes first, the stage fills the rest, no overlap.
  expect(geometry.side.right).toBeLessThanOrEqual(geometry.stage.left);
  expect(Math.abs(geometry.stage.right - geometry.inner.right)).toBeLessThan(
    1.5,
  );
  expect(geometry.side.left).toBeGreaterThanOrEqual(geometry.inner.left - 1);
  expect(geometry.indexes).toEqual(names.map((_, i) => i));
  geometry.labels.forEach((label, i) => {
    expect(label).toContain(names[i] ?? "");
  });
  const first = geometry.tiles[0];
  if (!first) throw new Error("no thumbnails");
  for (const tile of geometry.tiles) {
    expect(Math.abs(tile.x - first.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(tile.width - first.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(tile.height - first.height)).toBeLessThanOrEqual(1);
    expect(tile.imageInside).toBe(true);
    expect(tile.captionInside).toBe(true);
    expect(tile.nameFits).toBe(true);
  }
}

/** The data-index of the one thumbnail marked aria-current. */
async function currentThumb(page: Page): Promise<number[]> {
  return page
    .locator("[data-testid=quik-thumb][aria-current=true]")
    .evaluateAll((nodes) =>
      nodes.map((node) => Number((node as HTMLElement).dataset.index)),
    );
}

test("browser compiled multi-image grid, single and thumbnail views", async () => {
  const owned = new RuntimeFixture();
  let failed = true;
  const evidence = resolve(root, "../../../../dist/quikopen/multi/exp1");
  mkdirSync(evidence, { recursive: true });
  const thumbsEvidence = resolve(root, "../../../../dist/quikopen/thumbs/exp1");
  mkdirSync(thumbsEvidence, { recursive: true });
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
    writeFileSync(resolve(evidence, "browser-version.txt"), browser.version());
    const one = await openImage(
      owned,
      resolve(root, "fixtures/sample.svg"),
      "compiled",
    );
    const two = await openImage(
      owned,
      ["sample.svg", "transparent.png"].map((name) =>
        resolve(root, "fixtures", name),
      ),
      "compiled",
    );
    const nine = await openImage(
      owned,
      nineFixtures.map((name) => resolve(root, "fixtures", name)),
      "compiled",
    );

    for (const [width, height] of [
      [1000, 800],
      [700, 500],
    ] as const) {
      const page = await browser.newPage({
        viewport: { width, height },
        deviceScaleFactor: 2,
      });

      // One image: no SpaceRain, no motion control, no toggle or switcher.
      await page.goto(one.url.href);
      await browserExpect(page.getByTestId("quik-image")).toBeVisible();
      await browserExpect(page.locator("[data-space-rain-canvas]")).toHaveCount(
        0,
      );
      await browserExpect(page.getByLabel("Motion mode")).toHaveCount(0);
      await browserExpect(page.getByTestId("quik-view")).toHaveCount(0);
      await browserExpect(page.getByTestId("quik-switcher")).toHaveCount(0);
      await browserExpect(page.getByTestId("quik-grid")).toHaveCount(0);
      await assertLayout(page);
      await page.screenshot({
        animations: "disabled",
        path: resolve(evidence, `one-${String(width)}.png`),
      });

      // Two images: Thumbnails by default, then Grid 2×1.
      await page.goto(two.url.href);
      const twoNames = ["sample.svg", "transparent.png"];
      await browserExpect(page.getByTestId("quik-view-thumbs")).toHaveAttribute(
        "data-state",
        "on",
      );
      expect(
        await page
          .getByTestId("quik-view")
          .locator("[data-testid^=quik-view-]")
          .evaluateAll((nodes) =>
            nodes.map((node) => (node as HTMLElement).dataset.testid),
          ),
      ).toEqual(["quik-view-thumbs", "quik-view-grid", "quik-view-single"]);
      await browserExpect(page.getByTestId("quik-switcher")).toHaveCount(0);
      await browserExpect(page.getByTestId("quik-grid")).toHaveCount(0);
      await assertThumbs(page, twoNames);
      expect(await currentThumb(page)).toEqual([0]);
      await assertLayout(page);
      await page.screenshot({
        animations: "disabled",
        path: resolve(thumbsEvidence, `thumbs2-${String(width)}.png`),
      });
      await page.getByTestId("quik-view-grid").click();
      await browserExpect(page.getByTestId("quik-cell")).toHaveCount(2);
      await browserExpect(page.getByTestId("quik-view-grid")).toHaveAttribute(
        "data-state",
        "on",
      );
      await browserExpect(page.getByTestId("quik-count")).toHaveText(
        "2 images",
      );
      const pair = await gridGeometry(page);
      expect([pair.cols, pair.rows]).toEqual([2, 1]);
      expect(pair.captions).toEqual(["sample.svg", "transparent.png"]);
      await assertLayout(page);
      await page.screenshot({
        animations: "disabled",
        path: resolve(evidence, `grid2-${String(width)}.png`),
      });

      // Nine images in Thumbnails: select by click and keys, wrap, scroll.
      await page.goto(nine.url.href);
      await assertThumbs(page, nineFixtures);
      await assertLayout(page);
      await page.screenshot({
        animations: "disabled",
        path: resolve(thumbsEvidence, `thumbs9-${String(width)}.png`),
      });
      const stageSrc = async (): Promise<string | null> =>
        page.getByTestId("quik-image").getAttribute("src");
      await page.getByTestId("quik-thumb").nth(2).click();
      await browserExpect.poll(stageSrc).toContain("i=2");
      expect(await currentThumb(page)).toEqual([2]);
      for (const [key, expected] of [
        ["ArrowDown", 3],
        ["ArrowUp", 2],
        ["ArrowRight", 3],
        ["ArrowLeft", 2],
      ] as const) {
        await page.keyboard.press(key);
        await browserExpect.poll(() => currentThumb(page)).toEqual([expected]);
      }
      await page.getByTestId("quik-thumb").nth(0).click();
      await page.keyboard.press("ArrowUp");
      await browserExpect.poll(() => currentThumb(page)).toEqual([8]);
      await browserExpect.poll(stageSrc).toContain("i=8");
      // The selected preview is fully visible inside the sidebar.
      const visible = await page.evaluate(() => {
        const list = document.querySelector("[data-testid=quik-thumbs]");
        const selected = document.querySelector(
          "[data-testid=quik-thumb][aria-current=true]",
        );
        if (!list || !selected) throw new Error("missing thumbnails");
        const side = list.getBoundingClientRect();
        const thumb = selected.getBoundingClientRect();
        return {
          inside:
            thumb.top >= side.top - 0.5 && thumb.bottom <= side.bottom + 0.5,
          overflows: list.scrollHeight > list.clientHeight,
        };
      });
      expect(visible.inside).toBe(true);
      if (height === 500) expect(visible.overflows).toBe(true);
      await page.keyboard.press("ArrowDown");
      await browserExpect.poll(() => currentThumb(page)).toEqual([0]);
      // Background reaches every tile; zoom reaches only the stage.
      await page.getByTestId("quik-bg-checkered").click();
      expect(
        await page
          .getByTestId("quik-thumb-tile")
          .evaluateAll((nodes) => nodes.map((node) => node.dataset.bg)),
      ).toEqual(Array.from({ length: 9 }, () => "checkered"));
      await page.getByTestId("quik-thumb").nth(7).click();
      await page.screenshot({
        animations: "disabled",
        path: resolve(thumbsEvidence, `thumbs9-checkered-${String(width)}.png`),
      });
      for (let i = 0; i < 4; i += 1) await page.getByLabel("Zoom in").click();
      await browserExpect(page.getByTestId("quik-zoom-percent")).toHaveText(
        "200%",
      );
      await assertThumbs(page, nineFixtures);
      const stageScrolls = await page
        .getByTestId("quik-stage")
        .evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(stageScrolls).toBe(true);
      await page.getByTestId("quik-zoom-fit").click();
      await page.getByTestId("quik-bg-dark").click();
      await page.getByTestId("quik-thumb").nth(0).click();
      await page.getByTestId("quik-view-grid").click();
      for (const [id, state] of [
        ["thumbs", "off"],
        ["grid", "on"],
        ["single", "off"],
      ] as const) {
        await browserExpect(
          page.getByTestId(`quik-view-${id}`),
        ).toHaveAttribute("data-state", state);
      }

      // Nine images: 3×3, every image decoded, captions match.
      const cells = page.getByTestId("quik-cell-image");
      await browserExpect(cells).toHaveCount(9);
      await browserExpect
        .poll(async () =>
          cells.evaluateAll((nodes) =>
            nodes.every((node) => (node as HTMLImageElement).naturalWidth > 0),
          ),
        )
        .toBe(true);
      const grid = await gridGeometry(page);
      expect([grid.cols, grid.rows]).toEqual([3, 3]);
      expect(grid.captions).toEqual(nineFixtures);
      await browserExpect(page.getByTestId("quik-grid")).toHaveAttribute(
        "data-cols",
        "3",
      );
      // Fit keeps even the 2000px images inside their cells.
      const contained = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll("[data-testid=quik-cell-frame]"),
        ).every((frame) => {
          const outer = frame.getBoundingClientRect();
          const img = frame.querySelector("img")?.getBoundingClientRect();
          return (
            img !== undefined &&
            img.left >= outer.left - 0.5 &&
            img.right <= outer.right + 0.5 &&
            img.top >= outer.top - 0.5 &&
            img.bottom <= outer.bottom + 0.5
          );
        }),
      );
      expect(contained).toBe(true);
      await assertLayout(page);
      await page.screenshot({
        animations: "disabled",
        path: resolve(evidence, `grid9-${String(width)}.png`),
      });

      // Single: switcher with the select box, previous/next, position.
      await page.getByTestId("quik-view-single").click();
      await browserExpect(page.getByTestId("quik-grid")).toHaveCount(0);
      await browserExpect(page.getByTestId("quik-view-single")).toHaveAttribute(
        "data-state",
        "on",
      );
      const select = page.getByTestId("quik-select");
      const position = page.getByTestId("quik-position");
      const shown = async (): Promise<string | null> =>
        page.getByTestId("quik-image").getAttribute("alt");
      await browserExpect(select).toHaveText(`1. ${nineFixtures[0] ?? ""}`);
      await browserExpect(position).toHaveText("1 / 9");
      await browserExpect.poll(shown).toBe(nineFixtures[0]);
      await select.click();
      const options = page.getByRole("option");
      await browserExpect(options).toHaveCount(9);
      expect(await options.allTextContents()).toEqual(
        nineFixtures.map((name, i) => `${String(i + 1)}. ${name}`),
      );
      await page.screenshot({
        animations: "disabled",
        path: resolve(evidence, `select-open-${String(width)}.png`),
      });
      await options.nth(2).click();
      await browserExpect(position).toHaveText("3 / 9");
      await browserExpect.poll(shown).toBe(nineFixtures[2]);
      await browserExpect(page.getByTestId("quik-image")).toBeVisible();
      await assertLayout(page);
      await page.screenshot({
        animations: "disabled",
        path: resolve(evidence, `single-${String(width)}.png`),
      });
      await page.getByTestId("quik-next").click();
      await browserExpect(position).toHaveText("4 / 9");
      await page.getByTestId("quik-prev").click();
      await page.getByTestId("quik-prev").click();
      await browserExpect(position).toHaveText("2 / 9");
      await page.getByTestId("quik-prev").click();
      await page.getByTestId("quik-prev").click();
      await browserExpect(position).toHaveText("9 / 9");
      await page.getByTestId("quik-next").click();
      await browserExpect(position).toHaveText("1 / 9");
      // Page arrow keys move when focus is outside the select.
      await page.getByTestId("quik-stage").click();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await browserExpect(position).toHaveText("3 / 9");
      await page.keyboard.press("ArrowLeft");
      await browserExpect(position).toHaveText("2 / 9");
      await browserExpect.poll(shown).toBe(nineFixtures[1]);
      await select.focus();
      await page.keyboard.press("ArrowRight");
      await browserExpect(position).toHaveText("2 / 9");
      await page.getByTestId("quik-bg-checkered").click();
      await browserExpect(page.getByTestId("quik-stage")).toHaveAttribute(
        "data-bg",
        "checkered",
      );

      // Back to Grid keeps the background for every cell.
      await page.getByTestId("quik-view-grid").click();
      await browserExpect(page.getByTestId("quik-cell")).toHaveCount(9);
      await browserExpect(page.getByTestId("quik-switcher")).toHaveCount(0);
      expect(
        await page
          .getByTestId("quik-cell-frame")
          .evaluateAll((nodes) => nodes.map((node) => node.dataset.bg)),
      ).toEqual(Array.from({ length: 9 }, () => "checkered"));
      await page.getByTestId("quik-bg-dark").click();
      // Double-clicking a cell opens it on its own.
      await page.getByTestId("quik-cell").nth(4).dblclick();
      await browserExpect(position).toHaveText("5 / 9");
      // Thumbnails keeps the selection made in other views.
      await page.getByTestId("quik-view-thumbs").click();
      await browserExpect(page.getByTestId("quik-switcher")).toHaveCount(0);
      expect(await currentThumb(page)).toEqual([4]);
      await page.getByTestId("quik-view-grid").click();
      await page.close();
    }

    for (const opened of [one, two, nine]) {
      await opened.child.stdin.write(new Uint8Array([27]));
      await opened.child.stdin.flush();
      await until(() => opened.child.exitCode !== null, "multi exit");
      expect(await opened.child.exited).toBe(0);
    }
    failed = false;
  } finally {
    try {
      await browser?.close();
    } finally {
      await owned.close(failed);
    }
  }
}, 120000);

test("browser compiled terminal arrow keys switch images without exiting", async () => {
  const owned = new RuntimeFixture();
  let failed = true;
  let browser: Browser | undefined;
  try {
    const { child, url } = await openImage(
      owned,
      nineFixtures.slice(0, 3).map((name) => resolve(root, "fixtures", name)),
      "compiled",
    );
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage({
      viewport: { width: 1000, height: 800 },
      deviceScaleFactor: 1,
    });
    await page.goto(url.href);
    // Thumbnails (the default) follows PTY arrows too.
    await browserExpect(page.getByTestId("quik-thumb")).toHaveCount(3);
    await child.stdin.write(new Uint8Array([27, 0x5b, 0x43]));
    await child.stdin.flush();
    await browserExpect.poll(() => currentThumb(page)).toEqual([1]);
    await child.stdin.write(new Uint8Array([27, 0x5b, 0x44]));
    await child.stdin.flush();
    await browserExpect.poll(() => currentThumb(page)).toEqual([0]);
    expect(child.exitCode).toBeNull();
    await page.getByTestId("quik-view-single").click();
    const position = page.getByTestId("quik-position");
    await browserExpect(position).toHaveText("1 / 3");
    // TermSurf may deliver arrows to the PTY as CSI and SS3 sequences.
    await child.stdin.write(new Uint8Array([27, 0x5b, 0x43]));
    await child.stdin.flush();
    await browserExpect(position).toHaveText("2 / 3");
    await child.stdin.write(new Uint8Array([27, 0x4f, 0x43]));
    await child.stdin.flush();
    await browserExpect(position).toHaveText("3 / 3");
    await child.stdin.write(new Uint8Array([27]));
    await child.stdin.flush();
    // Separate chunks inside the 30ms hold: a split Left, not an exit.
    await Bun.sleep(5);
    await child.stdin.write(new Uint8Array([0x5b, 0x44]));
    await child.stdin.flush();
    await browserExpect(position).toHaveText("2 / 3");
    await Bun.sleep(200);
    expect(child.exitCode).toBeNull();
    expect((await revisionsOf(url)).nav).toBe(1);
    await child.stdin.write(new Uint8Array([27]));
    await child.stdin.flush();
    await until(() => child.exitCode !== null, "arrow test exit");
    expect(await child.exited).toBe(0);
    failed = false;
  } finally {
    try {
      await browser?.close();
    } finally {
      await owned.close(failed);
    }
  }
}, 60000);

async function until(check: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 8000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${label}`);
    await Bun.sleep(10);
  }
}

function decode(input: Buffer | undefined): Record<number, string | number> {
  if (!input) throw new Error("Missing frame");
  const frame = input;
  expect(frame.readUInt32LE(0)).toBe(frame.length - 4);
  let i = 4;
  function varint(): number {
    let value = 0;
    let shift = 0;
    while (i < frame.length) {
      const b = frame[i++];
      if (b === undefined) throw new Error("Missing byte");
      value |= (b & 127) << shift;
      if (!(b & 128)) return value;
      shift += 7;
    }
    throw new Error("Truncated varint");
  }
  expect(varint()).toBe(154);
  const length = varint();
  expect(i + length).toBe(frame.length);
  const fields: Record<number, string | number> = {};
  while (i < frame.length) {
    const tag = varint();
    if ((tag & 7) === 2) {
      const len = varint();
      fields[tag >>> 3] = frame.subarray(i, i + len).toString("utf8");
      i += len;
    } else if ((tag & 7) === 0) fields[tag >>> 3] = varint();
    else throw new Error("Unexpected wire type");
  }
  return fields;
}

async function host(
  path: string,
  owner?: RuntimeFixture,
): Promise<{ server: net.Server; frames: Buffer[]; sockets: net.Socket[] }> {
  const frames: Buffer[] = [];
  const sockets: net.Socket[] = [];
  const server = net.createServer((socket) => {
    sockets.push(socket);
    owner?.sockets.push(socket);
    let received = Buffer.alloc(0);
    socket.on("data", (data) => {
      received = Buffer.concat([
        received,
        typeof data === "string" ? Buffer.from(data) : data,
      ]);
      while (
        received.length >= 4 &&
        received.length >= received.readUInt32LE(0) + 4
      ) {
        const end = received.readUInt32LE(0) + 4;
        frames.push(received.subarray(0, end));
        received = received.subarray(end);
      }
    });
  });
  owner?.servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(path, resolve);
  });
  return { server, frames, sockets };
}

function noQuikSocks(dir: string): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    expect(name).not.toContain(".sock");
    expect(name).not.toBe("quik.sock");
  }
}

test("actual socket initial and resized frames retain geometry and options", async () => {
  const owned = new RuntimeFixture();
  const dir = owned.dir;
  let failed = true;
  let client: TermSurfClient | undefined;
  try {
    const fixture = await host(`${dir}/host`, owned);
    const url = `http://127.0.0.1/${"é".repeat(64)}`;
    client = await TermSurfClient.connect(
      { socketPath: `${dir}/host`, paneId: "pane" },
      url,
      { col: 1, row: 2, width: 128, height: 24 },
      { browser: "/test/browser", profile: "test" },
    );
    client.resize({ col: 3, row: 4, width: 80, height: 40 });
    await until(() => fixture.frames.length === 2, "resize frames");
    expect(decode(fixture.frames[0])).toEqual({
      1: "pane",
      2: 1,
      3: 2,
      4: 128,
      5: 24,
      6: url,
      7: "test",
      8: 1,
      9: "/test/browser",
    });
    expect(decode(fixture.frames[1])).toEqual({
      1: "pane",
      2: 3,
      3: 4,
      4: 80,
      5: 40,
      6: url,
      7: "test",
      8: 1,
      9: "/test/browser",
    });
    failed = false;
  } finally {
    client?.close();
    await owned.close(failed);
  }
});

test("setup failure cleans sockets and escalates a SIGTERM-resistant owned child", async () => {
  const owned = new RuntimeFixture();
  const start = Date.now();
  let pid = 0;
  try {
    await host(`${owned.dir}/host`, owned);
    const child = owned.spawn(
      [
        process.execPath,
        "--no-env-file",
        "-e",
        'process.on("SIGTERM", () => {}); console.log("fixture-ready"); setInterval(() => {}, 1000);',
      ],
      { PATH: process.env.PATH ?? "/usr/bin:/bin" },
      root,
    );
    pid = child.pid;
    await until(
      () => owned.children[0]?.output.includes("fixture-ready") === true,
      "resistant child ready",
    );
    const failure = await host(`${owned.dir}/host`, owned).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
  } finally {
    await owned.close(true);
  }
  expect(owned.escalated).toBe(true);
  expect(Date.now() - start).toBeLessThan(5000);
  expect(existsSync(owned.dir)).toBe(false);
  expect(() => process.kill(pid, 0)).toThrow();
  const log = resolve(
    root,
    "../../../../dist/webbuf4-quik-failures",
    `${basename(owned.dir)}.log`,
  );
  expect(readFileSync(log, "utf8")).toContain("fixture-ready");
});

test("source CLI rejects a missing path without binding HTTP", async () => {
  const owned = new RuntimeFixture();
  let failed = true;
  try {
    const child = owned.spawn(
      [process.execPath, "--no-env-file", `${root}/cli.ts`],
      { PATH: process.env.PATH ?? "/usr/bin:/bin" },
      root,
    );
    await waitUntil(
      () => child.exitCode !== null || child.signalCode !== null,
      "invalid CLI exit",
      2000,
    );
    expect(await child.exited).toBe(1);
    const output = owned.children[0];
    if (!output) throw new Error("Missing owned child");
    await Promise.all(output.streams);
    expect(owned.children[0]?.output).toContain("missing image path");
    noQuikSocks(owned.dir);
    failed = false;
  } finally {
    await owned.close(failed);
  }
});

test("source CLI rejects an unsupported path without binding HTTP", async () => {
  const owned = new RuntimeFixture();
  let failed = true;
  try {
    const png = `${owned.dir}/nope.txt`;
    writeFileSync(png, "png");
    const child = owned.spawn(
      [process.execPath, "--no-env-file", `${root}/cli.ts`, png],
      { PATH: process.env.PATH ?? "/usr/bin:/bin" },
      root,
    );
    await waitUntil(
      () => child.exitCode !== null || child.signalCode !== null,
      "invalid CLI exit",
      2000,
    );
    expect(await child.exited).toBe(1);
    const output = owned.children[0];
    if (!output) throw new Error("Missing owned child");
    await Promise.all(output.streams);
    expect(owned.children[0]?.output).toContain("unsupported image type");
    noQuikSocks(owned.dir);
    failed = false;
  } finally {
    await owned.close(failed);
  }
});

for (const [label, files, message] of [
  [
    "an unsupported second path",
    (dir: string): string[] => {
      writeFileSync(`${dir}/nope.txt`, "png");
      return [fixtureSvg, `${dir}/nope.txt`];
    },
    "unsupported image type",
  ],
  [
    "ten paths",
    (): string[] => Array.from({ length: 10 }, () => fixtureSvg),
    "too many images (max 9)",
  ],
] as const) {
  test(`source CLI rejects ${label} before binding HTTP or contacting TermSurf`, async () => {
    const owned = new RuntimeFixture();
    let failed = true;
    try {
      const socket = `${owned.dir}/host-reject`;
      const fixture = await host(socket, owned);
      const child = owned.spawn(
        [
          process.execPath,
          "--no-env-file",
          `${root}/cli.ts`,
          ...files(owned.dir),
        ],
        {
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          QUIK_PKG_ROOT: root,
          TERMSURF_SOCKET: socket,
          TERMSURF_PANE_ID: "fixture",
        },
        root,
      );
      await waitUntil(
        () => child.exitCode !== null || child.signalCode !== null,
        "invalid CLI exit",
        2000,
      );
      expect(await child.exited).toBe(1);
      const output = owned.children[0];
      if (!output) throw new Error("Missing owned child");
      await Promise.all(output.streams);
      expect(output.output).toContain(message);
      expect(output.output).not.toContain("127.0.0.1");
      expect(fixture.frames).toHaveLength(0);
      expect(fixture.sockets).toHaveLength(0);
      noQuikSocks(owned.dir);
      failed = false;
    } finally {
      await owned.close(failed);
    }
  });
}

test("source CLI rejects --server", async () => {
  const owned = new RuntimeFixture();
  let failed = true;
  try {
    const child = owned.spawn(
      [
        process.execPath,
        "--no-env-file",
        `${root}/cli.ts`,
        "--server",
        fixtureSvg,
      ],
      { PATH: process.env.PATH ?? "/usr/bin:/bin" },
      root,
    );
    await waitUntil(
      () => child.exitCode !== null || child.signalCode !== null,
      "invalid CLI exit",
      2000,
    );
    expect(await child.exited).toBe(1);
    const output = owned.children[0];
    if (!output) throw new Error("Missing owned child");
    await Promise.all(output.streams);
    expect(owned.children[0]?.output).toContain("unknown option: --server");
    failed = false;
  } finally {
    await owned.close(failed);
  }
});

for (const mode of ["source", "compiled"] as const) {
  for (const exit of ["esc", "ctrl-c", "ui-x"] as const) {
    test(`${mode} one process HTTP and ${exit} shutdown`, async () => {
      const owned = new RuntimeFixture();
      const dir = owned.dir;
      let failed = true;
      try {
        const fixture = await host(`${dir}/host`, owned);
        const env = {
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          QUIK_PKG_ROOT: root,
          TERMSURF_SOCKET: `${dir}/host`,
          TERMSURF_PANE_ID: "fixture",
          QUIK_COLS: "80",
          QUIK_ROWS: "24",
          QUIK_VERBOSE: "1",
        };
        const cmd =
          mode === "source"
            ? [process.execPath, "--no-env-file", `${root}/cli.ts`]
            : [binary];
        const child = owned.spawn([...cmd, fixtureSvg], env, root);
        await until(
          () => fixture.frames.length === 1 || child.exitCode !== null,
          "overlay",
        );
        if (child.exitCode !== null) throw new Error(owned.children[0]?.output);
        const fields = decode(fixture.frames[0]);
        expect([
          fields[1],
          fields[2],
          fields[3],
          fields[4],
          fields[5],
          fields[7],
          fields[8],
          fields[9],
        ]).toEqual(["fixture", 0, 0, 80, 24, "default", 1, ""]);
        const url = new URL(String(fields[6]));
        expect(url.hostname).toBe("127.0.0.1");
        expect(url.pathname).toBe("/");
        expect(url.searchParams.get("token")).toBeTruthy();
        expect(url.searchParams.get("client")).toBeNull();
        expect(url.searchParams.get("name")).toBe("sample.svg");
        expect(String(fields[6])).not.toContain(fixtureSvg);
        const response = await fetch(url);
        expect(response.status).toBe(200);
        const html = await response.text();
        expect(html).toContain("<html");
        const asset = /(?:src|href)="([^"]+\.js)"/.exec(html);
        expect(asset).not.toBeNull();
        if (!asset?.[1]) throw new Error("Missing JS asset");
        const js = await fetch(new URL(asset[1], url));
        expect(js.status).toBe(200);
        expect((await js.text()).length).toBeGreaterThan(100);
        const svgUrl = new URL("/image", url);
        svgUrl.search = url.search;
        const svg = await fetch(svgUrl);
        expect(svg.status).toBe(200);
        expect(svg.headers.get("content-type")).toContain("image/svg+xml");
        expect(Buffer.from(await svg.arrayBuffer())).toEqual(fixtureBytes);
        const metaUrl = new URL("/__quik/meta", url);
        metaUrl.search = url.search;
        const meta = await fetch(metaUrl);
        expect(meta.status).toBe(200);
        expect(await meta.json()).toEqual({
          ok: true,
          images: [{ name: "sample.svg" }],
        });
        if (exit === "ui-x") {
          const result = await fetch(new URL("/__quik/exit", url), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              token: url.searchParams.get("token"),
            }),
          });
          expect(result.status).toBe(200);
        } else {
          await child.stdin.write(new Uint8Array([exit === "esc" ? 27 : 3]));
          await child.stdin.flush();
        }
        await until(() => child.exitCode !== null, "process exit");
        expect(await child.exited).toBe(0);
        expect(owned.children[0]?.output).toContain(
          `exit: ${exit === "ctrl-c" ? "sigint" : exit}`,
        );
        const failure = await fetch(url).then(
          () => null,
          (error: unknown) => error,
        );
        expect(failure).toBeInstanceOf(Error);
        noQuikSocks(owned.dir);
        failed = false;
      } finally {
        await owned.close(failed);
      }
    }, 20000);
  }
}

test("two concurrent processes bind distinct ports and serve SVG and PNG", async () => {
  const owned = new RuntimeFixture();
  let failed = true;
  try {
    const otherSvg = `${owned.dir}/other.png`;
    writeFileSync(
      otherSvg,
      readFileSync(resolve(root, "fixtures/transparent.png")),
    );
    const hostA = await host(`${owned.dir}/host-a`, owned);
    const hostB = await host(`${owned.dir}/host-b`, owned);
    const baseEnv = {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      QUIK_PKG_ROOT: root,
      QUIK_COLS: "80",
      QUIK_ROWS: "24",
      QUIK_VERBOSE: "1",
    };
    const a = owned.spawn(
      [binary, fixtureSvg],
      {
        ...baseEnv,
        TERMSURF_SOCKET: `${owned.dir}/host-a`,
        TERMSURF_PANE_ID: "a",
      },
      root,
    );
    const b = owned.spawn(
      [binary, otherSvg],
      {
        ...baseEnv,
        TERMSURF_SOCKET: `${owned.dir}/host-b`,
        TERMSURF_PANE_ID: "b",
      },
      root,
    );
    await until(
      () =>
        (hostA.frames.length === 1 && hostB.frames.length === 1) ||
        a.exitCode !== null ||
        b.exitCode !== null,
      "both overlays",
    );
    if (a.exitCode !== null) throw new Error(owned.children[0]?.output);
    if (b.exitCode !== null) throw new Error(owned.children[1]?.output);
    const urlA = new URL(String(decode(hostA.frames[0])[6]));
    const urlB = new URL(String(decode(hostB.frames[0])[6]));
    expect(urlA.port).not.toBe(urlB.port);
    expect(
      (
        await fetch(
          Object.assign(new URL("/image", urlA), { search: urlB.search }),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await fetch(
          Object.assign(new URL("/image", urlB), { search: urlA.search }),
        )
      ).status,
    ).toBe(404);
    const svgA = await fetch(
      Object.assign(new URL("/image", urlA), { search: urlA.search }),
    );
    const svgB = await fetch(
      Object.assign(new URL("/image", urlB), { search: urlB.search }),
    );
    expect(svgA.status).toBe(200);
    expect(svgB.status).toBe(200);
    expect(Buffer.from(await svgA.arrayBuffer())).toEqual(fixtureBytes);
    expect(Buffer.from(await svgB.arrayBuffer())).not.toEqual(fixtureBytes);
    await a.stdin.write(new Uint8Array([27]));
    await a.stdin.flush();
    await until(() => a.exitCode !== null, "first process exit");
    expect(await a.exited).toBe(0);
    const stillB = await fetch(
      Object.assign(new URL("/image", urlB), { search: urlB.search }),
    );
    expect(stillB.status).toBe(200);
    const deadA = await fetch(urlA).then(
      () => null,
      (error: unknown) => error,
    );
    expect(deadA).toBeInstanceOf(Error);
    await b.stdin.write(new Uint8Array([27]));
    await b.stdin.flush();
    await until(() => b.exitCode !== null, "second process exit");
    expect(await b.exited).toBe(0);
    failed = false;
  } finally {
    await owned.close(failed);
  }
}, 20000);
