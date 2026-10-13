/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, Terminal, TerminalExecutedCommand, window } from 'vscode';
import { basename } from '../../../util/vs/base/common/path';
import { platform } from '../../../util/vs/base/common/process';
import { removeAnsiEscapeCodes } from '../../../util/vs/base/common/strings';

const terminalBuffers: Map<Terminal, string[]> = new Map();
const terminalCommands: Map<Terminal, TerminalExecutedCommand[]> = new Map();

export function getActiveTerminalBuffer(): string {
	const activeTerminal = window.activeTerminal;
	if (activeTerminal === undefined) {
		return '';
	}
	return terminalBuffers.get(activeTerminal)?.join('') || '';
}

export function getBufferForTerminal(terminal?: Terminal, maxChars: number = 16000): string {
	if (!terminal) {
		return '';
	}

	const buffer = terminalBuffers.get(terminal);
	if (!buffer) {
		return '';
	}
	const joined = buffer.join('');
	const start = Math.max(0, joined.length - maxChars);
	return joined.slice(start);
}

export function getLastCommandForTerminal(terminal: Terminal): TerminalExecutedCommand | undefined {
	return terminalCommands.get(terminal)?.at(-1);
}

export function getActiveTerminalLastCommand(): TerminalExecutedCommand | undefined {
	const activeTerminal = window.activeTerminal;
	if (activeTerminal === undefined) {
		return undefined;
	}
	return terminalCommands.get(activeTerminal)?.at(-1);
}

export function getActiveTerminalSelection(): string {
	try {
		return window.activeTerminal?.selection ?? '';
	} catch {
		// In case the API isn't available
		return '';
	}
}

let lastDetectedShellType: string | undefined;
export function getActiveTerminalShellType(): string {
	const activeTerminal = window.activeTerminal;

	// Prefer the state object as it's the most reliable
	if (activeTerminal?.state.shell) {
		return activeTerminal.state.shell;
	}

	if (activeTerminal && 'shellPath' in activeTerminal.creationOptions) {
		const shellPath = activeTerminal.creationOptions.shellPath;
		if (shellPath) {
			let candidateShellType: string | undefined;
			const shellFile = basename(shellPath);

			// Detect git bash specially as it depends on the .exe
			if (shellFile === 'bash.exe') {
				candidateShellType = 'Git Bash';
			} else {
				const shellFileWithoutExtension = shellFile.replace(/\..+/, '');
				switch (shellFileWithoutExtension) {
					case 'pwsh':
					case 'powershell':
						candidateShellType = 'powershell';
						break;
					case '':
						break;
					default:
						candidateShellType = shellFileWithoutExtension;
				}
			}
			if (candidateShellType) {
				lastDetectedShellType = candidateShellType;
				return candidateShellType;
			}
		}
	}

	// Fall back to the last detected shell type if it exists
	if (lastDetectedShellType) {
		return lastDetectedShellType;
	}

	// Fall back to bash or PowerShell, this uses the front end OS so it could give the wrong shell
	// when remoting from Windows into non-Windows or vice versa.
	return platform === 'win32' ? 'powershell' : 'bash';
}

function appendLimitedWindow<T>(target: T[], data: T) {
	target.push(data);
	if (target.length > 40) {
		// 40 data events should capture a minimum of about twice the typical visible area
		target.shift();
	}
}

export function installTerminalBufferListeners(): Disposable[] {
	return [
		window.onDidChangeTerminalState(t => {
			if (window.activeTerminal && t.processId === window.activeTerminal.processId) {
				const newShellType = t.state.shell;
				if (newShellType && newShellType !== lastDetectedShellType) {
					lastDetectedShellType = newShellType;
				}
			}
		}),
		window.onDidWriteTerminalData(e => {
			let dataBuffer = terminalBuffers.get(e.terminal);
			if (!dataBuffer) {
				dataBuffer = [];
				terminalBuffers.set(e.terminal, dataBuffer);
			}
			appendLimitedWindow(dataBuffer, removeAnsiEscapeCodes(e.data));
		}),
		window.onDidExecuteTerminalCommand(e => {
			let commands = terminalCommands.get(e.terminal);
			if (!commands) {
				commands = [];
				terminalCommands.set(e.terminal, commands);
			}
			appendLimitedWindow(commands, e);
		}),
		window.onDidCloseTerminal(e => {
			terminalBuffers.delete(e);
		})
	];
}
