# Copilot CLI Shim Post-Install PATH Behavior

## Scope

This document records the observed WSL installation behavior of the legacy
VS Code Copilot CLI shim and the Rust replacement, the source paths that
produce that behavior, and the conditions required for the upstream installer
to offer to add its installation directory to a shell profile.

The findings are based on:

- the terminal transcript captured on 2026-09-30;
- the repository at commit `8caae6993563a7f907a44249cd63a3dac5896568`;
- the last legacy TypeScript shim revision immediately before commit
  `315c844ac15e162ba1d51009b9c2a0439e587e4a` deleted it;
- the current Rust shim source under this directory; and
- the `github/copilot-cli` `install.sh` content retrieved from `main` on
  2026-09-30.

The old shim file at the parent of `315c844ac15` has Git blob
`a0211f4a48276c58784f258e4d9878f8aff853b2`. The same blob also appears in the
other local migration history inspected during this investigation, so the
legacy behavior described below is not based on two different versions of the
old TypeScript shim.

## Terminology

- **Legacy shim**: the generated POSIX launcher and its
  `copilotCLIShim.js` implementation that the Copilot extension previously
  wrote under its global-storage `copilotCli` directory.
- **Rust shim**: the `copilot_shim` Cargo package in this directory.
- **Official installer**: `https://gh.io/copilot-install`, which currently
  resolves to
  `https://raw.githubusercontent.com/github/copilot-cli/refs/heads/main/install.sh`.
- **Installed CLI**: the GitHub Copilot CLI executable downloaded by the
  official installer. In the observed non-root WSL run, this was
  `$HOME/.local/bin/copilot`.

## Observed WSL behavior

The captured terminal showed the following sequence.

### Running the Rust shim with `cargo run`

1. `cargo run` executed `target/debug/copilot`.
2. The Rust shim printed its installation-documentation URL and its own
   `Install GitHub Copilot CLI? [y/N]` prompt.
3. After an affirmative answer, the official installer:
   - downloaded the Linux x64 archive;
   - validated its checksum;
   - installed the CLI to `$HOME/.local/bin/copilot`; and
   - printed `Installation complete! Run 'copilot help' to get started.`
4. Repeating `cargo run` replaced the executable at the same path and again
   printed the short `Installation complete!` message.
5. Neither Rust-shim run displayed the official installer's notice that
   `$HOME/.local/bin` was absent from `PATH`, and neither displayed its shell
   profile prompt.

### Running `copilot`

1. The shell resolved `copilot` to the legacy shim.
2. The legacy shim printed that it could not find GitHub Copilot CLI and
   displayed its own install prompt.
3. After an affirmative answer, it printed
   `Trying install script via curl...`.
4. The same official installer replaced
   `$HOME/.local/bin/copilot`.
5. This time the official installer printed:

   ```text
   Notice: $HOME/.local/bin is not in your PATH

   Would you like to add it to $HOME/.profile? [y/N]
   ```

The screenshot ended at this final prompt. It does not show the answer or
subsequent process behavior.

## The extension's legacy PATH contribution

Immediately before `315c844ac15` removed the legacy implementation,
`copilotCLITerminalIntegration.ts` did the following during initialization:

1. Constructed:

   ```text
   <extension global storage>/copilotCli
   ```

2. Called:

   ```ts
   this.terminalService.contributePath(
       'copilot-cli',
       storageLocation,
       { command: 'copilot' },
       true
   );
   ```

3. On non-Windows platforms, wrote an executable named `copilot` into that
   directory. That launcher ran `copilotCLIShim.js` through Electron in Node
   mode.

The fourth `contributePath` argument is named `prepend`. The terminal service
therefore prepended the legacy storage directory to integrated-terminal
`PATH`. See
[`terminalService.ts`](../extensions/copilot/src/platform/terminal/common/terminalService.ts)
and
[`terminalServiceImpl.ts`](../extensions/copilot/src/platform/terminal/vscode/terminalServiceImpl.ts).

