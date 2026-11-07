/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService, ILogService } from '../../../../../platform/log/common/log.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService, WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustRequestService, IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IMarkerService } from '../../../../../platform/markers/common/markers.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IOutputChannel, IOutputService } from '../../../../services/output/common/output.js';
import { IPaneCompositePartService } from '../../../../services/panecomposite/browser/panecomposite.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationResolverService } from '../../../../services/configurationResolver/common/configurationResolver.js';
import { ITerminalGroupService, ITerminalService } from '../../../terminal/browser/terminal.js';
import { ITerminalProfileResolverService } from '../../../terminal/common/terminal.js';
import { TestContextService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { ILifecycleService, StartupKind } from '../../../../services/lifecycle/common/lifecycle.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { IChatService } from '../../../chat/common/chatService/chatService.js';
import { IChatAgentService } from '../../../chat/common/participants/chatAgents.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { ContributedTask, CustomTask, Task, TaskScope, USER_TASKS_GROUP_KEY } from '../../common/tasks.js';
import { ITaskFilter } from '../../common/taskService.js';
import { TaskService } from '../../electron-browser/taskService.js';

suite('TaskService.getTask label collision resolution (#335950)', () => {

	const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();
	const folder = new WorkspaceFolder({ uri: URI.file('/test'), name: 'test', index: 0 });
	const folderKey = folder.uri.toString();

	function createCustomTask(id: string, command: string): CustomTask {
		return new CustomTask(
			id,
			{
				kind: 'workspace',
				label: 'PreTask',
				config: { file: 'tasks.json', index: 0, element: { type: 'shell', label: 'PreTask' } }
			},
			'PreTask',
			'shell',
			{ name: command },
			false,
			{},
			{}
		);
	}

	function createContributedTask(id: string, command: string): ContributedTask {
		return new ContributedTask(
			id,
			{ kind: 'extension', label: 'PreTask', extension: 'pub.host', scope: TaskScope.Workspace, workspaceFolder: folder },
			'PreTask',
			'shell',
			{ type: 'shell', _key: 'shell:PreTask' },
			{ name: command },
			false,
			{},
			{}
		);
	}

	/**
	 * Creates a {@link TaskService} with all dependencies stubbed out.
	 * The tests drive {@link TaskService.getTask} directly and stub the task
	 * lookup methods, so the real workspace and provider machinery is unused.
	 */
	function createService(): TaskService {
		const fakeChannel = upcastPartial<IOutputChannel>({
			id: 'tasks',
			append: () => { },
			replace: () => { },
			clear: () => { },
			dispose: () => { }
		});
		const instantiationService = disposableStore.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IWorkspaceContextService, new TestContextService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IStorageService, disposableStore.add(new TestStorageService()));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IOutputService, upcastPartial<IOutputService>({ getChannel: () => fakeChannel }));
		instantiationService.stub(IMarkerService, {});
		instantiationService.stub(IPaneCompositePartService, {});
		instantiationService.stub(IViewsService, {});
		instantiationService.stub(ICommandService, {});
		instantiationService.stub(IEditorService, {});
		instantiationService.stub(IFileService, {});
		instantiationService.stub(ITextFileService, {});
		instantiationService.stub(IModelService, {});
		instantiationService.stub(IExtensionService, {});
		instantiationService.stub(IQuickInputService, {});
		instantiationService.stub(IConfigurationResolverService, { contributeVariable: () => { } });
		instantiationService.stub(ITerminalService, upcastPartial<ITerminalService>({ instances: [], whenConnected: Promise.resolve() }));
		instantiationService.stub(ITerminalGroupService, {});
		instantiationService.stub(ITerminalProfileResolverService, {});
		instantiationService.stub(IProgressService, {});
		instantiationService.stub(IOpenerService, {});
		instantiationService.stub(IDialogService, {});
		instantiationService.stub(INotificationService, {});
		instantiationService.stub(IWorkbenchEnvironmentService, {});
		instantiationService.stub(IPathService, {});
		instantiationService.stub(ITextModelService, {});
		instantiationService.stub(IPreferencesService, {});
		instantiationService.stub(IViewDescriptorService, {});
		instantiationService.stub(IWorkspaceTrustRequestService, {});
		instantiationService.stub(IWorkspaceTrustManagementService, {
			workspaceTrustInitialized: Promise.resolve(),
			isWorkspaceTrusted: () => true,
			onDidChangeTrust: Event.None
		});
		instantiationService.stub(IThemeService, {});
		instantiationService.stub(ILifecycleService, upcastPartial<ILifecycleService>({ startupKind: StartupKind.NewWindow, onBeforeShutdown: Event.None }));
		instantiationService.stub(IRemoteAgentService, { getConnection: () => null });
		instantiationService.stub(IAccessibilitySignalService, {});
		instantiationService.stub(IChatService, upcastPartial<IChatService>({ isEnabled: () => false }));
		instantiationService.stub(IChatAgentService, {});
		instantiationService.stub(IHostService, {});
		const system = instantiationService.createInstance(TaskService);
		// Settle the promise-backed listeners the constructor registers so they do not leak.
		system.registerSupportedExecutions(true, true, true);
		(system as unknown as { _onDidChangeTaskSystemInfo: Emitter<unknown> })._onDidChangeTaskSystemInfo.fire();
		return disposableStore.add(system);
	}

	test('getTask resolves the first task of a duplicate label in the workspace', async () => {
		const system = createService();
		const preFirst = createCustomTask('id-first', 'echo first');
		const preSecond = createCustomTask('id-second', 'echo second');
		const preThird = createCustomTask('id-third', 'echo third');

		// Three tasks with the same label in one tasks.json: the lookup keeps the definition order.
		const getWorkspaceTasksStub = sinon.stub(system, 'getWorkspaceTasks').resolves(new Map([
			[folderKey, { workspaceFolder: folder, set: { tasks: [preFirst, preSecond, preThird] }, configurations: undefined, hasErrors: false }]
		]));
		try {
			const task = await system.getTask(folder, 'PreTask');
			assert.strictEqual(task, preFirst);
		} finally {
			getWorkspaceTasksStub.restore();
		}
	});

	test('getTask keeps the definition order within a group of matching tasks', async () => {
		const system = createService();
		const customFirst = createCustomTask('id-custom-first', 'echo custom first');
		const customSecond = createCustomTask('id-custom-second', 'echo custom second');
		const contributed = createContributedTask('id-contributed', 'echo contributed');

		// No configured tasks are found in the workspace...
		const getWorkspaceTasksStub = sinon.stub(system, 'getWorkspaceTasks').resolves(new Map());
		// ...so the grouped lookup provides a mix of configured and contributed tasks with the same label.
		const getGroupedTasksStub = sinon.stub(system as unknown as { _getGroupedTasks(filter?: ITaskFilter): Promise<unknown> }, '_getGroupedTasks')
			.resolves({ get: (key: string | typeof folder): Task[] => (typeof key === 'string' ? key : key.uri.toString()) === folderKey ? [customFirst, customSecond, contributed] : [] });
		try {
			const task = await system.getTask(folder, 'PreTask');
			assert.strictEqual(task, customFirst);
		} finally {
			getWorkspaceTasksStub.restore();
			getGroupedTasksStub.restore();
		}
	});

	test('getTask prefers a configured task over a contributed one with the same label', async () => {
		const system = createService();
		const contributed = createContributedTask('id-contributed', 'echo contributed');
		const custom = createCustomTask('id-custom', 'echo custom');

		const getWorkspaceTasksStub = sinon.stub(system, 'getWorkspaceTasks').resolves(new Map());
		const getGroupedTasksStub = sinon.stub(system as unknown as { _getGroupedTasks(filter?: ITaskFilter): Promise<unknown> }, '_getGroupedTasks')
			.resolves({ get: (key: string | typeof folder): Task[] => (typeof key === 'string' ? key : key.uri.toString()) === folderKey ? [contributed] : key === USER_TASKS_GROUP_KEY ? [custom] : [] });
		try {
			const task = await system.getTask(folder, 'PreTask');
			assert.strictEqual(task, custom);
		} finally {
			getWorkspaceTasksStub.restore();
			getGroupedTasksStub.restore();
		}
	});
});
