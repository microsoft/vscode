/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { isIMenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IFolderToOpen, IOpenWindowOptions, IWindowOpenable } from '../../../../../platform/window/common/window.js';
import { WorkbenchScopeContext } from '../../../../common/contextkeys.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { GITHUB_REMOTE_FILE_SCHEME, ISession, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { Menus } from '../../browser/menus.js';
import { registerSessionsListActions } from '../../browser/views/sessionsListActions.js';
import { ISessionSection, SessionSectionHasRootFolderContext, SessionSectionTypeContext } from '../../browser/views/sessionsListCommon.js';
import { groupByRepository, groupByWorkspace } from '../../browser/views/sessionsListHelpers.js';
import { OPEN_SESSION_SECTION_FOLDER_IN_NEW_WINDOW_COMMAND_ID } from '../../common/sessionCommands.js';
import { buildTestSession } from '../common/testSessionBuilder.js';

suite('Sessions list actions', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createSession(id: string, root: URI, workingDirectory: URI = root, gitHubRepository?: string): ISession {
		const [owner, repo] = gitHubRepository?.split('/') ?? [];
		const gitRepository = gitHubRepository ? upcastPartial<NonNullable<ISessionWorkspace['folders'][number]['gitRepository']>>({ uri: root, gitHubInfo: constObservable({ owner, repo }) }) : undefined;
		const workspace: ISessionWorkspace = {
			uri: root, label: 'repo', icon: undefined!, requiresWorkspaceTrust: false, isVirtualWorkspace: false,
			folders: [{ root, workingDirectory, name: id, description: undefined, gitRepository }],
		};
		return { ...buildTestSession({ id, title: id }).session, workspace: constObservable(workspace) };
	}

	test('opens the root folder of a folder section in a new editor window, in a window that lists all sessions', async () => {
		const registrations = new DisposableStore();
		try {
			registrations.add(registerSessionsListActions());
			const commandId = OPEN_SESSION_SECTION_FOLDER_IN_NEW_WINDOW_COMMAND_ID;
			const when = MenuRegistry.getMenuItems(Menus.SessionSectionContext).filter(isIMenuItem).find(item => item.command.id === commandId)?.when;
			const context: Record<string, unknown> = { [ChatContextKeys.enabled.key]: true, [WorkbenchScopeContext.key]: 'all', [SessionSectionHasRootFolderContext.key]: true };
			const shown = (type: string, overrides: Record<string, unknown> = {}) => !!when?.evaluate({ getValue: <T>(key: string) => ({ ...context, [SessionSectionTypeContext.key]: type, ...overrides })[key] as T });

			const opened: { folder: string; forceNewWindow: boolean | undefined }[] = [];
			const instantiationService = store.add(new TestInstantiationService());
			instantiationService.stub(IHostService, upcastPartial<IHostService>({
				openWindow: async (toOpen?: unknown, options?: IOpenWindowOptions) => {
					for (const window of toOpen as IWindowOpenable[]) {
						opened.push({ folder: (window as IFolderToOpen).folderUri.toString(), forceNewWindow: options?.forceNewWindow });
					}
				},
			}));
			const repo = URI.file('/work/repo');
			const otherRepo = URI.file('/work/other');
			const worktree = createSession('w1', repo, URI.file('/work/repo.worktrees/feature'));
			const otherWorktree = createSession('w2', repo, URI.file('/work/repo.worktrees/fix'));
			const remote = createSession('remote', URI.from({ scheme: 'vscode-agent-host', path: '/work/repo' }));
			const cloud = createSession('cloud', URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: '/microsoft/vscode/main' }));
			const section = (...sessions: ISession[]) => groupByWorkspace(sessions)[0];
			const repositorySection = (...sessions: ISession[]) => groupByRepository(sessions)[0];
			const clone = createSession('clone', repo, repo, 'microsoft/vscode');
			const otherClone = createSession('otherClone', otherRepo, otherRepo, 'microsoft/vscode');
			const runOn = (arg: ISessionSection) => instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(commandId)!.handler(accessor, arg));
			await runOn(section(createSession('a', repo), createSession('b', repo)));
			await runOn(section(worktree, otherWorktree));
			await runOn(section(createSession('a', repo), createSession('c', otherRepo)));
			await runOn(section(remote));

			assert.deepStrictEqual({
				shown: Object.fromEntries(['workspace', 'repository', 'environment', 'archived', 'quickchats', 'automations', 'canvases', 'external'].map(type => [type, shown(type)])),
				customGroup: MenuRegistry.getMenuItems(Menus.SessionGroupContext).filter(isIMenuItem).some(item => item.command.id === commandId),
				workspaceScope: shown('workspace', { [WorkbenchScopeContext.key]: 'workspace' }),
				aiDisabled: shown('workspace', { [ChatContextKeys.enabled.key]: false }),
				noRootFolder: shown('workspace', { [SessionSectionHasRootFolderContext.key]: false }),
				folders: {
					oneFolder: section(createSession('a', repo)).rootFolder?.path,
					worktree: section(worktree).rootFolder?.path,
					worktreesOfOneRepo: section(createSession('a', repo), worktree, otherWorktree).rootFolder?.path,
					differentRoots: section(createSession('a', repo), createSession('c', otherRepo)).rootFolder?.path,
					remote: section(remote).rootFolder?.path,
					cloud: section(cloud).rootFolder,
					cloudFirst: section(cloud, createSession('a', repo)).rootFolder,
					repository: [repositorySection(clone).id, repositorySection(clone).rootFolder?.path],
					repositoryClones: [repositorySection(clone, otherClone).id, repositorySection(clone, otherClone).rootFolder?.path],
				},
				opened,
			}, {
				shown: { workspace: true, repository: true, environment: false, archived: false, quickchats: false, automations: false, canvases: false, external: false },
				customGroup: false,
				workspaceScope: false,
				aiDisabled: false,
				noRootFolder: false,
				folders: {
					oneFolder: '/work/repo', worktree: '/work/repo', worktreesOfOneRepo: '/work/repo', differentRoots: '/work/repo', remote: '/work/repo', cloud: undefined, cloudFirst: undefined,
					repository: ['repository:microsoft/vscode', '/work/repo'], repositoryClones: ['repository:microsoft/vscode', '/work/repo'],
				},
				// The root of the section's first session, never a worktree
				opened: [
					{ folder: 'file:///work/repo', forceNewWindow: true },
					{ folder: 'file:///work/repo', forceNewWindow: true },
					{ folder: 'file:///work/repo', forceNewWindow: true },
					{ folder: 'vscode-agent-host:/work/repo', forceNewWindow: true },
				],
			});
		} finally {
			registrations.dispose();
		}
	});
});
