/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { IPty, IPtyForkOptions, IWindowsPtyForkOptions } from 'node-pty';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { ActionType, StateAction } from '../../common/state/protocol/actions.js';
import { TerminalClaimKind, TerminalContentPart } from '../../common/state/protocol/state.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostTerminalManager, formatTerminalText, removeServerHandledTerminalQueries, type ITerminalQueryFilterState } from '../../node/agentHostTerminalManager.js';
import { Osc633Event, Osc633EventType, Osc633Parser } from '../../node/osc633Parser.js';

/**
 * Tests for the command detection integration in AgentHostTerminalManager.
 *
 * Since AgentHostTerminalManager.createTerminal requires node-pty, these tests
 * exercise the data-handling logic (OSC parsing → action dispatch → content
 * tracking) in isolation by simulating the internal flow.
 */

// ── Helpers to simulate the terminal manager's data pipeline ─────────

/** Minimal command tracker mirroring AgentHostTerminalManager's ICommandTracker. */
interface ITestCommandTracker {
	readonly parser: Osc633Parser;
	readonly nonce: string;
	commandCounter: number;
	detectionAvailableEmitted: boolean;
	pendingCommandLine?: string;
	activeCommandId?: string;
	activeCommandTimestamp?: number;
}

/**
 * Simplified version of AgentHostTerminalManager's data handling pipeline
 * that can be tested without node-pty or a real AgentHostStateManager.
 */
class TestTerminalDataHandler {
	readonly dispatched: StateAction[] = [];
	content: TerminalContentPart[] = [];
	cwd = '/home/user';
	private readonly _terminalQueryFilterState: ITerminalQueryFilterState = { pendingData: '' };

	constructor(
		readonly uri: string,
		readonly tracker: ITestCommandTracker,
	) { }

	/** Simulates AgentHostTerminalManager._handlePtyData */
	handlePtyData(rawData: string): string {
		const parseResult = this.tracker.parser.parse(rawData);
		const cleanedData = removeServerHandledTerminalQueries(parseResult.cleanedData, this._terminalQueryFilterState);

		for (const event of parseResult.events) {
			this._handleOsc633Event(event);
		}

		if (cleanedData.length > 0) {
			this._appendToContent(cleanedData);
		}

		return cleanedData;
	}

	private _handleOsc633Event(event: Osc633Event): void {
		if (!this.tracker.detectionAvailableEmitted) {
			this.tracker.detectionAvailableEmitted = true;
			this.dispatched.push({
				type: ActionType.TerminalCommandDetectionAvailable,
				terminal: this.uri,
			});
		}

		switch (event.type) {
			case Osc633EventType.CommandLine: {
				if (event.nonce === this.tracker.nonce) {
					this.tracker.pendingCommandLine = event.commandLine;
				}
				break;
			}
			case Osc633EventType.CommandExecuted: {
				const commandId = `cmd-${++this.tracker.commandCounter}`;
				const commandLine = this.tracker.pendingCommandLine ?? '';
				const timestamp = Date.now();
				this.tracker.pendingCommandLine = undefined;
				this.tracker.activeCommandId = commandId;
				this.tracker.activeCommandTimestamp = timestamp;

				this.content.push({
					type: 'command',
					commandId,
					commandLine,
					output: '',
					timestamp,
					isComplete: false,
				});

				this.dispatched.push({
					type: ActionType.TerminalCommandExecuted,
					terminal: this.uri,
					commandId,
					commandLine,
					timestamp,
				});
				break;
			}
			case Osc633EventType.CommandFinished: {
				const finishedCommandId = this.tracker.activeCommandId;
				if (!finishedCommandId) {
					break;
				}
				const durationMs = this.tracker.activeCommandTimestamp !== undefined
					? Date.now() - this.tracker.activeCommandTimestamp
					: undefined;

				for (const part of this.content) {
					if (part.type === 'command' && part.commandId === finishedCommandId) {
						part.isComplete = true;
						part.exitCode = event.exitCode;
						part.durationMs = durationMs;
						break;
					}
				}

				this.tracker.activeCommandId = undefined;
				this.tracker.activeCommandTimestamp = undefined;

				this.dispatched.push({
					type: ActionType.TerminalCommandFinished,
					terminal: this.uri,
					commandId: finishedCommandId,
					exitCode: event.exitCode,
					durationMs,
				});
				break;
			}
			case Osc633EventType.Property: {
				if (event.key === 'Cwd') {
					this.cwd = event.value;
					this.dispatched.push({
						type: ActionType.TerminalCwdChanged,
						terminal: this.uri,
						cwd: event.value,
					});
				}
				break;
			}
		}
	}

