/**
 * Creates a real Better Auth session for local verification and E2E tests, and
 * prints the signed cookie.
 *
 * WHY THIS EXISTS: sign-in is Microsoft SSO only, so there is no password to
 * automate. Rather than putting a dev backdoor in application code, this tool
 * writes a genuine session row and signs the cookie exactly the way Better Auth
 * does (setSignedCookie => `${token}.${HMAC-SHA256(secret, token)}` in
 * base64urlnopad). The application has no bypass; only this script can mint one,
 * and only with the server secret in hand.
 *
 * Usage: node scripts/dev-session.mjs [role]
 */
import { createHmac, randomBytes, randomUUID } from "node:crypto";

import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });
config({ path: ".env" });

const role = process.argv[2] ?? "operator";
const secret = process.env.BETTER_AUTH_SECRET;
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!secret || !url) {
  console.error("BETTER_AUTH_SECRET and DATABASE_URL are required.");
  process.exit(1);
}

const c = new pg.Client({ connectionString: url });
await c.connect();

const { rows: orgs } = await c.query(`select id, name from organization order by created_at limit 1`);
if (!orgs.length) {
  console.error("No organization found. Run `pnpm db:seed` first.");
  process.exit(1);
}
const org = orgs[0];

const email = `dev.${role}@growth-studio.invalid`;
const { rows: users } = await c.query(
  `insert into "user" (id, name, email, email_verified, created_at, updated_at)
   values ($1, $2, $3, false, now(), now())
   on conflict (email) do update set name = excluded.name
   returning id, name`,
  [randomUUID(), `Dev ${role}`, email],
);
const user = users[0];

await c.query(
  `insert into member (id, organization_id, user_id, role, created_at)
   select $1, $2, $3, $4, now()
   where not exists (select 1 from member where organization_id = $2 and user_id = $3)`,
  [randomUUID(), org.id, user.id, role],
);

const token = randomBytes(32).toString("base64url");
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

await c.query(
  `insert into session (id, user_id, token, expires_at, created_at, updated_at, active_organization_id)
   values ($1, $2, $3, $4, now(), now(), $5)`,
  [randomUUID(), user.id, token, expiresAt, org.id],
);
await c.end();

// Matches better-call's signCookieValue exactly: HMAC-SHA256 over the token,
// encoded as STANDARD base64 (btoa, padded — not base64url), joined with a
// dot, then URI-encoded as a whole.
const signature = createHmac("sha256", secret).update(token).digest("base64");
const cookieValue = encodeURIComponent(`${token}.${signature}`);

console.log(JSON.stringify({
  cookieName: "better-auth.session_token",
  cookieValue,
  user: { id: user.id, name: user.name, email, role },
  org: { id: org.id, name: org.name },
  expiresAt: expiresAt.toISOString(),
}, null, 2));
