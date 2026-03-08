/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { PermissionLevel } from './CommandClassifier';

/**
 * Colour escape codes for terminal output.
 */
const COLOURS = {
	reset: '\x1b[0m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	red: '\x1b[31m',
	cyan: '\x1b[36m',
	dim: '\x1b[2m',
	bold: '\x1b[1m',
} as const;

/**
 * Maps permission levels to terminal colours and labels.
 */
const PERMISSION_BADGES: Record<PermissionLevel, { colour: string; label: string }> = {
	allowed: { colour: COLOURS.green, label: 'ALLOWED' },
	confirm: { colour: COLOURS.yellow, label: 'CONFIRMED' },
	blocked: { colour: COLOURS.red, label: 'BLOCKED' },
};

/**
 * A VS Code pseudoterminal that displays sandbox command output.
 * All agent-executed commands are shown here with permission indicators.
 */
export class SandboxTerminal implements vscode.Pseudoterminal {
	private writeEmitter = new vscode.EventEmitter<string>();
	private closeEmitter = new vscode.EventEmitter<number | void>();

	readonly onDidWrite: vscode.Event<string> = this.writeEmitter.event;
	readonly onDidClose: vscode.Event<number | void> = this.closeEmitter.event;

	private terminal: vscode.Terminal | undefined;

	open(): void {
		this.writeLine(`${COLOURS.cyan}${COLOURS.bold}[Son of Anton]${COLOURS.reset} Sandbox terminal ready.\r\n`);
	}

	close(): void {
		this.writeEmitter.dispose();
		this.closeEmitter.dispose();
	}

	/**
	 * Write a raw line to the terminal.
	 */
	writeLine(text: string): void {
		this.writeEmitter.fire(text + '\r\n');
	}

	/**
	 * Display a command being executed with its permission level.
	 */
	showCommand(command: string, level: PermissionLevel): void {
		const badge = PERMISSION_BADGES[level];
		const prefix = `${COLOURS.cyan}[Son of Anton]${COLOURS.reset}`;
		const permBadge = `${badge.colour}[${badge.label}]${COLOURS.reset}`;
		this.writeLine(`${prefix} ${permBadge} ${COLOURS.dim}$${COLOURS.reset} ${command}`);
	}

	/**
	 * Stream stdout output to the terminal.
	 */
	showStdout(data: string): void {
		for (const line of data.split('\n')) {
			this.writeEmitter.fire(line + '\r\n');
		}
	}

	/**
	 * Stream stderr output to the terminal (in red).
	 */
	showStderr(data: string): void {
		for (const line of data.split('\n')) {
			this.writeEmitter.fire(`${COLOURS.red}${line}${COLOURS.reset}\r\n`);
		}
	}

	/**
	 * Show the exit code of a completed command.
	 */
	showExitCode(exitCode: number, durationMs: number): void {
		const prefix = `${COLOURS.cyan}[Son of Anton]${COLOURS.reset}`;
		const durationStr = durationMs < 1000
			? `${durationMs}ms`
			: `${(durationMs / 1000).toFixed(1)}s`;
		const codeColour = exitCode === 0 ? COLOURS.green : COLOURS.red;
		this.writeLine(`${prefix} Exit code: ${codeColour}${exitCode}${COLOURS.reset} ${COLOURS.dim}(${durationStr})${COLOURS.reset}\r\n`);
	}

	/**
	 * Show a blocked command message.
	 */
	showBlocked(command: string, reason: string): void {
		const prefix = `${COLOURS.cyan}[Son of Anton]${COLOURS.reset}`;
		const badge = `${COLOURS.red}[BLOCKED]${COLOURS.reset}`;
		this.writeLine(`${prefix} ${badge} ${COLOURS.dim}$${COLOURS.reset} ${command}`);
		this.writeLine(`${prefix} ${COLOURS.red}Reason: ${reason}${COLOURS.reset}\r\n`);
	}

	/**
	 * Ensure the terminal is visible in the VS Code UI.
	 */
	ensureVisible(): vscode.Terminal {
		if (!this.terminal) {
			this.terminal = vscode.window.createTerminal({
				name: 'Son of Anton Sandbox',
				pty: this,
			});
		}
		this.terminal.show(true);
		return this.terminal;
	}

	/**
	 * Dispose of the terminal.
	 */
	dispose(): void {
		this.terminal?.dispose();
	}
}
