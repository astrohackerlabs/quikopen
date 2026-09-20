/** Bun workspace Oxlint. */
import { defineConfig } from "oxlint";
import { strictTypeScriptRules } from "./oxlint-strict-rules.ts";

/** React Compiler rules: off (issue constraint). */
const reactCompilerOff = {
  "react/error-boundaries": "off",
  "react/globals": "off",
  "react/immutability": "off",
  "react/incompatible-library": "off",
  "react/preserve-manual-memoization": "off",
  "react/purity": "off",
  "react/refs": "off",
  "react/set-state-in-effect": "off",
  "react/set-state-in-render": "off",
  "react/static-components": "off",
  "react/use-memo": "off",
  "react/unsupported-syntax": "off",
  "react/void-use-memo": "off",
  "react/no-deriving-state-in-effects": "off",
  "react/invariant": "off",
  "react/rule-suppression": "off",
  "react/syntax": "off",
  "react/todo": "off",
  "react/capitalized-calls": "off",
  "react/exhaustive-effect-dependencies": "off",
  "react/hooks": "off",
  "react/memo-dependencies": "off",
} as const;

/** `eslint:recommended` + `typescript-eslint` recommended (not type-checked). */
const eslintTsRecommended = {
  "constructor-super": "error",
  "for-direction": "error",
  "getter-return": "error",
  "no-async-promise-executor": "error",
  "no-case-declarations": "error",
  "no-class-assign": "error",
  "no-compare-neg-zero": "error",
  "no-cond-assign": "error",
  "no-const-assign": "error",
  "no-constant-binary-expression": "error",
  "no-constant-condition": "error",
  "no-control-regex": "error",
  "no-debugger": "error",
  "no-delete-var": "error",
  "no-dupe-class-members": "error",
  "no-dupe-else-if": "error",
  "no-dupe-keys": "error",
  "no-duplicate-case": "error",
  "no-empty": "error",
  "no-empty-character-class": "error",
  "no-empty-pattern": "error",
  "no-empty-static-block": "error",
  "no-ex-assign": "error",
  "no-extra-boolean-cast": "error",
  "no-fallthrough": "error",
  "no-func-assign": "error",
  "no-global-assign": "error",
  "no-import-assign": "error",
  "no-invalid-regexp": "error",
  "no-irregular-whitespace":
    strictTypeScriptRules["eslint/no-irregular-whitespace"],
  "no-loss-of-precision": "error",
  "no-misleading-character-class": "error",
  "no-new-native-nonconstructor": "error",
  "no-nonoctal-decimal-escape": "error",
  "no-obj-calls": "error",
  "no-prototype-builtins": "error",
  "no-redeclare": "error",
  "no-regex-spaces": "error",
  "no-self-assign": "error",
  "no-setter-return": "error",
  "no-shadow-restricted-names": "error",
  "no-sparse-arrays": "error",
  "no-this-before-super": "error",
  "no-unassigned-vars": "error",
  "no-unexpected-multiline": "error",
  "no-unreachable": "error",
  "no-unsafe-finally": "error",
  "no-unsafe-negation": "error",
  "no-unsafe-optional-chaining": "error",
  "no-unused-labels": "error",
  "no-unused-private-class-members": "error",
  "no-useless-backreference": "error",
  "no-useless-catch": "error",
  "no-useless-escape": "error",
  "no-with": "error",
  "require-yield": "error",
  "use-isnan": "error",
  "valid-typeof": "error",
  "no-array-constructor": "error",
  "no-unused-expressions": "error",
  "typescript/ban-ts-comment": "error",
  "typescript/no-duplicate-enum-values": "error",
  "typescript/no-empty-object-type": "error",
  "typescript/no-explicit-any": "error",
  "typescript/no-extra-non-null-assertion": "error",
  "typescript/no-misused-new": "error",
  "typescript/no-namespace": "error",
  "typescript/no-non-null-asserted-optional-chain": "error",
  "typescript/no-require-imports": "error",
  "typescript/no-this-alias": "error",
  "typescript/no-unnecessary-type-constraint": "error",
  "typescript/no-unsafe-declaration-merging": "error",
  "typescript/no-unsafe-function-type": "error",
  "typescript/no-wrapper-object-types": "error",
  "typescript/prefer-as-const": "error",
  "typescript/prefer-namespace-keyword": "error",
  "typescript/triple-slash-reference": "error",
} as const;

const routeExportNames = [
  "meta",
  "links",
  "headers",
  "loader",
  "clientLoader",
  "action",
  "clientAction",
  "handle",
  "shouldRevalidate",
  "ErrorBoundary",
  "HydrateFallback",
  "buttonVariants",
  "badgeVariants",
  "middleware",
];

