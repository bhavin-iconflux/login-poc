import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";

const frontendFiles = ["frontend/**/*.{js,jsx}"];

export default [
  { ignores: ["**/dist", "**/node_modules"] },
  js.configs.recommended,
  { languageOptions: { globals: globals.node } },
  {
    files: frontendFiles,
    ...react.configs.flat.recommended,
    languageOptions: {
      ...react.configs.flat.recommended.languageOptions,
      globals: globals.browser,
    },
    settings: { react: { version: "detect" } },
  },
  { files: frontendFiles, ...react.configs.flat["jsx-runtime"] },
  { files: frontendFiles, rules: { "react/prop-types": "off" } },
];
