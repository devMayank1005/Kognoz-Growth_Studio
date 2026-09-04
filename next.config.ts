import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Next 16 keeps dynamic segments in the client router cache for 0s by
   * default, so every rail click refetched the whole RSC payload and the
   * operator watched the old page until the database answered — from India
   * that is ~280ms of Washington round trip on every navigation.
   *
   * 30s matches the rhythm of the data: pipeline and target rows change on
   * sweeps and mutations. Mutations must invalidate explicitly — the kanban and
   * inspector call router.refresh(), and the server actions call
   * revalidatePath. An earlier version of this comment claimed every mutation
   * already refreshed; addCard did not, and the operator saw stale numbers for
   * up to 30s after the app's primary action.
   */
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
