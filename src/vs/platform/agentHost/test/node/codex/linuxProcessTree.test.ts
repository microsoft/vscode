/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { timeout } from '../../../../../base/common/async.js';
import { isLinux } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILinuxProcessStat, ILinuxProcessTable, killLinuxProcessTree, parseLinuxProcessStat } from '../../../node/codex/linuxProcessTree.js';

interface IFakeProcess {
	readonly ppid: number;
	state: string;
	/** State reads before a requested stop takes effect; `Infinity` never stops. */
	stopDelay?: number;
	/** A child whose `clone()` completes while this process's stop is still pending. */
	forksWhileStopping?: number;
}

/** A process table in which `SIGSTOP` is delivered asynchronously, as on Linux. */
class FakeProcessTable implements ILinuxProcessTable {
	readonly signals: string[] = [];
	private _time = 0;
	readProcessesError: Error | undefined;

	constructor(private readonly _processes: Map<number, IFakeProcess>) { }

	get alive(): number[] {
		return [...this._processes.keys()].sort((a, b) => a - b);
	}

	get time(): number {
		return this._time;
	}

	readProcesses(): readonly ILinuxProcessStat[] {
		if (this.readProcessesError) {
			throw this.readProcessesError;
		}
		return [...this._processes].map(([pid, { ppid, state }]) => ({ pid, ppid, state }));
	}

	readState(pid: number): string | undefined {
		const process = this._processes.get(pid);
		if (process?.state === 'stopping') {
			if (process.forksWhileStopping !== undefined) {
				this._processes.set(process.forksWhileStopping, { ppid: pid, state: 'S' });
				process.forksWhileStopping = undefined;
			}
			if ((process.stopDelay = (process.stopDelay ?? 0) - 1) <= 0) {
				process.state = 'T';
			}
			return 'R';
		}
		return process?.state;
	}

	signal(pid: number, signal: 'SIGSTOP' | 'SIGKILL'): void {
		const process = this._processes.get(pid);
		if (!process) {
			throw new Error('ESRCH');
		}
		this.signals.push(`${signal} ${pid}`);
		if (signal === 'SIGKILL') {
			this._processes.delete(pid);
		} else {
			process.state = process.stopDelay || process.forksWhileStopping !== undefined ? 'stopping' : 'T';
		}
	}

	now(): number {
		return this._time;
	}

	sleep(ms: number): void {
		this._time += ms;
	}
}

function table(processes: Record<number, Omit<IFakeProcess, 'state'>>): FakeProcessTable {
	return new FakeProcessTable(new Map(Object.entries(processes).map(([pid, process]) => [Number(pid), { state: 'S', ...process }])));
}

suite('linuxProcessTree', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('stops the whole tree before killing it deepest first, leaving other processes alone', () => {
		const processes = table({ 10: { ppid: 1 }, 11: { ppid: 10 }, 12: { ppid: 11 }, 13: { ppid: 10 }, 20: { ppid: 1 }, 21: { ppid: 20 } });

		killLinuxProcessTree(10, processes);

		assert.deepStrictEqual({ signals: processes.signals, alive: processes.alive }, {
			signals: ['SIGSTOP 10', 'SIGSTOP 11', 'SIGSTOP 13', 'SIGSTOP 12', 'SIGKILL 12', 'SIGKILL 13', 'SIGKILL 11', 'SIGKILL 10'],
			alive: [20, 21],
		});
	});

	test('finds a child cloned while its parent is still stopping', () => {
		// The bubblewrap launcher's sandbox child would otherwise be missed and, once
		// the launcher is killed, block forever on an eventfd as an orphan.
		const processes = table({ 10: { ppid: 1 }, 11: { ppid: 10, stopDelay: 2, forksWhileStopping: 12 } });

		killLinuxProcessTree(10, processes);

		assert.deepStrictEqual({ signals: processes.signals, alive: processes.alive }, {
			signals: ['SIGSTOP 10', 'SIGSTOP 11', 'SIGSTOP 12', 'SIGKILL 12', 'SIGKILL 11', 'SIGKILL 10'],
			alive: [],
		});
	});

	test('still kills a process that does not stop before the deadline', () => {
		const processes = table({ 10: { ppid: 1 }, 11: { ppid: 10, stopDelay: Infinity }, 12: { ppid: 11 } });

		killLinuxProcessTree(10, processes, 25);

		assert.deepStrictEqual({ signals: processes.signals, alive: processes.alive, time: processes.time }, {
			signals: ['SIGSTOP 10', 'SIGSTOP 11', 'SIGSTOP 12', 'SIGKILL 12', 'SIGKILL 11', 'SIGKILL 10'],
			alive: [],
			time: 25,
		});
	});

	test('kills what it stopped when the process table becomes unreadable', () => {
		const processes = table({ 10: { ppid: 1 }, 11: { ppid: 10 } });
		processes.readProcessesError = new Error('EACCES');

		assert.throws(() => killLinuxProcessTree(10, processes), /EACCES/);
		assert.deepStrictEqual({ signals: processes.signals, alive: processes.alive }, {
			signals: ['SIGSTOP 10', 'SIGKILL 10'],
			alive: [11],
		});
	});

	test('does nothing when the root has already exited', () => {
		const processes = table({ 11: { ppid: 1 } });

		killLinuxProcessTree(10, processes);

		assert.deepStrictEqual({ signals: processes.signals, alive: processes.alive }, { signals: [], alive: [11] });
	});

	(isLinux ? test : test.skip)('kills a real process tree, including a grandchild that outlives its parent', async () => {
		const child = spawn('/bin/sh', ['-c', 'sh -c "sleep 60 & echo $!; wait" & wait'], { stdio: ['ignore', 'pipe', 'ignore'] });
		const exited = new Promise<NodeJS.Signals | null>(resolve => child.once('exit', (_code, signal) => resolve(signal)));
		const grandchild = await new Promise<number>(resolve => child.stdout.once('data', data => resolve(Number.parseInt(String(data), 10))));
		// SIGKILL is delivered asynchronously; allow the grandchild a moment to die.
		const isRunning = async (pid: number) => {
			for (let attempt = 0; attempt < 50; attempt++) {
				const stat = parseLinuxProcessStat(await fs.readFile(`/proc/${pid}/stat`, 'utf8').catch(() => ''));
				if (stat === undefined || stat.state === 'Z' || stat.state === 'X') {
					return false;
				}
				await timeout(20);
			}
			return true;
		};
		try {
			killLinuxProcessTree(child.pid!);

			assert.deepStrictEqual({ signal: await exited, grandchildRunning: await isRunning(grandchild) }, { signal: 'SIGKILL', grandchildRunning: false });
		} finally {
			try { process.kill(grandchild, 'SIGKILL'); } catch { /* already exited */ }
		}
	});

	test('parses stat lines whose command name contains spaces and parentheses', () => {
		assert.deepStrictEqual([
			parseLinuxProcessStat('33198 (bwrap) S 1 33194 33194 0 -1 4194560'),
			parseLinuxProcessStat('42 (a) (b c) T 7 42 42 0 -1'),
			parseLinuxProcessStat('garbage'),
		], [
			{ pid: 33198, ppid: 1, state: 'S' },
			{ pid: 42, ppid: 7, state: 'T' },
			undefined,
		]);
	});
});
