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
import { ILogService } from '../../../log/common/log.js';
import { TerminalClaimKind, type ITerminalSessionClaim } from '../../common/state/protocol/state.js';
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

type ShellType = 'bash' | 'powershell';

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

	constructor(
		private readonly _sessionUri: URI,
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

		const claim: ITerminalSessionClaim = {
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
			cwd,
		}, { shell: getShellExecutable(shellType) });

		const shell: IManagedShell = { id, terminalUri, shellType };
		this._shells.set(id, shell);
		this._trackToolCall(toolCallId, id);
		this._logService.info(`[ShellManager] Created ${shellType} shell ${id} (terminal=${terminalUri})`);
		return shell;
	}

	private _trackToolCall(toolCallId: string, shellId: string): void {
		this._toolCallShells.set(toolCallId, shellId);
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
	const sentinelId = makeSentinelId();
	const sentinelCmd = buildSentinelCommand(sentinelId, shell.shellType);
	const disposables = new DisposableStore();

	const contentBefore = terminalManager.getContent(shell.terminalUri) ?? '';
	const offsetBefore = contentBefore.length;

	// PTY input uses \r for line endings — the PTY translates to \r\n
	const input = `${command}\r${sentinelCmd}\r`;
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
		description: `Execute a command in a persistent ${shellType} shell. The shell is reused across calls.`,
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
