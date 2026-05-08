/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

/** Hard cap on the captured output per terminal. Spec: 16KB or 100 lines. */
const MAX_OUTPUT_BYTES = 16 * 1024;
const MAX_OUTPUT_LINES = 100;

/**
 * Snapshot of the most recently completed shell-integration command for a
 * single terminal: the command line that was run, plus its accumulated stdout
 * (capped at {@link MAX_OUTPUT_BYTES} / {@link MAX_OUTPUT_LINES}, whichever is
 * smaller).
 */
export interface CapturedTerminalOutput {
	readonly commandLine: string;
	readonly output: string;
}

/**
 * VT control-sequence stripper. The shell-integration `read()` stream yields
 * raw terminal data including ANSI colour codes, CSI cursor-movement, and
 * OSC 633 shell-integration markers — none of which are useful in an LLM
 * prompt. Strips them in place; the remaining text is what a human would
 * see on screen.
 */
function stripControlSequences(raw: string): string {
	return raw
		// OSC sequences (e.g. shell-integration markers `\x1b]633;...\x07`).
		.replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '')
		// CSI sequences (`\x1b[...<final>`), covers SGR/cursor/erase.
		.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
		// Other ESC-prefixed two-byte sequences.
		.replace(/\x1b[@-Z\\-_]/g, '')
		// Stray BEL / NUL.
		.replace(/[\x00\x07]/g, '');
}

/**
 * Subscribe to the stable `terminalShellIntegration` API and remember the
 * most recently completed command's output for each terminal. Used by the
 * `@terminal` mention to surface the last command's output to the LLM
 * without requiring the user to copy-paste manually.
 *
 * Caveats:
 *  - Capture only works when shell integration is enabled (the user has
 *    `terminal.integrated.shellIntegration.enabled` on, which is the
 *    default for bash/zsh/pwsh).
 *  - Output is gathered live as the command runs. Commands that ran before
 *    the buffer was constructed are not retroactively visible.
 *  - The VS Code stable API does not expose terminal scrollback; this
 *    subscriber-based approach is the closest available approximation.
 */
export class TerminalCaptureBuffer implements vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = [];
	private readonly perTerminal = new WeakMap<vscode.Terminal, CapturedTerminalOutput>();
	/** Current in-flight execution per terminal. Cleared on `onDidEnd`. */
	private readonly pending = new WeakMap<vscode.Terminal, { commandLine: string; chunks: string[]; bytes: number }>();

	constructor() {
		this.disposables.push(
			vscode.window.onDidStartTerminalShellExecution(event => {
				this.onStart(event);
			}),
		);
		this.disposables.push(
			vscode.window.onDidEndTerminalShellExecution(event => {
				this.onEnd(event);
			}),
		);
	}

	/**
	 * Look up the most recently completed command output for the given
	 * terminal. Returns `undefined` when no command has finished yet on this
	 * terminal (or shell integration was disabled when it ran).
	 */
	lastOutputFor(terminal: vscode.Terminal): CapturedTerminalOutput | undefined {
		return this.perTerminal.get(terminal);
	}

	dispose(): void {
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables.length = 0;
	}

	private onStart(event: vscode.TerminalShellExecutionStartEvent): void {
		const commandLine = event.execution.commandLine?.value ?? '';
		const state = { commandLine, chunks: [] as string[], bytes: 0 };
		this.pending.set(event.terminal, state);
		// Drain the read() stream concurrently so we never miss data. Errors
		// are swallowed — a failed read just means we won't have output for
		// this command, which is benign.
		void this.drain(event.execution, state);
	}

	private async drain(
		execution: vscode.TerminalShellExecution,
		state: { chunks: string[]; bytes: number },
	): Promise<void> {
		try {
			const stream = execution.read();
			for await (const data of stream) {
				if (state.bytes >= MAX_OUTPUT_BYTES) {
					// Keep consuming so the iterator drains, but stop accumulating.
					continue;
				}
				const cleaned = stripControlSequences(data);
				if (!cleaned) {
					continue;
				}
				state.chunks.push(cleaned);
				state.bytes += cleaned.length;
			}
		} catch {
			// Stream rejected (terminal closed mid-read, etc.) — keep what we have.
		}
	}

	private onEnd(event: vscode.TerminalShellExecutionEndEvent): void {
		const state = this.pending.get(event.terminal);
		if (!state) {
			return;
		}
		this.pending.delete(event.terminal);
		const joined = state.chunks.join('');
		const trimmed = trimToBudget(joined);
		this.perTerminal.set(event.terminal, {
			commandLine: state.commandLine,
			output: trimmed,
		});
	}
}

/**
 * Trim captured output to the smaller of {@link MAX_OUTPUT_BYTES} and
 * {@link MAX_OUTPUT_LINES}. Always keeps the *tail* of the output —
 * the most recent lines are usually what the user wants to discuss.
 *
 * @internal exported for unit tests; treat as private to this module.
 */
export function trimToBudget(text: string): string {
	let out = text;
	const lines = out.split(/\r?\n/);
	if (lines.length > MAX_OUTPUT_LINES) {
		out = lines.slice(-MAX_OUTPUT_LINES).join('\n');
	}
	if (out.length > MAX_OUTPUT_BYTES) {
		out = out.slice(out.length - MAX_OUTPUT_BYTES);
	}
	return out;
}
