/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Tool, ToolResultObject } from '@github/copilot-sdk';
import { generateUuid } from '../../../../base/common/uuid.js';
import { URI } from '../../../../base/common/uri.js';
import { removeAnsiEscapeCodes } from '../../../../base/common/strings.js';
import * as platform from '../../../../base/common/platform.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ILogService } from '../../../log/common/log.js';
import { TerminalClaimKind, type TerminalSessionClaim } from '../../common/state/protocol/state.js';
import { IAgentHostTerminalManager } from '../agentHostTerminalManager.js';

/**
 * Maximum scrollback content (in bytes) returned to the model in tool results.
 */
const MAX_OUTPUT_BYTES = 80_000;

/**
 * Default command timeout in milliseconds (120 seconds).
 */
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * The sentinel prefix used to detect command completion in terminal output.
 * The full sentinel format is: `<<<COPILOT_SENTINEL_<uuid>_EXIT_<code>>>`.
 */
const SENTINEL_PREFIX = '<<<COPILOT_SENTINEL_';

/**
 * Tracks a single persistent shell instance backed by a managed PTY terminal.
 */
interface IManagedShell {
	readonly id: string;
	readonly terminalUri: string;
	readonly shellType: ShellType;
}

export type ShellType = 'bash' | 'powershell';

function getShellExecutable(shellType: ShellType): string {
	if (shellType === 'powershell') {
		return 'powershell.exe';
	}
	return process.env['SHELL'] || '/bin/bash';
}

// ---------------------------------------------------------------------------
// ShellManager
// ---------------------------------------------------------------------------

/**
 * Per-session manager for persistent shell instances. Each shell is backed by
 * a {@link IAgentHostTerminalManager} terminal and participates in AHP terminal
 * claim semantics.
 *
 * Created via {@link IInstantiationService} once per session and disposed when
 * the session ends.
 */
export class ShellManager {

	private readonly _shells = new Map<string, IManagedShell>();
	private readonly _toolCallShells = new Map<string, string>();

	private readonly _onDidAssociateTerminal = new Emitter<{ toolCallId: string; terminalUri: string; displayName: string }>();
	readonly onDidAssociateTerminal: Event<{ toolCallId: string; terminalUri: string; displayName: string }> = this._onDidAssociateTerminal.event;

	constructor(
		private readonly _sessionUri: URI,
		private readonly _workingDirectory: URI | undefined,
		@IAgentHostTerminalManager private readonly _terminalManager: IAgentHostTerminalManager,
		@ILogService private readonly _logService: ILogService,
	) { }

	async getOrCreateShell(
		shellType: ShellType,
		turnId: string,
		toolCallId: string,
		cwd?: string,
	): Promise<IManagedShell> {
		for (const shell of this._shells.values()) {
			if (shell.shellType === shellType && this._terminalManager.hasTerminal(shell.terminalUri)) {
				const exitCode = this._terminalManager.getExitCode(shell.terminalUri);
				if (exitCode === undefined) {
					this._trackToolCall(toolCallId, shell.id);
					return shell;
				}
				this._shells.delete(shell.id);
			}
		}

		const id = generateUuid();
		const terminalUri = `agenthost-terminal://shell/${id}`;

		const claim: TerminalSessionClaim = {
			kind: TerminalClaimKind.Session,
			session: this._sessionUri.toString(),
			turnId,
			toolCallId,
		};

		const shellDisplayName = shellType === 'bash' ? 'Bash' : 'PowerShell';

		await this._terminalManager.createTerminal({
			terminal: terminalUri,
			claim,
			name: shellDisplayName,
			cwd: cwd ?? this._workingDirectory?.fsPath,
		}, { shell: getShellExecutable(shellType), preventShellHistory: true, nonInteractive: true });

		const shell: IManagedShell = { id, terminalUri, shellType };
		this._shells.set(id, shell);
		this._trackToolCall(toolCallId, id);
		this._logService.info(`[ShellManager] Created ${shellType} shell ${id} (terminal=${terminalUri})`);
		return shell;
	}

