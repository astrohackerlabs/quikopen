import base from "../../../prettier.config.mjs";
export default {
  ...base,
  plugins: ["prettier-plugin-tailwindcss"],
  tailwindStylesheet: "./app/app.css",
  tailwindFunctions: ["cn", "cva"],
};
