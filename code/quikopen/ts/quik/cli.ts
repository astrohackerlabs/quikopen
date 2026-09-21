/**
 * Unified quikopen entry (compiled to dist/quikopen).
 * One process per overlay: this process binds HTTP, serves the image, and
 * talks to TermSurf. No UDS, no --server role.
 *
 * Identity (--version / --help) is handled first so release gates never hang on TermSurf.
 */
import { tryHandleIdentity } from "./app/cli/product-identity.ts";
import { startProcess, waitForExit } from "./app/cli/process-runtime.ts";
import { parseClientArgs } from "./app/cli/parse-args.ts";
import { resolveImagePath } from "./app/cli/image-path.ts";

async function main(): Promise<void> {
  if (tryHandleIdentity(process.argv, process.env)) {
    process.exit(0);
  }

  const parsed = parseClientArgs(process.argv, import.meta.path);
  if (!parsed.ok) {
    console.error(parsed.error);
    process.exit(1);
  }

  const image = resolveImagePath(parsed.options.file);
  if (!image.ok) {
    console.error(image.error);
    process.exit(1);
  }

  try {
    const handles = await startProcess(
      process.env,
      {
        browser: parsed.options.browser,
        profile: parsed.options.profile,
      },
      { path: image.path, name: image.name },
    );
    const reason = await waitForExit(handles);
    if (process.env.QUIK_VERBOSE === "1") {
      console.error(`quikopen exit: ${reason}`);
    }
    process.exit(0);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(msg);
    process.exit(1);
  }
}

void main();
