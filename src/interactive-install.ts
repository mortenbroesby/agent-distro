/**
 * Interactive prompt orchestration stays separate from the filesystem installer.
 *
 * This module owns only user choices and progress presentation. The installer
 * remains the single authority for path validation, conflict safety, archives,
 * and transactional writes.
 */
import { catalog, profileChoices, selectedCatalogAssets, selectedCatalogEntries, stackChoices } from "./catalog.js";
import type { ManagedSelection } from "./install.js";
import { fail } from "./errors.js";
import { install, providerConflicts } from "./install.js";

/**
 * Runs the prompt flow through an injected Clack-compatible adapter.
 *
 * Injection keeps the UX testable without emulating a terminal while the real
 * wrapper below imports the production prompt library only for TTY use.
 *
 * @param target - Optional preselected repository directory.
 * @param p - Clack-compatible prompt adapter used for every interaction.
 * @param initial - Previously persisted selection used to prefill an update.
 * @returns `0` for completed or cancelled interaction, otherwise installer code.
 * @remarks Provider choice occurs before confirmation and before creating the
 * task log, guaranteeing a cancellation leaves the target untouched.
 */
export async function runInteractiveInstall(target: string | undefined, p: any, initial?: ManagedSelection) {
  p.intro("Agent Distro install");
  const destination =
    target ??
    (await p.text({
      message: "Install into",
      initialValue: process.cwd(),
      validate: (value) => (value ? undefined : "A target directory is required."),
    }));
  if (p.isCancel(destination)) {
    p.cancel("Installation cancelled.");
    return 0;
  }
  const stacks = await p.multiselect({
    message: "Select stacks",
    options: stackChoices.map(({ id, label, description }) => ({ value: id, label, hint: description })),
    initialValues: initial?.stacks,
    required: false,
  });
  if (p.isCancel(stacks)) {
    p.cancel("Installation cancelled.");
    return 0;
  }
  const selectedStacks = new Set(stacks);
  const profiles = await p.multiselect({
    message: "Select profiles",
    options: profileChoices
      .filter((profile) => selectedStacks.has(profile.stack))
      .map(({ id, label, description }) => ({ value: id, label, hint: description })),
    initialValues: initial?.profiles,
    required: false,
  });
  if (p.isCancel(profiles)) {
    p.cancel("Installation cancelled.");
    return 0;
  }
  const selected = await p.multiselect({
    message: "Select individual assets",
    options: catalog.assets
      .filter((asset) => selectedStacks.has(asset.stack))
      .map(({ path, label }) => ({ value: path, label, hint: path })),
    initialValues: initial?.assets,
    required: false,
  });
  if (p.isCancel(selected)) {
    p.cancel("Installation cancelled.");
    return 0;
  }
  if (profiles.length === 0 && selected.length === 0) {
    p.outro("No assets selected; nothing changed.");
    return 0;
  }
  // Resolve all unmergeable targets before confirmation. The installer receives
  // explicit choices rather than deriving an implicit provider priority.
  const providerChoices: Record<string, string> = {};
  for (const conflict of providerConflicts(selectedCatalogEntries(selected, profiles))) {
    const choice = await p.select({
      message: `Choose the provider for ${conflict.target}`,
      options: conflict.providers.map((provider) => ({
        value: provider.path,
        label: provider.label,
        hint: `${provider.stack} stack`,
      })),
    });
    if (p.isCancel(choice)) {
      p.cancel("Installation cancelled; nothing changed.");
      return 0;
    }
    providerChoices[conflict.target] = choice;
  }
  const count = selectedCatalogAssets(selected, profiles).length;
  const confirmed = await p.confirm({
    message: `Install ${count} selected asset${count === 1 ? "" : "s"} into ${destination}?`,
    initialValue: true,
  });
  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel("Installation cancelled; nothing changed.");
    return 0;
  }
  const log = p.taskLog({ title: "Installing selected assets", limit: 8, retainLog: true });
  const code = install(destination, {
    quiet: true,
    selected,
    profiles,
    providerChoices,
    onStep: (message) => log.message(message),
  });
  if (code === 0) log.success("Assets synchronized.");
  else log.error("Installation failed.");
  if (code === 0) p.outro("Installation complete.");
  return code;
}

/**
 * Opens the production Clack UI only when both standard streams are terminals.
 *
 * @param target - Optional preselected repository directory.
 * @param initial - Previously persisted selection used to prefill an update.
 * @returns The result code from {@link runInteractiveInstall}.
 * @remarks Non-interactive callers must provide explicit CLI selections; this
 * prevents a CI or script invocation from waiting forever for terminal input.
 */
export async function interactiveInstall(target?: string, initial?: ManagedSelection) {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    return fail("AGENT_DISTRO_E_USAGE", "Interactive install requires a terminal; use --asset <path...> or --all.");
  return runInteractiveInstall(target, await import("@clack/prompts"), initial);
}
