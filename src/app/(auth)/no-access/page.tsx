import { Wordmark } from "@/components/studio/shell";
import { parseAllowedDomains } from "@/domain/access";
import { readEnv } from "@/lib/env";

/**
 * Reached only when someone authenticated against the Kognoz directory but
 * their address is not on the allowed domain list — in practice, a tenant
 * guest. Naming the expected domain tells them immediately whether they are
 * simply in the wrong account, which is the common case.
 */
export default function NoAccessPage() {
  const domains = parseAllowedDomains(readEnv("ALLOWED_EMAIL_DOMAINS"));
  const list = domains.length ? domains.map((d) => `@${d}`).join(" or ") : "an approved";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-sm">
        <Wordmark />
        <h1 className="mt-8 font-display text-lg tracking-tight text-body">
          That account can&rsquo;t open Growth Studio
        </h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          You signed in successfully, but Growth Studio is limited to {list} accounts. If you have
          one, sign out of Microsoft and come back with it.
        </p>
        <p className="mt-4 text-[13px] leading-relaxed text-muted">
          If that <em>is</em> your work account, ask an admin to check the access settings.
        </p>
        <p className="mt-6 border-t border-line pt-4 text-[11px] leading-relaxed text-faint">
          Guest accounts in the directory are excluded on purpose — the pipeline holds commercial
          information about named companies.
        </p>
      </div>
    </main>
  );
}
