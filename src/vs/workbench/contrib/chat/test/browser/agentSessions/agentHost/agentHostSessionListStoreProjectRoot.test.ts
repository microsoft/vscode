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
import { withSessionMultiRootMetadata } from '../../../../../../../platform/agentHost/common/state/sessionState.js';
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

	test('in a window of a workspace file, a session of another workspace file whose project is one of its folders is not listed by its project', async () => {
		const { matchProjectRoot, shown, settle } = createList([
			session('this-workspace', '/work/vscode.worktrees/a', '/work/vscode', '/work/this.code-workspace'),
			session('other-workspace', '/work/vscode.worktrees/b', '/work/vscode', '/work/other.code-workspace'),
		], { folders: ['/work/vscode', '/work/tools'], configuration: '/work/this.code-workspace' });
		matchProjectRoot.set(true, undefined);
		await settle();

		assert.deepStrictEqual(shown(), ['this-workspace']);
	});
});
