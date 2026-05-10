import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist/", "node_modules/", "coverage/", "jest.config.js"],
  },
  {
    rules: {
      // Honor the ecosystem-standard underscore-prefix convention for
      // intentionally-unused arguments and variables. Prefixing a name
      // with `_` (e.g. `_event`, `_els`) signals "this parameter must
      // exist for the function/callback signature but the body doesn't
      // use it." Standard pattern across React/Vue/Next/most projects.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