export default defineConfig({
  options: {
    typeAware: true,
    respectEslintDisableDirectives: false,
  },
  plugins: ["eslint", "typescript", "react", "import"],
  categories: {
    correctness: "off",
    suspicious: "off",
    restriction: "off",
    perf: "off",
    pedantic: "off",
    style: "off",
    nursery: "off",
  },
  env: {
    builtin: false,
    es2022: true,
    "shared-node-browser": true,
    browser: false,
    node: false,
  },
  ignorePatterns: [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/forks/**",
    "**/vendor/**",
    "**/.react-router/**",
    "**/routeTree.gen.ts",
    "**/src/rs-*/**",
    "**/public/**",
    "**/app/blog.json",
    // Frozen e2cab7e81 conversion oracle, not maintained implementation.
    "earthbucks/ts/ebxlib/test/script-num-legacy.ts",
    // tsc declaration output copied by ebxcom's build:trpc-types; still checked by tsc.
    "earthbucks/ts/ebxcomclient/src/trpc-router-types.ts",
  ],
  rules: {
    ...eslintTsRecommended,
    "react/rules-of-hooks": "error",
    "react/exhaustive-deps": "error",
    ...reactCompilerOff,
    "prefer-const": "error",
    "no-var": "error",
    eqeqeq: ["error", "always"],
    // An explicit object opts out of Oxlint's implicit underscore exemptions.
    "no-unused-vars": [
      "error",
      { caughtErrors: "all", reportVarsOnlyUsedAsTypes: true },
    ],
    "typescript/no-unused-vars": [
      "error",
      { caughtErrors: "all", reportVarsOnlyUsedAsTypes: true },
    ],
    "typescript/no-non-null-assertion": "error",
    "typescript/no-inferrable-types": "error",
    "no-useless-constructor": "error",
    "import/no-duplicates": "error",
    "typescript/explicit-function-return-type": "error",
    "react/only-export-components": [
      "error",
      {
        allowConstantExport: true,
        allowExportNames: routeExportNames,
      },
    ],
  },
  overrides: [
    {
      // TypeScript declarations own TS globals; lint checks untyped helpers.
      files: ["**/*.{js,mjs,cjs}"],
      rules: { "no-undef": "error" },
    },
    {
      // Browser app/UI source; server-only paths below override this scope.
      files: [
        "**/app/**/*.{ts,tsx,mts,js,mjs}",
        "astrohacker/ts/ui/src/**/*.{ts,tsx,mts,js,mjs}",
        "termsurf/ts/ahnexus/src/**/*.{ts,tsx,mts,js,mjs}",
        "compubutton/ts/compubutton/src/**/*.{ts,tsx,mts,js,mjs}",
      ],
      env: { browser: true },
    },
    {
      files: [
        "**/{test,tests,scripts,plugins,server,server-only,cli}/**/*.{ts,tsx,mts,cts,js,mjs,cjs}",
        "**/*.{test,spec,config}.{ts,tsx,mts,cts,js,mjs,cjs}",
        "**/*.server.{ts,tsx,js,mjs}",
        "**/{server,cli,dev}.{ts,js,mjs}",
        "**/build-*.{ts,js,mjs}",
        "**/rs/**/vectors/*.ts",
        "earthbucks/ts/ebxdb/src/**/*.ts",
        "**/*.{cts,cjs}",
      ],
      env: { browser: false, node: true },
    },
    {
      files: [
        "**/*.browser.{ts,tsx,mts,js,mjs}",
        "**/test/browser-*/browser.{ts,js,mjs}",
      ],
      env: { browser: true, node: false },
    },
    {
      files: ["**/*.worker.{ts,js,mjs}", "**/*-worker.client.{ts,js,mjs}"],
      env: { browser: false, node: false, worker: true },
    },
    {
      files: ["**/*.{ts,tsx,mts,cts}"],
      rules: strictTypeScriptRules,
    },
    // Human-approved framework/API exceptions, Issue 26091023458065 Exp 1.
    // Routes may throw Responses for redirects/404s, not arbitrary values.
    {
      files: ["**/app/routes/**/*.{ts,tsx}", "**/app/root.tsx"],
      rules: {
        "typescript/only-throw-error": [
          "error",
          {
            allow: [
              { from: "lib", name: "Response" },
              {
                from: "package",
                package: "react-router",
                name: "DataWithResponseInit",
              },
            ],
            allowThrowingAny: false,
            allowThrowingUnknown: false,
          },
        ],
      },
    },
    // Existing public class APIs; empty/constructor-only classes stay checked.
    {
      files: [
        "**/earthbucks/ts/bchlib/src/signature-checker.ts",
        "**/earthbucks/ts/bchlib/src/tx-sighash.ts",
      ],
      rules: {
        "typescript/no-extraneous-class": ["error", { allowStaticOnly: true }],
      },
    },
    // BCH aliases intentionally refer to canonical members of the same enum.
    // Literal replacements would conflict with no-duplicate-enum-values.
    {
      files: ["**/earthbucks/ts/bchlib/src/opcode.ts"],
      rules: { "typescript/prefer-literal-enum-member": "off" },
    },
    // Negative fixtures exercise callers violating the Error-only convention.
    {
      files: ["**/earthbucks/ts/bchlib/test/tx-encoding.test.ts"],
      rules: { "typescript/only-throw-error": "off" },
    },
    {
      files: ["**/compubutton/ts/compubutton/test/computation.test.ts"],
      rules: { "typescript/prefer-promise-reject-errors": "off" },
    },
  ],
});
