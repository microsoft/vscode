/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
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
import { IChat, ISession, ISessionFolder, ISessionWorkspace, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IConfigurationResolverService } from '../../../../../workbench/services/configurationResolver/common/configurationResolver.js';
import { IWorkspaceFolderData } from '../../../../../platform/workspace/common/workspace.js';
import { ITaskEntry, ISessionsTasksService, ISessionTaskWithTarget } from '../../../chat/browser/sessionsTasksService.js';
import { osToTaskTargetOS } from '../../../chat/browser/taskCommand.js';
import { AgentHostSessionTaskRunner } from '../../browser/agentHostSessionTaskRunner.js';

function makeSession(opts: { providerId: string; cwd?: URI }): ISession {
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
		changesets: constObservable([]),
		changes: constObservable([]),
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

suite('AgentHostSessionTaskRunner', () => {

	const store = new DisposableStore();
	let runner: AgentHostSessionTaskRunner;
	let createdTerminals: { address: string; options?: IAgentHostTerminalCreateOptions }[];
	let sentText: { text: string; shouldExecute: boolean }[];
	let disposedTerminals: ITerminalInstance[];
	let allTasks: ISessionTaskWithTarget[];
	let resolverCalls: string[];
	const fakeInstance = {
		sendText: async (text: string, shouldExecute: boolean) => { sentText.push({ text, shouldExecute }); },
		dispose: () => { disposedTerminals.push(fakeInstance); },
	} as unknown as ITerminalInstance;

	setup(() => {
		createdTerminals = [];
		sentText = [];
		disposedTerminals = [];
		allTasks = [];
		resolverCalls = [];

		const instantiationService = store.add(new TestInstantiationService());

		instantiationService.stub(IAgentHostTerminalService, new class extends mock<IAgentHostTerminalService>() {
			override async createTerminalForEntry(address: string, options?: IAgentHostTerminalCreateOptions) {
				createdTerminals.push({ address, options });
				return fakeInstance;
			}
		});

		instantiationService.stub(ISessionsTasksService, new class extends mock<ISessionsTasksService>() {
			override async getAllTasks() {
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
			override async showPanel() { /* no-op */ }
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

		assert.deepStrictEqual(disposedTerminals, [fakeInstance]);
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
