import base from "../../../oxfmt.config.mjs";
export default {
  ...base,
  sortTailwindcss: {
    stylesheet: "./app/app.css",
    functions: ["cn", "cva"],
  },
};