This explains how the generated legacy `copilot` command was placed before
later `PATH` entries in terminals created with that contribution.

## How the legacy shim removed itself from child PATH

The deleted TypeScript shim can be inspected with:

```text
git show 315c844ac15^:extensions/copilot/src/extension/chatSessions/vscode-node/copilotCLIShim.ts
```

At line 34 of that historical file, it created a child environment:

```ts
const env = {
    ...process.env,
    PATH: (process.env.PATH || '')
        .replaceAll(`${__dirname}${path.delimiter}`, '')
        .replaceAll(`${path.delimiter}${__dirname}`, '')
};
```

This did not mutate the Node process's `process.env`. It created a separate
environment object used for child processes. The two replacements removed the
legacy shim's `__dirname` when it was adjacent to a `PATH` delimiter.

The legacy shim passed that same filtered `env` to:

- `copilot --version`, used to find a real CLI;
- `npm`;
- Homebrew;
- the curl and wget installer routes;
- `command -v` probes; and
- the final `copilot` launch.

For the curl route, the historical source ran:

```ts
spawnSync(
    'bash',
    ['-c', 'curl -fsSL https://gh.io/copilot-install | bash'],
    { stdio: 'inherit', env }
);
```

The `Trying install script via curl...` line in the observed transcript is the
literal log message immediately before this call.

The legacy install order was:

1. npm;
2. Homebrew, when present;
3. curl; and
4. wget.

The observed `Trying install script via curl...` line proves that execution
reached the curl route. The transcript does not distinguish whether npm was
absent or failed, or whether Homebrew was absent or failed.

## Why the legacy path filtering produced the profile prompt

The official installer installs the binary before checking command
accessibility. For a non-root process with no explicit `PREFIX`, it uses:

```sh
PREFIX="${PREFIX:-$HOME/.local}"
INSTALL_DIR="$PREFIX/bin"
```

After extracting `copilot` into `INSTALL_DIR`, it runs:

```sh
if ! command -v copilot >/dev/null 2>&1; then
    # Report missing PATH and offer to update a shell profile.
else
    echo "Installation complete! Run 'copilot help' to get started."
fi
```

The command tests whether any command named `copilot` is resolvable. It does
not verify that the resolved command is the executable that was just installed
at `$INSTALL_DIR/copilot`.

In the observed legacy-shim run:

1. the extension's generated shim directory contained the `copilot` command
   that started the legacy shim;
2. the legacy shim removed that directory from the environment passed to the
   installer; and
3. the official installer entered its `! command -v copilot` branch.

The third fact is established by the exact notice and profile prompt printed
by that branch. The evidence does not show another `copilot` command remaining
in the filtered `PATH`.

The old shim removed only its own `__dirname`. Its source did not identify and
remove every possible Rust shim, copied shim, or second legacy shim elsewhere
on `PATH`.

## How the official installer selects a profile

When `command -v copilot` fails, the current official installer computes
`CURRENT_SHELL` from `$SHELL` and selects:

| Shell | Profile selected by the installer |
|---|---|
| zsh | `${ZDOTDIR:-$HOME}/.zprofile` |
| bash with `.bash_profile` | `$HOME/.bash_profile` |
| bash with no `.bash_profile` but with `.bash_login` | `$HOME/.bash_login` |
| other bash case | `$HOME/.profile` |
| fish | `${XDG_CONFIG_HOME:-$HOME/.config}/fish/conf.d/copilot.fish` |
| any other shell name | `$HOME/.profile` |

For non-fish shells, it prepares:

```sh
export PATH="$INSTALL_DIR:$PATH"
```

When stdin is a terminal or `/dev/tty` exists, it asks:

```text
Would you like to add it to <selected profile>? [y/N]
```

An affirmative answer appends the PATH line to the selected file. The script
then tells the user to restart the shell or source that file.

