/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { identityAgentHostResourceUriMapper } from '../../../../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentSessionMetadata } from '../../../../../../../platform/agentHost/common/agentService.js';
import { withSessionMultiRootMetadata, withSessionWorkspaceless } from '../../../../../../../platform/agentHost/common/state/sessionState.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../../platform/workspace/common/workspace.js';
import { AgentHostSessionListStore, IAgentHostSessionListConnection } from '../../../../browser/agentSessions/agentHost/agentHostSessionListStore.js';

suite('AgentHostSessionListStore - project root', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const session = (id: string, workingDirectory: string, project: string, workspaceFile?: string): IAgentSessionMetadata => ({
		session: URI.from({ scheme: 'copilot', path: `/${id}` }),
		startTime: 0,
		modifiedTime: 0,
		workingDirectories: [URI.file(workingDirectory)],
		project: { uri: URI.file(project), displayName: project.split('/').pop()! },
		...(workspaceFile ? { _meta: withSessionMultiRootMetadata(undefined, { workspaceFile: URI.file(workspaceFile).toString() }) } : {}),
	});

	/** The sessions list of a window on `folders`, of the workspace file `configuration` if any, while matching by project root as `matchProjectRoot` says. */
	function createList(sessions: readonly IAgentSessionMetadata[], options?: { readonly folders?: readonly string[]; readonly configuration?: string }) {
		const matchProjectRoot = observableValue('matchProjectRoot', false);
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({ registerSessionResource: (backendSession: URI) => backendSession }));
		const folders = (options?.folders ?? ['/work/vscode']).map(folder => upcastPartial<IWorkspaceFolder>({ uri: URI.file(folder) }));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			getWorkspace: () => upcastPartial<IWorkspace>(options?.configuration ? { configuration: URI.file(options.configuration), folders } : { uri: URI.file('/work/vscode'), folders }),
			onDidChangeWorkspaceFolders: Event.None,
			onDidChangeWorkbenchState: Event.None,
		}));
		const connection: IAgentHostSessionListConnection = {
			onDidNotification: Event.None,
			resourceUris: identityAgentHostResourceUriMapper,
			listSessions: async () => [...sessions],
			disposeChat: async () => { },
			disposeSession: async () => { },
			dispatch: () => { },
		};
		const list = store.add(instantiationService.createInstance(AgentHostSessionListStore, connection, { matchProjectRoot }));
		return {
			matchProjectRoot,
			shown: () => list.getSessions('copilot').map(entry => entry.rawId).sort(),
			settle: async () => {
				await new Promise<void>(resolve => setTimeout(resolve, 0));
				await list.refresh(CancellationToken.None);
			},
		};
	}

	test('while matching by project root, also lists the sessions whose project is a folder of the window, such as in its worktrees, and lists them again as it turns on and off', async () => {
		const { matchProjectRoot, shown, settle } = createList([
			session('in-folder', '/work/vscode/src', '/work/vscode'),
			// Works in a worktree of the window's folder, which it reports as its project
			session('worktree', '/work/vscode.worktrees/feature', '/work/vscode'),
			session('unrelated', '/work/other.worktrees/x', '/work/other'),
			// A session of a multi-root workspace whose project is the folder: not listed by its project in a single-folder window
			session('multi-root', '/work/vscode.worktrees/multi', '/work/vscode', '/work/other.code-workspace'),
		]);

		await settle();
		const off = shown();
		matchProjectRoot.set(true, undefined);
		await settle();
		const on = shown();
		matchProjectRoot.set(false, undefined);
		await settle();

		assert.deepStrictEqual({ off, on, offAgain: shown() }, {
			off: ['in-folder'],
			on: ['in-folder', 'worktree'],
			offAgain: ['in-folder'],
		});
	});

	test('while matching by project root, also lists the sessions without a workspace, such as quick chats, but not of a multi-root workspace', async () => {
		const workspaceless = (id: string, workspaceFile?: string): IAgentSessionMetadata => ({
			session: URI.from({ scheme: 'copilot', path: `/${id}` }),
			startTime: 0,
			modifiedTime: 0,
			// Its scratch folder, which the agent host creates for it
			workingDirectories: [URI.file(`/home/.copilot/chats/${id}`)],
			_meta: withSessionWorkspaceless(workspaceFile ? withSessionMultiRootMetadata(undefined, { workspaceFile: URI.file(workspaceFile).toString() }) : undefined, true),
		});
		const { matchProjectRoot, shown, settle } = createList([
			session('in-folder', '/work/vscode/src', '/work/vscode'),
			workspaceless('quick-chat'),
			workspaceless('multi-root-chat', '/work/other.code-workspace'),
		]);

		await settle();
		const off = shown();
		matchProjectRoot.set(true, undefined);
		await settle();

		assert.deepStrictEqual({ off, on: shown() }, {
			off: ['in-folder'],
			on: ['in-folder', 'quick-chat'],
		});
	});

	test('in a window of a workspace file, a session of another workspace file whose project is one of its folders is not listed by its project', async () => {
		const { matchProjectRoot, shown, settle } = createList([
			session('this-workspace', '/work/vscode.worktrees/a', '/work/vscode', '/work/this.code-workspace'),
			session('other-workspace', '/work/vscode.worktrees/b', '/work/vscode', '/work/other.code-workspace'),
		], { folders: ['/work/vscode', '/work/tools'], configuration: '/work/this.code-workspace' });
		matchProjectRoot.set(true, undefined);
		await settle();

		assert.deepStrictEqual(shown(), ['this-workspace']);
	});
	test('while the window\'s folder is at one of its worktrees, still lists the sessions whose project is the folder\'s own location', async () => {
		const { matchProjectRoot, shown, settle } = createList([
			session('main-checkout', '/work/vscode', '/work/vscode'),
			session('sibling-worktree', '/work/vscode.worktrees/bar', '/work/vscode'),
			session('at-worktree', '/work/vscode.worktrees/foo', '/work/vscode'),
			session('unrelated', '/work/other.worktrees/x', '/work/other'),
		], { folders: ['/work/vscode.worktrees/foo'] });
		matchProjectRoot.set(true, undefined);
		await settle();

		assert.deepStrictEqual(shown(), ['at-worktree', 'main-checkout', 'sibling-worktree']);
	});

	test('while matching by project root, a session whose default chat works in another repository is not listed in the window of a repository that only its nested chats work in', async () => {
		const aph = '/work/agent-host-protocol.worktrees/chat-summary-docs';
		const shape = (id: string, defaultChatKnown: boolean): IAgentSessionMetadata => ({
			session: URI.from({ scheme: 'copilot', path: `/${id}` }),
			startTime: 0,
			modifiedTime: 0,
			// Its own folder first, then those its nested chats added: a worktree of the window's folder, and the folder itself
			workingDirectories: [URI.file(aph), URI.file('/work/vscode.worktrees/sync-docs'), URI.file('/work/vscode/src')],
			project: { uri: URI.file('/work/agent-host-protocol'), displayName: 'agent-host-protocol' },
			chats: [
				{ chat: URI.from({ scheme: 'copilot', path: `/${id}/default` }), kind: 'default', ...(defaultChatKnown ? { workingDirectories: [URI.file(aph).toString()] } : {}) },
				{ chat: URI.from({ scheme: 'copilot', path: `/${id}/summary-docs` }), kind: 'peer', workingDirectories: [URI.file(aph).toString()] },
				{ chat: URI.from({ scheme: 'copilot', path: `/${id}/sync-docs` }), kind: 'peer', workingDirectories: [URI.file('/work/vscode.worktrees/sync-docs').toString()] },
			],
		});
		const sessions = [shape('default-chat-known', true), shape('default-chat-unknown', false)];
		const shownIn = async (on: boolean) => {
			const { matchProjectRoot, shown, settle } = createList(sessions);
			matchProjectRoot.set(on, undefined);
			await settle();
			return shown();
		};

		assert.deepStrictEqual({ on: await shownIn(true), off: await shownIn(false) }, { on: [], off: ['default-chat-known', 'default-chat-unknown'] });
	});

	/** A session whose default chat works in `defaultChat`'s folders, if any, and with nested chats in other folders. */
	const sessionWithChats = (id: string, workingDirectories: readonly string[], project: string, defaultChat: readonly string[] | undefined, options?: { readonly workspaceless?: boolean }): IAgentSessionMetadata => ({
		session: URI.from({ scheme: 'copilot', path: `/${id}` }),
		startTime: 0,
		modifiedTime: 0,
		workingDirectories: workingDirectories.map(directory => URI.file(directory)),
		project: { uri: URI.file(project), displayName: project.split('/').pop()! },
		chats: [
			{ chat: URI.from({ scheme: 'copilot', path: `/${id}/default` }), kind: 'default', ...(defaultChat ? { workingDirectories: defaultChat.map(directory => URI.file(directory).toString()) } : {}) },
			{ chat: URI.from({ scheme: 'copilot', path: `/${id}/nested` }), kind: 'peer', workingDirectories: [URI.file('/work/b').toString()] },
		],
		...(options?.workspaceless ? { _meta: withSessionWorkspaceless(undefined, true) } : {}),
	});

	test('while matching by project root, a session is listed in the window of its default chat\'s folder, not of a folder that only a nested chat or a later folder of it works in, and by its project only where its default chat works in its first folder', async () => {
		const sessions = [
			// Its default chat works in A, a nested chat in B
			sessionWithChats('default-in-a', ['/work/a', '/work/b'], '/work/a', ['/work/a']),
			// Its default chat sets no folders of its own: it works in the session's first folder, not its second
			sessionWithChats('primary-a', ['/work/a', '/work/b'], '/work/a', undefined),
			// Its default chat works in a worktree of A, which the session reports as its project
			sessionWithChats('worktree-of-a', ['/work/a.worktrees/x'], '/work/a', undefined),
			// Its default chat works in B, and the session's first folder and project are A's
			sessionWithChats('default-in-b', ['/work/a', '/work/b'], '/work/a', ['/work/b']),
			// Without a workspace of its default chat, its folders and project match as before: every window lists a session
			// without a workspace, and one without a folder by its project
			sessionWithChats('workspaceless', ['/work/b.worktrees/y'], '/work/b', undefined, { workspaceless: true }),
			sessionWithChats('no-folder', [], '/work/b', undefined),
		];
		const shownIn = async (folder: string, on: boolean) => {
			const { matchProjectRoot, shown, settle } = createList(sessions, { folders: [folder] });
			matchProjectRoot.set(on, undefined);
			await settle();
			return shown();
		};

		assert.deepStrictEqual({
			a: await shownIn('/work/a', true),
			b: await shownIn('/work/b', true),
			offA: await shownIn('/work/a', false),
			offB: await shownIn('/work/b', false),
		}, {
			a: ['default-in-a', 'primary-a', 'workspaceless', 'worktree-of-a'],
			b: ['default-in-b', 'no-folder', 'workspaceless'],
			// Off, as on main: any folder of the session
			offA: ['default-in-a', 'default-in-b', 'primary-a'],
			offB: ['default-in-a', 'default-in-b', 'primary-a'],
		});
	});
});
