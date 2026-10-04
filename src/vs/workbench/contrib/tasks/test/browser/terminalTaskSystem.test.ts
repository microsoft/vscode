/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable, DisposableMap, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { IShellLaunchConfig } from '../../../../../platform/terminal/common/terminal.js';
import { ITerminalInstance, ITerminalService } from '../../../../contrib/terminal/browser/terminal.js';
import { ITaskService } from '../../common/taskService.js';
import { CustomTask, PanelKind, RevealKind, RevealProblemKind, RuntimeType } from '../../common/tasks.js';
import { ITaskSystemInfo, TaskError } from '../../common/taskSystem.js';
import { TerminalTaskSystem } from '../../browser/terminalTaskSystem.js';

suite('TerminalTaskSystem', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createCustomExecutionTask(): CustomTask {
		return new CustomTask(
			'task-test-id',
			{
				kind: 'workspace',
				label: 'testTask',
				config: { file: 'test.tasks.json', index: 0, element: { type: 'test' } }
			},
			'testTask',
			'test',
			{
				runtime: RuntimeType.CustomExecution,
				presentation: {
					reveal: RevealKind.Never,
					revealProblems: RevealProblemKind.Never,
					echo: false,
					focus: false,
					panel: PanelKind.Shared,
					showReuseMessage: false,
					clear: false
				}
			},
			false,
			{},
			{
				group: 'build',
				presentation: {
					reveal: RevealKind.Never,
					revealProblems: RevealProblemKind.Never,
					echo: false,
					focus: false,
					panel: PanelKind.Shared,
					showReuseMessage: false,
					clear: false
				}
			}
		);
	}

	/**
	 * Creates a {@link TerminalTaskSystem} whose terminal service records the shell
	 * launch configs passed to `createTerminal` and returns a fixed fake instance.
	 */
	function createSystem(): { system: TerminalTaskSystem; createdConfigs: { type?: string; isFeatureTerminal?: boolean }[] } {
		const createdConfigs: { type?: string; isFeatureTerminal?: boolean }[] = [];
		const fakeTerminal = upcastPartial<ITerminalInstance>({
			instanceId: 1,
			exitReason: undefined,
			reconnectionProperties: undefined,
			shellLaunchConfig: { isFeatureTerminal: true },
			onDisposed: () => Disposable.None
		});
		const onDidChangeActiveInstance = new Emitter<ITerminalInstance | undefined>();
		const terminalService = upcastPartial<ITerminalService>({
			instances: [fakeTerminal],
			onDidChangeActiveInstance: onDidChangeActiveInstance.event,
			createTerminal: async (options) => {
				const config = options?.config as IShellLaunchConfig | undefined;
				createdConfigs.push(config ? { type: config.type, isFeatureTerminal: config.isFeatureTerminal } : {});
				return fakeTerminal;
			}
		});
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ITaskService, upcastPartial<ITaskService>({ onDidStateChange: () => Disposable.None }));
		instantiationService.stub(IAccessibilitySignalService, new class extends mock<IAccessibilitySignalService>() {
			override async playSignal() { }
		});
		const system = store.add(new TerminalTaskSystem(
			terminalService,
			undefined!, // _terminalGroupService
			undefined!, // _outputService
			undefined!, // _paneCompositeService
			undefined!, // _viewsService
			undefined!, // _markerService
			undefined!, // _modelService
			undefined!, // _configurationResolverService
			upcastPartial<IWorkspaceContextService>({ getWorkbenchState: () => WorkbenchState.EMPTY }),
			undefined!, // _environmentService
			'test-output-channel',
			undefined!, // _fileService
			undefined!, // _terminalProfileResolverService
			undefined!, // _pathService
			undefined!, // _viewDescriptorService
			new NullLogService(),
			undefined!, // _notificationService
			instantiationService.createInstance(MockContextKeyService),
			instantiationService,
			() => undefined, // taskSystemInfoResolver
			() => Promise.resolve(undefined)  // _taskLookup
		));
		// Dispose the monitor's terminal disposables explicitly to satisfy the leak checker.
		const monitor = (system as unknown as { _taskProblemMonitor: { terminalDisposables: DisposableMap<number> } })._taskProblemMonitor;
		store.add(toDisposable(() => monitor.terminalDisposables.dispose()));
		return { system, createdConfigs };
	}

	test('custom execution task terminals are marked as task terminals (#338610)', async () => {
		const { system, createdConfigs } = createSystem();
		const task = createCustomExecutionTask();
		// `_currentTask` is normally assigned by `run()` before `_createTerminal` runs.
		(system as unknown as { _currentTask: { shellLaunchConfig: unknown } })._currentTask = { shellLaunchConfig: undefined };
		const resolver = {
			taskSystemInfo: undefined,
			resolve: async (_value: string) => {
				throw new Error('no workspace');
			}
		};
		const createTerminal = (system as unknown as {
			_createTerminal(task: CustomTask, resolver: { taskSystemInfo: ITaskSystemInfo | undefined; resolve(value: string): Promise<string> }, workspaceFolder: unknown): Promise<[ITerminalInstance | undefined, TaskError | undefined]>;
		})._createTerminal.bind(system);
		const [, error] = await createTerminal(task, resolver, undefined);
		assert.strictEqual(error, undefined);
		assert.strictEqual(createdConfigs.length, 1);
		assert.strictEqual(createdConfigs[0].type, 'Task');
		assert.strictEqual(createdConfigs[0].isFeatureTerminal, true);
	});
});
