<!--
  REMOTE_PLATFORM.md
  Living spec - keep in sync with code after each significant change.
  See: node/remotePlatform/, node/sshRemoteAgentHostService.ts,
       node/sshRemoteAgentHostHelpers.ts, cli/src/commands/agent_host.rs.
-->

# Remote Platform Abstraction

Connecting an agent host to a remote machine requires operating on that machine:
detect what it is, install the VS Code CLI, and launch `code agent host`. Each of
those steps is operating system specific.

This document specifies `IRemotePlatform`, the strategy that owns all OS-specific
remote behaviour, so the SSH transport contains no shell syntax of its own.
POSIX and Windows remotes are both supported.

---

## 1. Mental model

| Term | What it is |
|------|-----------|
| **Remote platform** | A strategy performing semantic operations ("is this file executable", "install the CLI") against a remote of one OS family, using an injected executor. |
| **Executor** (`ISshExec`) | Sends a command string plus a safe description of what it is for, returns `{ stdout, stderr, code }`. Knows nothing about shells or operating systems. |
| **Supervisor** | The detached, long-lived process `code agent host` daemonizes. It owns the agent host's lifecycle. |

### Principles

- **Operations, not command strings.** The platform exposes
  `isExecutableFile(exec, path)`, not `isExecutableFileCommand(): string`.
  Exit-code interpretation is OS-specific - Windows `Test-Path` prints `False`
  and exits `0` - so the platform must own execution, not hand strings to a
  caller.
- **The CLI owns the agent host lifecycle.** See §4. This is the decision that
  keeps this design small.
- **One place per OS.** Adding an OS means adding one implementation, not editing
  twenty call sites.
- **Escaping belongs to the platform.** Cross-platform escaping helpers are a
  trap and must not exist.

### Layering

```
sshRemoteAgentHostService ──uses──▶ IRemotePlatform ──▶ PosixRemotePlatform (Linux, macOS)
        │                                 └──────────▶ WindowsRemotePlatform
        └──uses──▶ detectRemotePlatform(exec)
```

`IRemotePlatform` receives an `ISshExec` per call and never imports the SSH
transport, so it is unit-testable against the existing fake executor.

---

## 2. Interface

```ts
export type RemoteOS = 'linux' | 'darwin' | 'win32';
export type RemoteArch = 'x64' | 'arm64' | 'armhf';

export interface IRemotePlatformInfo {
	readonly os: RemoteOS;
	readonly arch: RemoteArch;
}

/**
 * A remote path. Opaque because a plain string cannot distinguish a literal
 * path from a trusted shell expression: POSIX paths deliberately carry an
 * unquoted `~` for the remote shell to expand, while a Windows
 * `$env:USERPROFILE` fragment passed to `-LiteralPath` as a quoted value would
 * not expand at all. Each platform renders its own paths from validated
 * components; the type keeps callers from constructing one by concatenation.
 */
export interface IRemotePath { readonly _brand: 'remotePath'; }

/**
 * A launch target. Structured rather than a command string because
 * PowerShell's `&` does not split an executable-plus-arguments string and
 * `Invoke-Expression` would reintroduce injection.
 *
 * `executable` is an absolute remote path - never resolved against `PATH`,
 * since the desktop knows exactly which binary it installed. `args` are
 * *logical* arguments, unquoted and unescaped exactly as the process should
 * receive them; the platform quotes them when rendering.
 */
export interface IRemoteLaunchSpec {
	readonly executable: IRemotePath;
	readonly args: readonly string[];
}

export interface IRemotePlatform {
	readonly info: IRemotePlatformInfo;

	/**
	 * Paths and naming - pure, no I/O.
	 *
	 * `quality` is the product quality (`stable` | `insider` | `exploration`),
	 * selecting the CLI binary name (`code`, `code-insiders`, …).
	 * `serverDataFolderName` is a folder *name*, not a path - e.g.
	 * `.vscode-server`; `installRoot` turns it into a path under the remote home.
	 */
	cliArchiveName(quality: string): string;
	installRoot(serverDataFolderName: string): IRemotePath;
	cliDataDir(serverDataFolderName: string): IRemotePath;
	cliBin(serverDataFolderName: string, quality: string, commit?: string): IRemotePath;

	/**
	 * Parse a candidate path returned by the remote. This is the trust
	 * boundary: remote output arrives as an untrusted `string`, and only
	 * recognised shapes become an `IRemotePath` that may re-enter a command.
	 * Returning a parsed value rather than a boolean means an unvalidated
	 * string is unusable as a path by construction.
	 */
	parseFallbackCliPath(candidate: string, serverDataFolderName: string, quality: string): IRemotePath | undefined;

	/** CLI installation and discovery */
	isExecutableFile(exec: ISshExec, path: IRemotePath): Promise<boolean>;
	touchFile(exec: ISshExec, path: IRemotePath): Promise<boolean>;
	versionCheck(exec: ISshExec, cliBin: IRemotePath): Promise<boolean>;
	installCli(exec: ISshExec, options: { url: string; installRoot: IRemotePath; cliBin: IRemotePath; publish: CliPublishPolicy }): Promise<void>;
	pruneOldClis(exec: ISshExec, serverDataFolderName: string, quality: string, keep: number): Promise<void>;
	findFallbackClis(exec: ISshExec, serverDataFolderName: string, quality: string): Promise<readonly IRemotePath[]>;

	/** Launch */
	buildLaunchCommand(spec: IRemoteLaunchSpec): string;

	/**
	 * Wrap a raw, user-supplied command (`remoteAgentHostCommand`) for remote
	 * execution. Separate from `buildLaunchCommand` because the input is an
	 * opaque command string rather than an executable plus arguments, and
	 * because it carries a POSIX-only contract (§6). Lives on the interface so
	 * that its shell wrapper does not leak into the service (I1);
	 * `WindowsRemotePlatform` rejects it.
	 */
	buildRawLaunchCommand(command: string): string;
}
```

