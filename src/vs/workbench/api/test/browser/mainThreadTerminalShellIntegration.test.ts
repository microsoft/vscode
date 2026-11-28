/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy } from 'sinon';
import { timeout } from '../../../../base/common/async.js';
import { DynamicListEventMultiplexer, Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { mock } from '../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ICommandDetectionCapability, ITerminalCapabilityImplMap, ITerminalCommand, TerminalCapability } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { TerminalCapabilityStore } from '../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { ITerminalInstance, ITerminalService } from '../../../contrib/terminal/browser/terminal.js';
import { createInstanceCapabilityEventMultiplexer } from '../../../contrib/terminal/browser/terminalEvents.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { MainThreadTerminalShellIntegration } from '../../browser/mainThreadTerminalShellIntegration.js';
import { ExtHostTerminalShellIntegrationShape } from '../../common/extHost.protocol.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadTerminalShellIntegration', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createTerminal(instanceId: number) {
		const data = store.add(new Emitter<string>());
		const executed = store.add(new Emitter<ITerminalCommand>());
		const finished = store.add(new Emitter<ITerminalCommand>());
		const capabilities = store.add(new TerminalCapabilityStore());
		capabilities.add(TerminalCapability.CommandDetection, new class extends mock<ICommandDetectionCapability>() {
			override onCommandExecuted = executed.event;
			override onCommandFinished = finished.event;
		});
		const instance = new class extends mock<ITerminalInstance>() {
			override instanceId = instanceId;
			override capabilities = capabilities;
			override onData = data.event;
			override shellLaunchConfig = {};
		};
		return { instance, data, executed, finished };
	}

	function createIntegration(instances: ITerminalInstance[], hasReader = true) {
		const disposed = store.add(new Emitter<ITerminalInstance>());
		const events: string[] = [];
		const terminalService = new class extends mock<ITerminalService>() {
			override instances = instances;
			override onDidDisposeInstance = disposed.event;
			override createOnInstanceEvent<T>(getEvent: (instance: ITerminalInstance) => Event<T>) {
				return new DynamicListEventMultiplexer(instances, Event.None, disposed.event, getEvent);
			}
			override createOnInstanceCapabilityEvent<T extends TerminalCapability, K>(capability: T, getEvent: (value: ITerminalCapabilityImplMap[T]) => Event<K>) {
				return createInstanceCapabilityEventMultiplexer(instances, Event.None, disposed.event, capability, getEvent);
			}
		};
		const proxy = new class extends mock<ExtHostTerminalShellIntegrationShape>() {
			override $shellIntegrationChange() { }
			override async $shellExecutionStart(id: number) {
				events.push(`${id}:start`);
				return hasReader;
			}
			override $shellExecutionData(id: number, data: string) { events.push(`${id}:data:${data}`); }
			override $shellExecutionEnd(id: number) { events.push(`${id}:end`); }
			override $closeTerminal(id: number) { events.push(`${id}:close`); }
		};
		const integration = store.add(new MainThreadTerminalShellIntegration(
			SingleProxyRPCProtocol(proxy), terminalService,
			new class extends mock<IWorkbenchEnvironmentService>() { },
			new class extends mock<IExtensionService>() {
				override async activateByEvent() { }
			}
		));
		return { integration, disposed, events };
	}

	function command(): ITerminalCommand {
		return new class extends mock<ITerminalCommand>() {
			override command = 'echo test';
			override commandLineConfidence = 'high' as const;
			override isTrusted = true;
			override exitCode = 0;
		};
	}

	test('finished commands flush data and release their resources while the service stays alive', () => {
		const terminal = createTerminal(1);
		const { events } = createIntegration([terminal.instance]);
		const current = command();
		// Bare Emitters are not covered by the disposable tracker. Observe those owned
		// during execution without assuming which store owns them or inspecting private state.
		const added = spy(DisposableStore.prototype, 'add');
		try {
			terminal.executed.fire(current);
		} finally {
			added.restore();
		}
		const emitters = added.getCalls().map(call => call.args[0]).filter(value => value instanceof Emitter);
		const disposal = emitters.map(emitter => spy(emitter, 'dispose'));
		store.add(toDisposable(() => {
			for (const call of disposal) {
				call.restore();
			}
		}));
		terminal.data.fire('first');
		terminal.data.fire('second');
		terminal.finished.fire(current);
		assert.deepStrictEqual(events, ['1:start', '1:data:firstsecond', '1:end']);
		assert.ok(disposal.every(call => call.calledOnce), 'Command-scoped emitters must be disposed at command end');
	});

	test('terminal disposal flushes pending data before closing the extension stream', () => {
		const terminal = createTerminal(1);
		const { disposed, events } = createIntegration([terminal.instance]);
		terminal.executed.fire(command());
		terminal.data.fire('pending');
		disposed.fire(terminal.instance);
		assert.deepStrictEqual(events, ['1:start', '1:data:pending', '1:close']);
		assert.strictEqual(terminal.data.hasListeners(), false);
	});

	test('finishing one terminal keeps another terminal stream active', () => {
		const first = createTerminal(1);
		const second = createTerminal(2);
		const { events } = createIntegration([first.instance, second.instance]);
		const firstCommand = command();
		const secondCommand = command();
		first.executed.fire(firstCommand);
		second.executed.fire(secondCommand);
		first.data.fire('first');
		second.data.fire('second');
		first.finished.fire(firstCommand);
		second.data.fire(' still running');
		second.finished.fire(secondCommand);
		assert.deepStrictEqual(events, ['1:start', '2:start', '1:data:first', '1:end', '2:data:second still running', '2:end']);
	});

	test('replacing a command flushes its data and removes the old data listener', () => {
		const terminal = createTerminal(1);
		const { events } = createIntegration([terminal.instance]);
		terminal.executed.fire(command());
		terminal.data.fire('old');
		const current = command();
		terminal.executed.fire(current);
		terminal.data.fire('new');
		terminal.finished.fire(current);
		assert.deepStrictEqual(events.filter(event => event.startsWith('1:data:')), ['1:data:old', '1:data:new']);
		assert.strictEqual(terminal.data.hasListeners(), false);
	});

	test('duplicate start notifications do not duplicate output', () => {
		const terminal = createTerminal(1);
		const { events } = createIntegration([terminal.instance]);
		const current = command();
		terminal.executed.fire(current);
		terminal.executed.fire(current);
		terminal.data.fire('once');
		terminal.finished.fire(current);
		assert.deepStrictEqual(events, ['1:start', '1:data:once', '1:end']);
	});

	test('service disposal releases active terminal streams and flushes pending output', () => {
		const first = createTerminal(1);
		const second = createTerminal(2);
		const { integration, events } = createIntegration([first.instance, second.instance]);
		first.executed.fire(command());
		second.executed.fire(command());
		first.data.fire('first');
		second.data.fire('second');
		integration.dispose();
		assert.deepStrictEqual(events, ['1:start', '2:start', '1:data:first', '2:data:second']);
		assert.deepStrictEqual([first.data.hasListeners(), second.data.hasListeners()], [false, false]);
	});

	test('data is not sent when the execution has no reader', async () => {
		const terminal = createTerminal(1);
		const { events } = createIntegration([terminal.instance], false);
		const current = command();
		terminal.executed.fire(current);
		terminal.data.fire('before reply');
		await timeout(0);
		const isListening = terminal.data.hasListeners();
		terminal.data.fire('after reply');
		terminal.finished.fire(current);
		assert.deepStrictEqual({ events, isListening }, { events: ['1:start', '1:end'], isListening: false });
	});

	test('data is sent once a reader is added to a running execution', async () => {
		const terminal = createTerminal(1);
		const { integration, events } = createIntegration([terminal.instance], false);
		const current = command();
		terminal.executed.fire(current);
		await timeout(0);
		integration.$startSendingExecutionData(1, 1);
		terminal.data.fire('read');
		terminal.finished.fire(current);
		assert.deepStrictEqual(events, ['1:start', '1:data:read', '1:end']);
	});

	test('a reader added to a previous command does not resume the next command', async () => {
		const terminal = createTerminal(1);
		const { integration, events } = createIntegration([terminal.instance], false);
		const previous = command();
		terminal.executed.fire(previous);
		await timeout(0);
		terminal.finished.fire(previous);
		const current = command();
		terminal.executed.fire(current);
		integration.$startSendingExecutionData(1, 1);
		await timeout(0);
		terminal.data.fire('unread');
		terminal.finished.fire(current);
		assert.deepStrictEqual(events, ['1:start', '1:end', '1:start', '1:end']);
	});

	test('a reader added before the reply that reports no reader keeps the data', async () => {
		const terminal = createTerminal(1);
		const { integration, events } = createIntegration([terminal.instance], false);
		const current = command();
		terminal.executed.fire(current);
		terminal.data.fire('early');
		integration.$startSendingExecutionData(1, 1);
		await timeout(0);
		terminal.data.fire(' late');
		terminal.finished.fire(current);
		assert.deepStrictEqual(events, ['1:start', '1:data:early late', '1:end']);
	});

	test('continuous data is sent periodically and large data immediately', () => runWithFakedTimers({}, async () => {
		const terminal = createTerminal(1);
		const { events } = createIntegration([terminal.instance]);
		const current = command();
		terminal.executed.fire(current);
		for (let i = 0; i < 10; i++) {
			terminal.data.fire(`${i}`);
			await timeout(20);
		}
		terminal.data.fire('x'.repeat(1024 * 1024));
		const sentLargeData = events.length;
		terminal.finished.fire(current);
		assert.deepStrictEqual({ events: events.map(e => e.slice(0, 20)), sentLargeData }, {
			events: ['1:start', '1:data:012', '1:data:345', '1:data:678', '1:data:9xxxxxxxxxxxx', '1:end'],
			sentLargeData: 5,
		});
	}));
});
