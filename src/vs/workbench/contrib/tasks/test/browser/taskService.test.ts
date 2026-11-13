/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IConfigurationResolverService } from '../../../../services/configurationResolver/common/configurationResolver.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IOutputService } from '../../../../services/output/common/output.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import { TaskService } from '../../browser/taskService.js';
import { ProblemMatcherRegistry } from '../../common/problemMatcher.js';
import { ITaskSummary, ITaskSystem, TaskExecuteKind } from '../../common/taskSystem.js';
import { InMemoryTask, RunOptions } from '../../common/tasks.js';

suite('Task service rerun errors', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	for (const entry of ['command', 'terminal']) {
		for (const rejects of [false, true]) {
			test(`${entry} rerun ${rejects ? 'reports execution errors without an unhandled rejection' : 'completes without an error notification'}`, async () => {
				const instantiationService = workbenchInstantiationService(undefined, store);
				instantiationService.stub(IContextKeyService, store.add(instantiationService.createInstance(ContextKeyService)));
				instantiationService.stub(IWorkbenchEnvironmentService, new class extends mock<IWorkbenchEnvironmentService>() {
					override readonly remoteAuthority = undefined;
				});
				instantiationService.stub(IOutputService, { getChannel: () => undefined });
				instantiationService.stub(IConfigurationResolverService, { contributeVariable: () => { } });
				instantiationService.stub(ITerminalService, { whenConnected: Promise.resolve(), instances: [] });
				instantiationService.invokeFunction(accessor => sinon.stub(accessor.get(IEditorService), 'saveAll').resolves({ success: true, editors: [] }));
				sinon.stub(ProblemMatcherRegistry, 'onReady').resolves();
				const notifications: (string | Error)[] = [];
				instantiationService.stub(INotificationService, new class extends mock<INotificationService>() {
					override error(message: string | Error): void { notifications.push(message); }
				});
				const execution = new DeferredPromise<ITaskSummary>();
				const rerunCalled = new DeferredPromise<void>();
				const task = new InMemoryTask('test', { kind: 'inMemory', label: 'test' }, 'test', 'composite', RunOptions.defaults, {});
				const taskSystem = new class extends mock<ITaskSystem>() {
					override rerun() {
						void rerunCalled.complete();
						return { kind: TaskExecuteKind.Started, task, promise: execution.p };
					}
				};
				class RerunTaskService extends TaskService {
					protected override _getTaskSystem(): ITaskSystem { return taskSystem; }
				}
				const registerCommand = sinon.spy(CommandsRegistry, 'registerCommand');
				let service: RerunTaskService;
				try {
					service = store.add(instantiationService.createInstance(RerunTaskService));
				} finally {
					for (const call of registerCommand.getCalls()) {
						store.add(call.returnValue);
					}
					registerCommand.restore();
				}
				service.registerSupportedExecutions(true, true, true);
				const command = CommandsRegistry.getCommand('workbench.action.tasks.reRunTask');
				assert.ok(command);
				if (entry === 'command') {
					await instantiationService.invokeFunction(accessor => command.handler(accessor));
				} else {
					await service.rerun(1);
				}
				await rerunCalled.p;
				const error = new Error(`The command for process task '${task._label}' resolved to an empty string.`);
				if (rejects) {
					await execution.error(error);
				} else {
					await execution.complete({ exitCode: 0 });
				}
				await timeout(0);
				assert.deepStrictEqual(notifications, rejects ? [error.message] : []);
			});
		}
	}
});