	private _appendToContent(data: string): void {
		const tail = this.content.length > 0 ? this.content[this.content.length - 1] : undefined;
		if (tail && tail.type === 'command' && !tail.isComplete) {
			tail.output += data;
		} else if (tail && tail.type === 'unclassified') {
			tail.value += data;
		} else {
			this.content.push({ type: 'unclassified', value: data });
		}
	}
}

class TestPty implements IPty {
	readonly pid = 1;
	cols = 80;
	rows = 24;
	process = 'test-shell';
	handleFlowControl = false;
	readonly writes: string[] = [];
	readonly dataListenerRegistered = new DeferredPromise<void>();

	private readonly _onData = new Emitter<string>();
	readonly onData: IPty['onData'] = listener => {
		this.dataListenerRegistered.complete();
		return this._onData.event(data => listener(data));
	};

	private readonly _onExit = new Emitter<{ exitCode: number; signal?: number }>();
	readonly onExit: IPty['onExit'] = listener => this._onExit.event(data => listener(data));

	fireData(data: string): void {
		this._onData.fire(data);
	}

	resize(columns: number, rows: number): void {
		this.cols = columns;
		this.rows = rows;
	}

	clear(): void { }

	write(data: string | Buffer): void {
		this.writes.push(typeof data === 'string' ? data : data.toString());
	}

	kill(): void { }
	pause(): void { }
	resume(): void { }
}

class TestAgentHostTerminalManager extends AgentHostTerminalManager {
	constructor(
		stateManager: AgentHostStateManager,
		logService: NullLogService,
		productService: IProductService,
		configurationService: AgentConfigurationService,
		private readonly _pty: TestPty,
	) {
		super(stateManager, logService, productService, configurationService);
	}

	protected override async _spawnPty(_file: string, _args: string[], options: IPtyForkOptions | IWindowsPtyForkOptions): Promise<IPty> {
		this._pty.cols = options.cols ?? this._pty.cols;
		this._pty.rows = options.rows ?? this._pty.rows;
		return this._pty;
	}
}

function osc633(payload: string): string {
	return `\x1b]633;${payload}\x07`;
}

function createHandler(nonce = 'test-nonce'): TestTerminalDataHandler {
	return new TestTerminalDataHandler('terminal://test', {
		parser: new Osc633Parser(),
		nonce,
		commandCounter: 0,
		detectionAvailableEmitted: false,
	});
}

async function waitForWrites(pty: TestPty, count: number): Promise<void> {
	for (let i = 0; i < 20; i++) {
		if (pty.writes.length >= count) {
			return;
		}
		await timeout(10);
	}
}