Every operation supplies a **safe description** - a short, secret-free string
naming what it was doing - which `ISshExec` carries and errors are constructed
from. This is what replaces quoting the raw command (§7.3), and it must exist on
the execution contract rather than being bolted on later, since `sshExec` builds
its rejection message at the transport.

There is deliberately no metadata, liveness or termination operation. See §4.

---

## 3. POSIX implementation

`PosixRemotePlatform` is a single class covering Linux and macOS. Its install
honours the same boundary and publication contracts as Windows: `chmod 700` on
the install root and on the published binary, and `mv -n` or `mv -f` according to
the `CliPublishPolicy` (§5.4).

There is no Linux/Darwin subclass split, because no divergence exists to model:
the current commands are already written to be portable and say so - `ls -1t`
"sorts by mtime newest-first on both Linux (coreutils) and macOS (BSD)", and
`xargs -I{}` "skips the command entirely on empty input on both GNU and BSD
`xargs`" (`sshRemoteAgentHostHelpers.ts:192-202`). The abstraction is what makes
such a split cheap later: one subclass overriding what differs, with no call site
changed.

---

## 4. Lifecycle: the CLI owns it

`code agent host` is not a single process. The foreground invocation re-execs
itself detached with `VSCODE_AGENT_HOST_SUPERVISOR` set
(`cli/src/commands/agent_host.rs`); the detached **supervisor** binds the
listener, prints `__VSCODE_AGENT_HOST_READY__`, then redirects its own stdio to
null. The foreground **always exits at the readiness sentinel** - there is no
streaming mode and no `--detach` flag, though stale comments in those sources
still mention one.

Critically, the foreground already decides *whether a supervisor is needed*: it
classifies the lockfile and either reuses the live supervisor or spawns a fresh
one (`cli/src/commands/agent_host.rs`). **Both paths print the same banner** -
`print_reuse_banner` and the fresh-spawn path both call
`output::print_network_lines`, emitting the `ws://127.0.0.1:PORT[?tkn=TOKEN]`
line the desktop already parses (`extractAgentHostWebSocketURL`).

**The desktop therefore invokes `code agent host` and consumes its machine-readable
output.** That is the whole protocol.

The human banner alone is *not* a sufficient contract. It always prints
`ws://localhost:<port>` regardless of what the supervisor actually bound to
(`cli/src/commands/output.rs`), and the desktop's parser normalises that to
`127.0.0.1` - so reusing a supervisor started with `--host ::1` or a specific
address would leave the desktop dialling the wrong endpoint forever. The metadata
file carried a `host` field for exactly this reason, and the desktop read it
through `dialAgentHostHost`.

The CLI therefore emits a **single machine-readable line** alongside the banner,
carrying the dial host, port and token, on both the fresh-spawn and reuse paths.
That keeps "consume the output" as the protocol while restoring the information
the metadata read used to supply.

That line is a cross-language wire format and is specified as one: a version tag
so an older desktop can reject what it does not understand, a defined channel and
encoding, and a defined redaction rule - it carries a token, and the existing
`redactToken` only recognises `?tkn=` in URLs, so a JSON-shaped line would leak
into trace logs. Machine lines are structurally redacted before logging.

#### The endpoint line

```
__VSCODE_AGENT_HOST_ENDPOINT__ v=1 host=<dial-host> port=<port> [token=<token>]
```

| Property | Rule |
|---|---|
| Channel | stdout, on its own line, on both the fresh-spawn and reuse paths |
| Encoding | ASCII; space-separated `key=value`; no value contains a space |
| `host` | The address to dial, resolved from the address the listener actually bound. Wildcards map to the loopback of the *matching* family (`0.0.0.0` → `127.0.0.1`, `::` → `::1`). A `--host` label is never echoed verbatim: a name like `localhost` can resolve differently in two processes, so the supervisor could be on `::1` while a client reaches for `127.0.0.1`. Never bracketed here; bracketing is the consumer's job when it builds an authority. |
| `port` | Decimal. |
| `token` | Present only when a connection token is in use; raw, not URL-encoded. |
| Unknown keys | Ignored, so fields can be added without a version bump. |
| Redaction | `token=<value>` → `token=***`, applied before the line reaches any log. |
| Unknown `v=` | Treated as if the line were absent. |

A CLI too old to emit the line leaves the desktop on the human banner, which
means loopback - the behaviour it already had. That fallback is what keeps a
mismatched pair working, and it is why the line is additive rather than a
replacement for the banner.

