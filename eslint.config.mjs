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
  {
    // Environment variables must go through src/lib/env.ts.
    //
    // A trailing newline on MICROSOFT_TENANT_ID in Vercel put a control
    // character into Microsoft's token endpoint URL, which their front end
    // refused as an invalid URL — surfacing only as a sign-in redirect loop
    // with no error anywhere. readEnv/requireEnv strip that; a raw read cannot.
    // NODE_ENV is exempt: it is set by the toolchain, never pasted. Tests are
    // exempt because they must set process.env to exercise the reader itself.
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: ["src/lib/env.ts", "src/**/*.test.ts", "src/**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            'MemberExpression[object.object.name="process"][object.property.name="env"]:not([property.name="NODE_ENV"])',
          message:
            "Read environment variables through readEnv/requireEnv in src/lib/env.ts, not process.env directly.",
        },
      ],
    },
  },
]);

export default eslintConfig;
