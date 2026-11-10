import type { NextConfig } from "next";
import { frameAncestorsCsp } from "./src/lib/embed";

// Who may embed the dashboard in an iframe. Sent as a CSP with only the
// frame-ancestors directive: nothing else about the page is restricted, so this
// cannot break scripts or styles the way a full policy can.
//
// X-Frame-Options is deliberately never set. It has no syntax for a wildcard
// host, and where both are present browsers honour the stricter one — so adding
// it would override frame-ancestors and undo this.
//
// The value is read when the server starts, so changing EMBED_FRAME_ANCESTORS
// takes a redeploy (Railway redeploys on a variable change by default).
const csp = frameAncestorsCsp();

const nextConfig: NextConfig = {
  async headers() {
    if (!csp) return [];
    return [
      {
        source: "/:path*",
        headers: [{ key: "Content-Security-Policy", value: csp }],
      },
    ];
  },
};

export default nextConfig;
