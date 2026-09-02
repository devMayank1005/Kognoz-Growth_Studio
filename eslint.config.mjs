import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Reference material, not our source. docs/konverz-sales-copilot.jsx is
    // the prototype we port behaviour from — it is read, never built.
    "docs/**",
    ".vercel/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
