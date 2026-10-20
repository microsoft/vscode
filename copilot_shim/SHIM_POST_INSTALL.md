# Copilot CLI shim: behavior after installing on macOS and Linux

## Scope

This document explains how GitHub's official install script decides whether to offer a `PATH` update, why the legacy extension shim and an earlier Rust shim got different results from it, and the current platform-specific Rust behaviour. Linux preserves the installer's original `PATH`; macOS retains shim-directory filtering. Both use verified discovery after installation.

It is based on:

- a WSL terminal transcript captured on 2026-09-30;
- the last legacy TypeScript shim, which
  `git show 315c844ac15^:extensions/copilot/src/extension/chatSessions/vscode-node/copilotCLIShim.ts`
  shows;
- the `install.sh` in `github/copilot-cli` on `main` on 2026-09-30; and
- the current Rust shim in this directory.

[`REQUIREMENTS.md`](./REQUIREMENTS.md) is the specification. This document
records the reasoning behind its installer rules.

## Terminology

- **Legacy shim**: the `copilot` launcher and `copilotCLIShim.js` that earlier
  versions of the Copilot extension wrote to `<global storage>/copilotCli` and
  put at the front of the integrated terminal `PATH`.
- **Rust shim**: the `copilot_shim` package in this directory.
- **Official script**: `https://gh.io/copilot-install`, which resolves to
  `install.sh` in `github/copilot-cli`.
- **Installed CLI**: the Copilot CLI the official script installs; for a
  non-root user without `PREFIX`, `$HOME/.local/bin/copilot`.

## What was observed

