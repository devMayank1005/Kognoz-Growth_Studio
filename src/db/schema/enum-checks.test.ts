import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as schema from "./index";

/**
 * The CHECK constraints in drizzle/0015 must agree with the schema.
 *
 * `text("col", { enum: [...] })` is a compile-time type and nothing more, so
 * 0015 spells the same values out in SQL. That duplication is the risk this file
 * removes: add a stage to `stages` in TypeScript without a migration and the
 * database silently rejects every card that uses it, at runtime, in production.
 *
 * Reads the migration off disk and the values off the live Drizzle column
 * objects, so neither side can be quietly edited. The same guarantee
 * scripts/check-compliance.mts gives §8 by importing the pattern it checks.
 */

const MIGRATION = "drizzle/0015_enum_check_constraints.sql";
const sql = readFileSync(join(process.cwd(), MIGRATION), "utf8");

/** table -> column -> values, as the migration actually declares them. */
function parseChecks(text: string): Map<string, Map<string, string[]>> {
  const out = new Map<string, Map<string, string[]>>();
  const stmt =
    /ALTER TABLE "([^"]+)" ADD CONSTRAINT "([^"]+)" CHECK \("([^"]+)" IN \(([^)]*)\)\);/g;
  for (const m of text.matchAll(stmt)) {
    const [, table, constraint, column, list] = m;
    // The name is load-bearing: it is what you DROP to reverse this.
    expect(constraint, `constraint name for ${table}.${column}`).toBe(`${table}_${column}_check`);
    const values = [...list.matchAll(/'((?:[^']|'')*)'/g)].map((v) => v[1].replace(/''/g, "'"));
    if (!out.has(table)) out.set(table, new Map());
    out.get(table)!.set(column, values);
  }
  return out;
}

/** Every enum-typed column Drizzle knows about, as table -> column -> values. */
function schemaEnumColumns(): Map<string, Map<string, string[]>> {
  const out = new Map<string, Map<string, string[]>>();
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const table = getTableName(value);
    for (const [, column] of Object.entries(getTableColumns(value))) {
      const values = (column as unknown as { enumValues?: string[] }).enumValues;
      if (!values || values.length === 0) continue;
      if (!out.has(table)) out.set(table, new Map());
      out.get(table)!.set(column.name, [...values]);
    }
  }
  return out;
}

const declared = parseChecks(sql);
const actual = schemaEnumColumns();

describe("enum CHECK constraints", () => {
  it("parses the migration at all", () => {
    // A rename or a reformat that breaks the parser must fail loudly here
    // rather than silently pass every assertion below.
    expect(declared.size).toBeGreaterThan(0);
    const total = [...declared.values()].reduce((n, cols) => n + cols.size, 0);
    expect(total).toBe(12);
  });

  it("covers every enum column in the schema", () => {
    const missing: string[] = [];
    for (const [table, columns] of actual) {
      for (const column of columns.keys()) {
        if (!declared.get(table)?.has(column)) missing.push(`${table}.${column}`);
      }
    }
    // A new `text(..., { enum })` column with no CHECK is the hole this closes.
    expect(missing).toEqual([]);
  });

  it("constrains nothing the schema does not declare as an enum", () => {
    const extra: string[] = [];
    for (const [table, columns] of declared) {
      for (const column of columns.keys()) {
        if (!actual.get(table)?.has(column)) extra.push(`${table}.${column}`);
      }
    }
    expect(extra).toEqual([]);
  });

  it("agrees with the schema on every value, in order", () => {
    for (const [table, columns] of declared) {
      for (const [column, values] of columns) {
        expect(values, `${table}.${column}`).toEqual(actual.get(table)?.get(column));
      }
    }
  });

  it("still allows the eight stages the pipeline moves through", () => {
    // Spot-check the one that corrupts revenue reporting when it is wrong.
    expect(declared.get("opportunities")?.get("stage")).toEqual([
      "Prospect", "Plan reach-out", "Reached out", "In conversation",
      "Meeting set", "Proposal", "Won", "Lost",
    ]);
  });
});
