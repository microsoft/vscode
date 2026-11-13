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
import { AgentHostExitHeartbeat, IAgentHostHeartbeatSource } from '../../node/agentHostExitHeartbeat.js';
import { ActionType, type ActionEnvelope } from '../../common/state/sessionActions.js';
import { ToolCallConfirmationReason, ToolCallContributorKind, ToolCallStatus, type ToolCallState } from '../../common/state/sessionState.js';
import { AgentHostProcessExitDiagnosticsCollector, formatAgentHostExit, formatAgentHostStartupFailure, formatAgentHostStartupPhase, IAgentHostHeartbeat, IAgentHostProcessExitDiagnosticsSource, IAgentHostProcessExitEvent, IAgentHostProcessMemorySample, identifyAgentHostExitCaller, parseAgentHostHeartbeatMessage, parseAgentHostStderr, toAgentHostHeartbeatMessage } from '../../common/agentHostProcessExit.js';

class TestProcessSource implements IAgentHostProcessExitDiagnosticsSource {
	readonly spawn = new Emitter<number | undefined>();
	readonly stderr = new Emitter<string>();
	readonly crash = new Emitter<{ readonly reason: string }>();
	readonly exit = new Emitter<{ readonly code: number; readonly signal: string }>();
	readonly message = new Emitter<unknown>();
	readonly onSpawn = this.spawn.event;
	readonly onStderr = this.stderr.event;
	readonly onMessage = this.message.event;
	readonly onCrash = this.crash.event;
	readonly onExit = this.exit.event;

	constructor(store: Pick<DisposableStore, 'add'>) {
		store.add(this.spawn);
		store.add(this.stderr);
		store.add(this.crash);
		store.add(this.exit);
		store.add(this.message);
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
		const collector = disposables.add(new AgentHostProcessExitDiagnosticsCollector(source, { sampleMemory: () => samples.shift() }, {
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
		const collector = disposables.add(new AgentHostProcessExitDiagnosticsCollector(source, { sampleMemory: () => undefined }, {
			gracePeriodMs: 500,
			memorySampleIntervalMs: 1000,
			stderrWindowMs: 1000,
			maxStderrLength: 1024,
		}));
		const exits: IAgentHostProcessExitEvent[] = [];
		disposables.add(collector.onDidExit(e => exits.push(e)));

		source.spawn.fire(42);
		// Unterminated, so it is still the incomplete last line at exit.
		source.stderr.fire('FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory');
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
		const collector = new AgentHostProcessExitDiagnosticsCollector(source, { sampleMemory: () => undefined });
		const exits: IAgentHostProcessExitEvent[] = [];
		disposables.add(collector.onDidExit(e => exits.push(e)));

		source.exit.fire({ code: 1, signal: 'unknown' });
		collector.dispose();
		await timeout(1000);

		assert.deepStrictEqual(exits, []);
	}));

	test('reports the last startup phase, heartbeat, OOM heap, and parent context', () => runWithFakedTimers({}, async () => {
		const source = new TestProcessSource(disposables);
		const collector = disposables.add(new AgentHostProcessExitDiagnosticsCollector(source, {
			sampleMemory: () => undefined,
			getExitContext: exitTime => ({ msSinceResume: exitTime - 1000, systemSuspended: false, quitRequested: false, lifecyclePhase: exitTime === Date.now() ? 3 : 4, windowCount: 2, agentsWindowConnected: false, osSessionEnd: 'none' }),
		}, {
			gracePeriodMs: 500,
			memorySampleIntervalMs: 60_000,
			stderrWindowMs: 60_000,
			maxStderrLength: 1024,
		}));
		const exits: IAgentHostProcessExitEvent[] = [];
		disposables.add(collector.onDidExit(e => exits.push(e)));
		const heartbeat = (heapUsedMb: number, activity: IAgentHostHeartbeat['activity']): IAgentHostHeartbeat => ({
			heapUsedMb, heapLimitMb: 4096, externalMb: 10, arrayBuffersMb: 5, rssMb: heapUsedMb + 200,
			activeTurns: 1, runningToolCalls: activity === 'turn' ? 0 : 1, loadedSessions: 3, connectedClients: 1, activity, lastAction: 'chat:toolCallStart',
		});

		source.spawn.fire(42);
		source.stderr.fire(formatAgentHostStartupPhase('main') + formatAgentHostStartupPhase('ready'));
		source.stderr.fire('<--- Last few GCs --->\n[1:0x1]  9000 ms: Mark-Compact (reduce) 4090.1 (4100.0) -> 4088.6 (4101.0) MB, pooled: 0 MB\n');
		for (let i = 0; i < 20; i++) {
			source.message.fire(toAgentHostHeartbeatMessage(heartbeat(i === 10 ? 3900 : 900 + i, i === 19 ? 'tool:mcp' : 'turn')));
			source.message.fire('unrelated message');
			await timeout(100);
		}
		// A stderr line split across chunks.
		const fatal = 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory';
		source.stderr.fire(fatal.slice(0, 20));
		source.stderr.fire(fatal.slice(20));
		await timeout(400);
		source.exit.fire({ code: 0xE0000008, signal: 'unknown' });
		await timeout(500);

		assert.deepStrictEqual(exits.map(e => e.diagnostics), [{
			reason: 'none',
			uptimeMs: 2400,
			fatalSignature: 'v8HeapOutOfMemory',
			exitPath: 'abrupt',
			oomHeapMb: 4089,
			lastStartupPhase: 'ready',
			startupPhaseAgeMs: 2400,
			heartbeat: heartbeat(919, 'tool:mcp'),
			heartbeatAgeMs: 500,
			peakHeapUsedMb: 3900,
			context: { msSinceResume: Date.now() - 500 - 1000, systemSuspended: false, quitRequested: false, lifecyclePhase: 3, windowCount: 2, agentsWindowConnected: false, osSessionEnd: 'none' },
		}]);
	}));

	test('keeps only bounded heartbeat values', () => {
		assert.deepStrictEqual([
			parseAgentHostHeartbeatMessage({ type: 'vscode:agentHostHeartbeat', heartbeat: { heapUsedMb: 12.6, heapLimitMb: -5, externalMb: '7', activeTurns: 1e12, activity: 'tool:mcp', lastAction: 'chat:/Users/me/secret' } }),
			parseAgentHostHeartbeatMessage({ type: 'vscode:agentHostHeartbeat', heartbeat: { heapUsedMb: 1, activity: 'reading /Users/me/secret' } }),
			parseAgentHostHeartbeatMessage({ type: 'other', heartbeat: { activity: 'idle' } }),
			parseAgentHostHeartbeatMessage('vscode:agentHostHeartbeat'),
		], [
			{ heapUsedMb: 13, heapLimitMb: 0, externalMb: 0, arrayBuffersMb: 0, rssMb: 0, activeTurns: 100_000, runningToolCalls: 0, loadedSessions: 0, connectedClients: 0, activity: 'tool:mcp' },
			undefined,
			undefined,
			undefined,
		]);
	});
});

