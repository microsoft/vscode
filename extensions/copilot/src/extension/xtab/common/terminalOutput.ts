/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { ITerminalService } from '../../../platform/terminal/common/terminalService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { createServiceIdentifier } from '../../../util/common/services';
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { isAbsolute, posix } from '../../../util/vs/base/common/path';
import { extUriBiasedIgnorePathCase } from '../../../util/vs/base/common/resources';
import { removeAnsiEscapeCodes } from '../../../util/vs/base/common/strings';
import { URI } from '../../../util/vs/base/common/uri';
import { ParsedTerminalError, parseTerminalErrors } from './terminalErrorParser';

const MAX_BUFFER_CHARS = 2000;
const FAILURE_PARSE_BUFFER_CHARS = 8000;

interface LastTerminalActivity {
	readonly terminal: vscode.Terminal;
	readonly terminalName: string;
	readonly commandLine: string | undefined;
	readonly cwd: string | undefined;
	readonly exitCode: number | undefined;
	readonly timestamp: number;
}

/**
 * A captured terminal command failure with parsed, workspace-resolved errors.
 */
export interface RecentTerminalFailure {
	readonly terminal: vscode.Terminal;
	readonly commandLine: string | undefined;
	readonly cwd: string | undefined;
	readonly exitCode: number | undefined;
	readonly timestamp: number;
	/** Errors whose file resolves to a path inside a workspace folder. */
	readonly errors: readonly ResolvedTerminalError[];
}

/**
 * A {@link ParsedTerminalError} whose `file` has been resolved against the
 * command's working directory and validated to live inside a workspace folder.
 */
export interface ResolvedTerminalError extends ParsedTerminalError {
	/** Absolute file URI inside one of the workspace folders. */
	readonly uri: URI;
}

export const ITerminalMonitor = createServiceIdentifier<ITerminalMonitor>('ITerminalMonitor');

/**
 * Public surface of {@link TerminalMonitor}. Exposed as a service so consumers
 * outside `XtabProvider` (e.g. a VS Code-side contribution that triggers NES
 * on a captured terminal failure) can share the same monitor instance.
 */
export interface ITerminalMonitor {
	readonly _serviceBrand: undefined;
	readonly onDidObserveTerminalFailure: Event<RecentTerminalFailure>;
	getRecentFailure(maxAgeMs: number): RecentTerminalFailure | undefined;
	getData(): string;
}

/**
 * Monitors terminal activity and tracks the last terminal command execution.
 * Similar to UserInteractionMonitor, this class listens to terminal events
 * to understand user terminal activity patterns.
 */
export class TerminalMonitor extends Disposable implements ITerminalMonitor {

	declare readonly _serviceBrand: undefined;

	private _lastActivity: LastTerminalActivity | undefined;

	private _lastFailure: RecentTerminalFailure | undefined;

	/**
	 * Accumulated output for in-flight shell executions, captured via
	 * {@link vscode.TerminalShellExecution.read} from the start event. We use
	 * this for failure parsing because the global {@link getBufferForTerminal}
	 * buffer is windowed to ~40 data events and frequently evicts the actual
	 * error output before the end event fires.
	 */
	private readonly _pendingExecutionOutputs = new Map<vscode.TerminalShellExecution, string>();

	private readonly _onDidObserveTerminalFailure = this._register(new Emitter<RecentTerminalFailure>());
	public readonly onDidObserveTerminalFailure: Event<RecentTerminalFailure> = this._onDidObserveTerminalFailure.event;

	constructor(
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		// Capture each execution's full output as it streams. read() only yields
		// data written AFTER it is first called, so we must subscribe at start.
		this._register(this._terminalService.onDidStartTerminalShellExecution(e => {
			this._beginCapturingExecution(e.execution);
		}));

		// Listen to terminal shell execution end events to track command completions
		this._register(this._terminalService.onDidEndTerminalShellExecution(e => {
			this._recordTerminalActivity(e);
		}));

		// Clear last activity if the terminal is closed
		this._register(this._terminalService.onDidCloseTerminal(terminal => {
			if (this._lastActivity?.terminal === terminal) {
				this._lastActivity = undefined;
			}
			if (this._lastFailure?.terminal === terminal) {
				this._lastFailure = undefined;
			}
			// Drop any in-flight captures for executions on this terminal.
			for (const execution of Array.from(this._pendingExecutionOutputs.keys())) {
				// We can't ask the execution which terminal it belongs to once it
				// has ended, so we conservatively keep entries until their own
				// end event drains them; a closed terminal will simply leave us
				// with at most one stale entry that the next end event clears.
				void execution;
			}
		}));
	}

