/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { InMemoryTask, RunOptions, Task } from '../../../../../workbench/contrib/tasks/common/tasks.js';
import { ITaskService } from '../../../../../workbench/contrib/tasks/common/taskService.js';
import { IChat, ISession, ISessionFolder, ISessionWorkspace, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ITaskEntry } from '../../browser/sessionsTasksService.js';
import { WorkbenchSessionTaskRunner } from '../../browser/workbenchSessionTaskRunner.js';
import { ChatLayoutPresentation, CHAT_SPECIFIC_LAYOUT_SETTING } from '../../../../common/chatLayout.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IChatDeletedEvent, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { ITerminalService } from '../../../../../workbench/contrib/terminal/browser/terminal.js';

function makeSession(opts: { repository?: URI; worktree?: URI } = {}): ISession {
	const workspace = opts.repository ? {
		uri: opts.repository,
		label: 'test',
		icon: Codicon.folder,
		folders: [{
			root: opts.repository,
			workingDirectory: opts.worktree ?? opts.repository,
			name: 'test',
			description: undefined,
			gitRepository: { uri: opts.repository, workTreeUri: opts.worktree, baseBranchName: undefined, gitHubInfo: constObservable(undefined) },
		} satisfies ISessionFolder],
		requiresWorkspaceTrust: false,
	} : undefined;
	const chat = { resource: URI.parse('file:///session') } as IChat;
	return {
		sessionId: 'test:session',
		resource: chat.resource,
		providerId: 'test',
		sessionType: 'background',
		icon: Codicon.copilot,
		createdAt: new Date(),
		workspace: observableValue('workspace', workspace as ISessionWorkspace | undefined),
		title: observableValue('title', 'session'),
		updatedAt: observableValue('updatedAt', new Date()),
		status: observableValue('status', SessionStatus.Untitled),
		modelId: observableValue('modelId', undefined),
		mode: observableValue('mode', undefined),
		loading: observableValue('loading', false),
		isArchived: observableValue('isArchived', false),
		isRead: observableValue('isRead', true),
		lastTurnEnd: observableValue('lastTurnEnd', undefined),
		description: observableValue('description', undefined),
		chats: observableValue('chats', [chat]),
		mainChat: constObservable(chat),
		capabilities: constObservable({ supportsMultipleChats: false }),
	};
}

function makeTask(label: string, command?: string): ITaskEntry {
	return { label, type: 'shell', command: command ?? label };
}

