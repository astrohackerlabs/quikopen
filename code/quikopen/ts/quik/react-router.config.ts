import type { Config } from "@react-router/dev/config";

/**
 * SPA mode: client build is self-contained under build/client.
 * Compiled `dist/quikopen` serves those files with pure Bun.file —
 * no dynamic import of react-router from the standalone binary.
 */
export default {
  ssr: false,
} satisfies Config;
