/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Generators for the shell init scripts sourced before every built-in shell
 * tool command (SDK `ShellOptions.initScripts`).
 *
 * The SDK shell tool spawns a fresh, no-rc shell per command
 * (`bash --norc --noprofile -c` / `pwsh -NoProfile -NoLogo -NonInteractive
 * -Command`), so nothing the user's interactive shell would set up is present.
 * The workbench resolves what a session needs, generates the script *text*
 * here, and pushes it as session config; the agent host materializes the text
 * to disk and registers the paths with the SDK.
 *
 * Three runtime behaviors constrain every script produced here:
 *
 * 1. Only the script's **final** exit status is observed. A nonzero status makes
 *    the runtime print a failure notice before *every* subsequent command, so
 *    each script must end with a statement that always succeeds.
 * 2. Bash init-script **stderr is discarded**; diagnostics must go to stdout.
 * 3. Scripts are sourced *into* the command shell, so `exit`, `exec`, or a
 *    failure under `set -e` inside sourced content can still kill the command.
 *    That is unavoidable for user-authored content and is documented for the
 *    profile snippet.
 */

/** A shell targeted by {@link IShellInitSnippet}; mirrors the SDK's `ShellInitScriptShell`. */
export type ShellInitSnippetShell = 'bash' | 'powershell';

/**
 * One host-generated init script, carried as text so the producer never needs
 * filesystem access and the agent host stays in control of where files land.
 */
export interface IShellInitSnippet {
	/** Built-in shell this snippet applies to. */
	readonly shell: ShellInitSnippetShell;
	/** Script contents, sourced before each built-in shell command. */
	readonly script: string;
	/** Provenance, used for the generated filename and for logging. */
	readonly source: string;
}

/** Ordering prefix for the generated files; profile setup must precede activation. */
export const enum ShellInitSnippetSource {
	/** Loads the user's shell profile / rc so hooks and shell functions exist. */
	UserProfile = 'user-profile',
	/** Activates the selected Python environment. */
	PythonEnv = 'python-env',
}

/**
 * Marker-delimited region replayed from a bash rc file when sourcing it did not
 * take effect.
 *
 * Stock rc files on Debian/Ubuntu/Fedora begin with an interactivity guard
 * (`case $- in *i*) ;; *) return;; esac`), and tools such as conda *append*
 * their init block below it. Sourcing such a file from a non-interactive shell
 * therefore returns before the block is reached. Replaying just the marked
 * region recovers the shell functions those blocks define.
 *
 * `probe` keeps the replay idempotent: it runs only when the region has not
 * already taken effect.
 */
interface IShellInitRcRegion {
	/** Exact rc line that opens the region. */
	readonly startMarker: string;
	/** Exact rc line that closes the region. */
	readonly endMarker: string;
	/** Command name whose absence means the region has not taken effect. */
	readonly probe: string;
}

/**
 * Regions replayed from bash rc files. Conda is the only shipped entry: it is
 * the dominant hook-based Python environment manager, and `conda activate` is a
 * shell *function*, so it cannot be recovered from inherited environment
 * variables the way `PATH`-based setups can.
 */
const BASH_RC_REGIONS: readonly IShellInitRcRegion[] = [
	{
		startMarker: '# >>> conda initialize >>>',
		endMarker: '# <<< conda initialize <<<',
		probe: 'conda',
	},
];

/** Quotes a value for use inside a single-quoted POSIX shell string. */
function toBashSingleQuoted(value: string): string {
	return `'${value.replaceAll(`'`, `'\\''`)}'`;
}

/**
 * Wraps `body` in a PowerShell non-interpolating here-string.
 *
 * Throws when the payload contains a line that would terminate the here-string
 * early, which is the only sequence `@'...'@` cannot represent.
 */
function toPowerShellHereString(value: string): string {
	if (value.split(/\r?\n/).some(line => line.trimEnd() === `'@`)) {
		throw new Error(`Cannot embed a PowerShell here-string payload containing a line equal to "'@"`);
	}
	return `@'\n${value}\n'@`;
}

/** Escapes a value for a single-quoted PowerShell string. */
function toPowerShellSingleQuoted(value: string): string {
	return `'${value.replaceAll(`'`, `''`)}'`;
}

/**
 * Wraps generated PowerShell so a failure is reported without aborting the
 * remaining scripts or the user's command.
 *
 * The runtime dot-sources init scripts under `$ErrorActionPreference = 'Stop'`,
 * so the preference is saved and restored around the body. The trailing
 * `$global:LASTEXITCODE = 0` guarantees a successful final status, clearing any
 * nonzero native exit code the body may have left behind.
 */
function wrapPowerShell(header: string, body: string, failureMessage: string): string {
	return [
		`# ${header}`,
		`$__vscodePreviousErrorActionPreference = $ErrorActionPreference`,
		`try {`,
		`\t$ErrorActionPreference = 'Stop'`,
		body,
		`} catch {`,
		`\tWrite-Output ${toPowerShellSingleQuoted(failureMessage)}`,
		`} finally {`,
		`\t$ErrorActionPreference = $__vscodePreviousErrorActionPreference`,
		`}`,
		`$global:LASTEXITCODE = 0`,
		``,
	].join('\n');
}