The observed prompt selected `$HOME/.profile`. The investigation did not
inspect `$SHELL`, `.bash_profile`, or `.bash_login`, so it does not establish
which profile-selection branch produced that result.

The legacy shim invoked the installer as `curl | bash`, so Bash's script input
was the pipe rather than terminal stdin. The official installer also checks
for `/dev/tty` and reads the answer from `/dev/tty`; the observed prompt proves
that its interactive branch was available in this run.

## Rust shim discovery is separate from child PATH

The Rust shim discovers `copilot` candidates through
[`candidate.rs`](./src/candidate.rs). It rejects:

- the running executable, using file identity;
- other binaries containing the Rust shim marker; and
- scripts matching the legacy shim signatures.

These exclusions prevent the Rust shim from selecting and launching itself or
a legacy shim as the real CLI. They do not edit the process environment or
construct a different `PATH` for installer children.

This distinction is central to the observed behavior:

- Rust discovery can classify the legacy `copilot` as
  `DiscoveryExclusion::LegacyShim` and conclude that no real CLI is available.
- The official installer is a separate child process. It performs its own
  `command -v copilot` check against its child environment.
- The Rust discovery result is not communicated to the official installer.

## Rust shim installation flow

The Rust shim's initial install prompt is implemented in
[`prompt.rs`](./src/prompt.rs), not in the official installer. It prints:

```text
Installation instructions: <documentation URL>
Install GitHub Copilot CLI? [y/N]
```

On GNU Linux x64 and arm64,
[`install.rs`](./src/install.rs) selects curl followed by wget. Unlike the
legacy shim, this route does not try npm or Homebrew on Linux.

The Rust implementation does not pipe a downloaded script into Bash. It:

1. creates a temporary file;
2. downloads `https://gh.io/copilot-install` into that file with an available
   curl or wget executable;
3. runs the discovered Bash executable with the temporary file as an argument;
4. inherits terminal stdin, stdout, and stderr; and
5. removes the temporary file after the process has been reaped.

This behavior follows [`REQUIREMENTS.md`](./REQUIREMENTS.md).

## The Rust installer inherits the unfiltered PATH

[`CommandSpec`](./src/model.rs) currently stores:

- the program;
- its arguments; and
- the launch adapter.

It has no environment or `PATH` override field.

[`platform/mod.rs`](./src/platform/mod.rs) constructs
`std::process::Command`, adds arguments, and does not call `env`, `envs`, or
`env_clear`. The installer command therefore inherits the Rust process
environment.

[`install.rs`](./src/install.rs) runs the downloaded installer as:

```text
<discovered bash path> <temporary installer path>
```

It supplies no different environment for that command.

Running `cargo run` executes the Rust binary by its build path; Rust candidate
discovery does not remove the legacy shim's directory from the parent or child
environment. In the observed terminal, invoking `copilot` immediately
afterward ran the legacy shim. The short final message from the installer
establishes that its `command -v copilot` check succeeded during the Rust-shim
run.

Because the official installer treats any resolvable command named `copilot`
as sufficient, resolving the legacy shim causes it to skip:

- `Notice: $INSTALL_DIR is not in your PATH`;
- shell-profile selection; and
- `Would you like to add it to ...?`.

It instead prints:

```text
Installation complete! Run 'copilot help' to get started.
```

This message means that `command -v copilot` succeeded in the installer's
environment. It does not establish that the resolved command was the newly
installed `$INSTALL_DIR/copilot`.

## Side-by-side behavior

