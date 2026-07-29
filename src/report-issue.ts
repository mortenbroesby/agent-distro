import { sanitize, fail } from "./errors.js";
import { version } from "./package.js";

const issueUrl = "https://github.com/mortenbroesby/agent-distro/issues/new";

export function createIssueUrl({
  message,
  action = "unknown",
  code = "AGENT_DISTRO_E_UNEXPECTED",
}: { message: unknown; action?: unknown; code?: unknown }) {
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

export function reportIssue({
  diagnosticsConsent,
  message,
  action,
  code,
}: { diagnosticsConsent?: boolean; message?: string; action?: string; code?: string }) {
  if (!diagnosticsConsent) return fail("AGENT_DISTRO_E_USAGE", "Issue reporting requires --diagnostics-consent.");
  if (!message) return fail("AGENT_DISTRO_E_USAGE", "Issue reporting requires --message <summary>.");
  process.stdout.write(`${createIssueUrl({ message, action, code })}\n`);
  return 0;
}
