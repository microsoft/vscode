/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { cleanData } from '../../../telemetry/common/telemetryUtils.js';
import { AgentHostProcessExitDiagnosticsCollector, formatAgentHostExit, formatAgentHostStartupFailure, IAgentHostProcessExitDiagnosticsSource, IAgentHostProcessExitEvent, IAgentHostProcessMemorySample, identifyAgentHostExitCaller, parseAgentHostStderr } from '../../common/agentHostProcessExit.js';

class TestProcessSource implements IAgentHostProcessExitDiagnosticsSource {
	readonly spawn = new Emitter<number | undefined>();
	readonly stderr = new Emitter<string>();
	readonly crash = new Emitter<{ readonly reason: string }>();
	readonly exit = new Emitter<{ readonly code: number; readonly signal: string }>();
	readonly onSpawn = this.spawn.event;
	readonly onStderr = this.stderr.event;
	readonly onCrash = this.crash.event;
	readonly onExit = this.exit.event;

	constructor(store: Pick<DisposableStore, 'add'>) {
		store.add(this.spawn);
		store.add(this.stderr);
		store.add(this.crash);
		store.add(this.exit);
	}
}

suite('AgentHostProcessExit', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('classifies final stderr without retaining unmarked text', () => {
		const startupError = Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });
		startupError.stack = 'Error: database is locked\n    at initialize (agentHostDatabase.js:1:1)';

		assert.deepStrictEqual([
			parseAgentHostStderr('<--- Last few GCs --->\nFATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory\n'),
			parseAgentHostStderr('# Fatal error in V8\nCheck failed: value.IsString()\n'),
			parseAgentHostStderr(`Error: libc.so.6: version 'GLIBC_2.38' not found\n${formatAgentHostStartupFailure(startupError)}${formatAgentHostExit('processExit', 'agentHostMain')}`),
			parseAgentHostStderr(`${formatAgentHostStartupFailure(startupError)}${formatAgentHostExit('processExit', 'agentHostMain')}`),
			parseAgentHostStderr(formatAgentHostExit('eventLoopDrained', undefined)),
			parseAgentHostStderr('[agentHost:exit] {"path":"processExit","caller":"/Users/me/secret/file"}\n[agentHost:startupFailure] not-json\n'),
		], [
			{ fatalSignature: 'v8HeapOutOfMemory', exitPath: 'abrupt' },
			{ fatalSignature: 'v8Fatal', exitPath: 'abrupt' },
			{
				fatalSignature: 'nativeModuleLoad',
				exitPath: 'processExit',
				exitCaller: 'agentHostMain',
				startupFailure: { name: 'Error', code: 'SQLITE_BUSY', msg: 'database is locked', callstack: 'Error: database is locked\n    at initialize (agentHostDatabase.js:1:1)' },
			},
			{
				fatalSignature: 'startupFailure',
				exitPath: 'processExit',
				exitCaller: 'agentHostMain',
				startupFailure: { name: 'Error', code: 'SQLITE_BUSY', msg: 'database is locked', callstack: 'Error: database is locked\n    at initialize (agentHostDatabase.js:1:1)' },
			},
			{ fatalSignature: 'none', exitPath: 'eventLoopDrained' },
			{ fatalSignature: 'none', exitPath: 'processExit' },
		]);
	});

	test('reduces process.exit callers to telemetry-safe package names or VS Code module names', () => {
		const callers = [
			identifyAgentHostExitCaller('Error\n    at Object.<anonymous> (C:\\Users\\me\\AppData\\Roaming\\Code\\agent-host\\sdk-cache\\claude\\node_modules\\@anthropic-ai\\claude-agent-sdk\\sdk.mjs:12:3)', 'C:\\Program Files\\Code\\resources\\app'),
			identifyAgentHostExitCaller('Error\n    at file:///Applications/Code.app/Contents/Resources/app/node_modules.asar/koffi/index.js:1:2', '/Applications/Code.app/Contents/Resources/app'),
			identifyAgentHostExitCaller('Error\n    at load (C:\\Program Files\\Code\\resources\\app\\node_modules.asar.unpacked\\@vscode\\sqlite3\\lib\\sqlite3.js:4:1)', 'C:\\Program Files\\Code\\resources\\app'),
			identifyAgentHostExitCaller('Error\n    at file:///home/me/vscode/node_modules/koffi/index.js:1:2', '/home/me/vscode'),
			identifyAgentHostExitCaller('Error\n    at Timeout._onTimeout (C:\\Program Files\\Code\\resources\\app\\out\\bootstrap-fork.js:181:13)', 'c:\\program files\\code\\resources\\app'),
			identifyAgentHostExitCaller('Error\n    at file:///home/me/vscode/out/vs/platform/agentHost/node/agentHostMain.js:70:3', '/home/me/vscode/'),
			identifyAgentHostExitCaller('Error\n    at run (/home/me/jsmith-secret-project/run.js:1:1)', '/home/me/vscode'),
			identifyAgentHostExitCaller('Error\n    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)', '/home/me/vscode'),
			identifyAgentHostExitCaller(undefined, '/home/me/vscode'),
		];
		const expected = [
			'@anthropic-ai:claude-agent-sdk',
			'koffi',
			'@vscode:sqlite3',
			'koffi',
			'bootstrap-fork',
			'agentHostMain',
			'external',
			'node',
			'unknown',
		];

		assert.deepStrictEqual({
			callers,
			cleaned: callers.map(exitCaller => cleanData({ exitCaller }, []).exitCaller),
			parsed: parseAgentHostStderr(formatAgentHostExit('processExit', '@anthropic-ai:claude-agent-sdk')).exitCaller,
		}, {
			callers: expected,
			cleaned: expected,
			parsed: '@anthropic-ai:claude-agent-sdk',
		});
	});

	test('reports exit diagnostics after the grace period', () => runWithFakedTimers({}, async () => {
		const source = new TestProcessSource(disposables);
		const samples: IAgentHostProcessMemorySample[] = [
			{ workingSetKb: 1024 * 1024, peakWorkingSetKb: 2048 * 1024 },
			{ workingSetKb: 3072 * 1024 },
		];
		const collector = disposables.add(new AgentHostProcessExitDiagnosticsCollector(source, () => samples.shift(), {
			gracePeriodMs: 500,
			memorySampleIntervalMs: 1000,
			stderrWindowMs: 5000,
			maxStderrLength: 1024,
		}));
		const exits: IAgentHostProcessExitEvent[] = [];
		disposables.add(collector.onDidExit(e => exits.push(e)));

		source.spawn.fire(42);
		source.stderr.fire('FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory\n');
		await timeout(2500);
		source.stderr.fire('[agentHost:exit] {"path":"processExit","caller":"bootstrap-fork"}\n');
		source.exit.fire({ code: 0, signal: 'unknown' });
		const exitsBeforeGracePeriod = exits.length;
		source.crash.fire({ reason: 'clean-exit' });
		await timeout(500);

		assert.deepStrictEqual({ exitsBeforeGracePeriod, exits }, {
			exitsBeforeGracePeriod: 0,
			exits: [{
				code: 0,
				signal: 'unknown',
				diagnostics: {
					reason: 'clean-exit',
					uptimeMs: 2500,
					fatalSignature: 'v8HeapOutOfMemory',
					exitPath: 'processExit',
					exitCaller: 'bootstrap-fork',
					workingSetMb: 3072,
					peakWorkingSetMb: 3072,
					memorySampleAgeMs: 500,
				},
			}],
		});
	}));

	test('ignores stderr before the exit window and reports no crash reason when Electron reports none', () => runWithFakedTimers({}, async () => {
		const source = new TestProcessSource(disposables);
		const collector = disposables.add(new AgentHostProcessExitDiagnosticsCollector(source, () => undefined, {
			gracePeriodMs: 500,
			memorySampleIntervalMs: 1000,
			stderrWindowMs: 1000,
			maxStderrLength: 1024,
		}));
		const exits: IAgentHostProcessExitEvent[] = [];
		disposables.add(collector.onDidExit(e => exits.push(e)));

		source.spawn.fire(42);
		source.stderr.fire('FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory\n');
		await timeout(2000);
		source.exit.fire({ code: 3221225477, signal: 'unknown' });
		await timeout(500);

		assert.deepStrictEqual(exits, [{
			code: 3221225477,
			signal: 'unknown',
			diagnostics: { reason: 'none', uptimeMs: 2000, fatalSignature: 'none', exitPath: 'abrupt' },
		}]);
	}));

	test('does not report an exit after disposal', () => runWithFakedTimers({}, async () => {
		const source = new TestProcessSource(disposables);
		const collector = new AgentHostProcessExitDiagnosticsCollector(source, () => undefined);
		const exits: IAgentHostProcessExitEvent[] = [];
		disposables.add(collector.onDidExit(e => exits.push(e)));

		source.exit.fire({ code: 1, signal: 'unknown' });
		collector.dispose();
		await timeout(1000);

		assert.deepStrictEqual(exits, []);
	}));
});
