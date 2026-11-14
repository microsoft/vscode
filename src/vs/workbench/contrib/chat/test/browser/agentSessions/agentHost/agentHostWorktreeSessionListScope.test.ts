/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { identityAgentHostResourceUriMapper } from '../../../../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentSessionMetadata } from '../../../../../../../platform/agentHost/common/agentService.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { IFolderLocation, IWorkspaceFolderLocationService } from '../../../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../../platform/workspace/common/workspace.js';
import { AgentHostSessionListStore, IAgentHostSessionListConnection } from '../../../../browser/agentSessions/agentHost/agentHostSessionListStore.js';
import { AgentHostWorktreeSessionListScope } from '../../../../browser/agentSessions/agentHost/agentHostWorktreeSessionListScope.js';
import { AgentHostWorktreeSessionSources, IAgentHostWorktreeSessionSources } from '../../../../browser/agentSessions/agentHost/agentHostWorktreeSessionSources.js';
import { ChatConfiguration } from '../../../../common/constants.js';

suite('AgentHostWorktreeSessionListScope', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const session = (id: string, workingDirectory: string, project?: string): IAgentSessionMetadata => ({
		session: URI.from({ scheme: 'copilot', path: `/${id}` }),
		startTime: 0,
		modifiedTime: 0,
		workingDirectories: [URI.file(workingDirectory)],
		...(project ? { project: { uri: URI.file(project), displayName: project.split('/').pop()! } } : {}),
	});

	/** The Chat view's sessions list of a window on `/work/vscode`, with the sessions its agent host lists. */
	function createList(options: { readonly enabled: boolean; readonly sessions: readonly IAgentSessionMetadata[]; readonly locations?: readonly string[] }) {
		const configurationService = new TestConfigurationService({ [ChatConfiguration.EditorWindowEnableWorktree]: options.enabled });
		let locations = options.locations ?? [];
		const onDidChangeProviders = store.add(new Emitter<void>());
		let listed = 0;
		let locationReads = 0;
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({ registerSessionResource: (backendSession: URI) => backendSession }));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			getWorkspace: () => upcastPartial<IWorkspace>({ uri: URI.file('/work/vscode'), folders: [upcastPartial<IWorkspaceFolder>({ uri: URI.file('/work/vscode') })] }),
			onDidChangeWorkspaceFolders: Event.None,
		}));
		instantiationService.stub(IWorkspaceFolderLocationService, upcastPartial<IWorkspaceFolderLocationService>({
			onDidChangeProviders: onDidChangeProviders.event,
			onDidChangeLocation: Event.None,
			canSetLocation: () => true,
			getLocations: async () => { locationReads++; return locations.map(path => upcastPartial<IFolderLocation>({ uri: URI.file(path) })); },
		}));
		instantiationService.stub(IAgentHostWorktreeSessionSources, store.add(new AgentHostWorktreeSessionSources()));
		const connection: IAgentHostSessionListConnection = {
			onDidNotification: Event.None,
			resourceUris: identityAgentHostResourceUriMapper,
			listSessions: async () => { listed++; return [...options.sessions]; },
			disposeChat: async () => { },
			disposeSession: async () => { },
			dispatch: () => { },
		};
		const scope = store.add(instantiationService.createInstance(AgentHostWorktreeSessionListScope));
		const list = store.add(instantiationService.createInstance(AgentHostSessionListStore, connection, { scope }));
		const shown = () => list.getSessions('copilot').map(entry => entry.rawId).sort();
		const settle = async () => {
			await new Promise<void>(resolve => setTimeout(resolve, 0));
			await list.refresh(CancellationToken.None);
		};
		return {
			list, shown, settle,
			calls: () => ({ listed, locationReads }),
			setLocations: (next: readonly string[]) => { locations = next; onDidChangeProviders.fire(); },
		};
	}

	const sessions = [
		session('in-folder', '/work/vscode/src'),
		// Native: works in a worktree of the window's repository, which it reports as its project
		session('native', '/work/vscode.worktrees/feature', '/work/vscode'),
		// Another window's agent host owns it: it reports only its worktree, also as its project
		session('external', '/work/vscode.worktrees/from-insiders', '/work/vscode.worktrees/from-insiders'),
		// A worktree elsewhere, which only git knows as a location of the window's folder
		session('elsewhere', '/tmp/checkouts/fix'),
		session('unrelated', '/work/other.worktrees/x', '/work/other'),
	];

	test('with worktree support, lists the sessions of the window\'s repository and its worktrees, also of another agent host, but not another repository\'s', async () => {
		const { list, shown, settle } = createList({ enabled: true, sessions, locations: ['/tmp/checkouts/fix'] });
		await settle();
		await list.refresh(CancellationToken.None);

		assert.deepStrictEqual(shown(), ['elsewhere', 'external', 'in-folder', 'native']);
	});

	test('without worktree support, lists only the sessions working in the window\'s folders, as before', async () => {
		const { shown, settle } = createList({ enabled: false, sessions, locations: ['/tmp/checkouts/fix'] });
		await settle();

		assert.deepStrictEqual(shown(), ['in-folder']);
	});

	test('a worktree that is no location of the window\'s folder any more drops its sessions, read once per change rather than per session or refresh', async () => {
		const { list, shown, settle, setLocations, calls } = createList({ enabled: true, sessions, locations: ['/tmp/checkouts/fix'] });
		await settle();
		const before = { shown: shown(), calls: calls() };
		// Refreshing again reads neither the host's list nor the locations again
		await list.refresh(CancellationToken.None);
		const afterRefresh = calls();
		setLocations([]);
		await settle();

		assert.deepStrictEqual({ before, afterRefresh, after: shown() }, {
			before: { shown: ['elsewhere', 'external', 'in-folder', 'native'], calls: { listed: 1, locationReads: 1 } },
			afterRefresh: { listed: 1, locationReads: 1 },
			after: ['external', 'in-folder', 'native'],
		});
	});
});
