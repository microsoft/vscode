/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IToolInvocationContext } from '../../../../chat/common/tools/languageModelToolsService.js';
import { Task } from '../../../../tasks/common/taskService.js';
import { ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { collectTerminalResults } from '../../browser/taskHelpers.js';
import { IExecution, OutputMonitorState } from '../../browser/tools/monitoring/types.js';

suite('Task Helpers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('collectTerminalResults reads output from invocation start marker', async () => {
		const lines = ['old output', 'more old output', 'new output line 1', 'new output line 2'];
		let markerDisposed = false;
		const marker = {
			line: 2,
			dispose: () => { markerDisposed = true; }
		};
		const terminal = {
			instanceId: 1,
			title: 'task-terminal',
			shellLaunchConfig: { name: 'task-terminal' },
			registerMarker: () => marker,
			xterm: {
				raw: {
					buffer: {
						active: {
							length: lines.length,
							getLine: (y: number) => ({ translateToString: () => lines[y] })
						}
					}
				}
			}
		} as unknown as ITerminalInstance;
		const task = {
			_label: 'my-task',
			configurationProperties: {}
		} as Task;
		const invocationContext: IToolInvocationContext = {
			sessionResource: URI.parse('vscode-chat-session://test')
		};
		const instantiationService = {
			createInstance: (_ctor: unknown, execution: IExecution) => {
				const didFinishEmitter = new Emitter<void>();
				const monitor = {
					onDidFinishCommand: didFinishEmitter.event,
					pollingResult: {
						output: execution.getOutput(),
						pollDurationMs: 1,
						state: OutputMonitorState.Idle
					},
					outputMonitorTelemetryCounters: {
						inputToolManualAcceptCount: 0,
						inputToolManualRejectCount: 0,
						inputToolManualChars: 0,
						inputToolAutoAcceptCount: 0,
						inputToolAutoChars: 0,
						inputToolManualShownCount: 0,
						inputToolFreeFormInputShownCount: 0,
						inputToolFreeFormInputCount: 0,
					},
					dispose: () => didFinishEmitter.dispose()
				};
				setTimeout(() => didFinishEmitter.fire(), 0);
				return monitor;
			}
		} as unknown as IInstantiationService;

		const disposableStore = new DisposableStore();
		const results = await collectTerminalResults(
			[terminal],
			task,
			instantiationService,
			invocationContext,
			{ report: () => { } },
			CancellationToken.None,
			disposableStore
		);
		disposableStore.dispose();

		assert.strictEqual(results.length, 1);
		assert.strictEqual(results[0].output, 'new output line 1\nnew output line 2');
		assert.strictEqual(markerDisposed, true);
	});

	test('collectTerminalResults uses provided pre-run marker when present', async () => {
		const lines = ['old output', 'new output line 1', 'new output line 2', '* Terminal will be reused by tasks, press any key to close it.'];
		let defaultMarkerDisposed = false;
		let preRunMarkerDisposed = false;
		const defaultMarker = {
			line: 3,
			dispose: () => { defaultMarkerDisposed = true; }
		};
		const preRunMarker = {
			id: 1,
			line: 1,
			isDisposed: false,
			onDispose: new Emitter<void>().event,
			dispose: () => { preRunMarkerDisposed = true; }
		};
		const terminal = {
			instanceId: 1,
			title: 'task-terminal',
			shellLaunchConfig: { name: 'task-terminal' },
			registerMarker: () => defaultMarker,
			xterm: {
				raw: {
					buffer: {
						active: {
							length: lines.length,
							getLine: (y: number) => ({ translateToString: () => lines[y] })
						}
					}
				}
			}
		} as unknown as ITerminalInstance;
		const task = {
			_label: 'my-task',
			configurationProperties: {}
		} as Task;
		const invocationContext: IToolInvocationContext = {
			sessionResource: URI.parse('vscode-chat-session://test')
		};
		const instantiationService = {
			createInstance: (_ctor: unknown, execution: IExecution) => {
				const didFinishEmitter = new Emitter<void>();
				const monitor = {
					onDidFinishCommand: didFinishEmitter.event,
					pollingResult: {
						output: execution.getOutput(),
						pollDurationMs: 1,
						state: OutputMonitorState.Idle
					},
					outputMonitorTelemetryCounters: {
						inputToolManualAcceptCount: 0,
						inputToolManualRejectCount: 0,
						inputToolManualChars: 0,
						inputToolAutoAcceptCount: 0,
						inputToolAutoChars: 0,
						inputToolManualShownCount: 0,
						inputToolFreeFormInputShownCount: 0,
						inputToolFreeFormInputCount: 0,
					},
					dispose: () => didFinishEmitter.dispose()
				};
				setTimeout(() => didFinishEmitter.fire(), 0);
				return monitor;
			}
		} as unknown as IInstantiationService;

		const startMarkersByTerminalInstanceId = new Map<number, ReturnType<ITerminalInstance['registerMarker']>>();
		startMarkersByTerminalInstanceId.set(terminal.instanceId, preRunMarker as ReturnType<ITerminalInstance['registerMarker']>);

		const disposableStore = new DisposableStore();
		const results = await collectTerminalResults(
			[terminal],
			task,
			instantiationService,
			invocationContext,
			{ report: () => { } },
			CancellationToken.None,
			disposableStore,
			undefined,
			undefined,
			undefined,
			startMarkersByTerminalInstanceId
		);
		disposableStore.dispose();

		assert.strictEqual(results.length, 1);
		assert.strictEqual(results[0].output, 'new output line 1\nnew output line 2\n* Terminal will be reused by tasks, press any key to close it.');
		assert.strictEqual(preRunMarkerDisposed, true);
		assert.strictEqual(defaultMarkerDisposed, false);
	});

	test('collectTerminalResults reads full output when pre-run marker map has no marker for terminal', async () => {
		const lines = ['new output line 1', 'new output line 2', '* Terminal will be reused by tasks, press any key to close it.'];
		let defaultMarkerDisposed = false;
		const defaultMarker = {
			line: 1,
			dispose: () => { defaultMarkerDisposed = true; }
		};
		const terminal = {
			instanceId: 1,
			title: 'task-terminal',
			shellLaunchConfig: { name: 'task-terminal' },
			registerMarker: () => defaultMarker,
			xterm: {
				raw: {
					buffer: {
						active: {
							length: lines.length,
							getLine: (y: number) => ({ translateToString: () => lines[y] })
						}
					}
				}
			}
		} as unknown as ITerminalInstance;
		const task = {
			_label: 'my-task',
			configurationProperties: {}
		} as Task;
		const invocationContext: IToolInvocationContext = {
			sessionResource: URI.parse('vscode-chat-session://test')
		};
		const instantiationService = {
			createInstance: (_ctor: unknown, execution: IExecution) => {
				const didFinishEmitter = new Emitter<void>();
				const monitor = {
					onDidFinishCommand: didFinishEmitter.event,
					pollingResult: {
						output: execution.getOutput(),
						pollDurationMs: 1,
						state: OutputMonitorState.Idle
					},
					outputMonitorTelemetryCounters: {
						inputToolManualAcceptCount: 0,
						inputToolManualRejectCount: 0,
						inputToolManualChars: 0,
						inputToolAutoAcceptCount: 0,
						inputToolAutoChars: 0,
						inputToolManualShownCount: 0,
						inputToolFreeFormInputShownCount: 0,
						inputToolFreeFormInputCount: 0,
					},
					dispose: () => didFinishEmitter.dispose()
				};
				setTimeout(() => didFinishEmitter.fire(), 0);
				return monitor;
			}
		} as unknown as IInstantiationService;

		const startMarkersByTerminalInstanceId = new Map<number, ReturnType<ITerminalInstance['registerMarker']>>();

		const disposableStore = new DisposableStore();
		const results = await collectTerminalResults(
			[terminal],
			task,
			instantiationService,
			invocationContext,
			{ report: () => { } },
			CancellationToken.None,
			disposableStore,
			undefined,
			undefined,
			undefined,
			startMarkersByTerminalInstanceId
		);
		disposableStore.dispose();

		assert.strictEqual(results.length, 1);
		assert.strictEqual(results[0].output, 'new output line 1\nnew output line 2\n* Terminal will be reused by tasks, press any key to close it.');
		assert.strictEqual(defaultMarkerDisposed, false);
	});
});
