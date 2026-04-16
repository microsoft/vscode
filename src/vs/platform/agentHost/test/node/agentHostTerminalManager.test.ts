/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ActionType, IStateAction } from '../../common/state/protocol/actions.js';
import { ITerminalContentPart } from '../../common/state/protocol/state.js';
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
	readonly dispatched: IStateAction[] = [];
	content: ITerminalContentPart[] = [];
	cwd = '/home/user';

	constructor(
		readonly uri: string,
		readonly tracker: ITestCommandTracker,
	) { }

	/** Simulates AgentHostTerminalManager._handlePtyData */
	handlePtyData(rawData: string): string {
		const parseResult = this.tracker.parser.parse(rawData);
		const cleanedData = parseResult.cleanedData;

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

suite('AgentHostTerminalManager – command detection integration', () => {

	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

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
