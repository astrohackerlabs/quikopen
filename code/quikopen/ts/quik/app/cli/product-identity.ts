/**
 * Product CLI identity for release wrappers (Homebrew non-ahterm contract).
 * Keep pure and free of TermSurf so --version/--help never hang.
 */
import { QUIK_EMBEDDED_VERSION } from "./embedded-version.ts";

export const PRODUCT_NAME = "Quikopen";

export const HELP_FIRST_LINE =
  "Quikopen — open SVG files in Astrohacker TermSurf panes";

/**
 * Resolve stamped product version.
 * Priority:
 * 1. `ASTROHACKER_VERSION` process env (runtime override / `bun cli.ts`)
 * 2. `QUIK_EMBEDDED_VERSION` from app/cli/embedded-version.ts (written at compile)
 * 3. package fallback (usually `0.0.1`)
 */
export function resolveProductVersion(
  env: NodeJS.ProcessEnv = process.env,
  embeddedVersion: string | undefined = QUIK_EMBEDDED_VERSION,
  packageFallback = "0.0.1",
): string {
  const fromEnv = env.ASTROHACKER_VERSION?.trim();
  if (fromEnv) return fromEnv;
  const fromEmbed = embeddedVersion.trim();
  if (fromEmbed) return fromEmbed;
  return packageFallback;
}

/** First line of `--version` output. */
export function formatVersionLine(version: string): string {
  return `${PRODUCT_NAME} ${version}`;
}

export type IdentityKind = "version" | "help" | null;

/** Detect identity flags in argv (process.argv-style, includes argv0). */
export function detectIdentityFlag(argv: string[]): IdentityKind {
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--version" || a === "-V") return "version";
    if (a === "--help" || a === "-h") return "help";
  }
  return null;
}

export function versionOutput(version: string): string {
  return formatVersionLine(version) + "\n";
}

export function helpOutput(version: string): string {
  return (
    HELP_FIRST_LINE +
    "\n\n" +
    `Version: ${formatVersionLine(version)}\n` +
    "Usage:\n" +
    "  quikopen <svg-path>            Open an SVG in the current TermSurf pane\n" +
    "  quikopen --browser <engine>    Browser engine (chromium, webkit, …)\n" +
    "  quikopen --profile <name>      Browser profile name (default: default)\n" +
    "  quikopen -b <engine>           Short for --browser\n" +
    "  quikopen -p <name>             Short for --profile\n" +
    "  quikopen --version             Print version\n" +
    "  quikopen --help                Print this help\n"
  );
}

/**
 * If argv requests identity, write to stdout and return true (caller should exit 0).
 * Does not exit the process itself (testable).
 */
export function tryHandleIdentity(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  write: (s: string) => void = (s) => process.stdout.write(s),
): boolean {
  const kind = detectIdentityFlag(argv);
  if (!kind) return false;
  const version = resolveProductVersion(env);
  if (kind === "version") {
    write(versionOutput(version));
  } else {
    write(helpOutput(version));
  }
  return true;
}
