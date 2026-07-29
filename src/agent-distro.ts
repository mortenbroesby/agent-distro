/** Public library surface for embedding Agent Distro's CLI and installer. */
export { run } from "./cli.js";
export { formatFailure } from "./errors.js";
export { install, runInteractiveInstall } from "./install.js";
export type { InstallOptions, InstallProgress } from "./install.js";
export { createIssueUrl } from "./report-issue.js";