| Stage | Legacy TypeScript shim | Rust shim |
|---|---|---|
| How the shim reaches integrated-terminal PATH | Extension prepended `<global storage>/copilotCli` | Current extension contributes the shipped native shim directory |
| How a real CLI is distinguished from a shim | Runs `copilot --version` with its own directory removed from child PATH | Inspects candidates and excludes current, Rust-marker, and legacy-shim files without running them |
| Linux installer order | npm, Homebrew if present, curl, wget | curl, wget |
| Official script execution | `curl ... \| bash` or `wget ... \| bash` | Download to a temporary file, then `bash <file>` |
| Installer stdin | Script comes from a pipe; prompt reads `/dev/tty` when available | Inherited terminal stdin |
| Installer PATH | Child environment with legacy shim `__dirname` removed | Rust process PATH inherited without filtering |
| Result of upstream `command -v copilot` in the observed run | Failed | Succeeded |
| Upstream missing-PATH notice | Printed | Skipped |
| Upstream profile prompt | Printed for `$HOME/.profile` | Skipped |
| Upstream final message in the observed run | PATH-specific completion branch | Short `Run 'copilot help'` branch |

## Post-install behavior after the official script exits

### Legacy shim

After an installer route reports success, the historical TypeScript source
immediately calls `ensureInstalled()` again. That performs another
`copilot --version` check with the same filtered child environment.

The official installer appends a PATH line to a profile file when the user
accepts its prompt. It does not modify the already-running Node process's
environment. The screenshot did not include the answer to the profile prompt
or the legacy shim's subsequent recheck, so no runtime result after that point
was observed.

### Rust shim

After a successful installer result, [`app.rs`](./src/app.rs) discards the
initial discovery result and performs discovery again from the current process
environment, as required by [`REQUIREMENTS.md`](./REQUIREMENTS.md).

On non-Windows platforms, if that discovery still cannot see the installed
CLI, the Rust source:

1. emits the diagnostic
   `the installation completed, but GitHub Copilot CLI is not visible in the current PATH; restart the terminal or update PATH and retry`; and
2. returns `ApplicationExit::InternalFailure`, whose exit code is `1`.

Native runtime diagnostics are printed only when diagnostics are enabled, such
as with `--vscode-shim verbose`. This is why the absence of that diagnostic in
the non-verbose screenshot does not establish that post-install discovery
found the new executable.

Windows has a separate post-MSI path: the Rust shim checks the known per-user
MSI installation location and can launch that executable by full path. The
Unix official-script route has no equivalent full-path post-install lookup in
the current source.

## Current extension migration and legacy cleanup

Commit `315c844ac15` deleted:

- `copilotCLIShim.ts`; and
- `copilotCLIShim.ps1`.

The current
[`copilotCLITerminalIntegration.ts`](../extensions/copilot/src/extension/chatSessions/vscode-node/copilotCLITerminalIntegration.ts)
performs the following work during initialization:

1. Calls `removeLegacyShims()`.
2. `removeLegacyShims()` recursively removes
   `<extension global storage>/copilotCli`.
3. Locates the shipped native shim.
4. When the native shim exists and the feature is enabled, contributes its
   directory under the same `copilot-cli` contributor key.
5. Otherwise, removes the `copilot-cli` PATH contribution.

The historical contribution explicitly passed `prepend: true`. The current
native contribution omits that argument, whose terminal-service default is
`false`, so the current contribution is appended under the current terminal
service implementation.

The terminal service stores PATH contributions in the extension environment
variable collection. Its source notes that VS Code first applies cached
contributions during reload and that changed contributions can require a
terminal restart.

The observed transcript proves that the `copilot` command in that terminal
ran the legacy shim. It does not establish:

- which Copilot extension build initialized that terminal;
- whether the current migration cleanup had run before that terminal was
  created;
- the absolute legacy shim path in that WSL environment; or
- whether the terminal had been restarted after the contribution changed.

No conclusion about those unobserved details is required to explain the
different official-installer branches.

## Terminal link provider

[`copilotCLITerminalLinkProvider.ts`](../extensions/copilot/src/extension/chatSessions/vscode-node/copilotCLITerminalLinkProvider.ts)
does not install Copilot CLI, alter `PATH`, or produce either install prompt.
It detects file paths in Copilot CLI terminal output and handles links for
those paths.

