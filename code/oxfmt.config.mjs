/** Common formatting policy. UI packages add only Tailwind context. */
export default {
  sortPackageJson: false,
  sortImports: false,
  jsdoc: false,
  // Prettier did not format TOML; preserve the existing file scope.
  ignorePatterns: ["**/*.toml"],
  semi: true,
  singleQuote: false,
  tabWidth: 2,
  useTabs: false,
  trailingComma: "all",
  printWidth: 80,
  bracketSpacing: true,
  arrowParens: "always",
  endOfLine: "lf",
};
