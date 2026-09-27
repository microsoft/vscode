/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { OS } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService, ILogService } from '../../../../../platform/log/common/log.js';
import { AGENT_HOST_SCHEME, toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentHostTerminalCreateOptions, IAgentHostTerminalService } from '../../../../../workbench/contrib/terminal/browser/agentHostTerminalService.js';
import { ITerminalGroupService, ITerminalInstance, ITerminalService } from '../../../../../workbench/contrib/terminal/browser/terminal.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID, REMOTE_AGENT_HOST_PROVIDER_PREFIX } from '../../../../common/agentHostSessionsProvider.js';
import { IChat, ISession, ISessionFolder, ISessionWorkspace, SessionRemoteConnectionFailureReason, SessionRemoteConnectionStatus, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IConfigurationResolverService } from '../../../../../workbench/services/configurationResolver/common/configurationResolver.js';
import { IWorkspaceFolderData } from '../../../../../platform/workspace/common/workspace.js';
import { ITaskEntry, ISessionsTasksService, ISessionTaskWithTarget } from '../../../chat/browser/sessionsTasksService.js';
import { osToTaskTargetOS } from '../../../chat/browser/taskCommand.js';
import { AgentHostSessionTaskRunner } from '../../browser/agentHostSessionTaskRunner.js';

function makeSession(opts: { providerId: string; cwd?: URI; remoteConnectionStatus?: SessionRemoteConnectionStatus }): ISession {
	const folder: ISessionFolder | undefined = opts.cwd ? {
		root: opts.cwd,
		workingDirectory: opts.cwd,
		name: 'test',
		description: undefined,
		gitRepository: { uri: opts.cwd, workTreeUri: undefined, baseBranchName: undefined, gitHubInfo: constObservable(undefined) },
	} : undefined;
	const workspace: ISessionWorkspace | undefined = folder ? {
		uri: opts.cwd!,
		label: 'test',
		icon: Codicon.folder,
		folders: [folder],
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: false,
	} : undefined;
	const chat = { resource: URI.parse('file:///session') } as IChat;
	return {
		sessionId: `${opts.providerId}:session`,
		resource: chat.resource,
		providerId: opts.providerId,
		sessionType: 'background',
		icon: Codicon.copilot,
		createdAt: new Date(),
		workspace: observableValue('workspace', workspace),
		title: observableValue('title', 'session'),
		updatedAt: observableValue('updatedAt', new Date()),
		status: observableValue('status', SessionStatus.Untitled),
		modelId: observableValue('modelId', undefined),
		mode: observableValue('mode', undefined),
		loading: observableValue('loading', false),
		...(opts.remoteConnectionStatus ? { remoteConnectionStatus: observableValue('remoteConnectionStatus', opts.remoteConnectionStatus) } : {}),
		isArchived: observableValue('isArchived', false),
		isRead: observableValue('isRead', true),
		lastTurnEnd: observableValue('lastTurnEnd', undefined),
		description: observableValue('description', undefined),
		chats: observableValue('chats', [chat]),
		mainChat: constObservable(chat),
		capabilities: constObservable({ supportsMultipleChats: false }),
	};
}