	private _beginCapturingExecution(execution: vscode.TerminalShellExecution): void {
		// eslint-disable-next-line no-console
		console.debug(`[TerminalMonitor] onDidStartTerminalShellExecution fired: commandLine=${execution.commandLine?.value ?? '<unknown>'}; begin read()`);
		// Seed an empty string so the end handler can tell "we captured it"
		// apart from "we never saw the start" (shell integration off).
		this._pendingExecutionOutputs.set(execution, '');
		void (async () => {
			try {
				for await (const chunk of execution.read()) {
					const current = this._pendingExecutionOutputs.get(execution);
					if (current === undefined) {
						// The end handler already consumed and removed this entry.
						return;
					}
					this._pendingExecutionOutputs.set(execution, current + chunk);
				}
			} catch (err) {
				this._logService.debug(`[TerminalMonitor] execution.read() threw: ${err instanceof Error ? err.message : String(err)}`);
				// eslint-disable-next-line no-console
				console.debug(`[TerminalMonitor] execution.read() threw: ${err instanceof Error ? err.message : String(err)}`);
			}
		})();
	}

	private _recordTerminalActivity(event: vscode.TerminalShellExecutionEndEvent): void {
		const executedCommand = event.execution;

		// TEMP DEBUG: mirror to console so it shows up in the outer Debug Console too.
		// eslint-disable-next-line no-console
		console.debug(`[TerminalMonitor] onDidEndTerminalShellExecution fired: exitCode=${event.exitCode}, commandLine=${executedCommand.commandLine?.value ?? '<unknown>'}`);

		this._lastActivity = {
			terminal: event.terminal,
			terminalName: event.terminal.name,
			commandLine: executedCommand.commandLine?.value,
			cwd: formatCwd(executedCommand.cwd),
			exitCode: event.exitCode,
			timestamp: Date.now(),
		};

		this._recordTerminalFailure(event);
	}

	private _recordTerminalFailure(event: vscode.TerminalShellExecutionEndEvent): void {
		const exitCode = event.exitCode;
		const commandLine = event.execution.commandLine?.value;
		// Drain (and remove) any captured output for this execution regardless
		// of outcome — leaking entries would grow the map indefinitely.
		const capturedOutput = this._pendingExecutionOutputs.get(event.execution);
		this._pendingExecutionOutputs.delete(event.execution);
		// Treat any non-zero exit code as a failure. `undefined` exit codes
		// (terminal killed / shell integration unavailable) are skipped because
		// we cannot reliably know whether the command actually failed.
		if (exitCode === undefined || exitCode === 0) {
			this._logService.debug(`[TerminalMonitor] skipping non-failure terminal event: exitCode=${exitCode}, commandLine=${commandLine ?? '<unknown>'}`);
			// eslint-disable-next-line no-console
			console.debug(`[TerminalMonitor] skipping non-failure terminal event: exitCode=${exitCode}, commandLine=${commandLine ?? '<unknown>'}`);
			// On a successful command, clear any prior failure on the same terminal
			// so a fix doesn't keep haunting the prompt.
			if (this._lastFailure?.terminal === event.terminal) {
				this._lastFailure = undefined;
			}
			return;
		}

		const cwd = formatCwd(event.execution.cwd);
		// Prefer the per-execution capture (full output, no eviction). Fall back
		// to the global windowed buffer if the start event was missed (e.g. we
		// were activated mid-execution) or shell integration produced nothing.
		const captured = capturedOutput !== undefined && capturedOutput.length > 0
			? removeAnsiEscapeCodes(capturedOutput)
			: undefined;
		const buffer = captured ?? this._terminalService.getBufferForTerminal(event.terminal, FAILURE_PARSE_BUFFER_CHARS);
		const parsed = parseTerminalErrors({ commandLine, output: buffer, cwd });
		if (parsed.length === 0) {
			this._logService.debug(`[TerminalMonitor] terminal failure had no parseable errors: commandLine=${commandLine ?? '<unknown>'}, exitCode=${exitCode}, bufferLength=${buffer.length}, source=${captured !== undefined ? 'execution.read()' : 'getBufferForTerminal'}`);
			// eslint-disable-next-line no-console
			console.debug(`[TerminalMonitor] terminal failure had no parseable errors: commandLine=${commandLine ?? '<unknown>'}, exitCode=${exitCode}, bufferLength=${buffer.length}, source=${captured !== undefined ? 'execution.read()' : 'getBufferForTerminal'}, bufferTail=${JSON.stringify(buffer.slice(-400))}`);
			return;
		}

		const errors = this._resolveErrors(parsed, cwd);
		if (errors.length === 0) {
			this._logService.debug(`[TerminalMonitor] all ${parsed.length} parsed error(s) resolved outside the workspace and were dropped: commandLine=${commandLine ?? '<unknown>'}`);
			// eslint-disable-next-line no-console
			console.debug(`[TerminalMonitor] all ${parsed.length} parsed error(s) resolved outside the workspace and were dropped: commandLine=${commandLine ?? '<unknown>'}, parsedFiles=${parsed.map(p => p.file).join(',')}, cwd=${cwd ?? '<unknown>'}`);
			return;
		}

		const failure: RecentTerminalFailure = {
			terminal: event.terminal,
			commandLine,
			cwd,
			exitCode,
			timestamp: Date.now(),
			errors,
		};
		this._lastFailure = failure;
		this._logService.debug(`[TerminalMonitor] captured terminal failure: commandLine=${commandLine ?? '<unknown>'}, exitCode=${exitCode}, errors=${errors.length}, firstError=${errors[0].file}:${errors[0].line}`);
		// eslint-disable-next-line no-console
		console.debug(`[TerminalMonitor] captured terminal failure: commandLine=${commandLine ?? '<unknown>'}, exitCode=${exitCode}, errors=${errors.length}, firstError=${errors[0].file}:${errors[0].line}`);
		this._onDidObserveTerminalFailure.fire(failure);
	}

