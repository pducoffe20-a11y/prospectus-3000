import eslint from "@eslint/js";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "docs/design/concepts/**",
    ],
  },
  eslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module" },
  },
];
