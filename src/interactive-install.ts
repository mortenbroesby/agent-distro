// Interactive prompt orchestration stays separate from the filesystem installer.
import { catalog, profileChoices, selectedCatalogAssets, stackChoices } from "./catalog.js";
import type { ManagedSelection } from "./install.js";
import { fail } from "./errors.js";
import { install } from "./install.js";

/**
 * Runs the prompt flow through an injected Clack-compatible adapter.
 *
 * Injection keeps the UX testable without emulating a terminal while the real
 * wrapper below imports the production prompt library only for TTY use.
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
  const code = install(destination, { quiet: true, selected, profiles, onStep: (message) => log.message(message) });
  if (code === 0) log.success("Assets synchronized.");
  else log.error("Installation failed.");
  if (code === 0) p.outro("Installation complete.");
  return code;
}

/** Opens the real interactive UI only when both standard streams are terminals. */
export async function interactiveInstall(target?: string, initial?: ManagedSelection) {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    return fail("AGENT_DISTRO_E_USAGE", "Interactive install requires a terminal; use --asset <path...> or --all.");
  return runInteractiveInstall(target, await import("@clack/prompts"), initial);
}