The transcript came from a WSL terminal whose `PATH` still contained the legacy
shim's directory. The Rust shim was the build at commit `8caae699356`, before
the changes described under [Current Rust shim behavior](#current-rust-shim-behavior).

1. Running the Rust shim with `cargo run` showed its install prompt. After `y`,
   the official script installed `$HOME/.local/bin/copilot` and printed only
   `Installation complete! Run 'copilot help' to get started.` A second run
   installed again and printed the same line.
2. Typing `copilot` then ran the legacy shim, which showed its own prompt and
   ran the same script through `curl | bash`. This time the script printed:

   ```text
   Notice: $HOME/.local/bin is not in your PATH

   Would you like to add it to $HOME/.profile? [y/N]
   ```

The transcript ends at that prompt, so the answer and what followed weren't
observed.

## Why only the legacy shim got the profile prompt

The official script installs the CLI to `$PREFIX/bin` (by default
`$HOME/.local/bin` for a non-root user) and then checks:

```sh
if ! command -v copilot >/dev/null 2>&1; then
    # Report the missing PATH entry and offer to update a shell profile.
else
    echo "Installation complete! Run 'copilot help' to get started."
fi
```

The check passes for any command named `copilot`. It doesn't check that it
found the CLI it just installed.

- The legacy shim ran the script with its own directory removed from the
  child's `PATH`. Nothing else named `copilot` was on that `PATH`, so the check
  failed and the script offered to update the profile.
- The Rust shim at `8caae699356` ran the script with its own `PATH` unchanged.
  That `PATH` still contained the legacy shim's directory, so `command -v
  copilot` found the legacy shim, and the script skipped the notice and the
  prompt. The CLI was installed, but nothing put its directory on `PATH`.

Removing only the running shim's directory would not have been enough: the
command the script found was a different shim.

## How the official script selects a profile

When `command -v copilot` fails, the script picks a profile from `$SHELL`:

| Shell | Profile |
|---|---|
| zsh | `${ZDOTDIR:-$HOME}/.zprofile` |
| bash with `.bash_profile` | `$HOME/.bash_profile` |
| bash with `.bash_login` but no `.bash_profile` | `$HOME/.bash_login` |
| other bash | `$HOME/.profile` |
| fish | `${XDG_CONFIG_HOME:-$HOME/.config}/fish/conf.d/copilot.fish` |
| anything else | `$HOME/.profile` |

It asks `Would you like to add it to <profile>? [y/N]`, reading the answer from
the terminal (`/dev/tty`), and on `y` appends
`export PATH="$INSTALL_DIR:$PATH"` (fish syntax for fish). A profile change
affects shells started later; it doesn't change the `PATH` of the running
terminal or the shim.

## Current Rust shim behavior

### macOS workbench install-only flow

The [macOS Shell Command action](./REQUIREMENTS.md#macos-shell-command-installation) uses the shim's [interactive install-only mode](./REQUIREMENTS.md#install) after collecting consent. When initial discovery finds an existing CLI, this mode writes `GitHub Copilot CLI is already installed.` followed by `Location: <discovered absolute candidate.path>` to stderr; when installation and rediscovery find one, it instead writes `GitHub Copilot CLI installed successfully.` followed by the same location form. The location is the unchanged discovery path from the existing executable-file and shim-exclusion checks, not a canonicalized path or runtime verification; the mode exits without launching the CLI.

This route does not repeat the shim's first-use prompt. Normal `copilot` invocation retains its own prompt, installation, rediscovery, and final CLI launch behavior. The dedicated VS Code terminal, not the Rust shim, prints its localized `Press any key to close this terminal.` `waitOnExit` message after success, failure, or handled cancellation using standard product-message formatting; the Rust shim neither prints that hint nor waits for a key. Linux install-only behavior and Windows setup/result-file statuses are unchanged.

Neither the macOS workbench action nor the shim creates a `/usr/local/bin/copilot` link or otherwise owns Copilot CLI files, PATH entries, updates, or uninstallation. The installer may offer its own profile edit: accepting it can require a new terminal before the profile takes effect, while declining it leaves the existing PATH unchanged and can require the CLI's absolute path or manual PATH configuration.

### Running the official script

On macOS (after Homebrew, when it's available) and on GNU Linux x64 and arm64,
the Rust shim downloads the official script to a temporary file with curl or
wget and runs `bash <file>` attached to the terminal, so the script's prompts
work. It never pipes the script into `bash`.

#### Linux: inherited PATH

The Linux `bash` process inherits the original `PATH`, including its order, duplicates, and shim-containing directories. This matters when `/usr/bin/copilot` points to a VS Code shim: removing `/usr/bin`, or its merged-`/usr` alias `/bin`, would also hide utilities that the installer needs.

The upstream script installs the CLI before checking `command -v copilot`. A visible shim can satisfy that check and suppress the profile prompt, but the shim independently finds the real CLI through its installation-directory fallback. This preserves access to installer utilities without returning to the historical repeat-install behaviour.

#### macOS: filtered PATH

On macOS, the `bash` command, and only that command, gets a filtered `PATH` ([`installer_path`](./src/candidate.rs)):

1. The shim runs discovery and collects the directory of every candidate it
   rejected as the running shim (including links to it), another copy of the
   Rust shim (by its marker), or a legacy shim.
2. It removes those directories from `PATH`, keeping every other entry, their
   order, and their native bytes. Relative and empty entries are resolved
   against the current directory before comparing.
3. If no entry is left, the install stops with an explanation instead of
   running the script with an empty `PATH`.

[`CommandSpec`](./src/model.rs) carries the override, and
[`native_command`](./src/platform/mod.rs) applies it. The downloader, Homebrew,
the Windows MSI install, PowerShell probes, and the final CLI keep the
unchanged environment, and the shim's own environment isn't modified.

With macOS filtering, the script's `command -v copilot` fails unless a real Copilot CLI is on `PATH`, so it shows the missing-`PATH` notice and offers to update the profile. Declining the profile change doesn't cancel the install. Linux does not rely on this prompt being shown or accepted.

### Finding the CLI after the install

Neither platform adds the predicted install directory to the script's `PATH`. After a successful script installation, the shim independently runs discovery again:

1. `PATH`, as before; an eligible CLI there always wins.
2. Then the script's install directory
   ([`official_install_directory`](./src/install.rs)): `$PREFIX/bin` when
   `PREFIX` is set, `/usr/local/bin` when running as root, and otherwise
   `$HOME/.local/bin`. A relative `PREFIX` is resolved against the current
   directory. The candidate gets the same checks as one on `PATH`: a regular,
   executable file that isn't a shim.

For ordinary shim invocation, the CLI launches right away with the original arguments, although the terminal's `PATH` hasn't changed. The macOS workbench install-only route instead reports the verified availability path and exits without launching the CLI. Later invocations use the same fallback before offering to install, so a terminal with a stale `PATH` doesn't install again.

On Linux, removing VS Code can remove the system-shim route without removing the real CLI. If the installer skipped its profile update, the real CLI may then need its own `PATH` entry. A custom `PREFIX` must remain available through the appropriate environment or the CLI's own `PATH` entry on later invocations.

If neither finds the CLI, the shim prints, even without verbose mode:

```text
The installation completed, but no usable GitHub Copilot CLI was found on PATH or in the expected installation location. Source your shell profile, restart the terminal, or update PATH and retry.
```

and exits `1` without prompting again. If the install directory can't be
determined, for example because neither `HOME` nor `PREFIX` is set, it prints
`Could not locate GitHub Copilot CLI: <reason>` and exits `1`.

The fallback doesn't apply to Homebrew installs, whose `bin` directory is
normally on `PATH` already, or to ARMhf and musl, which have no automatic
install.

On Windows the shim installs GitHub's per-user MSI instead, and discovery
always searches `%LOCALAPPDATA%\GitHubCopilotCLI` after `PATH`; see
[`REQUIREMENTS.md`](./REQUIREMENTS.md).

## Side by side

| Stage | Legacy shim | Rust shim |
|---|---|---|
| How it tells a real CLI from a shim | Runs `copilot --version` with its own directory removed from the child's `PATH` | Inspects candidates without running them and rejects the running shim, Rust shim copies, and legacy shims |
| Linux install order | npm, Homebrew if present, curl, wget | curl, then wget |
| Running the official script | `curl ... \| bash` or `wget ... \| bash` | Download to a temporary file, then `bash <file>` |
| Script's stdin | The pipe; prompts read `/dev/tty` | The terminal |
| Script's `PATH` | Its own directory removed | Linux: inherited unchanged; macOS: every rejected shim's directory removed |
| Script's `command -v copilot` | Fails unless a real CLI is on `PATH` | Linux: a shim can satisfy the check; macOS: fails unless a real CLI is on `PATH` |
| Missing-`PATH` notice and profile prompt | Shown | Linux: may be skipped; macOS: shown when no real CLI is on `PATH` |
| After the install | Checks `copilot --version` again with the same `PATH` | Searches `PATH`, then the script's install directory, and launches the CLI |

## Legacy shims in existing terminals

The legacy extension put its `copilotCli` directory at the front of the
integrated terminal `PATH`. The current extension replaces that contribution
(see [`REQUIREMENTS.md`](./REQUIREMENTS.md)), but a terminal restored from
before the update keeps its old `PATH` until it's restarted, which is how the
observed terminal still ran the legacy shim. The Rust shim rejects legacy shims as CLI candidates on both platforms. macOS also excludes their directories from the installer's `PATH`; Linux keeps the original environment and does not rely on the installer's profile prompt.

## Upstream

macOS filtering works around the script accepting any `copilot`. Linux instead preserves access to system utilities and relies on the shim's real-CLI discovery/fallback. Neither platform patches the upstream script. If its accessibility check changes, re-evaluate the platform-specific assumptions against the new script rather than assuming this historical behaviour remains fixed.

## Not established by the transcript

- What happened after answering the `$HOME/.profile` prompt.
- The value of `$SHELL`, and whether `.bash_profile` or `.bash_login` existed.
- The legacy shim's absolute path, and which extension build created the
  terminal's `PATH`.
- The exit status of each `cargo run`.
- Whether the official script will keep this behavior.

## Source references

- Specification: [`REQUIREMENTS.md`](./REQUIREMENTS.md)
- Workflow and post-install discovery: [`src/app.rs`](./src/app.rs)
- Discovery and the installer `PATH`: [`src/candidate.rs`](./src/candidate.rs)
- Installer routes and the script's install directory:
  [`src/install.rs`](./src/install.rs)
- Command model and process creation: [`src/model.rs`](./src/model.rs) and
  [`src/platform/mod.rs`](./src/platform/mod.rs)
- Legacy shim:
  `git show 315c844ac15^:extensions/copilot/src/extension/chatSessions/vscode-node/copilotCLIShim.ts`
- Official script: <https://github.com/github/copilot-cli/blob/main/install.sh>
