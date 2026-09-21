/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import * as platform from '../../../../base/common/platform.js';
import { removeAnsiEscapeCodes } from '../../../../base/common/strings.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ILogService } from '../../../log/common/log.js';
import { TerminalClaimKind } from '../../common/state/protocol/state.js';
import { IAgentHostTerminalManager } from '../agentHostTerminalManager.js';

/**
 * Maximum scrollback content (in bytes) returned to the model / caller in
 * command results.
 */
export const SHELL_COMMAND_MAX_OUTPUT_BYTES = 80_000;

/**
 * Default command timeout in milliseconds (120 seconds).
 */
export const DEFAULT_SHELL_COMMAND_TIMEOUT_MS = 120_000;

/**
 * The sentinel prefix used to detect command completion in terminal output
 * when shell integration is unavailable. The full sentinel format is:
 * `<<<COPILOT_SENTINEL_<uuid>_EXIT_<code>>>`.
 */
const SENTINEL_PREFIX = '<<<COPILOT_SENTINEL_';

/**
 * The kind of shell a command runs in. Determines sentinel syntax, history
 * suppression and bracketed-paste heuristics.
 */
export type ShellType = 'bash' | 'powershell';

/**
 * Routes a resolved shell executable to a {@link ShellType}. Falls back to the
 * platform default for unknown shells.
 */
export function shellTypeForExecutable(shellPath: string): ShellType {
	// Strip path on either separator and the .exe suffix.
	const lastSep = Math.max(shellPath.lastIndexOf('/'), shellPath.lastIndexOf('\\'));
	const base = shellPath.slice(lastSep + 1).toLowerCase().replace(/\.exe$/, '');
	switch (base) {
		// PowerShell
		case 'pwsh':
		case 'powershell':
		case 'pwsh-preview':
			return 'powershell';
		// POSIX shells
		case 'bash':
		case 'sh':
		case 'zsh':
		case 'fish':
		case 'csh':
		case 'ksh':
		case 'nu':
		case 'xonsh':
		// Git for Windows bash entry points
		case 'git-cmd':
		// WSL launchers — bash inside, but invoked via these stubs
		case 'wsl':
		case 'ubuntu':
		case 'ubuntu1804':
		case 'kali':
		case 'debian':
		case 'opensuse-42':
		case 'sles-12':
			return 'bash';
		default:
			return platform.isWindows ? 'powershell' : 'bash';
	}
}

/**
 * For POSIX shells (bash/zsh) that honor `HISTCONTROL=ignorespace` /
 * `HIST_IGNORE_SPACE`, prepending a single space prevents the command from
 * being recorded in shell history. The shell integration scripts opt these
 * settings in via the `VSCODE_PREVENT_SHELL_HISTORY` env var (set when the
 * terminal is created with `preventShellHistory: true`). PowerShell
 * suppresses history through PSReadLine instead, so no prefix is needed.
 */
export function prefixForHistorySuppression(shellType: ShellType): string {
	return shellType === 'powershell' ? '' : ' ';
}

export function isMultilineCommand(command: string): boolean {
	const normalized = command.replace(/\r\n|\r/g, '\n');
	return /(?<!\\)\n/.test(normalized);
}

function shouldUseBracketedPasteMode(command: string): boolean {
	return platform.isMacintosh || isMultilineCommand(command);
}

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
	let markerIndex = content.lastIndexOf(marker);
	while (markerIndex !== -1) {
		const outputBeforeSentinel = content.substring(0, markerIndex);
		const afterMarker = content.substring(markerIndex + marker.length);
		const endIdx = afterMarker.indexOf('>>>');
		if (endIdx !== -1) {
			const exitCodeStr = afterMarker.substring(0, endIdx).trim();
			if (/^-?\d+$/.test(exitCodeStr)) {
				return {
					found: true,
					exitCode: parseInt(exitCodeStr, 10),
					outputBeforeSentinel,
				};
			}
		}
		// Ignore echoed sentinel command text (for example `$?`) and continue
		// scanning for the latest complete numeric sentinel marker.
		markerIndex = content.lastIndexOf(marker, markerIndex - 1);
	}

	return { found: false, exitCode: -1, outputBeforeSentinel: content };
}

/**
 * Strips ANSI escape codes and trims the terminal output to the last
 * {@link SHELL_COMMAND_MAX_OUTPUT_BYTES} bytes so it is safe to surface to a
 * model or the transcript.
 */