## Conditions for correcting the Rust-shim behavior

With the current official installer, its missing-PATH branch runs only when:

```sh
command -v copilot
```

fails in the installer process.

A Rust-shim-side correction therefore requires the official installer child
to receive a `PATH` from which rejected shim commands cannot be resolved. It
must not merely remove the `cargo run` executable's directory: the observed
command being resolved was the legacy shim in a separately contributed
directory.

The existing discovery code already identifies:

- the current executable;
- Rust shim copies;
- aliases with the same file identity; and
- legacy shim scripts.

A Rust-only implementation would need to:

1. derive an installer-only PATH that excludes directories containing those
   rejected shim commands while preserving unrelated PATH entries;
2. add per-command environment overrides to `CommandSpec`;
3. apply those overrides when constructing `std::process::Command`;
4. apply the filtered PATH to the downloaded official installer's Bash command;
5. leave the Rust parent environment unchanged;
6. leave final CLI launches and ordinary discovery on the original process
   environment; and
7. update the inherited-environment requirement to document this installer
   exception.

Filtering only the current Rust executable's directory would not cover the
observed legacy-shim case. Filtering only the first rejected shim directory
would not cover multiple shim entries. A correct filter must account for every
rejected shim command that `command -v copilot` could otherwise resolve.

Relevant tests would need to establish that:

- current, copied, aliased, and legacy shim directories are absent from the
  installer PATH;
- unrelated PATH entries retain their order;
- multiple shim entries are all excluded;
- the official Bash installer command receives the override;
- downloader, Homebrew, Windows MSI, final CLI, and ordinary discovery
  behavior remain unchanged; and
- post-install discovery still uses the original process environment.

An upstream correction is also possible: the official installer could test
whether the executable it just installed is accessible, instead of accepting
any command named `copilot`. The current upstream source does not perform that
identity check.

## Facts not established by this investigation

The available evidence does not establish:

- the result after answering the final `$HOME/.profile` prompt;
- the observed value of `$SHELL`;
- whether `.bash_profile` or `.bash_login` existed;
- the absolute path of the generated legacy shim in the WSL filesystem;
- which extension build or activation created the observed terminal
  environment;
- the terminal's exit status after each non-verbose `cargo run`; or
- whether the upstream `install.sh` will retain the same implementation after
  2026-09-30.

These points are intentionally left unresolved rather than inferred.

## Source references

- Rust requirements: [`REQUIREMENTS.md`](./REQUIREMENTS.md)
- Rust application workflow: [`src/app.rs`](./src/app.rs)
- Rust candidate discovery: [`src/candidate.rs`](./src/candidate.rs)
- Rust installer: [`src/install.rs`](./src/install.rs)
- Rust command model: [`src/model.rs`](./src/model.rs)
- Rust process construction:
  [`src/platform/mod.rs`](./src/platform/mod.rs)
- Rust prompt and runtime diagnostics:
  [`src/prompt.rs`](./src/prompt.rs) and
  [`src/runtime.rs`](./src/runtime.rs)
- Current extension integration:
  [`copilotCLITerminalIntegration.ts`](../extensions/copilot/src/extension/chatSessions/vscode-node/copilotCLITerminalIntegration.ts)
- Terminal PATH contribution service:
  [`terminalService.ts`](../extensions/copilot/src/platform/terminal/common/terminalService.ts)
  and
  [`terminalServiceImpl.ts`](../extensions/copilot/src/platform/terminal/vscode/terminalServiceImpl.ts)
- Terminal link provider:
  [`copilotCLITerminalLinkProvider.ts`](../extensions/copilot/src/extension/chatSessions/vscode-node/copilotCLITerminalLinkProvider.ts)
- Historical TypeScript shim:
  `git show 315c844ac15^:extensions/copilot/src/extension/chatSessions/vscode-node/copilotCLIShim.ts`
- Official installer:
  <https://github.com/github/copilot-cli/blob/main/install.sh>