suite('AgentHostTerminalManager – command detection integration', () => {

	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('formats command input with terminal enter semantics', () => {
		assert.strictEqual(formatTerminalText('echo first\necho second', { shouldExecute: true }), 'echo first\recho second\r');
		assert.strictEqual(formatTerminalText('echo first\r\necho second', { shouldExecute: true }), 'echo first\recho second\r');
		assert.strictEqual(formatTerminalText('echo first\r', { shouldExecute: true }), 'echo first\r');
		assert.strictEqual(formatTerminalText('answer\n', { shouldExecute: false }), 'answer\r');
		assert.strictEqual(formatTerminalText('/tmp/foo\npwd', { shouldExecute: true }), '/tmp/foo\rpwd\r');
		assert.strictEqual(formatTerminalText('echo first\necho second', { shouldExecute: true, forceBracketedPasteMode: true }), '\x1b[200~echo first\recho second\x1b[201~\r');
		assert.strictEqual(formatTerminalText('answer\n', { shouldExecute: false, forceBracketedPasteMode: true }), '\x1b[200~answer\r\x1b[201~');
	});

	test('writes formatted command input to the PTY', async () => {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		const productService = { _serviceBrand: undefined, applicationName: 'vscode' } as IProductService;
		const pty = new TestPty();
		const manager = disposables.add(new TestAgentHostTerminalManager(stateManager, logService, productService, configurationService, pty));

		const createTerminal = manager.createTerminal({
			terminal: 'agenthost-terminal://test/command-input',
			claim: { kind: TerminalClaimKind.Client, clientId: 'test-client' },
			cwd: process.cwd(),
			cols: 80,
			rows: 24,
		}, { shell: '/bin/bash' });

		await pty.dataListenerRegistered.p;
		pty.fireData('prompt');
		await createTerminal;

		await manager.sendText('agenthost-terminal://test/command-input', 'echo first\necho second', { shouldExecute: true });

		assert.deepStrictEqual(pty.writes, ['echo first\recho second\r']);
	});

	test('writes bracketed paste command input when enabled by the terminal', async () => {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		const productService = { _serviceBrand: undefined, applicationName: 'vscode' } as IProductService;
		const pty = new TestPty();
		const manager = disposables.add(new TestAgentHostTerminalManager(stateManager, logService, productService, configurationService, pty));

		const createTerminal = manager.createTerminal({
			terminal: 'agenthost-terminal://test/bracketed-paste',
			claim: { kind: TerminalClaimKind.Client, clientId: 'test-client' },
			cwd: process.cwd(),
			cols: 80,
			rows: 24,
		}, { shell: '/bin/bash' });

		await pty.dataListenerRegistered.p;
		pty.fireData('\x1b[?2004h');
		await createTerminal;

		await manager.sendText('agenthost-terminal://test/bracketed-paste', 'echo first\necho second', { shouldExecute: true, bracketedPasteMode: true });

		assert.deepStrictEqual(pty.writes, ['\x1b[200~echo first\recho second\x1b[201~\r']);
	});

	test('does not write bracketed paste command input when disabled by the terminal', async () => {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		const productService = { _serviceBrand: undefined, applicationName: 'vscode' } as IProductService;
		const pty = new TestPty();
		const manager = disposables.add(new TestAgentHostTerminalManager(stateManager, logService, productService, configurationService, pty));

		const createTerminal = manager.createTerminal({
			terminal: 'agenthost-terminal://test/bracketed-paste-disabled',
			claim: { kind: TerminalClaimKind.Client, clientId: 'test-client' },
			cwd: process.cwd(),
			cols: 80,
			rows: 24,
		}, { shell: '/bin/bash' });

		await pty.dataListenerRegistered.p;
		pty.fireData('prompt');
		await createTerminal;

		await manager.sendText('agenthost-terminal://test/bracketed-paste-disabled', 'echo first\necho second', { shouldExecute: true, bracketedPasteMode: true });

		assert.deepStrictEqual(pty.writes, ['echo first\recho second\r']);
	});

	test('writes headless DSR responses back to the PTY', async () => {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		const productService = { _serviceBrand: undefined, applicationName: 'vscode' } as IProductService;
		const pty = new TestPty();
		const manager = disposables.add(new TestAgentHostTerminalManager(stateManager, logService, productService, configurationService, pty));

		const createTerminal = manager.createTerminal({
			terminal: 'agenthost-terminal://test/dsr',
			claim: { kind: TerminalClaimKind.Client, clientId: 'test-client' },
			cwd: process.cwd(),
			cols: 80,
			rows: 24,
		}, { shell: '/bin/bash' });

		await pty.dataListenerRegistered.p;
		pty.fireData('abc\x1b[6n');
		await createTerminal;
		await waitForWrites(pty, 1);

		assert.deepStrictEqual(pty.writes, ['\x1b[1;4R']);
	});

	test('resolves alt-buffer promise from headless terminal data', async () => {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		const productService = { _serviceBrand: undefined, applicationName: 'vscode' } as IProductService;
		const pty = new TestPty();
		const manager = disposables.add(new TestAgentHostTerminalManager(stateManager, logService, productService, configurationService, pty));
		const uri = 'agenthost-terminal://test/alt-buffer';

		const createTerminal = manager.createTerminal({
			terminal: uri,
			claim: { kind: TerminalClaimKind.Client, clientId: 'test-client' },
			cwd: process.cwd(),
			cols: 80,
			rows: 24,
		}, { shell: '/bin/bash' });

		await pty.dataListenerRegistered.p;
		pty.fireData('prompt');
		await createTerminal;

		const altBufferStore = disposables.add(new DisposableStore());
		const altBufferPromise = manager.createAltBufferPromise(uri, altBufferStore);

		pty.fireData('\x1b[?1049h');

		await altBufferPromise;
	});

	test('disposed alt-buffer promise listener does not resolve', async () => {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		const productService = { _serviceBrand: undefined, applicationName: 'vscode' } as IProductService;
		const pty = new TestPty();
		const manager = disposables.add(new TestAgentHostTerminalManager(stateManager, logService, productService, configurationService, pty));
		const uri = 'agenthost-terminal://test/alt-buffer-disposed';

		const createTerminal = manager.createTerminal({
			terminal: uri,
			claim: { kind: TerminalClaimKind.Client, clientId: 'test-client' },
			cwd: process.cwd(),
			cols: 80,
			rows: 24,
		}, { shell: '/bin/bash' });

		await pty.dataListenerRegistered.p;
		pty.fireData('prompt');
		await createTerminal;

		const altBufferStore = new DisposableStore();
		const altBufferPromise = manager.createAltBufferPromise(uri, altBufferStore);
		let didEnterAltBuffer = false;
		void altBufferPromise.then(() => didEnterAltBuffer = true);
		altBufferStore.dispose();
		pty.fireData('\x1b[?1049h');
		await timeout(10);

		assert.strictEqual(didEnterAltBuffer, false);
	});

	test('server-handled CPR queries are stripped from client-facing data', () => {
		function filter(data: string): string {
			return removeServerHandledTerminalQueries(data, { pendingData: '' });
		}

		assert.strictEqual(filter('before \x1b[6n after'), 'before  after');
		assert.strictEqual(filter('before \x1b[?6n after'), 'before  after');
		assert.strictEqual(filter('\x1b[5n\x1b[c\x1b[0c\x1b[>c\x1b[>0c'), '\x1b[5n\x1b[c\x1b[0c\x1b[>c\x1b[>0c');
		assert.strictEqual(filter('normal output\r\n'), 'normal output\r\n');
	});

	test('server-handled CPR queries are stripped across data chunks', () => {
		let state: ITerminalQueryFilterState = { pendingData: '' };
		assert.strictEqual(removeServerHandledTerminalQueries('before \x1b[', state), 'before ');
		assert.strictEqual(removeServerHandledTerminalQueries('6n after', state), ' after');

		state = { pendingData: '' };
		assert.strictEqual(removeServerHandledTerminalQueries('before \x1b[?', state), 'before ');
		assert.strictEqual(removeServerHandledTerminalQueries('6n after', state), ' after');

		state = { pendingData: '' };
		assert.strictEqual(removeServerHandledTerminalQueries('before \x1b[', state), 'before ');
		assert.strictEqual(removeServerHandledTerminalQueries('K after', state), '\x1b[K after');
	});

	test('manager data path strips CPR queries while preserving surrounding output', () => {
		const handler = createHandler();

		const cleaned = handler.handlePtyData(`before${osc633('A')}\x1b[6nmid\x1b[?6nafter`);

		assert.strictEqual(cleaned, 'beforemidafter');
		assert.deepStrictEqual(handler.content, [{ type: 'unclassified', value: 'beforemidafter' }]);
		assert.strictEqual(handler.dispatched[0].type, ActionType.TerminalCommandDetectionAvailable);
	});

	test('TerminalCommandDetectionAvailable is dispatched on first OSC 633', () => {
		const handler = createHandler();

		handler.handlePtyData(osc633('A'));

		assert.strictEqual(handler.dispatched.length, 1);
		assert.strictEqual(handler.dispatched[0].type, ActionType.TerminalCommandDetectionAvailable);
	});

	test('TerminalCommandDetectionAvailable is dispatched only once', () => {
		const handler = createHandler();

		handler.handlePtyData(osc633('A'));
		handler.handlePtyData(osc633('B'));
		handler.handlePtyData(osc633('A'));

		const detectionActions = handler.dispatched.filter(
			a => a.type === ActionType.TerminalCommandDetectionAvailable
		);
		assert.strictEqual(detectionActions.length, 1);
	});

	test('full command lifecycle dispatches correct actions', () => {
		const handler = createHandler();

		// Shell prompt
		handler.handlePtyData(`${osc633('A')}$ ${osc633('B')}`);
		// Command entered, shell reports command line and executes
		handler.handlePtyData(`${osc633('E;echo\\x20hello;test-nonce')}${osc633('C')}`);
		// Command output
		handler.handlePtyData('hello\r\n');
		// Command finishes
		handler.handlePtyData(osc633('D;0'));

		const actions = handler.dispatched;
		// Expect: DetectionAvailable, CommandExecuted, CommandFinished
		assert.strictEqual(actions[0].type, ActionType.TerminalCommandDetectionAvailable);

		const executed = actions.find(a => a.type === ActionType.TerminalCommandExecuted);
		assert.ok(executed);
		assert.strictEqual(executed.commandId, 'cmd-1');
		assert.strictEqual(executed.commandLine, 'echo hello');

		const finished = actions.find(a => a.type === ActionType.TerminalCommandFinished);
		assert.ok(finished);
		assert.strictEqual(finished.commandId, 'cmd-1');
		assert.strictEqual(finished.exitCode, 0);
	});

	test('content parts are structured correctly after command lifecycle', () => {
		const handler = createHandler();

		// Prompt output (before command)
		handler.handlePtyData(`${osc633('A')}user@host:~ $ ${osc633('B')}`);
		// Command line + execute
		handler.handlePtyData(`${osc633('E;ls;test-nonce')}${osc633('C')}`);
		// Command output
		handler.handlePtyData('file1\nfile2\n');
		// Command finishes
		handler.handlePtyData(osc633('D;0'));
		// New prompt
		handler.handlePtyData(`${osc633('A')}user@host:~ $ `);

		assert.deepStrictEqual(handler.content.map(p => ({
			type: p.type,
			...(p.type === 'unclassified' ? { value: p.value } : {
				commandId: p.commandId,
				commandLine: p.commandLine,
				output: p.output,
				isComplete: p.isComplete,
				exitCode: p.exitCode,
			}),
		})), [
			{ type: 'unclassified', value: 'user@host:~ $ ' },
			{
				type: 'command',
				commandId: 'cmd-1',
				commandLine: 'ls',
				output: 'file1\nfile2\n',
				isComplete: true,
				exitCode: 0,
			},
			{ type: 'unclassified', value: 'user@host:~ $ ' },
		]);
	});

	test('nonce validation rejects untrusted command lines', () => {
		const handler = createHandler('my-secret-nonce');

		// Malicious output containing a fake command line with wrong nonce
		handler.handlePtyData(osc633('E;rm\\x20-rf\\x20/;wrong-nonce'));
		handler.handlePtyData(osc633('C'));

		const executed = handler.dispatched.find(a => a.type === ActionType.TerminalCommandExecuted);
		assert.ok(executed);
		// Command line should be empty because the nonce didn't match
		assert.strictEqual(executed.commandLine, '');
	});

	test('nonce validation accepts trusted command lines', () => {
		const handler = createHandler('my-secret-nonce');

		handler.handlePtyData(osc633('E;echo\\x20safe;my-secret-nonce'));
		handler.handlePtyData(osc633('C'));

		const executed = handler.dispatched.find(a => a.type === ActionType.TerminalCommandExecuted);
		assert.ok(executed);
		assert.strictEqual(executed.commandLine, 'echo safe');
	});

	test('multiple sequential commands get sequential IDs', () => {
		const handler = createHandler();

		// First command
		handler.handlePtyData(`${osc633('E;cmd1;test-nonce')}${osc633('C')}`);
		handler.handlePtyData(osc633('D;0'));

		// Second command
		handler.handlePtyData(`${osc633('E;cmd2;test-nonce')}${osc633('C')}`);
		handler.handlePtyData(osc633('D;1'));

		const executed = handler.dispatched.filter(a => a.type === ActionType.TerminalCommandExecuted);
		assert.strictEqual(executed.length, 2);
		assert.strictEqual(executed[0].commandId, 'cmd-1');
		assert.strictEqual(executed[0].commandLine, 'cmd1');
		assert.strictEqual(executed[1].commandId, 'cmd-2');
		assert.strictEqual(executed[1].commandLine, 'cmd2');

		const finished = handler.dispatched.filter(a => a.type === ActionType.TerminalCommandFinished);
		assert.strictEqual(finished.length, 2);
		assert.strictEqual(finished[0].commandId, 'cmd-1');
		assert.strictEqual(finished[0].exitCode, 0);
		assert.strictEqual(finished[1].commandId, 'cmd-2');
		assert.strictEqual(finished[1].exitCode, 1);
	});

	test('CWD property dispatches TerminalCwdChanged', () => {
		const handler = createHandler();

		handler.handlePtyData(osc633('P;Cwd=/new/working/dir'));

		const cwdAction = handler.dispatched.find(a => a.type === ActionType.TerminalCwdChanged);
		assert.ok(cwdAction);
		assert.strictEqual(cwdAction.cwd, '/new/working/dir');
		assert.strictEqual(handler.cwd, '/new/working/dir');
	});

	test('OSC 633 sequences are stripped from cleaned output', () => {
		const handler = createHandler();

		const cleaned = handler.handlePtyData(
			`before${osc633('A')}prompt${osc633('B')}${osc633('E;ls;test-nonce')}${osc633('C')}output${osc633('D;0')}after`
		);

		assert.strictEqual(cleaned, 'beforepromptoutputafter');
	});

	test('data without shell integration passes through unmodified', () => {
		const handler = new TestTerminalDataHandler('terminal://test', {
			parser: new Osc633Parser(),
			nonce: 'nonce',
			commandCounter: 0,
			detectionAvailableEmitted: false,
		});

		const data = 'regular terminal output with \x1b[31mcolors\x1b[0m';
		const cleaned = handler.handlePtyData(data);

		assert.strictEqual(cleaned, data);
		assert.deepStrictEqual(handler.content, [
			{ type: 'unclassified', value: data },
		]);
		assert.deepStrictEqual(handler.dispatched, []);
	});

	test('CommandFinished without active command is ignored', () => {
		const handler = createHandler();

		// Emit a PromptStart to trigger detection available, then finish without execute
		handler.handlePtyData(osc633('A'));
		handler.handlePtyData(osc633('D;0'));

		const finished = handler.dispatched.filter(a => a.type === ActionType.TerminalCommandFinished);
		assert.strictEqual(finished.length, 0);
	});

	test('command output is accumulated in the command content part', () => {
		const handler = createHandler();

		handler.handlePtyData(`${osc633('E;test;test-nonce')}${osc633('C')}`);
		handler.handlePtyData('line1\r\n');
		handler.handlePtyData('line2\r\n');
		handler.handlePtyData('line3\r\n');
		handler.handlePtyData(osc633('D;0'));

		const cmdParts = handler.content.filter(p => p.type === 'command');
		assert.strictEqual(cmdParts.length, 1);
		assert.strictEqual(cmdParts[0].type === 'command' && cmdParts[0].output, 'line1\r\nline2\r\nline3\r\n');
	});
});