export function prepareOutputForModel(rawOutput: string): string {
	let text = removeAnsiEscapeCodes(rawOutput).trim();
	if (text.length > SHELL_COMMAND_MAX_OUTPUT_BYTES) {
		text = text.substring(text.length - SHELL_COMMAND_MAX_OUTPUT_BYTES);
	}
	return text;
}

/**
 * Terminal against which a shell command is executed.
 */
export interface IShellCommandTarget {
	/** URI of the managed terminal the command runs in. */
	readonly terminalUri: string;
	/** The kind of shell backing the terminal. */
	readonly shellType: ShellType;
}

/**
 * How a shell command execution finished.
 *
 * - `completed` — the command finished; {@link IShellCommandResult.exitCode} holds the exit code.
 * - `timeout` — the command did not finish within the timeout; output is partial.
 * - `background` — the terminal claim was narrowed (user chose to continue in background).
 * - `altBuffer` — the command switched to the terminal's alternate buffer (interactive UI).
 * - `shellExited` — the shell process exited unexpectedly.
 */
export type ShellCommandStatus = 'completed' | 'timeout' | 'background' | 'altBuffer' | 'shellExited';

/**
 * Neutral, agent-agnostic result of executing a shell command. Callers map this
 * to their own result shape (e.g. an SDK `ToolResultObject` or an AHP tool call
 * completion).
 */
export interface IShellCommandResult {
	/** How the command execution finished. */
	readonly status: ShellCommandStatus;
	/** Exit code, when known (`completed` and `shellExited`). */
	readonly exitCode?: number;
	/** Cleaned command output (empty for `background`/`altBuffer`). */
	readonly output: string;
}

/**
 * Execute a command on an already-created managed terminal, resolving once the
 * command finishes, times out, backgrounds, enters the alternate buffer, or the
 * shell exits. Uses shell integration (OSC 633) for completion detection when
 * available and falls back to a sentinel echo otherwise.
 *
 * This is the shared shell-integration primitive used by both the Copilot SDK
 * shell tools and the agent-host `!command` runner.
 */
export function executeShellCommand(
	target: IShellCommandTarget,
	command: string,
	timeoutMs: number,
	terminalManager: IAgentHostTerminalManager,
	logService: ILogService,
): Promise<IShellCommandResult> {
	return terminalManager.supportsCommandDetection(target.terminalUri)
		? executeCommandWithShellIntegration(target, command, timeoutMs, terminalManager, logService)
		: executeCommandWithSentinel(target, command, timeoutMs, terminalManager, logService);
}

function registerAltBufferHandler(
	target: IShellCommandTarget,
	terminalManager: IAgentHostTerminalManager,
	logService: ILogService,
	disposables: DisposableStore,
	finish: (result: IShellCommandResult) => void,
): void {
	void terminalManager.createAltBufferPromise(target.terminalUri, disposables).then(() => {
		logService.info('[ShellCommand] Command entered alternate buffer');
		finish({ status: 'altBuffer', output: '' });
	});
}

/**
 * Execute a command using shell integration (OSC 633) for completion detection.
 * No sentinel echo is injected — the shell's own command-finished signal
 * provides the exit code and cleanly delineated output.
 */
async function executeCommandWithShellIntegration(
	target: IShellCommandTarget,
	command: string,
	timeoutMs: number,
	terminalManager: IAgentHostTerminalManager,
	logService: ILogService,
): Promise<IShellCommandResult> {
	const disposables = new DisposableStore();

	const result = new Promise<IShellCommandResult>(resolve => {
		let resolved = false;
		const finish = (result: IShellCommandResult) => {
			if (resolved) {
				return;
			}
			resolved = true;
			disposables.dispose();
			resolve(result);
		};

		disposables.add(terminalManager.onCommandFinished(target.terminalUri, event => {
			const output = prepareOutputForModel(event.output);
			const exitCode = event.exitCode ?? 0;
			logService.info(`[ShellCommand] Command completed (shell integration) with exit code ${exitCode}`);
			finish({ status: 'completed', exitCode, output });
		}));

		registerAltBufferHandler(target, terminalManager, logService, disposables, finish);

		disposables.add(terminalManager.onExit(target.terminalUri, (exitCode: number) => {
			logService.info(`[ShellCommand] Shell exited unexpectedly with code ${exitCode}`);
			const fullContent = terminalManager.getContent(target.terminalUri) ?? '';
			finish({ status: 'shellExited', exitCode, output: prepareOutputForModel(fullContent) });
		}));

		disposables.add(terminalManager.onClaimChanged(target.terminalUri, (claim) => {
			if (claim.kind === TerminalClaimKind.Session && !claim.toolCallId) {
				logService.info(`[ShellCommand] Continuing in background (claim narrowed)`);
				finish({ status: 'background', output: '' });
			}
		}));

		const timer = setTimeout(() => {
			logService.warn(`[ShellCommand] Command timed out after ${timeoutMs}ms`);
			const fullContent = terminalManager.getContent(target.terminalUri) ?? '';
			finish({ status: 'timeout', output: prepareOutputForModel(fullContent) });
		}, timeoutMs);
		disposables.add(toDisposable(() => clearTimeout(timer)));

	});

	try {
		await terminalManager.sendText(target.terminalUri, `${prefixForHistorySuppression(target.shellType)}${command}`, {
			shouldExecute: true,
			bracketedPasteMode: shouldUseBracketedPasteMode(command),
		});
	} catch (err) {
		disposables.dispose();
		throw err;
	}

	return result;
}