/**
 * Builds the Python activation snippets for a session.
 *
 * `activation` is the ready-to-eval command string published by the Python
 * environment extension (for example ` source /repo/.venv/bin/activate`). It is
 * embedded by value: the SDK has no per-session shell `env`, so the variable it
 * normally arrives in cannot be read from inside the shell tool.
 *
 * Returns an empty array for absent or blank input so callers can pass the
 * result straight through to clear any previously applied scripts.
 */
export function createPythonActivationSnippets(shell: ShellInitSnippetShell, activation: string | undefined): IShellInitSnippet[] {
	if (!activation?.trim()) {
		return [];
	}
	const failureMessage = 'copilot shell init: Python activation failed; continuing without the selected environment.';
	const header = 'Generated by VS Code from the selected Python environment.';
	if (shell === 'powershell') {
		return [{
			shell,
			source: ShellInitSnippetSource.PythonEnv,
			script: wrapPowerShell(header, `\tInvoke-Expression ${toPowerShellHereString(activation)}`, failureMessage),
		}];
	}
	return [{
		shell,
		source: ShellInitSnippetSource.PythonEnv,
		script: [
			`# ${header}`,
			`if ! builtin eval ${toBashSingleQuoted(activation)}; then`,
			`\tprintf '%s\\n' ${toBashSingleQuoted(failureMessage)}`,
			`fi`,
			`builtin true`,
			``,
		].join('\n'),
	}];
}

/** Emits the guarded replay of one marker-delimited rc region. */
function bashRcRegionReplay(region: IShellInitRcRegion): string[] {
	const variable = `__vscode_rc_region`;
	// `sed` reads the rc file fresh on every command, matching the runtime's
	// per-command re-sourcing, so no rc content is ever captured at generation
	// time and allowed to go stale.
	const extract = `sed -n ${toBashSingleQuoted(`/^${region.startMarker}$/,/^${region.endMarker}$/p`)} "$HOME/.bashrc" 2>/dev/null`;
	return [
		`\tif ! builtin type ${region.probe} >/dev/null 2>&1; then`,
		`\t\t${variable}="$(${extract})"`,
		`\t\tif [ -n "$${variable}" ] && ! builtin eval "$${variable}"; then`,
		`\t\t\tprintf '%s\\n' ${toBashSingleQuoted(`copilot shell init: ${region.probe} initialization failed; continuing.`)}`,
		`\t\tfi`,
		`\t\tbuiltin unset ${variable}`,
		`\tfi`,
	];
}

/**
 * Builds the snippets that load the user's shell profile, so hooks and shell
 * *functions* — which are never exported and therefore cannot arrive through
 * inherited environment variables — exist in the command shell.
 *
 * Bash sources `~/.bashrc` best-effort and then replays any
 * {@link BASH_RC_REGIONS} that did not take effect, which is what makes this
 * work despite the interactivity guard in stock rc files.
 *
 * `~/.zshrc` is deliberately never sourced: it is zsh syntax and the tool shell
 * is always bash. PowerShell dot-sources the current user's profiles, which
 * have no interactivity-guard convention and so need no replay.
 */
export function createUserProfileSnippets(shell: ShellInitSnippetShell): IShellInitSnippet[] {
	if (shell === 'powershell') {
		const body = [
			`\tforeach ($__vscodeProfile in @($PROFILE.CurrentUserAllHosts, $PROFILE.CurrentUserCurrentHost)) {`,
			`\t\tif ($__vscodeProfile -and (Test-Path -LiteralPath $__vscodeProfile)) {`,
			`\t\t\t. $__vscodeProfile`,
			`\t\t}`,
			`\t}`,
		].join('\n');
		return [{
			shell,
			source: ShellInitSnippetSource.UserProfile,
			script: wrapPowerShell(
				`Generated by VS Code: load the user's PowerShell profile for agent shell commands.`,
				body,
				'copilot shell init: loading the PowerShell profile failed; continuing.',
			),
		}];
	}
	return [{
		shell,
		source: ShellInitSnippetSource.UserProfile,
		script: [
			`# Generated by VS Code: load the user's bash rc for agent shell commands.`,
			`# Stock rc files return early in non-interactive shells, so after the`,
			`# best-effort source we replay managed blocks that did not take effect.`,
			`if [ -r "$HOME/.bashrc" ]; then`,
			`\tif ! builtin source "$HOME/.bashrc"; then`,
			`\t\tprintf '%s\\n' ${toBashSingleQuoted('copilot shell init: loading ~/.bashrc failed; continuing.')}`,
			`\tfi`,
			...BASH_RC_REGIONS.flatMap(bashRcRegionReplay),
			`fi`,
			`builtin true`,
			``,
		].join('\n'),
	}];
}

/** Restricts a snippet source to the characters used in generated filenames. */
export function sanitizeSnippetSource(value: string): string {
	return value.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 64);
}

/**
 * Validates a value received over the protocol before it is written to disk.
 * The agent host must not trust the shape of client-pushed session config.
 */
export function isShellInitSnippetArray(value: unknown): value is IShellInitSnippet[] {
	return Array.isArray(value) && value.every(entry => {
		if (!entry || typeof entry !== 'object') {
			return false;
		}
		const candidate = entry as Partial<IShellInitSnippet>;
		return (candidate.shell === 'bash' || candidate.shell === 'powershell')
			&& typeof candidate.script === 'string'
			&& candidate.script.length > 0
			&& typeof candidate.source === 'string'
			&& sanitizeSnippetSource(candidate.source).length > 0;
	});
}
