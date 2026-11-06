/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile } from 'child_process';
import { l10n, Terminal, window } from 'vscode';
import { Disposable, IDisposable } from '../../../../util/vs/base/common/lifecycle';
import { isWindows } from '../../../../util/vs/base/common/platform';
import { createDecorator } from '../../../../util/vs/platform/instantiation/common/instantiation';

export const ICopilotCLISessionTracker = createDecorator<ICopilotCLISessionTracker>('ICopilotCLISessionTracker');

export interface SessionProcessInfo {
	readonly pid: number;
	readonly ppid: number;
}

export interface ICopilotCLISessionTracker extends Disposable {
	readonly _serviceBrand: undefined;
	/**
	 * Record the PID and PPID for a newly connected session.
	 * Returns a disposable that removes the session when disposed.
	 */
	registerSession(sessionId: string, info: SessionProcessInfo): IDisposable;

	/**
	 * Set the display name for a session (called by the CLI).
	 */
	setSessionName(sessionId: string, name: string): void;

	/**
	 * Get a display name for a session, falling back to the sessionId.
	 */
	getSessionDisplayName(sessionId: string): string;

	/**
	 * Get the IDs of all connected sessions.
	 */
	getSessionIds(): readonly string[];

	/**
	 * Directly associate a terminal with a session.
	 * The mapping is automatically removed when the terminal is closed.
	 */
	setSessionTerminal(sessionId: string, terminal: Terminal): void;

	/**
	 * Get the terminal associated with a session.
	 * Returns `undefined` if no matching terminal is found.
	 */
	getTerminal(sessionId: string): Promise<Terminal | undefined>;
}

export class CopilotCLISessionTracker extends Disposable implements ICopilotCLISessionTracker {
	declare _serviceBrand: undefined;
	private readonly _sessions = new Map<string, SessionProcessInfo>();
	private readonly _sessionNames = new Map<string, string>();
	private readonly _sessionTerminals = new Map<string, Terminal>();
	private readonly _grandparentPids = new Map<string, number[]>();

	constructor() {
		super();
		this._register(window.onDidCloseTerminal(closedTerminal => {
			for (const [id, t] of this._sessionTerminals) {
				if (t === closedTerminal) {
					this._sessionTerminals.delete(id);
				}
			}
		}));
	}
	registerSession(sessionId: string, info: SessionProcessInfo): IDisposable {
		this._sessions.set(sessionId, info);
		return {
			dispose: () => {
				this._sessions.delete(sessionId);
				this._sessionNames.delete(sessionId);
				this._sessionTerminals.delete(sessionId);
				this._grandparentPids.delete(sessionId);
			}
		};
	}

	setSessionName(sessionId: string, name: string): void {
		this._sessionNames.set(sessionId, name);
	}

	getSessionDisplayName(sessionId: string): string {
		return this._sessionNames.get(sessionId) || l10n.t('Copilot CLI Session');
	}

	getSessionIds(): readonly string[] {
		return Array.from(this._sessions.keys());
	}

	setSessionTerminal(sessionId: string, terminal: Terminal): void {
		this._sessionTerminals.set(sessionId, terminal);
	}

	async getTerminal(sessionId: string): Promise<Terminal | undefined> {
		// Check direct terminal mapping first
		const directTerminal = this._sessionTerminals.get(sessionId);
		if (directTerminal) {
			return directTerminal;
		}

		const info = this._sessions.get(sessionId);
		if (!info) {
			return undefined;
		}

		// Try matching by PPID first
		const matchByPpid = await this._findTerminalByPid(info.ppid);
		if (matchByPpid) {
			return matchByPpid;
		}

		// Fallback: try the grandparent PID (PPID of the PPID), using cache
		// Try fetching up to 4 generations of parent PIDs to account for different shell configurations (e.g. login shells, shell wrappers)
		const ppids = this._grandparentPids.get(sessionId) ?? [];
		this._grandparentPids.set(sessionId, ppids);
		let previousPpid = info.ppid;
		for (let index = 0; index < 4; index++) {
			if (ppids.length <= index) {
				const pid = await getParentPid(previousPpid);
				if (pid) {
					ppids.push(pid);
				} else {
					break;
				}
			}
			const pid = ppids[index];
			previousPpid = pid;
			const terminal = pid ? await this._findTerminalByPid(pid) : undefined;
			if (terminal) {
				this._sessionTerminals.set(sessionId, terminal);
				return terminal;
			}
		}

		return undefined;
	}

	private async _findTerminalByPid(targetPid: number): Promise<Terminal | undefined> {
		const terminalPids = window.terminals.map(t => t.processId.then(pid => ({ terminal: t, pid })));

		for (const promise of terminalPids) {
			try {
				const { terminal, pid } = await promise;
				if (pid && targetPid === pid) {
					return terminal;
				}
			} catch {
				//
			}
		}

		return undefined;
	}
}

/**
 * Look up the parent PID of a given process.
 * Uses PowerShell on Windows and `ps` on Linux/macOS.
 * Returns `undefined` if the lookup fails for any reason.
 */
export async function getParentPid(pid: number): Promise<number | undefined> {
	try {
		const stdout = await new Promise<string>((resolve, reject) => {
			const args = isWindows
				? ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").ParentProcessId`]
				: ['-o', 'ppid=', '-p', String(pid)];
			const cmd = isWindows ? 'powershell.exe' : 'ps';
			execFile(cmd, args, { windowsHide: true }, (err, out) => {
				if (err) {
					reject(err);
				} else {
					resolve(out);
				}
			});
		});

		const parsed = parseInt(stdout.trim(), 10);
		return isNaN(parsed) ? undefined : parsed;
	} catch {
		return undefined;
	}
}
