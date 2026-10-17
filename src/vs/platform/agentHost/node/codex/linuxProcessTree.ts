/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';

/** The fields of `/proc/<pid>/stat` needed to walk and freeze a process tree. */
export interface ILinuxProcessStat {
	readonly pid: number;
	readonly ppid: number;
	/** One-letter scheduler state, for example `R`, `S`, `D`, `T`, or `Z`. */
	readonly state: string;
}

/** Process-table access, injectable so the termination order can be tested. */
export interface ILinuxProcessTable {
	/** Reads every live process. */
	readProcesses(): readonly ILinuxProcessStat[];
	/** Reads one process's state, or `undefined` when it no longer exists. */
	readState(pid: number): string | undefined;
	/** Sends a signal; throws when the process does not exist. */
	signal(pid: number, signal: 'SIGSTOP' | 'SIGKILL'): void;
	now(): number;
	sleep(ms: number): void;
}

/**
 * Parses `/proc/<pid>/stat`. The command name is parenthesized and may itself
 * contain spaces and parentheses, so the remaining fields follow its last `)`.
 */
export function parseLinuxProcessStat(text: string): ILinuxProcessStat | undefined {
	const commandEnd = text.lastIndexOf(')');
	if (commandEnd === -1) {
		return undefined;
	}
	const pid = Number.parseInt(text, 10);
	const [state, ppid] = text.slice(commandEnd + 2).split(' ');
	const parentPid = Number.parseInt(ppid, 10);
	if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(parentPid) || !state) {
		return undefined;
	}
	return { pid, ppid: parentPid, state };
}

function readStat(pid: number | string): ILinuxProcessStat | undefined {
	try {
		// eslint-disable-next-line local/code-no-sync-fs -- Reads kernel-generated /proc state. The walk runs during teardown, including process exit, and must finish before returning: an interrupted asynchronous walk would leave frozen processes behind.
		return parseLinuxProcessStat(fs.readFileSync(`/proc/${pid}/stat`, 'utf8'));
	} catch {
		// The process exited while the table was being read.
		return undefined;
	}
}

const procfs: ILinuxProcessTable = {
	readProcesses: () => {
		const processes: ILinuxProcessStat[] = [];
		// eslint-disable-next-line local/code-no-sync-fs -- Lists kernel-generated /proc entries; see readStat for why the walk is synchronous.
		for (const entry of fs.readdirSync('/proc')) {
			if (/^\d+$/.test(entry)) {
				const stat = readStat(entry);
				if (stat) {
					processes.push(stat);
				}
			}
		}
		return processes;
	},
	readState: pid => readStat(pid)?.state,
	signal: (pid, signal) => { process.kill(pid, signal); },
	now: () => Date.now(),
	sleep: ms => {
		try {
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
		} catch {
			// Blocking waits are unavailable in this context; the caller polls until its deadline.
		}
	},
};

/** States in which a process can no longer run or create children. */
function isQuiescent(state: string | undefined): boolean {
	return state === undefined || state === 'T' || state === 't' || state === 'Z' || state === 'X';
}

/**
 * Synchronously kills a Linux process and all of its descendants, including
 * descendants that would otherwise outlive their parent.
 *
 * Each process is stopped, and observed to be stopped, before its children are
 * enumerated, so no process can create a child that the walk misses. `SIGSTOP`
 * is delivered asynchronously: a process inside `clone()` completes it before
 * stopping. A process that does not stop within `stopTimeoutMs` (for example,
 * one in uninterruptible sleep) is still killed. Every stopped process is then
 * killed, deepest first, so none is reparented while its parent is alive.
 */
export function killLinuxProcessTree(rootPid: number, table: ILinuxProcessTable = procfs, stopTimeoutMs = 100): void {
	const deadline = table.now() + stopTimeoutMs;
	const stopped: number[] = [];
	const seen = new Set<number>([rootPid]);
	try {
		let level = [rootPid];
		while (level.length > 0) {
			const parents = new Set<number>();
			for (const pid of level) {
				try {
					table.signal(pid, 'SIGSTOP');
				} catch {
					// Exited; its children, if any, were reparented outside the tree.
					continue;
				}
				stopped.push(pid);
				parents.add(pid);
			}
			for (const pid of parents) {
				while (!isQuiescent(table.readState(pid)) && table.now() < deadline) {
					table.sleep(1);
				}
			}
			level = [];
			for (const process of table.readProcesses()) {
				if (parents.has(process.ppid) && !seen.has(process.pid)) {
					seen.add(process.pid);
					level.push(process.pid);
				}
			}
		}
	} finally {
		for (let index = stopped.length - 1; index >= 0; index--) {
			try {
				table.signal(stopped[index], 'SIGKILL');
			} catch {
				// Already exited.
			}
		}
	}
}
