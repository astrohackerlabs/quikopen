/**
 * Pure client CLI argv parse for quik.
 * Identity (--version/--help) is handled separately before this path.
 */

export interface ClientCliOptions {
  file: string;
  browser: string;
  profile: string;
}

export type ParseArgsResult =
  { ok: true; options: ClientCliOptions } | { ok: false; error: string };

const DEFAULT_BROWSER = "";
const DEFAULT_PROFILE = "default";

/**
 * Bun `build --compile` injects the virtual entry path into process.argv
 * (typically argv[1] as `/$bunfs/root/<outfile>`). Not a user argument.
 */
export function isBunCompileVirtualEntry(arg: string): boolean {
  return arg.startsWith("/$bunfs/") || arg.includes("$bunfs/");
}

/**
 * Parse process.argv-style args (includes argv0).
 * Supports: one positional SVG path, --browser / -b, --profile / -p.
 * Values may be `--flag=value` or `--flag value`.
 * Skips Bun compiled-binary virtual entry paths (`/$bunfs/…`).
 */
export function parseClientArgs(
  argv: string[],
  sourceEntry?: string,
): ParseArgsResult {
  let browser: string | undefined;
  let profile: string | undefined;
  let file: string | undefined;

  for (let i = 1; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (i === 1 && sourceEntry !== undefined && a === sourceEntry) continue;
    if (isBunCompileVirtualEntry(a)) {
      continue;
    }
    if (a === "--version" || a === "-V" || a === "--help" || a === "-h") {
      continue;
    }

    const eq = a.indexOf("=");
    if (eq > 0 && a.startsWith("-")) {
      const key = a.slice(0, eq);
      const val = a.slice(eq + 1);
      if (key === "--browser" || key === "-b") {
        if (!val) return { ok: false, error: "missing value for --browser" };
        browser = val;
        continue;
      }
      if (key === "--profile" || key === "-p") {
        if (!val) return { ok: false, error: "missing value for --profile" };
        profile = val;
        continue;
      }
    }

    if (a === "--browser" || a === "-b") {
      const val = argv[++i];
      // oxlint-disable-next-line eqeqeq -- nullish check; === null would miss undefined
      if (val == null || val.startsWith("-")) {
        return { ok: false, error: "missing value for --browser" };
      }
      browser = val;
      continue;
    }
    if (a === "--profile" || a === "-p") {
      const val = argv[++i];
      // oxlint-disable-next-line eqeqeq -- nullish check; === null would miss undefined
      if (val == null || val.startsWith("-")) {
        return { ok: false, error: "missing value for --profile" };
      }
      profile = val;
      continue;
    }

    if (a.startsWith("-")) {
      return { ok: false, error: `unknown option: ${a}` };
    }
    if (file !== undefined) {
      return { ok: false, error: `unexpected argument: ${a}` };
    }
    file = a;
  }

  if (!file) {
    return { ok: false, error: "missing svg path" };
  }

  return {
    ok: true,
    options: {
      file,
      browser: browser ?? DEFAULT_BROWSER,
      profile: profile ?? DEFAULT_PROFILE,
    },
  };
}

/** Overlay fields for SetOverlay (omit-path defaults). */
export function overlayFromOptions(options: ClientCliOptions): {
  browser: string;
  profile: string;
} {
  return {
    browser: options.browser,
    profile: options.profile,
  };
}
