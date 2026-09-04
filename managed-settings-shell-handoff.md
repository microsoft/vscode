# Managed Settings Shell Permissions Handoff

> Working handoff document. Keep this file uncommitted unless explicitly requested otherwise.

## Session

- Session ID: `d69c2ba1-eb70-464e-8d8f-9b28503f373c`
- VS Code workspace: `/Users/anthonykimmac2026/Desktop/vscode`
- Runtime workspace: `/Users/anthonykimmac2026/Desktop/copilot-agent-runtime`

## Objective

Understand enterprise managed settings across the Copilot runtime, public SDK, and VS Code Agent Host, with a focus on shell permission coverage.

## Architecture

- `github/copilot-agent-runtime` owns the managed-settings schema, rule grammar, composition, and enforcement.
- `github/copilot-sdk` transports managed settings and permission requests between hosts and the runtime.
- VS Code Agent Host enables runtime managed settings, presents permission UI, and contains a temporary bridge for selected legacy VS Code settings.

The managed permissions object is:

```ts
{
	disableBypassPermissionsMode?: string;
	deny?: string[];
	ask?: string[];
	allow?: string[];
}
```

Supported managed rule families:

- `Shell(...)`
- `Read(...)`
- `Edit(...)` / `Write(...)`
- `Domain(...)`

There are no managed `Tool(...)`, `MCP(...)`, `Factory(...)`, or `Hook(...)` selectors.

## Tool-to-Permission Mapping

Managed rules target runtime permission request families, not literal tool names:

| Runtime tools | Permission request | Managed rule |
|---|---|---|
| `view` | `read` | `Read(...)` |
| `create`, `edit`, `str_replace_editor`, `apply_patch` | `write` | `Edit(...)` / `Write(...)` |
| `bash`, `powershell`, `local_shell` | `shell` | `Shell(...)` |

Direct file tools therefore receive managed path enforcement. File effects performed inside a shell command remain part of a `shell` request.

## Script Safety

VS Code enables the runtime shell analyzer after create/resume:

```ts
session.rpc.options.update({ enableScriptSafety: true });
```

VS Code implementation:

- [`CopilotSessionLauncher._applyScriptSafety`](./src/vs/platform/agentHost/node/copilot/copilotSessionLauncher.ts)

The standalone Copilot CLI also enables `enableScriptSafety`, but supplies it during its internal session construction. Managed settings do not automatically enable script safety. The runtime defaults the option to `false` when it is absent.

Runtime implementation at commit `13043126c93940d6c5968d510f2f156691b0fea7`:

