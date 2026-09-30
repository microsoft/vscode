# Copilot CLI shim: behavior after installing on macOS and Linux

## Scope

This document explains how GitHub's official install script decides whether to
offer a `PATH` update, why the legacy extension shim and an earlier Rust shim
got different results from it, and what the Rust shim does now, during and
after an install through that script.

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

### Running the official script

On macOS (after Homebrew, when it's available) and on GNU Linux x64 and arm64,
the Rust shim downloads the official script to a temporary file with curl or
wget and runs `bash <file>` attached to the terminal, so the script's prompts
work. It never pipes the script into `bash`.

The `bash` command, and only that command, gets a filtered `PATH`
([`installer_path`](./src/candidate.rs)):

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

The script's `command -v copilot` now fails unless a real Copilot CLI is on
`PATH`, so it shows the missing-`PATH` notice and offers to update the profile.
Declining the profile change doesn't cancel the install.

### Finding the CLI after the install

The shim doesn't add the install directory to that `PATH`; the script decides
whether the CLI is reachable. Instead, after a successful install through the
script, the shim runs discovery again:

1. `PATH`, as before; an eligible CLI there always wins.
2. Then the script's install directory
   ([`official_install_directory`](./src/install.rs)): `$PREFIX/bin` when
   `PREFIX` is set, `/usr/local/bin` when running as root, and otherwise
   `$HOME/.local/bin`. A relative `PREFIX` is resolved against the current
   directory. The candidate gets the same checks as one on `PATH`: a regular,
   executable file that isn't a shim.

So the CLI launches right away, with the original arguments, although the
terminal's `PATH` hasn't changed. Later invocations use the same fallback before
offering to install, so a terminal with a stale `PATH` doesn't install again.

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
| Script's `PATH` | Its own directory removed | Every rejected shim's directory removed |
| Script's `command -v copilot` | Fails unless a real CLI is on `PATH` | Fails unless a real CLI is on `PATH` |
| Missing-`PATH` notice and profile prompt | Shown | Shown |
| After the install | Checks `copilot --version` again with the same `PATH` | Searches `PATH`, then the script's install directory, and launches the CLI |

## Legacy shims in existing terminals

The legacy extension put its `copilotCli` directory at the front of the
integrated terminal `PATH`. The current extension replaces that contribution
(see [`REQUIREMENTS.md`](./REQUIREMENTS.md)), but a terminal restored from
before the update keeps its old `PATH` until it's restarted, which is how the
observed terminal still ran the legacy shim. The Rust shim rejects legacy shims
both as candidates and in the script's `PATH`, so they don't affect it.

## Upstream

The filtered `PATH` works around the script accepting any `copilot`. If the
script checked that `command -v copilot` resolves to the CLI it just installed,
the filtering would no longer be needed.

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
