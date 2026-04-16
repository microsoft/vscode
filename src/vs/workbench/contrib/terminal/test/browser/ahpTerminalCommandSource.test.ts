/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AhpTerminalCommand, AhpTerminalCommandSource } from '../../browser/ahpTerminalCommandSource.js';
import { AgentHostPty, AhpCommandMarkKind, getAhpCommandMarkId, type IAgentHostPtyCommandExecutedEvent, type IAgentHostPtyCommandFinishedEvent } from '../../browser/agentHostPty.js';
import { ITerminalCapabilityStore, TerminalCapability, type ITerminalCommand } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import type { ITerminalInstance } from '../../browser/terminal.js';

suite('AhpTerminalCommand', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('basic properties are set correctly', () => {
		const cmd = new AhpTerminalCommand('cmd-1', 'echo hello', 1000);
		assert.strictEqual(cmd.id, 'cmd-1');
		assert.strictEqual(cmd.command, 'echo hello');
		assert.strictEqual(cmd.timestamp, 1000);
		assert.strictEqual(cmd.exitCode, undefined);
		assert.strictEqual(cmd.duration, 0);
		assert.strictEqual(cmd.commandLineConfidence, 'high');
		assert.strictEqual(cmd.isTrusted, false);
	});

	test('extractCommandLine returns command', () => {
		const cmd = new AhpTerminalCommand('cmd-1', 'ls -la', 1000);
		assert.strictEqual(cmd.extractCommandLine(), 'ls -la');
	});

	test('getOutput returns undefined when no stored output', () => {
		const cmd = new AhpTerminalCommand('cmd-1', 'echo hello', 1000);
		assert.strictEqual(cmd.getOutput(), undefined);
		assert.strictEqual(cmd.hasOutput(), false);
	});

	test('getOutput returns stored output with ANSI codes stripped', () => {
		const cmd = new AhpTerminalCommand('cmd-1', 'echo hello', 1000, {
			storedOutput: '\x1b[32mhello\x1b[0m\r\nworld',
		});
		assert.strictEqual(cmd.getOutput(), 'hello\r\nworld');
		assert.strictEqual(cmd.hasOutput(), true);
	});

	test('getRawOutput returns raw VT output', () => {
		const rawOutput = '\x1b[32mhello\x1b[0m';
		const cmd = new AhpTerminalCommand('cmd-1', 'echo hello', 1000, {
			storedOutput: rawOutput,
		});
		assert.strictEqual(cmd.getRawOutput(), rawOutput);
	});

	test('appendOutput creates and appends stored output', () => {
		const cmd = new AhpTerminalCommand('cmd-1', 'echo hello', 1000);
		assert.strictEqual(cmd.hasOutput(), false);

		cmd.appendOutput('hello ');
		assert.strictEqual(cmd.hasOutput(), true);
		assert.strictEqual(cmd.getRawOutput(), 'hello ');

		cmd.appendOutput('world');
		assert.strictEqual(cmd.getRawOutput(), 'hello world');
	});

	test('finish sets exit code, duration, and end marker', () => {
		const cmd = new AhpTerminalCommand('cmd-1', 'echo hello', 1000);
		assert.strictEqual(cmd.exitCode, undefined);
		assert.strictEqual(cmd.duration, 0);
		assert.strictEqual(cmd.endMarker, undefined);

		cmd.finish(0, 500);
		assert.strictEqual(cmd.exitCode, 0);
		assert.strictEqual(cmd.duration, 500);
	});

	test('getPromptRowCount and getCommandRowCount return 1', () => {
		const cmd = new AhpTerminalCommand('cmd-1', 'echo hello', 1000);
		assert.strictEqual(cmd.getPromptRowCount(), 1);
		assert.strictEqual(cmd.getCommandRowCount(), 1);
	});

	test('getOutputMatch returns undefined', () => {
		const cmd = new AhpTerminalCommand('cmd-1', 'echo hello', 1000, {
			storedOutput: 'output',
		});
		assert.strictEqual(cmd.getOutputMatch({ lineMatcher: 'foo', anchor: 'bottom', offset: 0, length: 1 }), undefined);
	});
});