	private _trackToolCall(toolCallId: string, shellId: string): void {
		this._toolCallShells.set(toolCallId, shellId);
		const shell = this._shells.get(shellId);
		if (shell) {
			const displayName = shell.shellType === 'bash' ? 'Bash' : 'PowerShell';
			this._onDidAssociateTerminal.fire({ toolCallId, terminalUri: shell.terminalUri, displayName });
		}
	}

	getTerminalUriForToolCall(toolCallId: string): string | undefined {
		const shellId = this._toolCallShells.get(toolCallId);
		if (!shellId) {
			return undefined;
		}
		return this._shells.get(shellId)?.terminalUri;
	}

	getShell(id: string): IManagedShell | undefined {
		return this._shells.get(id);
	}

	listShells(): IManagedShell[] {
		const result: IManagedShell[] = [];
		for (const shell of this._shells.values()) {
			if (this._terminalManager.hasTerminal(shell.terminalUri)) {
				result.push(shell);
			}
		}
		return result;
	}

	shutdownShell(id: string): boolean {
		const shell = this._shells.get(id);
		if (!shell) {
			return false;
		}
		this._terminalManager.disposeTerminal(shell.terminalUri);
		this._shells.delete(id);
		this._logService.info(`[ShellManager] Shut down shell ${id}`);
		return true;
	}

	dispose(): void {
		for (const shell of this._shells.values()) {
			if (this._terminalManager.hasTerminal(shell.terminalUri)) {
				this._terminalManager.disposeTerminal(shell.terminalUri);
			}
		}
		this._shells.clear();
		this._toolCallShells.clear();
	}
}

// ---------------------------------------------------------------------------
// Sentinel helpers
// ---------------------------------------------------------------------------

function makeSentinelId(): string {
	return generateUuid().replace(/-/g, '');
}

function buildSentinelCommand(sentinelId: string, shellType: ShellType): string {
	if (shellType === 'powershell') {
		return `Write-Output "${SENTINEL_PREFIX}${sentinelId}_EXIT_$LASTEXITCODE>>>"`;
	}
	return `echo "${SENTINEL_PREFIX}${sentinelId}_EXIT_$?>>>"`;
}

/**
 * For POSIX shells (bash/zsh) that honor `HISTCONTROL=ignorespace` /
 * `HIST_IGNORE_SPACE`, prepending a single space prevents the command from
 * being recorded in shell history. The shell integration scripts opt these
 * settings in via the `VSCODE_PREVENT_SHELL_HISTORY` env var (set when the
 * terminal is created with `preventShellHistory: true`). PowerShell
 * suppresses history through PSReadLine instead, so no prefix is needed.
 *
 * Exported for tests.
 */
export function prefixForHistorySuppression(shellType: ShellType): string {
	return shellType === 'powershell' ? '' : ' ';
}

function parseSentinel(content: string, sentinelId: string): { found: boolean; exitCode: number; outputBeforeSentinel: string } {
	const marker = `${SENTINEL_PREFIX}${sentinelId}_EXIT_`;
	const idx = content.indexOf(marker);
	if (idx === -1) {
		return { found: false, exitCode: -1, outputBeforeSentinel: content };
	}

	const outputBeforeSentinel = content.substring(0, idx);
	const afterMarker = content.substring(idx + marker.length);
	const endIdx = afterMarker.indexOf('>>>');
	const exitCodeStr = endIdx >= 0 ? afterMarker.substring(0, endIdx) : afterMarker.trim();
	const exitCode = parseInt(exitCodeStr, 10);
	return {
		found: true,
		exitCode: isNaN(exitCode) ? -1 : exitCode,
		outputBeforeSentinel,
	};
}