suite('AgentHostExitHeartbeat', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('reports activity from running tool calls, sooner while busy or the heap fills, and promptly on turn changes', () => runWithFakedTimers({}, async () => {
		const envelopes = disposables.add(new Emitter<ActionEnvelope>());
		const runningToolCalls: ToolCallState[] = [];
		const state = { activeTurnCount: 0, heapUsed: 100 * 1024 * 1024 };
		const source: IAgentHostHeartbeatSource = {
			onDidEmitEnvelope: envelopes.event,
			get activeTurnCount() { return state.activeTurnCount; },
			loadedSessionCount: 2,
			connectedClientCount: 1,
			getRunningToolCalls: () => runningToolCalls,
		};
		const start = Date.now();
		const posts: { readonly atMs: number; readonly activity: string; readonly heapUsedMb: number; readonly lastAction?: string }[] = [];
		const emit = (type: ActionType) => envelopes.fire({ channel: 'chat', serverSeq: 0, origin: undefined, action: { type } as ActionEnvelope['action'] });
		const heartbeat = new AgentHostExitHeartbeat(source, h => posts.push({ atMs: Date.now() - start, activity: h.activity, heapUsedMb: h.heapUsedMb, ...(h.lastAction ? { lastAction: h.lastAction } : {}) }), {
			heapLimitBytes: 1000 * 1024 * 1024,
			readMemory: () => ({ heapUsed: state.heapUsed, external: 0, arrayBuffers: 0, rss: 0 }),
		});

		await timeout(30_000);
		// A turn starts: reported within the throttle interval. Streaming and bookkeeping actions are not reported as the last action.
		state.activeTurnCount = 1;
		emit(ActionType.ChatTurnStarted);
		emit(ActionType.RootActiveSessionsChanged);
		emit(ActionType.ChatDelta);
		await timeout(1000);
		// An auto-approved tool starts running: reported within the throttle interval, then every few seconds.
		runningToolCalls.push({ status: ToolCallStatus.Running, toolCallId: 't', toolName: 'tool', displayName: 'Tool', invocationMessage: 'Running', confirmed: ToolCallConfirmationReason.NotNeeded, contributor: { kind: ToolCallContributorKind.MCP, customizationId: 'server' } });
		emit(ActionType.ChatToolCallReady);
		await timeout(6500);
		// The heap passes half its limit: reported every second.
		state.heapUsed = 600 * 1024 * 1024;
		await timeout(6000);
		heartbeat.dispose();
		await timeout(60_000);

		assert.deepStrictEqual(posts, [
			{ atMs: 0, activity: 'idle', heapUsedMb: 100 },
			{ atMs: 30_000, activity: 'idle', heapUsedMb: 100 },
			{ atMs: 31_000, activity: 'turn', heapUsedMb: 100, lastAction: 'chat:turnStarted' },
			{ atMs: 32_000, activity: 'tool:mcp', heapUsedMb: 100, lastAction: 'chat:toolCallReady' },
			{ atMs: 37_000, activity: 'tool:mcp', heapUsedMb: 100, lastAction: 'chat:toolCallReady' },
			{ atMs: 42_000, activity: 'tool:mcp', heapUsedMb: 600, lastAction: 'chat:toolCallReady' },
			{ atMs: 43_000, activity: 'tool:mcp', heapUsedMb: 600, lastAction: 'chat:toolCallReady' },
		]);
	}));
});