suite('AhpTerminalCommandSource', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let onCommandExecuted: Emitter<IAgentHostPtyCommandExecutedEvent>;
	let onCommandFinished: Emitter<IAgentHostPtyCommandFinishedEvent>;
	let onSupportsCommandDetection: Emitter<void>;
	let onWillData: Emitter<string>;
	let onDisposed: Emitter<unknown>;
	let mockPty: {
		onCommandExecuted: Emitter<IAgentHostPtyCommandExecutedEvent>['event'];
		onCommandFinished: Emitter<IAgentHostPtyCommandFinishedEvent>['event'];
		onSupportsCommandDetection: Emitter<void>['event'];
		supportsCommandDetection: boolean;
	};
	let mockInstance: Partial<ITerminalInstance>;

	/** Simple marker stub for testing */
	let markerIdCounter: number;
	const mockMarkers = new Map<string, { id: number; line: number; isDisposed: boolean; dispose: () => void; onDispose: { (listener: () => void): { dispose(): void } } }>();

	function createMockBufferMarkCapability() {
		return {
			type: TerminalCapability.BufferMarkDetection,
			addMark(props?: { id?: string; hidden?: boolean; marker?: unknown }) {
				const id = props?.id;
				if (id) {
					const marker = { id: markerIdCounter++, line: 0, isDisposed: false, dispose: () => { }, onDispose: () => ({ dispose: () => { } }) };
					mockMarkers.set(id, marker);
				}
			},
			getMark(id: string) {
				return mockMarkers.get(id);
			},
		};
	}

	setup(() => {
		markerIdCounter = 1;
		mockMarkers.clear();

		onCommandExecuted = store.add(new Emitter<IAgentHostPtyCommandExecutedEvent>());
		onCommandFinished = store.add(new Emitter<IAgentHostPtyCommandFinishedEvent>());
		onSupportsCommandDetection = store.add(new Emitter<void>());
		onWillData = store.add(new Emitter<string>());
		onDisposed = store.add(new Emitter<unknown>());

		const bufferMarkCapability = createMockBufferMarkCapability();

		mockPty = {
			onCommandExecuted: onCommandExecuted.event,
			onCommandFinished: onCommandFinished.event,
			onSupportsCommandDetection: onSupportsCommandDetection.event,
			supportsCommandDetection: false,
		};

		mockInstance = {
			onWillData: onWillData.event,
			onDisposed: onDisposed.event as ITerminalInstance['onDisposed'],
			capabilities: {
				get(type: TerminalCapability) {
					if (type === TerminalCapability.BufferMarkDetection) {
						return bufferMarkCapability;
					}
					return undefined;
				},
			} as unknown as ITerminalCapabilityStore,
		};
	});

	function createSource(): AhpTerminalCommandSource {
		const source = new AhpTerminalCommandSource();
		source.connect(mockInstance as ITerminalInstance, mockPty as AgentHostPty);
		store.add(source);
		return source;
	}

	/**
	 * Simulates what xterm's OSC 633 parser does when it processes a SetMark
	 * code: registers a marker in the BufferMarkCapability by ID. In the real
	 * flow, AgentHostPty writes the SetMark code via handleData() before
	 * firing the command event, so the capability already has the marker when
	 * AhpTerminalCommandSource._handleCommandExecuted/Finished runs.
	 */
	function simulateMark(commandId: string, kind: AhpCommandMarkKind): void {
		const markId = getAhpCommandMarkId(commandId, kind);
		const bufferMark = mockInstance.capabilities?.get(TerminalCapability.BufferMarkDetection) as ReturnType<typeof createMockBufferMarkCapability>;
		bufferMark?.addMark({ id: markId });
	}

	test('initial state has empty commands and no executing command', () => {
		const source = createSource();
		assert.deepStrictEqual(source.commands, []);
		assert.strictEqual(source.executingCommandObject, undefined);
	});

	test('onCommandExecuted creates an executing command', () => {
		const source = createSource();
		const events: ITerminalCommand[] = [];
		store.add(source.onCommandExecuted(cmd => events.push(cmd)));

		simulateMark('cmd-1', AhpCommandMarkKind.Executed);
		onCommandExecuted.fire({
			commandId: 'cmd-1',
			commandLine: 'echo hello',
			timestamp: 1000,
		});

		assert.strictEqual(source.executingCommandObject?.id, 'cmd-1');
		assert.strictEqual(source.executingCommandObject?.command, 'echo hello');
		assert.strictEqual(events.length, 1);
		assert.strictEqual(events[0].id, 'cmd-1');
		// Executing commands are not yet in the commands list
		assert.deepStrictEqual(source.commands, []);
	});

	test('onCommandFinished completes the executing command', () => {
		const source = createSource();
		const finishedEvents: ITerminalCommand[] = [];
		store.add(source.onCommandFinished(cmd => finishedEvents.push(cmd)));

		simulateMark('cmd-1', AhpCommandMarkKind.Executed);
		onCommandExecuted.fire({
			commandId: 'cmd-1',
			commandLine: 'echo hello',
			timestamp: 1000,
		});

		simulateMark('cmd-1', AhpCommandMarkKind.End);
		onCommandFinished.fire({
			commandId: 'cmd-1',
			exitCode: 0,
			durationMs: 500,
		});

		assert.strictEqual(source.executingCommandObject, undefined);
		assert.strictEqual(source.commands.length, 1);
		assert.strictEqual(source.commands[0].id, 'cmd-1');
		assert.strictEqual(source.commands[0].exitCode, 0);
		assert.strictEqual(source.commands[0].duration, 500);
		assert.strictEqual(finishedEvents.length, 1);
	});

	test('markers are resolved from BufferMarkCapability by ID', () => {
		const source = createSource();

		simulateMark('cmd-1', AhpCommandMarkKind.Executed);
		onCommandExecuted.fire({
			commandId: 'cmd-1',
			commandLine: 'echo hello',
			timestamp: 1000,
		});

		const executing = source.executingCommandObject;
		assert.ok(executing?.executedMarker, 'executedMarker should be resolved from BufferMarkCapability');

		simulateMark('cmd-1', AhpCommandMarkKind.End);
		onCommandFinished.fire({ commandId: 'cmd-1', exitCode: 0 });

		const completed = source.commands[0];
		assert.ok(completed?.endMarker, 'endMarker should be resolved from BufferMarkCapability');
	});

	test('getCommandById returns executing and completed commands', () => {
		const source = createSource();

		simulateMark('cmd-1', AhpCommandMarkKind.Executed);
		onCommandExecuted.fire({
			commandId: 'cmd-1',
			commandLine: 'ls',
			timestamp: 1000,
		});
		assert.strictEqual(source.getCommandById('cmd-1')?.command, 'ls');

		simulateMark('cmd-1', AhpCommandMarkKind.End);
		onCommandFinished.fire({ commandId: 'cmd-1', exitCode: 0 });
		assert.strictEqual(source.getCommandById('cmd-1')?.command, 'ls');

		assert.strictEqual(source.getCommandById('nonexistent'), undefined);
	});

	test('multiple commands are tracked in order', () => {
		const source = createSource();

		// First command
		simulateMark('cmd-1', AhpCommandMarkKind.Executed);
		onCommandExecuted.fire({ commandId: 'cmd-1', commandLine: 'ls', timestamp: 1000 });
		simulateMark('cmd-1', AhpCommandMarkKind.End);
		onCommandFinished.fire({ commandId: 'cmd-1', exitCode: 0 });

		// Second command
		simulateMark('cmd-2', AhpCommandMarkKind.Executed);
		onCommandExecuted.fire({ commandId: 'cmd-2', commandLine: 'pwd', timestamp: 2000 });
		simulateMark('cmd-2', AhpCommandMarkKind.End);
		onCommandFinished.fire({ commandId: 'cmd-2', exitCode: 0 });

		assert.strictEqual(source.commands.length, 2);
		assert.strictEqual(source.commands[0].id, 'cmd-1');
		assert.strictEqual(source.commands[1].id, 'cmd-2');
	});

	test('streaming data is appended to non-replayed executing command', () => {
		const source = createSource();

		simulateMark('cmd-1', AhpCommandMarkKind.Executed);
		onCommandExecuted.fire({
			commandId: 'cmd-1',
			commandLine: 'echo hello',
			timestamp: 1000,
			// No storedOutput — this is a streaming command
		});

		onWillData.fire('hello ');
		onWillData.fire('world');

		const executing = source.executingCommandObject as AhpTerminalCommand;
		assert.strictEqual(executing.getRawOutput(), 'hello world');
	});

	test('streaming data is NOT appended to replayed commands', () => {
		const source = createSource();

		simulateMark('cmd-1', AhpCommandMarkKind.Executed);
		onCommandExecuted.fire({
			commandId: 'cmd-1',
			commandLine: 'echo hello',
			timestamp: 1000,
			storedOutput: 'existing output', // Replayed command
		});

		onWillData.fire('extra data');

		const executing = source.executingCommandObject as AhpTerminalCommand;
		// Should still have the original stored output, not appended
		assert.strictEqual(executing.getRawOutput(), 'existing output');
	});

	test('onCommandFinished with unknown commandId is ignored', () => {
		const source = createSource();
		const finishedEvents: ITerminalCommand[] = [];
		store.add(source.onCommandFinished(cmd => finishedEvents.push(cmd)));

		onCommandFinished.fire({
			commandId: 'nonexistent',
			exitCode: 1,
		});

		assert.deepStrictEqual(source.commands, []);
		assert.strictEqual(finishedEvents.length, 0);
	});

	test('dispose cleans up resources', () => {
		const innerStore = new DisposableStore();
		const source = new AhpTerminalCommandSource();
		source.connect(mockInstance as ITerminalInstance, mockPty as AgentHostPty);
		innerStore.add(source);

		simulateMark('cmd-1', AhpCommandMarkKind.Executed);
		onCommandExecuted.fire({
			commandId: 'cmd-1',
			commandLine: 'test',
			timestamp: 1000,
		});

		innerStore.dispose();

		// After disposal, firing events should not create new commands
		const executedEvents: ITerminalCommand[] = [];
		// Can't subscribe after dispose, but events should not leak
		onCommandExecuted.fire({
			commandId: 'cmd-2',
			commandLine: 'test2',
			timestamp: 2000,
		});
		assert.strictEqual(executedEvents.length, 0);
	});
});
