import * as net from "node:net";
import {
  mkdtempSync,
  existsSync,
  unlinkSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { basename, resolve } from "node:path";

export async function waitUntil(
  check: () => boolean,
  label: string,
  milliseconds = 8000,
): Promise<void> {
  const deadline = Date.now() + milliseconds;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${label}`);
    await Bun.sleep(10);
  }
}

/** Test-only resource owner. Never operates on product default paths or unrelated PIDs. */
export class RuntimeFixture {
  readonly dir = mkdtempSync("/tmp/wb4-calc-");
  readonly children: {
    process: Bun.Subprocess<"pipe", "pipe", "pipe">;
    output: string;
    streams: Promise<void>[];
  }[] = [];
  readonly servers: net.Server[] = [];
  readonly sockets: net.Socket[] = [];
  escalated = false;

  spawn(
    cmd: string[],
    env: Record<string, string>,
    cwd: string,
  ): Bun.Subprocess<"pipe", "pipe", "pipe"> {
    const process = Bun.spawn(cmd, {
      env,
      cwd,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    const owned = { process, output: "", streams: [] as Promise<void>[] };
    this.children.push(owned);
    async function collect(stream: ReadableStream<Uint8Array>): Promise<void> {
      const decoder = new TextDecoder();
      for await (const bytes of stream)
        owned.output += decoder.decode(bytes, { stream: true });
      owned.output += decoder.decode();
    }
    owned.streams.push(collect(process.stdout), collect(process.stderr));
    return process;
  }

  async close(failed: boolean): Promise<void> {
    for (const child of this.children) {
      let exited = false;
      void child.process.exited.then(() => {
        exited = true;
      });
      if (
        child.process.exitCode === null &&
        child.process.signalCode === null
      ) {
        child.process.kill("SIGTERM");
        try {
          await waitUntil(() => exited, "SIGTERM", 250);
        } catch {
          this.escalated = true;
          child.process.kill("SIGKILL");
          await waitUntil(() => exited, "SIGKILL", 2000);
        }
      }
      await child.process.exited;
      await Promise.all(child.streams);
    }
    for (const socket of this.sockets) socket.destroy();
    for (const server of this.servers) {
      if (server.listening) {
        let done = false;
        server.close(() => {
          done = true;
        });
        await waitUntil(() => done, "host close", 2000);
      }
    }
    if (failed) {
      const logs = resolve(
        import.meta.dir,
        "../../../../../dist/webbuf4-quik-failures",
      );
      mkdirSync(logs, { recursive: true });
      writeFileSync(
        resolve(logs, `${basename(this.dir)}.log`),
        this.children
          .map((c) => `pid ${String(c.process.pid)}\n${c.output}`)
          .join("\n"),
      );
    }
    for (const name of ["control", "host"]) {
      const path = `${this.dir}/${name}`;
      if (existsSync(path)) unlinkSync(path);
    }
    rmSync(this.dir, { recursive: true, force: true });
  }
}