suite('AgentHostSessionTaskRunner', () => {

	const store = new DisposableStore();
	let runner: AgentHostSessionTaskRunner;
	let createdTerminals: { address: string; options?: IAgentHostTerminalCreateOptions; instance: ITerminalInstance }[];
	let sentText: { text: string; shouldExecute: boolean }[];
	let disposedTerminals: ITerminalInstance[];
	let allTasks: ISessionTaskWithTarget[];
	let allTasksOwner: ISession | IChat | undefined;
	let resolverCalls: string[];
	let commandExecuting: boolean | undefined;
	let terminalCwd: { initial: string; current: string } | undefined;
	let pendingCommandMarks: number;
	let clearedTerminals: ITerminalInstance[];
	let showPanelBarrier: DeferredPromise<void> | undefined;
	let firstShowPanelCall: DeferredPromise<void> | undefined;
	let secondShowPanelCall: DeferredPromise<void> | undefined;
	let showPanelCallCount: number;

	function createFakeTerminal(): ITerminalInstance {
		const instanceStore = store.add(new DisposableStore());
		let isDisposed = false;
		const instance = {
			get isDisposed() { return isDisposed; },
			store: instanceStore,
			sendText: async (text: string, shouldExecute: boolean) => { sentText.push({ text, shouldExecute }); },
			clearBuffer: () => { clearedTerminals.push(instance); },
			dispose: () => {
				if (!isDisposed) {
					isDisposed = true;
					disposedTerminals.push(instance);
					instanceStore.dispose();
				}
			},
		} as unknown as ITerminalInstance;
		return instance;
	}

	setup(() => {
		createdTerminals = [];
		sentText = [];
		disposedTerminals = [];
		allTasks = [];
		allTasksOwner = undefined;
		resolverCalls = [];
		commandExecuting = undefined;
		terminalCwd = { initial: '/x', current: '/x' };
		pendingCommandMarks = 0;
		clearedTerminals = [];
		showPanelBarrier = undefined;
		firstShowPanelCall = undefined;
		secondShowPanelCall = undefined;
		showPanelCallCount = 0;

		const instantiationService = store.add(new TestInstantiationService());

		instantiationService.stub(IAgentHostTerminalService, new class extends mock<IAgentHostTerminalService>() {
			override async createTerminalForEntry(address: string, options?: IAgentHostTerminalCreateOptions) {
				const instance = createFakeTerminal();
				createdTerminals.push({ address, options, instance });
				return instance;
			}
			override isCommandExecuting() {
				return commandExecuting;
			}
			override markCommandPending() {
				pendingCommandMarks++;
			}
			override getCwd() {
				return terminalCwd;
			}
		});

		instantiationService.stub(ISessionsTasksService, new class extends mock<ISessionsTasksService>() {
			override async getAllTasks(owner: ISession | IChat) {
				allTasksOwner = owner;
				return allTasks;
			}
		});

		instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
			override getProvider<T extends ISessionsProvider>(id: string): T | undefined {
				if (id === LOCAL_AGENT_HOST_PROVIDER_ID || id.startsWith(REMOTE_AGENT_HOST_PROVIDER_PREFIX)) {
					return new class extends mock<IAgentHostSessionsProvider>() {
						override id = id;
						override remoteAddress = id === LOCAL_AGENT_HOST_PROVIDER_ID ? undefined : `remote-${id}`;
					} as unknown as T;
				}
				return undefined;
			}
		});

		instantiationService.stub(ITerminalService, new class extends mock<ITerminalService>() {
			override setActiveInstance() { /* no-op */ }
		});

		instantiationService.stub(ITerminalGroupService, new class extends mock<ITerminalGroupService>() {
			override async showPanel() {
				showPanelCallCount++;
				if (showPanelCallCount === 1) {
					firstShowPanelCall?.complete();
				} else if (showPanelCallCount === 2) {
					secondShowPanelCall?.complete();
				}
				await showPanelBarrier?.p;
			}
		});

		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IConfigurationResolverService, new class extends mock<IConfigurationResolverService>() {
			override resolveAsync(folder: IWorkspaceFolderData | undefined, value: any): any {
				resolverCalls.push(String(value));
				return Promise.resolve(
					typeof value === 'string' && folder
						? value.replaceAll('${workspaceFolder}', folder.uri.path)
						: value
				);
			}
		});

		runner = instantiationService.createInstance(AgentHostSessionTaskRunner);
		// Reference unused imports to keep them in the bundle and silence linters.
		void Event;
	});

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	function shellTask(): ITaskEntry {
		return { label: 'build', type: 'shell', command: 'echo', args: ['hi'] };
	}

	test('canRun: false for non-agent-host providers', () => {
		assert.strictEqual(runner.canRun(makeSession({ providerId: 'copilot-chat-sessions' })), false);
	});

	test('canRun: true for local agent host', () => {
		assert.strictEqual(runner.canRun(makeSession({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID })), true);
	});

	test('canRun: true for remote agent host', () => {
		assert.strictEqual(runner.canRun(makeSession({ providerId: 'agenthost-myhost' })), true);
	});

	test('does not run tasks for an unavailable remote agent host', async () => {
		const session = makeSession({
			providerId: 'agenthost-myhost',
			cwd: toAgentHostUri(URI.file('/remote/worktree'), 'remote-agenthost-myhost'),
			remoteConnectionStatus: { kind: 'disconnected', reason: SessionRemoteConnectionFailureReason.HostNotRunning },
		});

		const handle = await runner.runTask(shellTask(), session);

		assert.deepStrictEqual({
			canRun: runner.canRun(session),
			handle,
			createdTerminals,
		}, {
			canRun: false,
			handle: undefined,
			createdTerminals: [],
		});
	});

	test('local agent-host sessions pass through file: cwd', async () => {
		const cwd = URI.parse('file:///path/to/worktree');
		const session = makeSession({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, cwd });

		(await runner.runTask(shellTask(), session))?.dispose();

		assert.strictEqual(createdTerminals.length, 1);
		assert.strictEqual(createdTerminals[0].address, '__local__');
		assert.deepStrictEqual(createdTerminals[0].options?.cwd?.toString(), cwd.toString());
		assert.deepStrictEqual(sentText, [{ text: 'echo hi', shouldExecute: true }]);
	});

	test('returned handle stops the task by disposing its terminal', async () => {
		const session = makeSession({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, cwd: URI.parse('file:///x') });

		const handle = await runner.runTask(shellTask(), session);
		assert.deepStrictEqual(disposedTerminals, []);

		handle?.dispose();

		assert.deepStrictEqual(disposedTerminals, [createdTerminals[0].instance]);
	});

	test('reuses the idle terminal that last ran the same task', async () => {
		const session = makeSession({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, cwd: URI.parse('file:///x') });
		commandExecuting = false;

		const handles = [
			await runner.runTask(shellTask(), session),
			await runner.runTask(shellTask(), session),
			await runner.runTask({ label: 'test', type: 'shell', command: 'echo', args: ['test'] }, session),
		];
		handles.forEach(handle => handle?.dispose());

		assert.deepStrictEqual({
			createdTerminals: createdTerminals.map(t => t.options?.name),
			sentText: sentText.map(t => t.text),
			pendingCommandMarks,
		}, {
			createdTerminals: ['Task: build', 'Task: test'],
			sentText: ['echo hi', 'echo hi', 'echo test'],
			pendingCommandMarks: 3,
		});
	});

	test('does not reuse a terminal whose shell left the task working directory', async () => {
		const session = makeSession({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, cwd: URI.parse('file:///x') });
		commandExecuting = false;

		const handles = [await runner.runTask(shellTask(), session)];
		terminalCwd = { initial: '/x', current: '/x/' };
		handles.push(await runner.runTask(shellTask(), session));
		terminalCwd = { initial: '/x', current: '/x/subdir' };
		handles.push(await runner.runTask(shellTask(), session));
		handles.forEach(handle => handle?.dispose());

		assert.strictEqual(createdTerminals.length, 2);
	});

	test('clears a reused terminal when the task requests it', async () => {
		const session = makeSession({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, cwd: URI.parse('file:///x') });
		commandExecuting = false;
		const task = { ...shellTask(), terminal: { clear: true } };

		const handles = [
			await runner.runTask(task, session),
			await runner.runTask(task, session),
		];
		handles.forEach(handle => handle?.dispose());

		assert.deepStrictEqual({
			createdTerminals: createdTerminals.length,
			clearedTerminals,
		}, {
			createdTerminals: 1,
			clearedTerminals: [createdTerminals[0].instance],
		});
	});

	test('does not reuse a terminal while a command is being launched', async () => {
		const session = makeSession({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, cwd: URI.parse('file:///x') });
		commandExecuting = false;
		showPanelBarrier = new DeferredPromise<void>();
		firstShowPanelCall = new DeferredPromise<void>();
		secondShowPanelCall = new DeferredPromise<void>();

		const firstRun = runner.runTask(shellTask(), session);
		await firstShowPanelCall.p;
		const secondRun = runner.runTask(shellTask(), session);
		await secondShowPanelCall.p;
		showPanelBarrier.complete();
		const handles = await Promise.all([firstRun, secondRun]);
		handles.forEach(handle => handle?.dispose());

		assert.strictEqual(createdTerminals.length, 2);
	});

	test('disposing an earlier run does not dispose a terminal reused by a later run', async () => {
		const session = makeSession({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, cwd: URI.parse('file:///x') });
		commandExecuting = false;

		const firstHandle = await runner.runTask(shellTask(), session);
		const secondHandle = await runner.runTask(shellTask(), session);
		firstHandle?.dispose();
		const disposedAfterFirstHandle = [...disposedTerminals];
		secondHandle?.dispose();

		assert.deepStrictEqual({
			disposedAfterFirstHandle,
			disposedTerminals,
		}, {
			disposedAfterFirstHandle: [],
			disposedTerminals: [createdTerminals[0].instance],
		});
	});

	test('does not reuse a terminal when the task requests a new panel', async () => {
		const session = makeSession({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, cwd: URI.parse('file:///x') });
		commandExecuting = false;
		const tasks: ITaskEntry[] = [
			{ ...shellTask(), presentation: { panel: 'new' } },
			{ ...shellTask(), label: 'mixedCase', presentation: { panel: 'New' } },
			{ ...shellTask(), label: 'legacy', terminal: { panel: 'new' } },
		];

		const handles = [];
		for (const task of tasks) {
			handles.push(await runner.runTask(task, session), await runner.runTask(task, session));
		}
		handles.forEach(handle => handle?.dispose());

		assert.strictEqual(createdTerminals.length, 6);
	});

	test('does not reuse a terminal whose command is still running or whose state is unknown', async () => {
		const session = makeSession({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, cwd: URI.parse('file:///x') });

		commandExecuting = true;
		const handles = [
			await runner.runTask(shellTask(), session),
			await runner.runTask(shellTask(), session),
		];
		commandExecuting = undefined;
		handles.push(await runner.runTask(shellTask(), session));
		handles.forEach(handle => handle?.dispose());

		assert.strictEqual(createdTerminals.length, 3);
	});

	test('agent-host scheme cwds are unwrapped to their original URI', async () => {
		const innerCwd = URI.parse('file:///remote/path');
		const wrapped = toAgentHostUri(innerCwd, 'remote');
		assert.strictEqual(wrapped.scheme, AGENT_HOST_SCHEME, 'precondition: wrapped uri');
		const session = makeSession({ providerId: 'agenthost-myhost', cwd: wrapped });

		(await runner.runTask(shellTask(), session))?.dispose();

		assert.strictEqual(createdTerminals.length, 1);
		assert.strictEqual(createdTerminals[0].options?.cwd?.toString(), innerCwd.toString());
	});

	test('unknown scheme cwds are omitted (host uses default)', async () => {
		const session = makeSession({ providerId: 'agenthost-myhost', cwd: URI.parse('vscode-vfs://github/owner/repo') });

		(await runner.runTask(shellTask(), session))?.dispose();

		assert.strictEqual(createdTerminals.length, 1);
		assert.strictEqual(createdTerminals[0].options?.cwd, undefined);
	});

	test('skips when no command can be resolved from the task', async () => {
		const session = makeSession({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, cwd: URI.parse('file:///x') });
		(await runner.runTask({ label: 'empty' }, session))?.dispose();
		assert.deepStrictEqual(createdTerminals, []);
	});

	test('resolves dependsOn chains against the full tasks.json', async () => {
		const session = makeSession({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, cwd: URI.parse('file:///x') });
		const transpile: ITaskEntry = { label: 'Transpile Client', type: 'shell', command: 'npm', args: ['run', 'transpile'] };
		const runDev: ITaskEntry = { label: 'Run Dev', type: 'shell', command: 'npm', args: ['run', 'dev'] };
		const top: ITaskEntry = {
			label: 'Run and Compile Code - OSS',
			dependsOn: ['Transpile Client', 'Run Dev'],
			dependsOrder: 'sequence',
			inAgents: true,
		};
		allTasks = [
			{ task: transpile, target: 'workspace' },
			{ task: runDev, target: 'workspace' },
			{ task: top, target: 'workspace' },
		];

		(await runner.runTask(top, session))?.dispose();

		assert.deepStrictEqual(sentText, [{ text: 'npm run transpile && npm run dev', shouldExecute: true }]);
	});

	test('local agent-host sessions apply OS-specific command overrides', async () => {
		const session = makeSession({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, cwd: URI.parse('file:///x') });
		const task: ITaskEntry = {
			label: 'Run Dev Agents',
			type: 'shell',
			command: './scripts/code.sh',
			windows: { command: '.\\scripts\\code.bat' },
			args: ['--agents'],
		};

		(await runner.runTask(task, session))?.dispose();

		const expectedCommand = osToTaskTargetOS(OS) === 'windows' ? '.\\scripts\\code.bat' : './scripts/code.sh';
		assert.deepStrictEqual(sentText, [{ text: `${expectedCommand} --agents`, shouldExecute: true }]);
	});

	test('expands ${workspaceFolder} to the session working directory', async () => {
		const cwd = URI.file('/path/to/worktree');
		const session = makeSession({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, cwd });
		const task: ITaskEntry = {
			label: 'Run Client',
			type: 'shell',
			command: './scripts/code.sh',
			args: ['--user-data-dir=${workspaceFolder}/.profile-oss'],
		};

		(await runner.runTask(task, session))?.dispose();

		assert.deepStrictEqual(sentText, [{
			text: `./scripts/code.sh --user-data-dir=${cwd.path}/.profile-oss`,
			shouldExecute: true,
		}]);
		assert.deepStrictEqual(resolverCalls, ['./scripts/code.sh', '--user-data-dir=${workspaceFolder}/.profile-oss']);
	});

	test('runs tasks and dependent tasks from the active chat working directory', async () => {
		const session = makeSession({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, cwd: URI.file('/session-a') });
		const chatCwd = URI.file('/session-b');
		const chat = {
			...session.mainChat.get(),
			resource: URI.parse('file:///session/chat-b'),
			workspace: constObservable({
				...session.workspace.get()!,
				uri: chatCwd,
				folders: [{
					...session.workspace.get()!.folders[0],
					root: chatCwd,
					workingDirectory: chatCwd,
				}],
			}),
		};
		const dependency: ITaskEntry = {
			label: 'Prepare',
			type: 'shell',
			command: 'echo ${workspaceFolder}',
		};
		const task: ITaskEntry = {
			label: 'Run',
			type: 'shell',
			dependsOn: 'Prepare',
		};
		allTasks = [{ task: dependency, target: 'workspace' }];

		(await runner.runTask(task, session, chat))?.dispose();

		assert.deepStrictEqual({
			allTasksOwner: allTasksOwner === chat,
			cwd: createdTerminals[0].options?.cwd?.toString(),
			sentText,
		}, {
			allTasksOwner: true,
			cwd: chatCwd.toString(),
			sentText: [{ text: `echo ${chatCwd.path}`, shouldExecute: true }],
		});
	});

	test('remote agent-host sessions expand ${workspaceFolder} from the POSIX host path without the renderer resolver', async () => {
		const innerCwd = URI.file('/remote/worktree');
		const session = makeSession({ providerId: 'agenthost-myhost', cwd: toAgentHostUri(innerCwd, 'remote') });
		const task: ITaskEntry = {
			label: 'Run Client',
			type: 'shell',
			command: './scripts/code.sh',
			args: ['--user-data-dir=${workspaceFolder}/.profile-oss'],
		};

		(await runner.runTask(task, session))?.dispose();

		assert.deepStrictEqual(sentText, [{
			text: `./scripts/code.sh --user-data-dir=${innerCwd.path}/.profile-oss`,
			shouldExecute: true,
		}]);
		assert.deepStrictEqual(resolverCalls, []);
	});
});