function prepareOutputForModel(rawOutput: string): string {
	let text = removeAnsiEscapeCodes(rawOutput).trim();
	if (text.length > MAX_OUTPUT_BYTES) {
		text = text.substring(text.length - MAX_OUTPUT_BYTES);
	}
	return text;
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

function makeSuccessResult(text: string): ToolResultObject {
	return { textResultForLlm: text, resultType: 'success' };
}

function makeFailureResult(text: string, error?: string): ToolResultObject {
	return { textResultForLlm: text, resultType: 'failure', error };
}

async function executeCommandInShell(
	shell: IManagedShell,
	command: string,
	timeoutMs: number,
	terminalManager: IAgentHostTerminalManager,
	logService: ILogService,
): Promise<ToolResultObject> {
	const result = terminalManager.supportsCommandDetection(shell.terminalUri)
		? await executeCommandWithShellIntegration(shell, command, timeoutMs, terminalManager, logService)
		: await executeCommandWithSentinel(shell, command, timeoutMs, terminalManager, logService);
	return {
		...result,
		textResultForLlm: `Shell ID: ${shell.id}\n${result.textResultForLlm}`,
	};
}

/**
 * Execute a command using shell integration (OSC 633) for completion detection.
 * No sentinel echo is injected — the shell's own command-finished signal
 * provides the exit code and cleanly delineated output.
 */
async function executeCommandWithShellIntegration(
	shell: IManagedShell,
	command: string,
	timeoutMs: number,
	terminalManager: IAgentHostTerminalManager,
	logService: ILogService,
): Promise<ToolResultObject> {
	const disposables = new DisposableStore();

	terminalManager.writeInput(shell.terminalUri, `${prefixForHistorySuppression(shell.shellType)}${command}\r`);

	return new Promise<ToolResultObject>(resolve => {
		let resolved = false;
		const finish = (result: ToolResultObject) => {
			if (resolved) {
				return;
			}
			resolved = true;
			disposables.dispose();
			resolve(result);
		};

		disposables.add(terminalManager.onCommandFinished(shell.terminalUri, event => {
			const output = prepareOutputForModel(event.output);
			const exitCode = event.exitCode ?? 0;
			logService.info(`[ShellTool] Command completed (shell integration) with exit code ${exitCode}`);
			if (exitCode === 0) {
				finish(makeSuccessResult(`Exit code: ${exitCode}\n${output}`));
			} else {
				finish(makeFailureResult(`Exit code: ${exitCode}\n${output}`));
			}
		}));

		disposables.add(terminalManager.onExit(shell.terminalUri, (exitCode: number) => {
			logService.info(`[ShellTool] Shell exited unexpectedly with code ${exitCode}`);
			const fullContent = terminalManager.getContent(shell.terminalUri) ?? '';
			const output = prepareOutputForModel(fullContent);
			finish(makeFailureResult(`Shell exited with code ${exitCode}\n${output}`));
		}));

		disposables.add(terminalManager.onClaimChanged(shell.terminalUri, (claim) => {
			if (claim.kind === TerminalClaimKind.Session && !claim.toolCallId) {
				logService.info(`[ShellTool] Continuing in background (claim narrowed)`);
				finish(makeSuccessResult('The user chose to continue this command in the background. The terminal is still running.'));
			}
		}));

		const timer = setTimeout(() => {
			logService.warn(`[ShellTool] Command timed out after ${timeoutMs}ms`);
			const fullContent = terminalManager.getContent(shell.terminalUri) ?? '';
			const output = prepareOutputForModel(fullContent);
			finish(makeFailureResult(
				`Command timed out after ${Math.round(timeoutMs / 1000)}s. Partial output:\n${output}`,
				'timeout',
			));
		}, timeoutMs);
		disposables.add(toDisposable(() => clearTimeout(timer)));
	});
}

/**
 * Fallback: execute a command using a sentinel echo to detect completion.
 * Used when shell integration is not available.
 */
async function executeCommandWithSentinel(
	shell: IManagedShell,
	command: string,
	timeoutMs: number,
	terminalManager: IAgentHostTerminalManager,
	logService: ILogService,
): Promise<ToolResultObject> {
	const sentinelId = makeSentinelId();
	const sentinelCmd = buildSentinelCommand(sentinelId, shell.shellType);
	const disposables = new DisposableStore();

	const contentBefore = terminalManager.getContent(shell.terminalUri) ?? '';
	const offsetBefore = contentBefore.length;

	// PTY input uses \r for line endings — the PTY translates to \r\n
	const input = `${prefixForHistorySuppression(shell.shellType)}${command}\r${sentinelCmd}\r`;
	terminalManager.writeInput(shell.terminalUri, input);

	return new Promise<ToolResultObject>(resolve => {
		let resolved = false;
		const finish = (result: ToolResultObject) => {
			if (resolved) {
				return;
			}
			resolved = true;
			disposables.dispose();
			resolve(result);
		};

		const checkForSentinel = () => {
			const fullContent = terminalManager.getContent(shell.terminalUri) ?? '';
			// Clamp offset: the terminal manager trims content when it exceeds
			// 100k chars (slices to last 80k). If trimming happened after we
			// captured offsetBefore, scan from the start of the current buffer.
			const clampedOffset = Math.min(offsetBefore, fullContent.length);
			const newContent = fullContent.substring(clampedOffset);
			const parsed = parseSentinel(newContent, sentinelId);
			if (parsed.found) {
				const output = prepareOutputForModel(parsed.outputBeforeSentinel);
				logService.info(`[ShellTool] Command completed with exit code ${parsed.exitCode}`);
				if (parsed.exitCode === 0) {
					finish(makeSuccessResult(`Exit code: ${parsed.exitCode}\n${output}`));
				} else {
					finish(makeFailureResult(`Exit code: ${parsed.exitCode}\n${output}`));
				}
			}
		};

		disposables.add(terminalManager.onData(shell.terminalUri, () => {
			checkForSentinel();
		}));

		disposables.add(terminalManager.onExit(shell.terminalUri, (exitCode: number) => {
			logService.info(`[ShellTool] Shell exited unexpectedly with code ${exitCode}`);
			const fullContent = terminalManager.getContent(shell.terminalUri) ?? '';
			const newContent = fullContent.substring(offsetBefore);
			const output = prepareOutputForModel(newContent);
			finish(makeFailureResult(`Shell exited with code ${exitCode}\n${output}`));
		}));

		disposables.add(terminalManager.onClaimChanged(shell.terminalUri, (claim) => {
			if (claim.kind === TerminalClaimKind.Session && !claim.toolCallId) {
				logService.info(`[ShellTool] Continuing in background (claim narrowed)`);
				finish(makeSuccessResult('The user chose to continue this command in the background. The terminal is still running.'));
			}
		}));

		const timer = setTimeout(() => {
			logService.warn(`[ShellTool] Command timed out after ${timeoutMs}ms`);
			const fullContent = terminalManager.getContent(shell.terminalUri) ?? '';
			const newContent = fullContent.substring(offsetBefore);
			const output = prepareOutputForModel(newContent);
			finish(makeFailureResult(
				`Command timed out after ${Math.round(timeoutMs / 1000)}s. Partial output:\n${output}`,
				'timeout',
			));
		}, timeoutMs);
		disposables.add(toDisposable(() => clearTimeout(timer)));

		checkForSentinel();
	});
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

interface IShellToolArgs {
	command: string;
	timeout?: number;
}

interface IWriteShellArgs {
	command: string;
}

interface IReadShellArgs {
	shell_id?: string;
}

interface IShutdownShellArgs {
	shell_id?: string;
}

/**
 * Creates the set of SDK {@link Tool} definitions that override the built-in
 * Copilot CLI shell tools with PTY-backed implementations.
 *
 * Returns tools for the platform-appropriate shell (bash or powershell),
 * including companion tools (read, write, shutdown, list).
 */
export function createShellTools(
	shellManager: ShellManager,
	terminalManager: IAgentHostTerminalManager,
	logService: ILogService,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Tool<any>[] {
	const shellType: ShellType = platform.isWindows ? 'powershell' : 'bash';

	const primaryTool: Tool<IShellToolArgs> = {
		name: shellType,
		description: shellType === 'bash' ? createBashModelDescription(false) : createPowerShellModelDescription(shellType, 'pwsh.exe', false),
		parameters: {
			type: 'object',
			properties: {
				command: { type: 'string', description: 'The command to execute' },
				timeout: { type: 'number', description: 'Timeout in milliseconds (default 120000)' },
			},
			required: ['command'],
		},
		overridesBuiltInTool: true,
		handler: async (args, invocation) => {
			const shell = await shellManager.getOrCreateShell(
				shellType,
				invocation.toolCallId,
				invocation.toolCallId,
			);
			const timeoutMs = args.timeout ?? DEFAULT_TIMEOUT_MS;
			return executeCommandInShell(shell, args.command, timeoutMs, terminalManager, logService);
		},
	};

	const readTool: Tool<IReadShellArgs> = {
		name: `read_${shellType}`,
		description: `Read the latest output from a running ${shellType} shell.`,
		parameters: {
			type: 'object',
			properties: {
				shell_id: { type: 'string', description: 'Shell ID to read from (optional; uses latest shell if omitted)' },
			},
		},
		overridesBuiltInTool: true,
		skipPermission: true,
		handler: (args) => {
			const shells = shellManager.listShells();
			const shell = args.shell_id
				? shellManager.getShell(args.shell_id)
				: shells[shells.length - 1];
			if (!shell) {
				return makeFailureResult('No active shell found.', 'no_shell');
			}
			const content = terminalManager.getContent(shell.terminalUri);
			if (!content) {
				return makeSuccessResult('(no output)');
			}
			return makeSuccessResult(prepareOutputForModel(content));
		},
	};

	const writeTool: Tool<IWriteShellArgs> = {
		name: `write_${shellType}`,
		description: `Send input to a running ${shellType} shell (e.g. answering a prompt, sending Ctrl+C).`,
		parameters: {
			type: 'object',
			properties: {
				command: { type: 'string', description: 'Text to write to the shell stdin' },
			},
			required: ['command'],
		},
		overridesBuiltInTool: true,
		skipPermission: true,
		handler: (args) => {
			const shells = shellManager.listShells();
			const shell = shells[shells.length - 1];
			if (!shell) {
				return makeFailureResult('No active shell found.', 'no_shell');
			}
			terminalManager.writeInput(shell.terminalUri, args.command);
			return makeSuccessResult('Input sent to shell.');
		},
	};

	const shutdownTool: Tool<IShutdownShellArgs> = {
		name: shellType === 'bash' ? 'bash_shutdown' : `${shellType}_shutdown`,
		description: `Stop a ${shellType} shell.`,
		parameters: {
			type: 'object',
			properties: {
				shell_id: { type: 'string', description: 'Shell ID to stop (optional; stops latest shell if omitted)' },
			},
		},
		overridesBuiltInTool: true,
		skipPermission: true,
		handler: (args) => {
			if (args.shell_id) {
				const success = shellManager.shutdownShell(args.shell_id);
				return success
					? makeSuccessResult('Shell stopped.')
					: makeFailureResult('Shell not found.', 'not_found');
			}
			const shells = shellManager.listShells();
			const shell = shells[shells.length - 1];
			if (!shell) {
				return makeFailureResult('No active shell to stop.', 'no_shell');
			}
			shellManager.shutdownShell(shell.id);
			return makeSuccessResult('Shell stopped.');
		},
	};

	const listTool: Tool<Record<string, never>> = {
		name: `list_${shellType}`,
		description: `List active ${shellType} shell instances.`,
		parameters: { type: 'object', properties: {} },
		overridesBuiltInTool: true,
		skipPermission: true,
		handler: () => {
			const shells = shellManager.listShells();
			if (shells.length === 0) {
				return makeSuccessResult('No active shells.');
			}
			const descriptions = shells.map(s => {
				const exitCode = terminalManager.getExitCode(s.terminalUri);
				const status = exitCode !== undefined ? `exited (${exitCode})` : 'running';
				return `- ${s.id}: ${s.shellType} [${status}]`;
			});
			return makeSuccessResult(descriptions.join('\n'));
		},
	};

	return [primaryTool, readTool, writeTool, shutdownTool, listTool];
}
interface ITerminalSandboxResolvedNetworkDomains {
	allowedDomains: string[];
	deniedDomains: string[];
}

function isWindowsPowerShell(envShell: string): boolean {
	return envShell.endsWith('System32\\WindowsPowerShell\\v1.0\\powershell.exe');
}

function createPowerShellModelDescription(shellType: string, shellPath: string, isSandboxEnabled: boolean, networkDomains?: ITerminalSandboxResolvedNetworkDomains): string {
	const isWinPwsh = isWindowsPowerShell(shellPath);
	const parts = [
		`This tool allows you to execute ${isWinPwsh ? 'Windows PowerShell 5.1' : 'PowerShell'} commands in a persistent terminal session, preserving environment variables, working directory, and other context across multiple commands.`,
		'',
		'Command Execution:',
		// IMPORTANT: PowerShell 5 does not support `&&` so always re-write them to `;`. Note that
		// the behavior of `&&` differs a little from `;` but in general it's fine
		isWinPwsh ? '- Use semicolons ; to chain commands on one line, NEVER use && even when asked explicitly' : '- Prefer ; when chaining commands on one line',
		'- Prefer pipelines | for object-based data flow',
		'- Never create a sub-shell (eg. powershell -c "command") unless explicitly asked',
		'',
		'Directory Management:',
		'- Prefer relative paths when navigating directories, only use absolute when the path is far away or the current cwd is not expected',
		'- By default (mode=sync), shell and cwd are reused by subsequent sync commands',
		'- Use $PWD or Get-Location for current directory',
		'- Use Push-Location/Pop-Location for directory stack',
		'',
		'Program Execution:',
		'- Supports .NET, Python, Node.js, and other executables',
		'- Install modules via Install-Module, Install-Package',
		'- Use Get-Command to verify cmdlet/function availability',
		'',
		'Async Mode:',
		'- For long-running tasks (e.g., servers), use mode=async',
		'- Returns a terminal ID for checking status and runtime later',
		'- Use Start-Job for background PowerShell jobs',
		'',
		`Use write_${shellType} to send commands or input to a terminal session.`,
	];

	if (isSandboxEnabled) {
		parts.push(...createSandboxLines(networkDomains));
	}

	parts.push(
		'',
		'Output Management:',
		'- Output is automatically truncated if longer than 60KB to prevent context overflow',
		'- Use Select-Object, Where-Object, Format-Table to filter output',
		'- Use -First/-Last parameters to limit results',
		'- For pager commands, add | Out-String or | Format-List',
		'',
		'Best Practices:',
		'- Use proper cmdlet names instead of aliases in scripts',
		'- Quote paths with spaces: "C:\\Path With Spaces"',
		'- Prefer PowerShell cmdlets over external commands when available',
		'- Prefer idiomatic PowerShell like Get-ChildItem instead of dir or ls for file listings',
		'- Use Test-Path to check file/directory existence',
		'- Be specific with Select-Object properties to avoid excessive output',
		'- Avoid printing credentials unless absolutely required',
		'',
		'Interactive Input Handling:',
		'- When a terminal command is waiting for interactive input, do NOT suggest alternatives or ask the user whether to proceed. Instead, use the ask_user tool to collect the needed values from the user, then send them.',
		`- Send exactly one answer per prompt using write_${shellType}. Never send multiple answers in a single send.`,
		`- After each send, call read_${shellType} to read the next prompt before sending the next answer.`,
		'- Continue one prompt at a time until the command finishes.',
	);

	return parts.join('\n');
}

function createSandboxLines(networkDomains?: ITerminalSandboxResolvedNetworkDomains): string[] {
	const lines = [
		'',
		'Sandboxing:',
		'- ATTENTION: Terminal sandboxing is enabled, commands run in a sandbox by default',
		'- When executing commands within the sandboxed environment, all operations requiring a temporary directory must utilize the $TMPDIR environment variable. The /tmp directory is not guaranteed to be accessible or writable and must be avoided',
		'- Tools and scripts should respect the TMPDIR environment variable, which is automatically set to an appropriate path within the sandbox',
		'- When a command fails due to sandbox restrictions, immediately re-run it with requestUnsandboxedExecution=true. Do NOT ask the user for permission — setting this flag automatically shows a confirmation prompt to the user',
		'- Only set requestUnsandboxedExecution=true when there is evidence of failures caused by the sandbox, e.g. \'Operation not permitted\' errors, network failures, or file access errors, etc',
		'- Do NOT set requestUnsandboxedExecution=true without first executing the command in sandbox mode. Always try the command in the sandbox first, and only set requestUnsandboxedExecution=true when retrying after that sandboxed execution failed due to sandbox restrictions.',
		'- When setting requestUnsandboxedExecution=true, also provide requestUnsandboxedExecutionReason explaining why the command needs unsandboxed access',
	];
	if (networkDomains) {
		const deniedSet = new Set(networkDomains.deniedDomains);
		const effectiveAllowed = networkDomains.allowedDomains.filter(d => !deniedSet.has(d));
		if (effectiveAllowed.length === 0) {
			lines.push('- All network access is blocked in the sandbox');
		} else {
			lines.push(`- Only the following domains are accessible in the sandbox (all other network access is blocked): ${effectiveAllowed.join(', ')}`);
		}
		if (networkDomains.deniedDomains.length > 0) {
			lines.push(`- The following domains are explicitly blocked in the sandbox: ${networkDomains.deniedDomains.join(', ')}`);
		}
	}
	return lines;
}

function createGenericDescription(shellType: string, isSandboxEnabled: boolean, networkDomains?: ITerminalSandboxResolvedNetworkDomains): string {
	const parts = [`
Command Execution:
- Use && to chain simple commands on one line
- Prefer pipelines | over temporary files for data flow
- Never create a sub-shell (eg. bash -c "command") unless explicitly asked

Directory Management:
- Prefer relative paths when navigating directories, only use absolute when the path is far away or the current cwd is not expected
- By default (mode=sync), shell and cwd are reused by subsequent sync commands
- Use $PWD for current directory references
- Consider using pushd/popd for directory stack management
- Supports directory shortcuts like ~ and -

Program Execution:
- Supports Python, Node.js, and other executables
- Install packages via package managers (brew, apt, etc.)
- Use which or command -v to verify command availability

Async Mode:
- For long-running tasks (e.g., servers), use mode=async
- Returns a terminal ID for checking status and runtime later

Use write_${shellType} to send commands or input to a terminal session.`];

	if (isSandboxEnabled) {
		parts.push(createSandboxLines(networkDomains).join('\n'));
	}

	parts.push(`

Output Management:
- Output is automatically truncated if longer than 60KB to prevent context overflow
- Use head, tail, grep, awk to filter and limit output size
- For pager commands, disable paging: git --no-pager or add | cat
- Use wc -l to count lines before displaying large outputs

Best Practices:
- Quote variables: "$var" instead of $var to handle spaces
- Use find with -exec or xargs for file operations
- Be specific with commands to avoid excessive output
- Avoid printing credentials unless absolutely required
- NEVER run sleep or similar wait commands in a terminal. You will be automatically notified on your next turn when async terminal commands or timed-out sync commands complete or need input. Do NOT poll for completion.

Interactive Input Handling:
- When a terminal command is waiting for interactive input, do NOT suggest alternatives or ask the user whether to proceed. Instead, use the ask_user tool to collect the needed values from the user, then send them.
- Send exactly one answer per prompt using write_${shellType}. Never send multiple answers in a single send.
- After each send, call read_${shellType} to read the next prompt before sending the next answer.
- Continue one prompt at a time until the command finishes.`);

	return parts.join('');
}

function createBashModelDescription(isSandboxEnabled: boolean, networkDomains?: ITerminalSandboxResolvedNetworkDomains): string {
	return [
		'This tool allows you to execute shell commands in a persistent bash terminal session, preserving environment variables, working directory, and other context across multiple commands.',
		createGenericDescription('bash', isSandboxEnabled, networkDomains),
		'- Use [[ ]] for conditional tests instead of [ ]',
		'- Prefer $() over backticks for command substitution',
		'- Use set -e at start of complex commands to exit on errors'
	].join('\n');
}
