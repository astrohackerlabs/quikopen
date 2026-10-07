/**
 * Unified quikopen entry (compiled to dist/quikopen).
 * One process per overlay: this process binds HTTP, serves the images, and
 * talks to TermSurf. No UDS, no --server role.
 *
 * Identity (--version / --help) is handled first so release gates never hang on TermSurf.
 */
import { tryHandleIdentity } from "./app/cli/product-identity.ts";
import {
  startProcess,
  waitForExit,
  type ImageFile,
} from "./app/cli/process-runtime.ts";
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

  // Validate every path before binding HTTP or contacting TermSurf.
  const images: ImageFile[] = [];
  for (const file of parsed.options.files) {
    const image = resolveImagePath(file);
    if (!image.ok) {
      console.error(image.error);
      process.exit(1);
    }
    images.push({ path: image.path, name: image.name });
  }

  try {
    const handles = await startProcess(
      process.env,
      {
        browser: parsed.options.browser,
        profile: parsed.options.profile,
      },
      images,
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
