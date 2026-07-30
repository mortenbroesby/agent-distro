/** Public library surface for embedding Agent Distro's CLI and installer. */
export { run } from "./cli.js";
export { formatFailure } from "./errors.js";
export { install, providerConflicts } from "./install.js";
export type { InstallOptions, InstallProgress, ProviderConflict } from "./install.js";
export { interactiveInstall, runInteractiveInstall } from "./interactive-install.js";
export { createIssueUrl } from "./report-issue.js";