**IPv6 does not compose today**, so promising an IPv6-capable endpoint means
fixing the consumers rather than just the producer: the WebSocket URL is built by
string concatenation that yields an invalid authority for a bare IPv6 literal
(`sshRemoteAgentHostService.ts:427-429`), `SSHConnection` stores only port and
token rather than the host (`:495-505`), relay-only reconnect hardcodes
`127.0.0.1` (`:618-646`), and the Rust side maps the `::` wildcard to IPv4
loopback instead of `::1` (`cli/src/commands/agent_host.rs:653-658`). The
endpoint must be stored whole, IPv6 authorities bracketed, and both initial and
relay-only reconnect covered by tests.

**The CLI's metadata write must become fatal before readiness.** The supervisor
currently only warns when the write fails and then prints the sentinel and
detaches (`cli/src/tunnels/agent_host.rs:1042-1051`,
`cli/src/commands/agent_host.rs:286-315`). Under the previous design the desktop
wrote its own record, so that was survivable; now the supervisor's record is the
*only* one, and a successful-but-untracked supervisor means the next invocation
spawns another while the desktop is forbidden from cleaning either up. "Ready"
must imply "discoverable", proven by fault injection.

Consequences, which are the point of this design:

- **The desktop never writes agent host metadata.** The supervisor owns that
  file. Writing a shell's `$$` over it records a process that has already exited
  and clobbers authoritative state.
- **The desktop never terminates a remote process.** The supervisor is shared -
  it "is shared and outlives any individual invocation" - and `code tunnel`, WSL
  and other desktops reuse it. Killing on a relay failure can tear down an agent
  host another consumer is using. A relay failure now surfaces a retryable error
  and destroys nothing.

This removes the desktop-side lockfile read, write and cleanup paths, and with
them the need for process identity, liveness probing, tree-kill and metadata
schema changes. It also fixes two pre-existing defects by deletion rather than by
adding machinery to make them safe.

**Cost, accepted deliberately.** Reconnects that previously reused a live agent
host skipped platform detection and the CLI install check; they no longer do, so
a full reconnect costs a few more round trips and a desktop commit change can
re-download the CLI even when a healthy supervisor is serving. This is accepted:
reconnects are rare, the work happens on an already-established connection, and
no kill switch or fallback path is warranted for it. Maintaining a second,
divergent copy of the CLI's lifecycle logic to avoid it would cost far more than
it saves.

**Timeouts must agree, and the desktop's must be the outer one.** The desktop
gives the launch 60 seconds (`sshRemoteAgentHostService.ts:343-348`) while the
CLI allows five minutes for supervisor readiness
(`cli/src/commands/agent_host.rs:49-51`). Simply matching the two would still
race: the desktop's timer starts earlier, before remote PowerShell startup and
the supervisor spawn, so equal budgets let the desktop give up while the CLI is
legitimately still inside its own. The desktop budget is therefore the CLI's plus
a margin, or the CLI owns readiness timing outright and the desktop only guards
against a dead channel.

---

## 5. Windows implementation

### 5.1 Transport encoding

Windows OpenSSH may be configured with `cmd.exe`, `powershell.exe`, or `pwsh` as
the default shell. Quoting rules differ across all three and the configured shell
is not knowable up front.

**Every Windows command is sent as:**

```
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand <base64-UTF16LE>
```

The base64 alphabet (`A-Z a-z 0-9 + / =`) contains no shell metacharacter, so the
outer command line is inert under `cmd.exe`, PowerShell and `sh` alike. This
removes default-shell ambiguity and eliminates outer-shell quoting as a class of
bug. `powershell.exe` is used rather than `pwsh` because it is present on every
supported Windows install.

Base64 protects only the *outer* shell; values interpolated **inside** the
payload are escaped by the platform.

Constrained Language mode is **not supported** - it would restrict the .NET use
the envelope relies on. A remote configured that way fails with a clear error
rather than being worked around.

### 5.2 Payload envelope

Every payload uses one envelope so the executor's contract is identical across
platforms:

- `$ErrorActionPreference = 'Stop'` and an explicit `exit <n>`; predicates emit
  an explicit exit code rather than relying on output (`Test-Path` prints `False`
  and exits `0`).
- **`$ProgressPreference = 'SilentlyContinue'`.** With stderr redirected - which
  it always is over an SSH exec channel - Windows PowerShell serialises every
  progress record as CLIXML onto stderr, and `-UseBasicParsing` does not suppress
  it. Measured on the real CLI artifact (9.5 MB): default progress took 13,125 ms
  and pushed **342 KB of CLIXML** back over the channel; with progress silenced,
  844 ms and zero stderr. A 15x cost, paid on exactly the slow first connect §12
  worries about. This belongs in the envelope rather than the install payload,
  because progress records fire for unrelated cmdlets too.
- **Native executables propagate their own exit code.** `$ErrorActionPreference`
  governs cmdlets and does *not* turn a failing `.exe` into a PowerShell error,
  so any payload invoking a native binary ends with `exit $LASTEXITCODE`.
  Without this a failed `--version` check reports success.
