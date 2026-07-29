import eslint from "@eslint/js";
import jsonc from "eslint-plugin-jsonc";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "docs/design/concepts/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...jsonc.configs["flat/recommended-with-jsonc"],
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module" },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
);
