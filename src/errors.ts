/**
 * Stable, user-facing failure categories shared by the CLI and diagnostics.
 *
 * Codes are intentionally machine-readable while their associated recovery
 * guidance remains safe for users to copy into a terminal or bug report.
 */
export type FailureCode =
  | "AGENT_DISTRO_E_TARGET_INVALID"
  | "AGENT_DISTRO_E_DESTINATION_UNSAFE"
  | "AGENT_DISTRO_E_CONFLICT"
  | "AGENT_DISTRO_E_RECOVERY_REQUIRED"
  | "AGENT_DISTRO_E_MANIFEST_INVALID"
  | "AGENT_DISTRO_E_ASSET_DRIFT"
  | "AGENT_DISTRO_E_USAGE"
  | "AGENT_DISTRO_E_UNEXPECTED";

const nextSteps: Record<FailureCode, string> = {
  AGENT_DISTRO_E_TARGET_INVALID: "Pass an existing directory as <target>.",
  AGENT_DISTRO_E_DESTINATION_UNSAFE: "Choose a target without symlinked or directory conflicts.",
  AGENT_DISTRO_E_CONFLICT:
    'Review changed files, then rerun with --force if replacement is intended. If unexpected, run agent-distro report-issue --diagnostics-consent --message "describe the conflict".',
  AGENT_DISTRO_E_RECOVERY_REQUIRED: "Run agent-distro recover <target>, then retry the install.",
  AGENT_DISTRO_E_MANIFEST_INVALID: "Reinstall Agent Distro assets with --force, then run doctor again.",
  AGENT_DISTRO_E_ASSET_DRIFT: "Review managed assets, then rerun install with --force if replacement is intended.",
  AGENT_DISTRO_E_USAGE: "Run agent-distro --help for valid commands and options.",
  AGENT_DISTRO_E_UNEXPECTED:
    'Run agent-distro doctor --diagnostics <target>; if it persists, run agent-distro report-issue --diagnostics-consent --message "describe the failure".',
};

/**
 * Removes common credentials and local paths before text reaches a terminal or
 * locally generated issue URL.
 *
 * @param value - Untrusted error detail from a command, library, or filesystem.
 * @returns A one-line, length-bounded diagnostic that is safe to display.
 * @remarks Sanitization is deliberately conservative. It favors redaction over
 * preserving complete original text because this value can later be shared.
 */
export function sanitize(value: unknown) {
  return String(value)
    .replace(/(?:ghp|github_pat|npm)_[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/(?:token|password|secret|authorization)\s*[=:]\s*\S+/gi, "$1=[redacted]")
    .replace(/(?:\/Users\/[^\s:]+|\/home\/[^\s:]+|[A-Z]:\\[^\s:]+)/g, "[local-path]")
    .replace(/\s+/g, " ")
    .slice(0, 500);
}

/**
 * Formats one stable failure category with a sanitized actionable next step.
 *
 * @param code - Failure category that selects recovery guidance.
 * @param message - Untrusted diagnostic detail to sanitize before display.
 * @returns Human-readable stderr text with no trailing side effect.
 */
export function formatFailure(code: FailureCode, message: unknown) {
  return `${code}: ${sanitize(message)}\nNext: ${nextSteps[code]}`;
}

/**
 * Writes a formatted failure to stderr and returns the conventional exit code.
 *
 * @param code - Stable failure category.
 * @param message - Untrusted detail that must not reach stderr unsanitized.
 * @returns Always `1`, letting Commander adapters remain free of `process.exit`.
 */
export function fail(code: FailureCode, message: unknown) {
  console.error(formatFailure(code, message));
  return 1;
}