- `[Console]::OutputEncoding` pinned to UTF-8, since the transport decodes UTF-8.
- Windows PowerShell can emit **CLIXML** on redirected stderr; it is decoded into
  readable text, not discarded.

Base64 doubles the payload, and UTF-16LE doubles it again, so a payload costs
roughly 2.67 wire characters per source character against `cmd.exe`'s
8191-character command line. Install is the only sequence that comes close, and
it is therefore issued as two executions - boundary, then download - measured at
2930 and 4322 wire characters. `WindowsRemotePlatform` tests assert every
generated command stays under 8000. If a payload ever approaches the limit the
correct response is to split the operation into several executions, not to build
a chunked script-upload mechanism.

### 5.3 Operation mapping

| Operation | PowerShell |
|---|---|
| `isExecutableFile` | `Test-Path -PathType Leaf` + explicit `exit` |
| `touchFile` | `(Get-Item -LiteralPath …).LastWriteTime = Get-Date` |
| `versionCheck` | invoke the binary, `exit $LASTEXITCODE` |
| `pruneOldClis` | enumerate, sort by `LastWriteTime`, skip the newest `<keep>`, delete the rest **per-item best-effort** |

`pruneOldClis` is the one operation that must not honour the envelope's
`ErrorActionPreference = 'Stop'`. A naive
`… | Select-Object -Skip <keep> | Remove-Item -Force` pipeline raises a
terminating error on the first locked binary and abandons every candidate after
it - measured with six commit-keyed binaries and `keep = 2`, with the fourth
running: exit code 1, and two binaries that should have been deleted survived
permanently, leaking ~10 MB per desktop build thereafter.

This is reachable in the design's own steady state, not a corner case: §4 makes
the supervisor long-lived, so it holds its own (older, commit-keyed) binary
mapped while the desktop rotates builds. The `touchFile` mtime guard does not
help - setting `LastWriteTime` on a running executable succeeds, so prune runs
anyway. POSIX has no equivalent problem: `rm` of a running binary succeeds, and
the command is deliberately written as `xargs -I{} rm -f -- {} 2>/dev/null; true`
and invoked with `ignoreExitCode`.

The payload therefore deletes each candidate individually with the error
suppressed and ends with `exit 0`, matching the POSIX best-effort contract.

### 5.4 CLI install

The Windows CLI artifact is a **`.zip`**, so the POSIX `curl … \| tar xz` pipeline
has no analogue:

| | Linux/macOS | Windows |
|---|---|---|
| Artifact | `vscode_cli_<os>_<arch>_cli.tar.gz` | `vscode_cli_win32_<arch>_cli.zip` |
| Binary | `code-insiders` | `code-insiders.exe` |
| Executable bit | `chmod +x` | not applicable |

Install runs as two executions, since one payload carrying both would approach
the command-line limit of §5.2:

1. **Boundary.** Create the install root and restrict it (§7.2).
2. **Download.** Create a temp directory beneath the protected root, download
   into it (`Invoke-WebRequest -UseBasicParsing -OutFile`), `Expand-Archive
   -Force`, publish, remove the temp directory. The archive contains exactly one
   flat entry, `code-insiders.exe`, so nothing has to be flattened.

**Publication is policy-driven.** `installCli` takes a `CliPublishPolicy`, and
both platforms honour the same two values:

| Policy | Destination | Windows | POSIX |
|---|---|---|---|
| `immutable` | commit-keyed | `Move-Item` without overwrite | `mv -n` |
| `replaceable` | dev build | `File.Replace`, failing loudly | `mv -f` |

A commit-keyed destination is keyed on the build it contains, so an existing
file *is* the same build: rename into place without overwrite and treat
"destination exists" as a concurrent installer having won. A dev-build
destination carries no such guarantee - the caller reaches install only after
the existing binary failed `versionCheck` - so publication must overwrite and
must fail loudly if it cannot. Silently keeping a binary already known not to
run only defers the failure to a less explicable place.

`[System.IO.File]::Replace` is the overwriting primitive. It renames the
destination aside rather than unlinking it, so - measured against a running copy
of `ping.exe` - it succeeds on a mapped executable image, replaces the content,
and leaves the running process alive; it also never leaves a window with no
destination. It carries the *replaced* file's DACL forward, so publication is
followed by `icacls <dest> /reset`, which re-inherits the install root's DACL
(§7.2). PowerShell binds a bare `$null` third argument to `''`, failing with
"The path is not of a legal form", so the payload passes `[NullString]::Value`.

`Move-Item -Force` is unusable as the overwriting primitive: it deletes then
moves, so there is a window with no destination, and it fails outright on a
mapped destination - measured, raising `Cannot create a file when that file
already exists` and leaving both files in place.

The loose path re-runs `versionCheck` after installing, so a binary that still
does not run surfaces as a stated error rather than a downstream failure.

**Naming.** The extension belongs to the *file*, not the archive stem, so the
commit-keyed name is `code-insiders-<40hex>.exe` - never
`code-insiders.exe-<40hex>`. `cliArchiveName` returns the stem and the platform
appends its own extension, keeping construction and parsing symmetrical.

### 5.5 Paths

Paths are built from `$env:USERPROFILE` with backslash separators. The
`validateShellToken` / `validateCommit` guards apply unchanged and remain
security-critical.

