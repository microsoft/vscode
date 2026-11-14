/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { SESSIONS_LIST_MARK_READ_COMMAND_ID } from '../../../../../common/chatSessionCommands.js';
import { EditorInput } from '../../../../../common/editor/editorInput.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ISession, ISessionWorkspace } from '../../../../../services/sessions/common/session.js';
import { MarkAgentSessionReadAction, MarkAgentSessionUnreadAction } from '../../../../chat/browser/agentSessions/agentSessionsActions.js';
import { ISessionsManagementService } from '../../../common/sessionsManagement.js';
import { getEditorWindowComposerTarget } from '../../../browser/editorWindow/editorWindowSessionsPresenter.js';
import { IAgentsChatPartOpenOptions, IAgentsChatPartService } from '../../../browser/agentsView/agentsChatPart.js';
import { registerAgentsChatPartActions, registerAgentsViewNewSessionActions } from '../../../browser/agentsView/agentsChatPartActions.js';
import { KeybindingsRegistry } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
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
			return opened.map(({ target, newComposer }) => ({ folder: target?.folderUri?.path, providerId: target?.providerId, sessionTypeId: target?.sessionTypeId, noWorkspace: !!target && !target.folderUri, newComposer }));
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
			worktree: [{ folder: '/work/repo.worktrees/feature', providerId: 'local-agent-host', sessionTypeId: 'claude', noWorkspace: false, newComposer: true }],
			other: [],
			sameFolder: [{ folder: '/work/repo.worktrees/feature', providerId: 'local-agent-host', sessionTypeId: 'copilotcli', noWorkspace: false, newComposer: true }],
			menus: {
				sectionToolbar: 'chatIsEnabled && sessionSection.type == \'worktree\'',
				sectionContext: 'chatIsEnabled && sessionSection.type == \'worktree\'',
				session: 'chatIsEnabled',
			},
		});
	});

	test('a new quick chat opens a composer of its own without a workspace, from the Chats section and the Command Palette, without a keybinding', async () => {
		store.add(registerAgentsChatPartActions());
		const id = 'workbench.action.agentsView.newQuickChat';

		assert.deepStrictEqual({
			opened: await run(id, undefined),
			menus: {
				sectionToolbar: menuWhen(SessionSectionToolbarMenuId, id),
				sectionContext: menuWhen(Menus.SessionSectionContext, id),
				commandPalette: menuWhen(MenuId.CommandPalette, id),
			},
			keybindings: KeybindingsRegistry.getDefaultKeybindings().filter(keybinding => keybinding.command === id).length,
		}, {
			opened: [{ folder: undefined, providerId: undefined, sessionTypeId: undefined, noWorkspace: true, newComposer: true }],
			menus: {
				sectionToolbar: 'agentHostEnabled && chatIsEnabled && sessionSection.type == \'quickchats\'',
				sectionContext: 'agentHostEnabled && chatIsEnabled && sessionSection.type == \'quickchats\'',
				commandPalette: 'agentHostEnabled && chatIsEnabled',
			},
			keybindings: 0,
		});
	});

	test('the header of a chat in the chat part does not offer Show Chat Tabs, which governs only the peer chats of a session', async () => {
		store.add(registerAgentsChatPartActions());

		assert.deepStrictEqual(
			SessionHeaderMenus.flatMap(menu => MenuRegistry.getMenuItems(menu)).filter(item => !isIMenuItem(item) && item.submenu.id === 'AgentsChatPartChatTabs').length,
			0);
	});

	test('the context menu of a session offers its customizations, with AI features enabled, for a single session, which it names', async () => {
		store.add(registerAgentsViewNewSessionActions());
		const id = 'workbench.action.agentsView.openSessionCustomizations';
		const item = MenuRegistry.getMenuItems(SessionItemContextMenuId).filter(isIMenuItem).find(candidate => candidate.command.id === id);
		const calls: string[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ICommandService, upcastPartial<ICommandService>({ executeCommand: async (command: string, arg: { sessionResource: URI }) => { calls.push(`${command} ${arg.sessionResource.toString()}`); } }));
		const session = upcastPartial<ISession>({ resource: URI.parse('agent-host-copilot:/one') });
		const handler = CommandsRegistry.getCommand(id)!.handler;
		await instantiationService.invokeFunction(accessor => handler(accessor, session));
		const several = await instantiationService.invokeFunction(accessor => Promise.resolve(handler(accessor, [session, session])).then(() => 'opened', () => 'rejected'));

		assert.deepStrictEqual({
			when: item?.when?.serialize(),
			precondition: item?.command.precondition?.serialize(),
			agentsWindowAction: item?.command.id === 'sessionsViewPane.openCustomizations',
			calls,
			several,
		}, {
			when: 'chatIsEnabled',
			precondition: 'chatIsEnabled && !sessionItem.isMultiSelection',
			agentsWindowAction: false,
			calls: ['aiCustomization.openManagementEditor agent-host-copilot:/one'],
			several: 'rejected',
		});
	});

	test('a new session of the chat part aims at the window\'s folder of the active editor, else at its first', () => {
		const folders = [URI.file('/work/vscode'), URI.file('/work/tools')].map(uri => upcastPartial<IWorkspaceFolder>({ uri }));
		const workspaceContextService = upcastPartial<IWorkspaceContextService>({
			getWorkspace: () => upcastPartial<IWorkspace>({ folders }),
			getWorkspaceFolder: (resource: URI) => folders.find(folder => resource.path.startsWith(`${folder.uri.path}/`)) ?? null,
		});
		const target = (activeResource: URI | undefined) => getEditorWindowComposerTarget(workspaceContextService, upcastPartial<IEditorService>({
			activeEditor: activeResource && upcastPartial<EditorInput>({ resource: activeResource }),
		}))?.folderUri?.path;

		assert.deepStrictEqual({
			inSecond: target(URI.file('/work/tools/package.json')),
			outside: target(URI.file('/elsewhere/file.ts')),
			none: target(undefined),
		}, { inSecond: '/work/tools', outside: '/work/vscode', none: '/work/vscode' });
	});

	test('Mark as Read and Mark as Unread of a chat tab mark its chat through the sessions list\'s commands, while the chat part registers its actions', async () => {
		const built = buildTestSession({ id: 's1', title: 'Session' });
		const session = built.session;
		const main = built.mainChat.chat;
		const side = { ...main, resource: session.resource.with({ fragment: 'side' }) };
		const marked: string[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			markRead: async target => { marked.push(`read ${target.sessionId}`); },
			markUnread: async target => { marked.push(`unread ${target.sessionId}`); },
			markChatRead: async (_target, chat) => { marked.push(`read chat ${chat.resource.fragment}`); },
			markChatUnread: async (_target, chat) => { marked.push(`unread chat ${chat.resource.fragment}`); },
		}));
		instantiationService.stub(ICommandService, upcastPartial<ICommandService>({
			executeCommand: async <R>(id: string, ...args: unknown[]) => instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(id)!.handler(accessor, ...args)) as R,
		}));
		const read = new MarkAgentSessionReadAction();
		const unread = new MarkAgentSessionUnreadAction();

		const before = CommandsRegistry.getCommand(SESSIONS_LIST_MARK_READ_COMMAND_ID);
		const registration = registerAgentsChatPartActions();
		// A chat tab of a side chat and of a session's main chat run the agent sessions' commands
		for (const [action, context] of [[read, { session, chat: side }], [unread, { session, chat: main }], [unread, [{ session, chat: side }, { session, chat: main }]]] as const) {
			await instantiationService.invokeFunction(accessor => action.run(accessor, context as never));
		}
		registration.dispose();

		assert.deepStrictEqual({ marked, restoredAfterDispose: CommandsRegistry.getCommand(SESSIONS_LIST_MARK_READ_COMMAND_ID) === before }, {
			marked: ['read chat side', 'unread s1', 'unread chat side', 'unread s1'],
			restoredAfterDispose: true,
		});
	});
});
