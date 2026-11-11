/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { EditorInput } from '../../../../../common/editor/editorInput.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ISession, ISessionWorkspace } from '../../../../../services/sessions/common/session.js';
import { getAgentsChatPartComposerTarget, IAgentsChatPartOpenOptions, IAgentsChatPartService } from '../../../browser/agentsView/agentsChatPart.js';
import { registerAgentsViewNewSessionActions } from '../../../browser/agentsView/agentsChatPartActions.js';
import { Menus } from '../../../browser/menus.js';
import { INewSessionTarget } from '../../../browser/parts/chatView.js';
import { ISessionSection, SessionItemContextMenuId, SessionSectionToolbarMenuId } from '../../../browser/views/sessionsList.js';
import { buildTestSession } from '../../common/testSessionBuilder.js';

suite('Agents chat part actions', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	/** A session working in `workingDirectory`, such as a worktree of the repository `root`. */
	function createSession(id: string, root: string, workingDirectory: string, createdAt: number): ISession {
		const workspace: ISessionWorkspace = {
			uri: URI.file(root), label: id, icon: undefined!, requiresWorkspaceTrust: false, isVirtualWorkspace: false,
			folders: [{ root: URI.file(root), workingDirectory: URI.file(workingDirectory), name: id, description: undefined, gitRepository: undefined }],
		};
		return { ...buildTestSession({ id, title: id }).session, providerId: 'local-agent-host', sessionType: 'copilotcli', createdAt: new Date(createdAt), workspace: constObservable(workspace) };
	}

	function run(commandId: string, arg: unknown) {
		const opened: { readonly target: INewSessionTarget | undefined; readonly newComposer: boolean | undefined }[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IAgentsChatPartService, upcastPartial<IAgentsChatPartService>({
			openComposer: async (target: INewSessionTarget | undefined, options?: IAgentsChatPartOpenOptions) => { opened.push({ target, newComposer: options?.newComposer }); },
		}));
		return instantiationService.invokeFunction(async accessor => {
			await CommandsRegistry.getCommand(commandId)!.handler(accessor, arg);
			return opened.map(({ target, newComposer }) => ({ folder: target?.folderUri?.path, providerId: target?.providerId, sessionTypeId: target?.sessionTypeId, newComposer }));
		});
	}

	const menuWhen = (menu: Parameters<typeof MenuRegistry.getMenuItems>[0], commandId: string) => MenuRegistry.getMenuItems(menu).filter(isIMenuItem).find(item => item.command.id === commandId)?.when?.serialize();

	test('starts a new session in the worktree of a Worktree section, as its latest session, but not in its Other section; and in the folder of a session', async () => {
		store.add(registerAgentsViewNewSessionActions());
		const older = createSession('older', '/work/repo', '/work/repo.worktrees/feature', 1);
		const latest = { ...createSession('latest', '/work/repo', '/work/repo.worktrees/feature', 2), sessionType: 'claude' };
		const section = (id: string) => upcastPartial<ISessionSection>({ id, label: id, sessions: [older, latest] });

		assert.deepStrictEqual({
			worktree: await run('workbench.action.agentsView.newSessionInWorktree', section(`worktree:${URI.file('/work/repo.worktrees/feature').toString()}`)),
			other: await run('workbench.action.agentsView.newSessionInWorktree', section('worktree:other')),
			sameFolder: await run('workbench.action.agentsView.newSessionInSameFolder', older),
			menus: {
				sectionToolbar: menuWhen(SessionSectionToolbarMenuId, 'workbench.action.agentsView.newSessionInWorktree'),
				sectionContext: menuWhen(Menus.SessionSectionContext, 'workbench.action.agentsView.newSessionInWorktree'),
				session: menuWhen(SessionItemContextMenuId, 'workbench.action.agentsView.newSessionInSameFolder'),
			},
		}, {
			worktree: [{ folder: '/work/repo.worktrees/feature', providerId: 'local-agent-host', sessionTypeId: 'claude', newComposer: true }],
			other: [],
			sameFolder: [{ folder: '/work/repo.worktrees/feature', providerId: 'local-agent-host', sessionTypeId: 'copilotcli', newComposer: true }],
			menus: {
				sectionToolbar: 'chatIsEnabled && sessionSection.type == \'worktree\'',
				sectionContext: 'chatIsEnabled && sessionSection.type == \'worktree\'',
				session: 'chatIsEnabled && !sessionItem.isMultiSelection',
			},
		});
	});

	test('a new session of the chat part aims at the window\'s folder of the active editor, else at its first', () => {
		const folders = [URI.file('/work/vscode'), URI.file('/work/tools')].map(uri => upcastPartial<IWorkspaceFolder>({ uri }));
		const workspaceContextService = upcastPartial<IWorkspaceContextService>({
			getWorkspace: () => upcastPartial<IWorkspace>({ folders }),
			getWorkspaceFolder: (resource: URI) => folders.find(folder => resource.path.startsWith(`${folder.uri.path}/`)) ?? null,
		});
		const target = (activeResource: URI | undefined) => getAgentsChatPartComposerTarget(workspaceContextService, upcastPartial<IEditorService>({
			activeEditor: activeResource && upcastPartial<EditorInput>({ resource: activeResource }),
		}))?.folderUri?.path;

		assert.deepStrictEqual({
			inSecond: target(URI.file('/work/tools/package.json')),
			outside: target(URI.file('/elsewhere/file.ts')),
			none: target(undefined),
		}, { inSecond: '/work/tools', outside: '/work/vscode', none: '/work/vscode' });
	});
});
