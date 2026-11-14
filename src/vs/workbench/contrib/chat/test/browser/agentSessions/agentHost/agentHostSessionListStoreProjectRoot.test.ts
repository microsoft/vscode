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

	test('while matching by project root, also lists the sessions whose project is a folder of the window, such as in its worktrees, and lists them again as it turns on and off', async () => {
		const matchProjectRoot = observableValue('matchProjectRoot', false);
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({ registerSessionResource: (backendSession: URI) => backendSession }));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			getWorkspace: () => upcastPartial<IWorkspace>({ uri: URI.file('/work/vscode'), folders: [upcastPartial<IWorkspaceFolder>({ uri: URI.file('/work/vscode') })] }),
			onDidChangeWorkspaceFolders: Event.None,
		}));
		const sessions = [
			session('in-folder', '/work/vscode/src', '/work/vscode'),
			// Works in a worktree of the window's folder, which it reports as its project
			session('worktree', '/work/vscode.worktrees/feature', '/work/vscode'),
			session('unrelated', '/work/other.worktrees/x', '/work/other'),
			// A session of another multi-root workspace that shares the folder: only the windows of its workspace file list it
			session('multi-root', '/work/vscode.worktrees/multi', '/work/vscode', '/work/other.code-workspace'),
		];
		const connection: IAgentHostSessionListConnection = {
			onDidNotification: Event.None,
			resourceUris: identityAgentHostResourceUriMapper,
			listSessions: async () => [...sessions],
			disposeChat: async () => { },
			disposeSession: async () => { },
			dispatch: () => { },
		};
		const list = store.add(instantiationService.createInstance(AgentHostSessionListStore, connection, { matchProjectRoot }));
		const shown = () => list.getSessions('copilot').map(entry => entry.rawId).sort();
		const settle = async () => {
			await new Promise<void>(resolve => setTimeout(resolve, 0));
			await list.refresh(CancellationToken.None);
		};

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
});