/**
 * Fallback: execute a command using a sentinel echo to detect completion.
 * Used when shell integration is not available.
 */
async function executeCommandWithSentinel(
	target: IShellCommandTarget,
	command: string,
	timeoutMs: number,
	terminalManager: IAgentHostTerminalManager,
	logService: ILogService,
): Promise<IShellCommandResult> {
	const sentinelId = makeSentinelId();
	const sentinelCmd = buildSentinelCommand(sentinelId, target.shellType);
	const disposables = new DisposableStore();

	const contentBefore = terminalManager.getContent(target.terminalUri) ?? '';
	const offsetBefore = contentBefore.length;

	const result = new Promise<IShellCommandResult>(resolve => {
		let resolved = false;
		const finish = (result: IShellCommandResult) => {
			if (resolved) {
				return;
			}
			resolved = true;
			disposables.dispose();
			resolve(result);
		};

		const checkForSentinel = () => {
			const fullContent = terminalManager.getContent(target.terminalUri) ?? '';
			// Clamp offset: the terminal manager trims content when it exceeds
			// 100k chars (slices to last 80k). If trimming happened after we
			// captured offsetBefore, scan from the start of the current buffer.
			const clampedOffset = Math.min(offsetBefore, fullContent.length);
			const newContent = fullContent.substring(clampedOffset);
			const parsed = parseSentinel(newContent, sentinelId);
			if (parsed.found) {
				const output = prepareOutputForModel(parsed.outputBeforeSentinel);
				logService.info(`[ShellCommand] Command completed with exit code ${parsed.exitCode}`);
				finish({ status: 'completed', exitCode: parsed.exitCode, output });
			}
		};

		disposables.add(terminalManager.onData(target.terminalUri, () => {
			checkForSentinel();
		}));

		registerAltBufferHandler(target, terminalManager, logService, disposables, finish);

		disposables.add(terminalManager.onExit(target.terminalUri, (exitCode: number) => {
			logService.info(`[ShellCommand] Shell exited unexpectedly with code ${exitCode}`);
			const fullContent = terminalManager.getContent(target.terminalUri) ?? '';
			const newContent = fullContent.substring(offsetBefore);
			finish({ status: 'shellExited', exitCode, output: prepareOutputForModel(newContent) });
		}));

		disposables.add(terminalManager.onClaimChanged(target.terminalUri, (claim) => {
			if (claim.kind === TerminalClaimKind.Session && !claim.toolCallId) {
				logService.info(`[ShellCommand] Continuing in background (claim narrowed)`);
				finish({ status: 'background', output: '' });
			}
		}));

		const timer = setTimeout(() => {
			logService.warn(`[ShellCommand] Command timed out after ${timeoutMs}ms`);
			const fullContent = terminalManager.getContent(target.terminalUri) ?? '';
			const newContent = fullContent.substring(offsetBefore);
			finish({ status: 'timeout', output: prepareOutputForModel(newContent) });
		}, timeoutMs);
		disposables.add(toDisposable(() => clearTimeout(timer)));

		checkForSentinel();
	});

	try {
		await terminalManager.sendText(target.terminalUri, `${prefixForHistorySuppression(target.shellType)}${command}`, {
			shouldExecute: true,
			bracketedPasteMode: shouldUseBracketedPasteMode(command),
		});
		await terminalManager.sendText(target.terminalUri, sentinelCmd, { shouldExecute: true });
	} catch (err) {
		disposables.dispose();
		throw err;
	}

	return result;
}