### 5.6 The supervisor must survive the exec channel

This is the one change without which nothing else on Windows matters.

The supervisor is spawned with `CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW`
(`cli/src/util/command.rs:181`). Neither flag escapes a **Windows Job Object**.
Win32-OpenSSH runs each exec channel's process tree in a job, and the foreground
`code agent host` exits at readiness - so the job can be torn down and take the
detached supervisor with it, moments after it printed its endpoint.

The supervisor spawn therefore becomes job-aware, adding
`CREATE_BREAKAWAY_FROM_JOB`. The repository already has exactly this pattern for
the server child, including a probe for whether breakaway is allowed
(`cli/src/tunnels/code_server.rs:641-649,942-950`) - the probe is a test spawn of
`cmd /C echo ok` carrying the flag, since `CreateProcess` fails with access
denied when the job lacks `JOB_OBJECT_LIMIT_BREAKAWAY_OK`.

**This is measured, not inferred.** Against a Win32-OpenSSH *exec* channel:

```
in_job=True   limit_flags=0x00002800
flag_breakaway_ok=True   flag_silent_breakaway_ok=False   flag_kill_on_job_close=True
```

and, after the channel closed, of two children spawned `DETACHED_PROCESS` with
their std handles on `NUL`:

```
child_plain      DEAD    <- reaped with the job
child_breakaway  ALIVE
```

The same result holds for the real CLI, as an A/B against one Windows 11 remote,
launching through `buildLaunchCommand` exactly as the desktop does:

| Build | While the channel is open | After it closes |
|---|---|---|
| With `CREATE_BREAKAWAY_FROM_JOB` | supervisor running | running, listening, accepts a connection |
| Flag removed, otherwise identical | already gone | gone; port dead |

Both builds print the endpoint banner, so the failure is invisible to anything
that only watches for readiness - the desktop would connect to a supervisor that
no longer exists.

Two consequences follow. **Detachment alone does not save a process** - the plain
child was fully detached and still died, so redirecting stdio and daemonizing, as
the supervisor already does, is not sufficient. And because
`SILENT_BREAKAWAY_OK` is clear while `BREAKAWAY_OK` is set, the flag has to be
passed explicitly; nothing happens automatically.

The job permits breakaway, so this is the two-line change and no fallback is
required. Should a remote ever be configured with breakaway denied, the probe
above returns false and the correct response is to fail the connection with an
actionable error rather than let the agent host die seconds later for no visible
reason.

This failure mode is invisible to unit tests and to a local PowerShell run: it
requires a real Win32-OpenSSH exec channel. §12 verifies it first, because every
other Windows behaviour depends on the supervisor still being alive.

---

## 6. Detection and ordering

Platform detection runs immediately after the SSH connection is established and
before any managed operation, because those operations are platform specific.

1. **POSIX probe** - a single `uname -s -m` (one round trip, down from two).
2. **Windows probe** - only if the POSIX probe fails or is unparseable. An
   encoded payload emits `VSCODE_REMOTE_OS=win32 VSCODE_REMOTE_ARCH=<x64|arm64>`.
   Architecture comes from `PROCESSOR_ARCHITEW6432 ?? PROCESSOR_ARCHITECTURE` so
   a 32-bit host process cannot mis-report an x64 machine.
3. **Neither** - fail with the unsupported-platform error, quoting both probes'
   output so the failure is diagnosable.

POSIX is probed first so the pre-existing path costs no extra round trip. The
probes themselves are the one exception to platform-owned commands: they run
before a platform exists, which is what they are for.

The Windows probe is **marker-based** (`VSCODE_REMOTE_OS=`) rather than
positional, because a remote login shell may print arbitrary banner output on
every channel - a machine-wide PowerShell profile is enough to prepend dozens of
lines, and the client cannot suppress it (`sshd` runs `DefaultShell` before it
sees our command, so a client-side `-NoProfile` never reaches the outer shell).
Detection therefore scans for its marker instead of trusting the first token.

**`remoteAgentHostCommand`** assumes POSIX and skips detection. This dev-only
escape hatch (`chat.sshRemoteAgentHostCommand`) points at a locally-built agent
host; multi-platform override support is deliberately out of scope. The path
still resolves a concrete `PosixRemotePlatform` and renders its launch through
`buildRawLaunchCommand`, so no shell syntax leaks into the service. Pointing it
at a Windows remote fails with a raw `bash` error, so the setting description
states the limitation and that failure shape is surfaced as a targeted hint.

---

## 7. Security

### 7.1 Model

This work introduces no new security model; it extends the existing one to
Windows, where it is not currently enforced.

- **The connection token** is the bearer credential authenticating clients to the
  agent host over loopback (`LoopbackAuth::Token`). The agent host executes agent
  operations, so possessing the token confers the ability to act as that user.
- **The trust boundary is the user account.** The local endpoint serves
  "processes running as the same user" (`LOCAL_ENDPOINT.md:4`), and the CLI
  enforces that on POSIX with mode `0600` files in a `0700` directory.
- **The adversary in scope is another unprivileged user account on the same
  remote machine.** Out of scope: a compromised remote host, and anyone with root
  or Administrator rights - both already defeat the POSIX protections.