	/**
	 * Returns the most recently captured terminal failure if it occurred within
	 * the last `maxAgeMs` milliseconds, otherwise `undefined`.
	 */
	public getRecentFailure(maxAgeMs: number): RecentTerminalFailure | undefined {
		const failure = this._lastFailure;
		if (failure === undefined) {
			return undefined;
		}
		if (Date.now() - failure.timestamp > maxAgeMs) {
			return undefined;
		}
		return failure;
	}

	/**
	 * Resolve each parsed error's file against the command's cwd and the set of
	 * workspace folders. Errors whose file is not inside any workspace folder
	 * are dropped — this avoids feeding hallucinated paths or system locations
	 * (e.g. `/usr/include/...`) to the model.
	 */
	private _resolveErrors(parsed: readonly ParsedTerminalError[], cwd: string | undefined): ResolvedTerminalError[] {
		const folders = this._workspaceService.getWorkspaceFolders();
		if (folders.length === 0) {
			return [];
		}
		const cwdAbs = cwd && isAbsolute(cwd) ? cwd : undefined;
		const resolved: ResolvedTerminalError[] = [];
		for (const err of parsed) {
			const uri = resolveErrorFile(err.file, cwdAbs, folders);
			if (uri === undefined) {
				continue;
			}
			resolved.push({ ...err, uri });
		}
		return resolved;
	}

	/**
	 * Gets the terminal output data for telemetry, including how long ago the last command was executed.
	 * Data is primarily sourced from onDidEndTerminalShellExecution to ensure consistency
	 * (buffer, command, and metadata all come from the same terminal).
	 */
	public getData(): string {
		const now = Date.now();
		const terminalCount = this._terminalService.terminals.length;

		if (!this._lastActivity) {
			return JSON.stringify({
				terminalCount,
			});
		}

		// Get buffer from the same terminal where the last command was executed
		const buffer = this._terminalService.getBufferForTerminal(this._lastActivity.terminal, MAX_BUFFER_CHARS * 2);
		const msAgo = now - this._lastActivity.timestamp;

		const data = {
			// All data from the same terminal that executed the last tracked command
			terminalName: this._lastActivity.terminalName,
			commandLine: this._lastActivity.commandLine,
			cwd: this._lastActivity.cwd,
			exitCode: this._lastActivity.exitCode,
			msAgo,
			// Buffer from the same terminal
			buffer: buffer.length <= MAX_BUFFER_CHARS ? {
				fits: true,
				content: buffer,
				length: buffer.length,
			} : {
				fits: false,
				contentStart: buffer.slice(0, MAX_BUFFER_CHARS / 2),
				contentEnd: buffer.slice(-MAX_BUFFER_CHARS / 2),
				length: buffer.length,
				truncatedChars: buffer.length - MAX_BUFFER_CHARS,
			},
			// General terminal state
			terminalCount,
		};

		return JSON.stringify(data);
	}
}

function formatCwd(cwd: URI | string | undefined): string | undefined {
	if (cwd === undefined) {
		return undefined;
	}
	if (typeof cwd === 'string') {
		return cwd;
	}
	return cwd.fsPath;
}

/**
 * Resolve a file path as it appeared in terminal output against the command's
 * working directory, and check that it lives inside one of the workspace
 * folders. Returns `undefined` when the path is outside the workspace.
 *
 * Exported for testing only.
 */
export function resolveErrorFile(file: string, cwd: string | undefined, folders: readonly URI[]): URI | undefined {
	// Normalise leading `./` so absolute-vs-relative checks behave predictably.
	const cleaned = file.replace(/^\.[\\/]/, '');
	let absPath: string;
	if (isAbsolute(cleaned)) {
		absPath = cleaned;
	} else if (cwd !== undefined) {
		absPath = posix.resolve(cwd.replace(/\\/g, '/'), cleaned.replace(/\\/g, '/'));
	} else {
		// No cwd available — try each workspace folder as a base.
		for (const folder of folders) {
			const candidate = URI.joinPath(folder, cleaned);
			if (folders.some(f => extUriBiasedIgnorePathCase.isEqualOrParent(candidate, f))) {
				return candidate;
			}
		}
		return undefined;
	}

	const uri = URI.file(absPath);
	for (const folder of folders) {
		if (extUriBiasedIgnorePathCase.isEqualOrParent(uri, folder)) {
			return uri;
		}
	}
	return undefined;
}