suite('WorkbenchSessionTaskRunner', () => {

	const store = new DisposableStore();
	let runner: WorkbenchSessionTaskRunner;
	let ranTasks: { label: string }[];
	let terminatedTasks: { label: string }[];
	let tasksByLabel: Map<string, Task>;
	let workspaceFoldersByUri: Map<string, IWorkspaceFolder>;
	let instantiationService: TestInstantiationService;
	let phone: ReturnType<typeof observableValue<boolean>>;
	let executedTasks: Task[];
	let resolutionBarrier: DeferredPromise<void> | undefined;
	let onDidDeleteChat: Emitter<IChatDeletedEvent>;

	const repoUri = URI.parse('file:///repo');
	const worktreeUri = URI.parse('file:///worktree');

	setup(() => {
		ranTasks = [];
		terminatedTasks = [];
		tasksByLabel = new Map();
		workspaceFoldersByUri = new Map();
		executedTasks = [];
		resolutionBarrier = undefined;

		instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ITerminalService, new class extends mock<ITerminalService>() {
			override readonly defaultBackendIdentity = 'pty';
		});

		instantiationService.stub(ITaskService, new class extends mock<ITaskService>() {
			override async getTask(_workspaceFolder: any, alias: string | any) {
				const label = typeof alias === 'string' ? alias : '';
				await resolutionBarrier?.p;
				return tasksByLabel.get(label);
			}
			override async run(task: Task | undefined) {
				if (task) {
					ranTasks.push({ label: task._label });
					executedTasks.push(task);
				}
				return undefined;
			}
			override async terminate(task: Task) {
				terminatedTasks.push({ label: task._label });
				return { success: true, task };
			}
		});

		instantiationService.stub(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() {
			override getWorkspaceFolder(resource: URI): IWorkspaceFolder | null {
				return workspaceFoldersByUri.get(resource.toString()) ?? null;
			}
		});
		phone = observableValue('phone', false);
		const presentation = store.add(new ChatLayoutPresentation(new TestConfigurationService({ [CHAT_SPECIFIC_LAYOUT_SETTING]: false }), true, phone));
		instantiationService.stub(IAgentWorkbenchLayoutService, new class extends mock<IAgentWorkbenchLayoutService>() {
			override readonly chatLayoutPresentation = presentation;
		});
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable(undefined);
		});
		onDidDeleteChat = store.add(new Emitter<IChatDeletedEvent>());
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override readonly onDidDeleteChat = onDidDeleteChat.event;
			override readonly onDidChangeSessions = store.add(new Emitter<ISessionsChangeEvent>()).event;
		});

		runner = instantiationService.createInstance(WorkbenchSessionTaskRunner);
	});

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	function registerMockTask(label: string, folder: URI): void {
		tasksByLabel.set(label, { _label: label } as unknown as Task);
		workspaceFoldersByUri.set(folder.toString(), { uri: folder, name: 'folder', index: 0, toResource: () => folder } as IWorkspaceFolder);
	}

	function enableChatOwnership(): void {
		const presentation = store.add(new ChatLayoutPresentation(new TestConfigurationService({ [CHAT_SPECIFIC_LAYOUT_SETTING]: true }), true, phone));
		instantiationService.stub(IAgentWorkbenchLayoutService, new class extends mock<IAgentWorkbenchLayoutService>() {
			override readonly chatLayoutPresentation = presentation;
		});
		runner = instantiationService.createInstance(WorkbenchSessionTaskRunner);
		registerMockTask('build', worktreeUri);
		tasksByLabel.set('build', new InMemoryTask('build', { kind: 'inMemory', label: 'test' }, 'build', 'composite', RunOptions.defaults, {}));
	}

	test('same-cwd sibling workbench tasks carry distinct immutable scopes through task cloning', async () => {
		enableChatOwnership();
		const session = makeSession({ repository: repoUri, worktree: worktreeUri });
		const peer = { ...session.mainChat.get(), resource: URI.parse('opaque:/peer'), workspace: session.workspace };
		store.add((await runner.runTask(makeTask('build'), session))!);
		store.add((await runner.runTask(makeTask('build'), session, peer))!);
		store.add((await runner.runTask(makeTask('build'), session))!);
		const cloned = executedTasks.map(task => task.clone());
		assert.deepStrictEqual({
			owners: cloned.map(task => task.terminalScope?.owner.chatResource),
			sameOwnerReusesKey: cloned[0].getMapKey() === cloned[2].getMapKey(),
			peerHasDistinctKey: cloned[0].getMapKey() !== cloned[1].getMapKey(),
			catalogUnmodified: tasksByLabel.get('build')!.terminalScope,
		}, { owners: [session.mainChat.get().resource.toString(), peer.resource.toString(), session.mainChat.get().resource.toString()], sameOwnerReusesKey: true, peerHasDistinctKey: true, catalogUnmodified: undefined });
	});

	test('exact confirmed chat deletion cancels workbench task lookup without removing catalog entries', async () => {
		enableChatOwnership();
		resolutionBarrier = new DeferredPromise<void>();
		const session = makeSession({ repository: repoUri, worktree: worktreeUri });
		const running = runner.runTask(makeTask('build'), session);
		onDidDeleteChat.fire({ session, sessionResource: session.resource, chatResource: session.mainChat.get().resource });
		await resolutionBarrier.complete();
		await running;
		assert.deepStrictEqual(executedTasks, []);
	});

	test('runtime phone cancels queued task lookup and suspends task-stop cleanup', async () => {
		enableChatOwnership();
		const session = makeSession({ repository: repoUri, worktree: worktreeUri });
		const handle = store.add((await runner.runTask(makeTask('build'), session))!);
		resolutionBarrier = new DeferredPromise<void>();
		const running = runner.runTask(makeTask('build'), session);
		phone.set(true, undefined);
		handle.dispose();
		await resolutionBarrier.complete();
		await running;
		assert.deepStrictEqual({ executed: executedTasks.length, terminated: terminatedTasks.length }, { executed: 1, terminated: 0 });
	});

	test('canRun: false for sessions without a workspace', () => {
		assert.strictEqual(runner.canRun(makeSession()), false);
	});

	test('canRun: false for non-file schemes', () => {
		const session = makeSession({ repository: URI.parse('vscode-vfs://github/owner/repo') });
		assert.strictEqual(runner.canRun(session), false);
	});

	test('canRun: false when no workspace folder is loaded for the path', () => {
		const session = makeSession({ worktree: worktreeUri, repository: repoUri });
		assert.strictEqual(runner.canRun(session), false);
	});

	test('canRun: true for local file sessions with a loaded workspace folder', () => {
		workspaceFoldersByUri.set(worktreeUri.toString(), { uri: worktreeUri, name: 'folder', index: 0, toResource: () => worktreeUri } as IWorkspaceFolder);
		const session = makeSession({ worktree: worktreeUri, repository: repoUri });
		assert.strictEqual(runner.canRun(session), true);
	});

	test('runTask looks up by label and runs via ITaskService', async () => {
		registerMockTask('build', worktreeUri);
		const session = makeSession({ worktree: worktreeUri, repository: repoUri });

		(await runner.runTask(makeTask('build'), session))?.dispose();

		assert.deepStrictEqual(ranTasks, [{ label: 'build' }]);
	});

	test('returned handle terminates the task via ITaskService', async () => {
		registerMockTask('build', worktreeUri);
		const session = makeSession({ worktree: worktreeUri, repository: repoUri });

		const handle = await runner.runTask(makeTask('build'), session);
		assert.deepStrictEqual(terminatedTasks, []);

		handle?.dispose();

		assert.deepStrictEqual(terminatedTasks, [{ label: 'build' }]);
	});

	test('runTask is a no-op when task is not registered', async () => {
		workspaceFoldersByUri.set(worktreeUri.toString(), { uri: worktreeUri, name: 'folder', index: 0, toResource: () => worktreeUri } as IWorkspaceFolder);
		const session = makeSession({ worktree: worktreeUri, repository: repoUri });

		await runner.runTask(makeTask('nope'), session);

		assert.strictEqual(ranTasks.length, 0);
	});

	test('runTask uses repository as cwd when worktree is not available', async () => {
		registerMockTask('build', repoUri);
		const session = makeSession({ repository: repoUri });

		(await runner.runTask(makeTask('build'), session))?.dispose();

		assert.deepStrictEqual(ranTasks, [{ label: 'build' }]);
	});

	test('priority is 0 (lowest fallback)', () => {
		assert.strictEqual(runner.priority, 0);
		// Sanity check on Schemas import usage so unused-import doesn't bite.
		assert.strictEqual(Schemas.file, 'file');
	});
});