The obligation is parity: token-bearing files must be no more readable on Windows
than the `0600`/`0700` the POSIX path enforces.

### 7.2 Obligations

- **Windows has no such protection today.** Every permission call in the writers
  is gated `#[cfg(not(windows))]` (`cli/src/tunnels/agent_host_metadata.rs:70-88`,
  `mint_connection_token`), so the token file inherits whatever the parent grants
  - and `~/<serverDataFolderName>` is created by whichever tool got there first.
  Fixed in the **Rust writers**, since the CLI is the writer, by applying a
  protected DACL before atomic replacement, and by protecting the containing
  directory as the POSIX `0700` does.
  The DACL is set through `SetNamedSecurityInfoW` with
  `PROTECTED_DACL_SECURITY_INFORMATION` and read back through
  `GetNamedSecurityInfoW`, rather than by shelling out to `icacls`. That matters
  for correctness, not tidiness: `icacls` reports results in the machine's
  display language, so any check that greps its output is unreliable off
  English, and `/inheritance:r` removes inherited entries on some hosts while
  converting them to explicit ones on others. The API is deterministic and
  locale-independent.
  The verifier enumerates the **whole DACL** and requires every allow entry to
  name the owner, `SYSTEM` or `Administrators`. Scanning only for well-known
  "everyone-ish" SIDs would miss an explicit grant to a specific account, which
  is exactly the case that matters. A `NULL` DACL grants everyone access and is
  reported as unprotected.
- **Both files are token-bearing.** The metadata file carries `connection_token`
  in the same struct as the separate token file, so both are covered.
- **Legacy files are repaired before they are trusted, not merely on write.**
  `mint_connection_token` returns an existing token before rewriting it
  (`cli/src/commands/agent_host.rs:720-725`), but more importantly the **reuse
  path returns before either writer runs**: a supervisor started before this
  change keeps its inherited ACL for as long as it lives, and repairing only in
  the writers would never reach it. Reuse therefore validates the ACLs of the
  metadata and token files first, and refuses to reuse - reporting an actionable
  error - when they are readable beyond the owner. Otherwise a world-writable
  legacy lockfile could also redirect the desktop to an endpoint chosen by
  another local account.
- **The validator must resolve the *supervisor's* token file, not its own.**
  The metadata lives under a canonical agent-host root that ignores
  `--cli-data-dir` (`cli/src/state.rs`), but the token is written under
  `--cli-data-dir` - and `--connection-token-file` can place it anywhere at all
  (`cli/src/commands/args.rs:249-254`). Recording only the launcher root is
  therefore still insufficient: the validator could inspect a stale default-root
  file, pass, and never see the live supervisor's token.
  The lockfile records the **exact token-file path** in `connectionTokenFile`.
  For metadata predating that field: a tokenless supervisor has no token file, so
  validating the metadata ACL alone is correct and reuse proceeds; a token-bearing
  one is matched against a finite set of known legacy roots, requiring both an
  exact token-content match and a secure ACL, and only an unresolved case produces
  the actionable restart error. A blanket refusal would strand users behind a
  supervisor that §4 forbids the desktop from killing.
  A token found under a broad ACL is **not** reused after tightening it - it may
  already have leaked; the supervisor is refused instead. The same rule governs
  minting: an existing token file is only reused when it was *already*
  protected, and a token that was readable by other accounts is replaced rather
  than adopted. A caller-supplied `--connection-token-file` is held to the same
  bar and refused when it is readable by other accounts; it is not tightened on
  the caller's behalf, because the path is theirs and tightening cannot un-leak
  a token that was already exposed.
  `classify_agent_host_lockfile` performs this check and returns
  `RefuseInsecure { reason }`, which every caller surfaces: reuse and spawning a
  rival are both wrong while an untrusted supervisor holds the port. The
  remediation names the offending file and asks for it to be removed. It does
  **not** suggest `code agent kill`, which reads its target PID from the very
  lockfile just judged untrustworthy.
- **The install boundary is protected.** We execute the binary we install, so
  another local account with modify rights on a permissive install root could
  replace it between install and launch; `--version` proves it runs, not that it
  is ours. One protected installation boundary covers the root, the extraction
  temp directory and the final executable.
  On Windows the install root is restricted before anything is written into it,
  to `S-1-3-4` (`OWNER RIGHTS`, resolving to whoever owns the object), `S-1-5-18`
  (`SYSTEM`) and `S-1-5-32-544` (`Administrators`). The last two are parity with
  POSIX, where root already reads a `0600` file. The grant is inheritable -
  `(OI)(CI)F` - so the extraction directory and the published binary, created
  beneath the root, are covered by that one boundary; publication additionally
  runs `icacls <dest> /reset` because `File.Replace` carries the replaced file's
  DACL forward (§5.4).
  Principals are named by SID, never by account name: these machines are commonly
  joined such that the name is `AzureAD\user@example.com`, which does not survive
  interpolation into a command line. `/inheritance:r` removes inherited entries on
  some hosts and converts them to explicit ones on others, so the payload sweeps
  every surviving foreign SID and re-reads the DACL to confirm none is left. That
  read goes through `System.Security.AccessControl` rather than `Get-Acl`, because
  `Microsoft.PowerShell.Security` is not loadable on every host - measured,
  `CouldNotAutoloadMatchingModule`.
  A host that cannot apply the boundary **fails the install**. This is a security
  promise, and degrading silently is worse than refusing: the alternative is
  executing a binary any local account could have swapped.
  On POSIX the same boundary is stated rather than left to the ambient umask:
  `chmod 700` on the install root and on the published binary. The CLI applies the
  same rule to its own metadata and token files: `restrict_to_owner` sets mode
  `0600` on a file and `0700` on a directory instead of assuming how the caller
  created it, so a file predating the boundary is repaired rather than trusted.
