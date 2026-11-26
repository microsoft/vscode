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
import { ISession, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { Menus } from '../../browser/menus.js';
import { registerSessionsListActions } from '../../browser/views/sessionsListActions.js';
import { ISessionSection, SessionSectionHasLocalFolderContext, SessionSectionTypeContext } from '../../browser/views/sessionsListCommon.js';
import { getSessionSectionLocalFolder } from '../../browser/views/sessionsListHelpers.js';
import { OPEN_SESSION_SECTION_FOLDER_IN_NEW_WINDOW_COMMAND_ID } from '../../common/sessionCommands.js';
import { buildTestSession } from '../common/testSessionBuilder.js';

suite('Sessions list actions', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createSession(id: string, root: URI, workingDirectory: URI = root): ISession {
		const workspace: ISessionWorkspace = {
			uri: root, label: id, icon: undefined!, requiresWorkspaceTrust: false, isVirtualWorkspace: false,
			folders: [{ root, workingDirectory, name: id, description: undefined, gitRepository: undefined }],
		};
		return { ...buildTestSession({ id, title: id }).session, workspace: constObservable(workspace) };
	}

	test('opens the one local root folder of a folder section in a new editor window, in a window that lists all sessions', async () => {
		const registrations = new DisposableStore();
		try {
			registrations.add(registerSessionsListActions());
			const commandId = OPEN_SESSION_SECTION_FOLDER_IN_NEW_WINDOW_COMMAND_ID;
			const when = MenuRegistry.getMenuItems(Menus.SessionSectionContext).filter(isIMenuItem).find(item => item.command.id === commandId)?.when;
			const context: Record<string, unknown> = { [ChatContextKeys.enabled.key]: true, [WorkbenchScopeContext.key]: 'all', [SessionSectionHasLocalFolderContext.key]: true };
			const shown = (type: string, overrides: Record<string, unknown> = {}) => !!when?.evaluate({ getValue: <T>(key: string) => ({ ...context, [SessionSectionTypeContext.key]: type, ...overrides })[key] as T });

			const opened: { folder: string; forceNewWindow: boolean | undefined }[] = [];
			const instantiationService = store.add(new TestInstantiationService());
			instantiationService.stub(IHostService, upcastPartial<IHostService>({
				openWindow: async (toOpen?: unknown, options?: IOpenWindowOptions) => {
					for (const window of toOpen as IWindowOpenable[]) {
						opened.push({ folder: (window as IFolderToOpen).folderUri.path, forceNewWindow: options?.forceNewWindow });
					}
				},
			}));
			const repo = URI.file('/work/repo');
			const otherRepo = URI.file('/work/other');
			const worktree = createSession('w1', repo, URI.file('/work/repo.worktrees/feature'));
			const otherWorktree = createSession('w2', repo, URI.file('/work/repo.worktrees/fix'));
			const remote = createSession('remote', URI.from({ scheme: 'vscode-agent-host', path: '/work/repo' }));
			const section = (...sessions: ISession[]) => upcastPartial<ISessionSection>({ id: 'workspace:repo', label: 'repo', sessions });
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
				noLocalFolder: shown('workspace', { [SessionSectionHasLocalFolderContext.key]: false }),
				folders: {
					oneFolder: getSessionSectionLocalFolder(section(createSession('a', repo)))?.path,
					worktree: getSessionSectionLocalFolder(section(worktree))?.path,
					worktreesOfOneRepo: getSessionSectionLocalFolder(section(createSession('a', repo), worktree, otherWorktree))?.path,
					differentRoots: getSessionSectionLocalFolder(section(createSession('a', repo), createSession('c', otherRepo))),
					remote: getSessionSectionLocalFolder(section(remote)),
				},
				opened,
			}, {
				shown: { workspace: true, repository: true, environment: false, archived: false, quickchats: false, automations: false, canvases: false, external: false },
				customGroup: false,
				workspaceScope: false,
				aiDisabled: false,
				noLocalFolder: false,
				folders: { oneFolder: '/work/repo', worktree: '/work/repo', worktreesOfOneRepo: '/work/repo', differentRoots: undefined, remote: undefined },
				// Only the sections whose sessions belong to one local root, which opens even for sessions in its worktrees
				opened: [{ folder: '/work/repo', forceNewWindow: true }, { folder: '/work/repo', forceNewWindow: true }],
			});
		} finally {
			registrations.dispose();
		}
	});
});
