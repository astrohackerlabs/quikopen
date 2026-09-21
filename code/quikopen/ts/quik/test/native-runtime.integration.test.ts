import { expect, test } from "bun:test";
import * as net from "node:net";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  mkdirSync,
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
  file: string,
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
    [...cmd, file],
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
        const sizes = await page.getByTestId("quik-stage").evaluate((el) => ({
          width: el.clientWidth,
          height: el.clientHeight,
          scrollWidth: el.scrollWidth,
          scrollHeight: el.scrollHeight,
          pageHeight: document.documentElement.scrollHeight,
          viewport: innerHeight,
        }));
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
        expect(await meta.json()).toEqual({ ok: true, name: "sample.svg" });
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
