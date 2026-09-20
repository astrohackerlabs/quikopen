import { expect, test } from "bun:test";
import * as net from "node:net";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { Buffer } from "node:buffer";
import { TermSurfClient } from "../app/cli/termsurf-client.ts";
import { RuntimeFixture, waitUntil } from "./runtime-fixture.ts";

const root = resolve(import.meta.dir, "..");
const binary = resolve(root, "dist/quikopen");
const fixtureSvg = resolve(root, "fixtures/sample.svg");
if (!existsSync(binary))
  throw new Error("Build quikopen before integration tests");
if (!existsSync(fixtureSvg)) throw new Error("Missing fixtures/sample.svg");

const fixtureBytes = readFileSync(fixtureSvg);

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
    expect(owned.children[0]?.output).toContain("missing svg path");
    noQuikSocks(owned.dir);
    failed = false;
  } finally {
    await owned.close(failed);
  }
});

test("source CLI rejects a png path without binding HTTP", async () => {
  const owned = new RuntimeFixture();
  let failed = true;
  try {
    const png = `${owned.dir}/nope.png`;
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
    expect(owned.children[0]?.output).toContain("not an svg file");
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
        const svgUrl = new URL("/svg", url);
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

test("two concurrent processes bind distinct ports and serve distinct SVGs", async () => {
  const owned = new RuntimeFixture();
  let failed = true;
  try {
    const otherSvg = `${owned.dir}/other.svg`;
    writeFileSync(
      otherSvg,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#f7768e"/></svg>\n`,
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
    const svgA = await fetch(
      Object.assign(new URL("/svg", urlA), { search: urlA.search }),
    );
    const svgB = await fetch(
      Object.assign(new URL("/svg", urlB), { search: urlB.search }),
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
      Object.assign(new URL("/svg", urlB), { search: urlB.search }),
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