- [Runtime script-safety switch](https://github.com/github/copilot-agent-runtime/blob/13043126c93940d6c5968d510f2f156691b0fea7/src/runtime/src/tools/shell_driver_host.rs#L3675-L3757)
- [Shell analyzer](https://github.com/github/copilot-agent-runtime/blob/13043126c93940d6c5968d510f2f156691b0fea7/src/runtime/src/tools_base/shell_safety.rs#L357-L368)
- [Current `SafetyAssessment`](https://github.com/github/copilot-agent-runtime/blob/13043126c93940d6c5968d510f2f156691b0fea7/src/runtime/src/tools_base/shell_safety.rs#L283-L295)
- [Shell permission payload](https://github.com/github/copilot-agent-runtime/blob/13043126c93940d6c5968d510f2f156691b0fea7/src/runtime/src/tools/shell_driver_shell.rs#L256-L275)
- [Managed permission preflight](https://github.com/github/copilot-agent-runtime/blob/13043126c93940d6c5968d510f2f156691b0fea7/src/runtime/src/permissions/orchestrator.rs#L2006-L2064)

With script safety disabled, the runtime returns a degenerate assessment with no paths or URLs and treats the full command as non-read-only.

With script safety enabled, the runtime produces facts including:

```ts
{
	commands: Array<{ identifier: string; readOnly: boolean }>;
	commandSegments: Array<{ identifier: string; fullCommandText: string }>;
	possiblePaths: string[];
	possibleUrls: Array<{ url: string }>;
	hasWriteFileRedirection: boolean;
	hasDangerousExpansion: boolean;
	canOfferSessionApproval: boolean;
}
```

The missing information is the access mode associated with each path. `possiblePaths` is a heuristic flat list and does not identify which path is read, written, both, or merely possible.

## Confirmed Managed-Policy Gap

Managed `Read(...)` and `Edit(...)` rules apply to direct file permission requests but not to equivalent file effects inside a shell request.

For example:

```jsonc
{
	"permissions": {
		"deny": [
			"Read(~/.ssh/**)",
			"Edit(/protected/**)"
		]
	}
}
```

The managed path rules do not currently provide equivalent enforcement for:

```bash
cat ~/.ssh/config
echo changed > protected/file
```

Other sandbox, path-approval, or content-exclusion controls may still prompt or block these operations. The gap is specifically that the managed `Read(...)` or `Edit(...)` verdict is not applied to the corresponding shell effect.

Do not translate managed path rules into generated `Shell(...)` rules. The runtime should evaluate the independent effects and combine their verdicts restrictively.

## Proposed Runtime Direction

Extend the shell analyzer to preserve structured path effects:

```rust
struct ShellPathEffect {
	path: String,
	read: bool,
	write: bool,
}
```

Then:

1. Classify statically identifiable shell effects:
   - `cat input.txt`: read
   - `echo x > output.txt`: write
   - `sed -i ... file.txt`: read and write
2. Resolve relative targets against the session CWD.
3. Evaluate read effects with managed `Read(...)`.
4. Evaluate write effects with managed `Edit(...)` / `Write(...)`.
5. Combine path verdicts with the managed `Shell(...)` verdict:
   - Any deny blocks.
   - Any ask requires human, one-time approval.
   - An allow in one family cannot override a denial in another.
6. Revalidate policy and resolved targets after an interactive prompt.

The structured effects can remain internal to the runtime. A public SDK field is optional for diagnostics and is not required for runtime enforcement.

## Filed Issues

- [github/copilot-agent-runtime#18812](https://github.com/github/copilot-agent-runtime/issues/18812): apply managed `Edit(...)` rules to shell write effects
- [github/copilot-agent-runtime#18882](https://github.com/github/copilot-agent-runtime/issues/18882): apply managed `Read(...)` rules to shell read effects

Both issues are assigned to `anthonykim1`.

## VS Code Prior Art

VS Code already performs write-side analysis for terminal auto-approval:

- [`TreeSitterCommandParser.getFileWrites`](./src/vs/workbench/contrib/terminalContrib/chatAgentTools/browser/treeSitterCommandParser.ts)
- [`CommandLineFileWriteAnalyzer`](./src/vs/workbench/contrib/terminalContrib/chatAgentTools/browser/tools/commandLineAnalyzer/commandLineFileWriteAnalyzer.ts)

It detects:

- Bash and PowerShell write redirections
- Command-specific writes such as `sed -i`
- Relative targets resolved against terminal CWD
- Writes outside configured workspace boundaries

This VS Code behavior only decides whether to skip or show a confirmation. It is not enterprise managed-policy enforcement. VS Code does not currently produce a general typed read/write effect list or perform managed `Read(...)` / `Edit(...)` matching.

## Important Boundary

VS Code has an experimental PTY-backed terminal override. It is disabled by default and reaches the runtime as `custom-tool`, not `shell`. Managed `Shell(...)` rules therefore do not automatically apply to that override. This is a separate Agent Host/runtime integration issue from the built-in shell read/write-effect work.

## Other Useful Follow-Ups

- Decide whether `enableScriptSafety` should be automatic whenever managed permissions are enabled.
- Expose `enableScriptSafety` atomically in public SDK create/resume configuration rather than requiring a post-create RPC update.
- Investigate managed selectors for custom tools, MCP calls, factories, and hooks.
- Reverify managed workspace path resolution tracked by microsoft/vscode#329955.
- Reverify stale managed-policy reconciliation tracked by microsoft/vscode#328879.
- Explore effective-policy UI using `session.managed_settings_resolved` and `session.managed_settings_enforced`.

## Work Performed

- Investigation only; no product source files were changed.
- No builds or tests were run.
- The two runtime GitHub issues above were created and assigned.