- **Testing requires native Windows Rust tests.** `cargo test` runs only on Linux
  (`.github/workflows/pr-linux-cli-test.yml`). Focused ACL tests are added to a
  Windows CLI job, asserting inheritance is disabled and no broad ACEs are
  present, exercised against a parent granting `Everyone`.

### 7.3 Diagnostics must not leak secrets

Raw wire commands never reach errors, logs or telemetry, at any level. On Windows
the command is an opaque base64 blob - useless to a reader and able to carry
secrets - and on POSIX it is a shell string with the same exposure. Trace level is
no exception: a level that is routinely enabled to diagnose a connection failure
is exactly where the payload would be captured and pasted into an issue.

`ISshExec` therefore takes a required `description`: a short, localized,
secret-free name for the operation, drawn from the `sshOperation` table. A nonzero
exit reads `Could not <description> on the remote (exit code <n>).`, followed by
the remote's stderr when there is any, and the launch path logs the description in
place of the command. Streamed CLI output continues through `redactToken`. Because
the desktop no longer writes metadata (§4), no desktop-issued command carries the
connection token at all.

---

## 8. Invariants

- **I1.** No shell syntax outside `node/remotePlatform/` on the SSH path. WSL
  composes its own bootstrap script and drives a `wsl.exe` child; it is out of
  scope (§9).
- **I2.** Every post-detection operation on a Windows remote is an
  `-EncodedCommand` invocation.
- **I3.** No operation other than detection itself runs before the platform is
  resolved.
- **I4.** On the managed path the desktop never writes agent host metadata and
  never terminates a remote process. The `remoteAgentHostCommand` override is
  exempt: it launches an arbitrary process that implements none of this protocol,
  and is dev-only (§6).
- **I5.** Raw wire commands never reach logs, errors or telemetry; secrets never
  appear in either.
- **I6.** Remote-supplied paths are validated by `parseFallbackCliPath` before
  re-entering a command.

---

## 9. Out of scope

- **WSL migration.** WSL drives a `wsl.exe` child and composes one bootstrap
  script rather than issuing discrete SSH commands. It keeps working because
  `IRemotePlatform` re-exports the primitives it imports; folding it into the
  abstraction is a separate change.
- **Multi-platform `remoteAgentHostCommand`** (§6).
- **Desktop-side agent host reuse without invoking the CLI.** A read-only
  metadata fast path would avoid several round trips per reconnect; it is not
  worth a second copy of the CLI's lifecycle rules.
- **Restarting a remote agent host from the desktop.** `--replace` exists in the
  CLI, but no service API exposes restart, and running it over the *current* SSH
  client would kill the supervisor, close the relay, and dispose the client that
  issued the command. Doing this properly needs a separate connection and a
  defined sequence. "Reconnect" replaces the relay only, and server update goes
  through the existing upgrade RPC, so nothing regresses by leaving this out.
- **PID-reuse hardening inside the CLI.** `classify_agent_host_lockfile` treats
  any live PID as the supervisor (`cli/src/tunnels/agent_host.rs`), so a recycled
  PID can be reused or, under `--replace`, killed. The desktop's own liveness
  check was equally weak, so this design depends on an existing limitation rather
  than introducing one - but it is now the only such check, and worth fixing in
  the CLI separately.
- **Serialising concurrent first connects.** Classification and spawn are not
  interlocked, so two simultaneous first connects can each spawn a supervisor and
  race on the metadata write, which is only warned about on failure. Pre-existing
  and CLI-internal; a startup lock belongs with the PID-reuse fix.
- **Capability gating of unsupported launchers.** A fallback CLI is accepted on a
  bare `--version` success, so a sufficiently old binary need not implement the
  machine-readable output §4 relies on. The desktop must degrade to the human
  banner and report clearly rather than assume; a version or capability gate is
  the durable fix.

---

## 10. Test strategy

Existing SSH tests drive a fake executor with scripted responses and assert on
the literal command strings issued, so a Windows connect flow is testable
end-to-end with no Windows machine.

