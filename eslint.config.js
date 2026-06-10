import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import { defineConfig } from "eslint/config";
import eslintConfig from "typescript-eslint";

export default defineConfig(
  { ignores: ["dist/**", "node_modules/**", "examples/**"] },
  js.configs.recommended,
  ...eslintConfig.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      // TS 6.x is newer than this typescript-eslint release officially targets;
      // the parser works fine, so silence the version banner.
      parserOptions: { warnOnUnsupportedTypeScriptVersion: false },
    },
    rules: {
      // TypeScript handles undefined-variable checks (and knows the Node globals).
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  prettier,
);
