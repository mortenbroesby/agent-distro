import { fail, sanitize } from "./errors.js";
import { version } from "./package.js";

const issueUrl = "https://github.com/mortenbroesby/agent-distro/issues/new";

/**
 * Builds, but never opens or submits, a pre-filled GitHub issue URL.
 *
 * Every caller-provided value is sanitized so users retain final control over
 * the report and do not accidentally publish credentials or local paths.
 */
export function createIssueUrl({
  message,
  action = "unknown",
  code = "AGENT_DISTRO_E_UNEXPECTED",
}: {
  message: unknown;
  action?: unknown;
  code?: unknown;
}) {
  const body = [
    "<!-- Generated locally. Review before submitting. -->",
    `Agent Distro: ${version}`,
    `Node: ${process.versions.node}`,
    `Platform: ${process.platform} ${process.arch}`,
    `Action: ${sanitize(action)}`,
    `Code: ${sanitize(code)}`,
    `Failure: ${sanitize(message)}`,
  ].join("\n");
  return `${issueUrl}?${new URLSearchParams({ title: "Agent Distro failure", body }).toString()}`;
}

/**
 * Validates explicit consent and prints the locally generated issue URL.
 *
 * @returns A CLI exit code; no network request or browser launch occurs.
 */
export function reportIssue({
  diagnosticsConsent,
  message,
  action,
  code,
}: {
  diagnosticsConsent?: boolean;
  message?: string;
  action?: string;
  code?: string;
}) {
  // Consent is explicit because even a sanitized diagnostic summary is user data.
  if (!diagnosticsConsent) return fail("AGENT_DISTRO_E_USAGE", "Issue reporting requires --diagnostics-consent.");
  if (!message) return fail("AGENT_DISTRO_E_USAGE", "Issue reporting requires --message <summary>.");
  process.stdout.write(`${createIssueUrl({ message, action, code })}\n`);
  return 0;
}
