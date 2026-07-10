import pkg from "../../package.json";

// A short build identifier for the footer. Render exposes the deploy's commit
// as RENDER_GIT_COMMIT; locally we fall back to "dev". Kept tiny on purpose.
const sha = process.env.RENDER_GIT_COMMIT?.slice(0, 7) || "dev";

export const APP_VERSION = `v${pkg.version} · ${sha}`;