| Layer | What it covers |
|---|---|
| **Operation tests** | Per platform, assert emitted strings and returned values against the fake executor, snapshot-style per operation group. |
| **Envelope tests** | Payloads round-trip to the intended PowerShell for inputs containing `'`, `"`, `` ` ``, `$`, `;` and newlines; native exit codes propagate; CLIXML on stderr is decoded. |
| **Detection tests** | POSIX outputs map correctly; unknown output errors; the Windows probe runs only when the POSIX probe fails; no managed operation precedes resolution. |
| **Lifecycle tests** | The desktop issues no metadata write and no kill; a relay failure surfaces a retryable error and destroys nothing. |
| **Remote-SSH contract tests** | The install root is shared with Remote-SSH: pin the Windows filename shape (`code-insiders-<40hex>.exe`), the cleanup and fallback globs, and legacy paths. Cleanup must never match beyond exact quality + 40-hex + extension. |
| **Regression** | The existing suite, plus WSL and local-lockfile suites, which share the refactored module. |

The fake executor fails on an unexpected command and on an exhausted response
queue, so a test cannot pass while issuing a command nobody scripted.

**Executing the payloads.** Unit tests prove we emit what we intended, not that
the PowerShell is valid, so decoded payloads are executed against real
`powershell.exe` on a Windows CI agent, through `cmd.exe /c` as well as directly.
Two claims are only meaningful when executed and are covered there: the install
boundary - asserted by reading back the DACL of the root, the extraction
directory and the published binary beneath a parent granting `Everyone` - and the
publish policies, including replacement of a destination that is a *running*
executable image. End-to-end verification against a real remote is the §12 manual
checklist; there is no automated substitute, because CI has no SSH-reachable
Windows host and a suite that only runs on one machine decays silently.

---

## 11. Diagnostics and strings

A Windows remote is a first-time path, so failures must say what went wrong and
where. Each stage produces a distinct, localized message rather than a raw shell
error:

| Stage | Surfaced as |
|---|---|
| Detection | Remote OS could not be determined; both probes' output quoted |
| PowerShell missing | `powershell.exe` not found on the remote |
| Download / extract | CLI download or unpack failed, with the URL but no secrets |
| Launch | Agent host exited before becoming ready |

Any failing remote command names its operation - `sshOperation` holds the
localized descriptions - and never its payload (§7.3).

All new user-facing strings go through `nls.localize`, including the POSIX-only
hint for `remoteAgentHostCommand` (§6). The
`chat.sshRemoteAgentHostCommand` setting description gains that limitation.

---

## 12. Validation checklist

Run against a real Windows 11 remote (§10).

### Preparing the remote

A locally built CLI is unsigned and has no cloud reputation, so a managed
Windows host running Microsoft Defender **Attack Surface Reduction** refuses to
execute it. `CreateProcess` fails with a bare `Access is denied`, no output and
no exit code. Confirm the cause in the remote's
*Microsoft-Windows-Windows Defender/Operational* log: event **1121** names the
blocking rule. Shipped builds are signed and prevalent, so this affects
development only - do not add product code for it.

Grant the install root an ASR exclusion once, in an elevated shell on the
remote, matching `serverDataFolderName` from `product.json`:

```powershell
Add-MpPreference -AttackSurfaceReductionOnlyExclusions "$env:USERPROFILE\.vscode-server-oss"
```

Verify with `(Get-MpPreference).AttackSurfaceReductionOnlyExclusions`. Folder
exclusions are recursive, so commit-keyed binaries beneath it are covered.

### Checklist

1. **Supervisor survives the exec channel.** Connect, confirm the agent host is
   still running after the launching command has exited, and that the relay stays
   usable. This is §5.6 and is the first thing to check - every other item
   assumes it.
2. **First connect**, no CLI present: detection, download, extract, launch,
   session usable.
3. **Reconnect**: the CLI reuses its supervisor; no second one appears.
4. **Reuse reports the real endpoint**: a supervisor bound to a non-loopback or
   IPv6 address is dialled correctly, not assumed to be `127.0.0.1`.
5. **Default shell `cmd.exe`** and **default shell PowerShell** both work.
6. **Profile path containing a space and an apostrophe** installs and launches.
7. **Relay failure** with a healthy agent host leaves the supervisor running and
   surfaces a retryable error.
8. **ACL**: metadata and token files are owner-only, verified against a parent
   granting `Everyone`; a pre-existing insecure supervisor is refused with an
   actionable error rather than silently trusted. Verify with a **divergent
   `--cli-data-dir`** - reuse a supervisor started by `code tunnel` - so the
   validator is proven to resolve *that* supervisor's token file, not its own.
9. **Retention survives a locked binary**: with the running supervisor's own
   commit-keyed binary among the prune candidates, older ones are still removed
   and the operation reports success.
10. **Concurrent install**: two connects installing the same commit at once both
    end with a working binary and no error.
11. **Failure output** carries no secrets and no raw wire commands, at every log
    level including trace; a failed operation names itself instead.
12. **Install boundary**: with the profile directory granting `Everyone` full
    control, the install root, the extraction directory and the published binary
    still grant only the owner, `SYSTEM` and `Administrators`, and a host where
    the restriction cannot be applied refuses the install rather than proceeding.
13. **Broken dev binary is replaced**: with a non-commit-keyed CLI present that
    fails `--version`, connect installs over it and the connection succeeds; if
    the replacement still fails `--version`, the error says so.
14. **Slow first connect** does not hit the desktop timeout while the CLI is
    still downloading, and the install does not flood stderr with progress
    CLIXML.
15. **POSIX regression**: a Linux remote still connects and reconnects.
