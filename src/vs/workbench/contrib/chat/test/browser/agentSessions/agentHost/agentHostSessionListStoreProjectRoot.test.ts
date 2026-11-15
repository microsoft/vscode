/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { identityAgentHostResourceUriMapper } from '../../../../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentSessionMetadata } from '../../../../../../../platform/agentHost/common/agentService.js';
import { type INotification } from '../../../../../../../platform/agentHost/common/state/sessionActions.js';
import { ROOT_STATE_URI, SessionStatus, withSessionMultiRootMetadata, withSessionWorkspaceless } from '../../../../../../../platform/agentHost/common/state/sessionState.js';
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
		const onDidNotification = store.add(new Emitter<INotification>());
		const connection: IAgentHostSessionListConnection = {
			onDidNotification: onDidNotification.event,
			resourceUris: identityAgentHostResourceUriMapper,
			listSessions: async () => [...sessions],
			disposeChat: async () => { },
			disposeSession: async () => { },
			dispatch: () => { },
		};
		const list = store.add(instantiationService.createInstance(AgentHostSessionListStore, connection, { matchProjectRoot }));
		return {
			matchProjectRoot,
			notify: (notification: INotification) => onDidNotification.fire(notification),
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

	/** A session working in `workingDirectories`, its own folder first, with a default chat and a nested chat. */
	const sessionWithChats = (id: string, workingDirectories: readonly string[], project: string, options?: { readonly workspaceless?: boolean }): IAgentSessionMetadata => ({
		session: URI.from({ scheme: 'copilot', path: `/${id}` }),
		startTime: 0,
		modifiedTime: 0,
		workingDirectories: workingDirectories.map(directory => URI.file(directory)),
		project: { uri: URI.file(project), displayName: project.split('/').pop()! },
		chats: [
			{ chat: URI.from({ scheme: 'copilot', path: `/${id}/default` }), kind: 'default' },
			{ chat: URI.from({ scheme: 'copilot', path: `/${id}/nested` }), kind: 'peer' },
		],
		...(options?.workspaceless ? { _meta: withSessionWorkspaceless(undefined, true) } : {}),
	});

	test('while matching by project root, a session whose own folder is of another repository is not listed in the window of a repository that only its nested chats work in', async () => {
		// Its default chat works in a worktree of agent-host-protocol; its nested chats added a worktree of the window's folder,
		// and the folder itself
		const { matchProjectRoot, shown, settle } = createList([
			sessionWithChats('other-repository', ['/work/agent-host-protocol.worktrees/chat-summary-docs', '/work/vscode.worktrees/sync-docs', '/work/vscode/src'], '/work/agent-host-protocol'),
		]);
		await settle();
		const off = shown();
		matchProjectRoot.set(true, undefined);
		await settle();

		assert.deepStrictEqual({ off, on: shown() }, { off: ['other-repository'], on: [] });
	});

	test('while matching by project root, a session added or changed by the host is listed by its first folder as a listed one is: a folder appended later changes nothing, another first folder narrows the list', async () => {
		const aph = URI.file('/work/agent-host-protocol.worktrees/chat-summary-docs').toString();
		const vscode = URI.file('/work/vscode.worktrees/sync-docs').toString();
		const { matchProjectRoot, notify, shown, settle } = createList([
			sessionWithChats('listed', ['/work/agent-host-protocol.worktrees/chat-summary-docs'], '/work/agent-host-protocol'),
			sessionWithChats('in-vscode', ['/work/vscode/src'], '/work/vscode'),
		]);
		matchProjectRoot.set(true, undefined);
		await settle();
		const log = [shown().join(',')];
		const resource = (id: string) => URI.from({ scheme: 'copilot', path: `/${id}` }).toString();
		// Started in another repository, with a later folder in the window's folder itself
		notify({ type: 'root/sessionAdded', channel: ROOT_STATE_URI, summary: { resource: resource('added'), provider: 'copilot', title: 'Added', status: SessionStatus.Idle, createdAt: new Date(0).toISOString(), modifiedAt: new Date(0).toISOString(), workingDirectories: [aph, URI.file('/work/vscode/src').toString()] } });
		log.push(shown().join(','));
		// Nested chats add folders: of the window's repository to one of another, of another repository to one of the window's
		for (const id of ['listed', 'added']) {
			notify({ type: 'root/sessionSummaryChanged', channel: ROOT_STATE_URI, session: resource(id), changes: { workingDirectories: [aph, vscode, URI.file('/work/vscode/src').toString()] } });
		}
		notify({ type: 'root/sessionSummaryChanged', channel: ROOT_STATE_URI, session: resource('in-vscode'), changes: { workingDirectories: [URI.file('/work/vscode/src').toString(), aph] } });
		log.push(shown().join(','));
		// Its first folder, and so its project, become of another repository
		notify({ type: 'root/sessionSummaryChanged', channel: ROOT_STATE_URI, session: resource('in-vscode'), changes: { workingDirectories: [aph, URI.file('/work/vscode/src').toString()], project: { uri: URI.file('/work/agent-host-protocol').toString(), displayName: 'agent-host-protocol' } } });
		log.push(shown().join(','));

		assert.deepStrictEqual(log, ['in-vscode', 'in-vscode', 'in-vscode', '']);
	});

	test('while matching by project root, a session is listed in the window of its first folder or its project, not of a later folder of it, and as before without a workspace or folder', async () => {
		const sessions = [
			// Its own folder is A; a nested chat works in B
			sessionWithChats('first-a', ['/work/a', '/work/b'], '/work/a'),
			// Works in a worktree of A, which it reports as its project
			sessionWithChats('worktree-of-a', ['/work/a.worktrees/x'], '/work/a'),
			// Its own folder is B
			sessionWithChats('first-b', ['/work/b', '/work/a'], '/work/b'),
			// Without a workspace, every window lists it; without a folder, the window of its project does
			sessionWithChats('workspaceless', ['/work/b.worktrees/y'], '/work/b', { workspaceless: true }),
			sessionWithChats('no-folder', [], '/work/b'),
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
			a: ['first-a', 'workspaceless', 'worktree-of-a'],
			b: ['first-b', 'no-folder', 'workspaceless'],
			// Off, as on main: any folder of the session
			offA: ['first-a', 'first-b'],
			offB: ['first-a', 'first-b'],
		});
	});
});
