import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Environment variables must go through src/lib/env.ts.
//
// A trailing newline on MICROSOFT_TENANT_ID in Vercel put a control character
// into Microsoft's token endpoint URL, which their front end refused as an
// invalid URL — surfacing only as a sign-in redirect loop with no error
// anywhere. readEnv/requireEnv strip that; a raw read cannot. NODE_ENV is
// exempt: it is set by the toolchain, never pasted.
//
// Declared once and reused, because `no-restricted-syntax` is replaced wholesale
// by a later config block rather than merged — the domain block below has to
// carry this selector too or domain files would silently lose it.
const NO_RAW_PROCESS_ENV = {
  selector:
    'MemberExpression[object.object.name="process"][object.property.name="env"]:not([property.name="NODE_ENV"])',
  message:
    "Read environment variables through readEnv/requireEnv in src/lib/env.ts, not process.env directly.",
};

const NO_FETCH_IN_DOMAIN = {
  selector: 'CallExpression[callee.name="fetch"]',
  message:
    "src/domain is the pure layer — no I/O. Fetch in an adapter (src/lib, src/engine) and pass the result in.",
};

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
    files: ["src/**/*.ts", "src/**/*.tsx"],
    // Tests are exempt because they must set process.env to exercise the reader.
    ignores: ["src/lib/env.ts", "src/**/*.test.ts", "src/**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": ["error", NO_RAW_PROCESS_ENV],
    },
  },
  {
    // src/domain is pure: the scoring, routing, signal-decay, revenue and Zoho
    // mapping math, and the part that must stay under test. It decides what is
    // written into a client's live CRM, so it has to be testable without a
    // network, a database, or a running app.
    //
    // This was previously convention only — and src/lib/zoho/records.ts asserted
    // in a comment that a boundary like it was "enforced by eslint" when nothing
    // enforced anything. It is enforced now. Tests are included deliberately: a
    // domain test that needs a database is telling you the module is not pure.
    files: ["src/domain/**/*.ts", "src/domain/**/*.tsx"],
    rules: {
      "no-restricted-syntax": ["error", NO_RAW_PROCESS_ENV, NO_FETCH_IN_DOMAIN],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/db", "@/db/*",
                "@/lib", "@/lib/*",
                "@/engine", "@/engine/*",
                "@/app", "@/app/*",
                "**/db/*", "**/engine/*",
              ],
              message:
                "src/domain is the pure layer — no imports from db, lib, engine or app. Types that are database-shaped belong in an adapter (see src/lib/zoho/card.ts).",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
