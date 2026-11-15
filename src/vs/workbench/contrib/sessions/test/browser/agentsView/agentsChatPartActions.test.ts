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
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { SESSIONS_CHAT_TABS_SETTING } from '../../../common/sessionConfig.js';
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
import { AGENTS_CHAT_PART_CLOSE_ALL_CHATS_COMMAND_ID, AGENTS_CHAT_PART_CLOSE_CHAT_COMMAND_ID, AgentsChatPartChatTabsMenu, AgentsChatPartVisibleContext, registerAgentsChatPartActions, registerAgentsViewNewSessionActions } from '../../../browser/agentsView/agentsChatPartActions.js';
import { InAgentsChatPartContext } from '../../../browser/agentsView/agentsChatPartContext.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Menus } from '../../../browser/menus.js';
import { SessionIsCreatedContext, SessionSupportsRenameContext } from '../../../common/contextkeys.js';
import { INewSessionTarget } from '../../../browser/parts/chatView.js';
import { ISessionSection, SessionItemContextMenuId, SessionSectionToolbarMenuId } from '../../../browser/views/sessionsList.js';
import { buildTestSession } from '../../common/testSessionBuilder.js';
import { ChatViewId } from '../../../../chat/browser/chat.js';
import { ChatContextKeys } from '../../../../chat/common/actions/chatContextKeys.js';

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

	test('the header of a chat in the chat part offers how it shows its chats, Multiple or Single, only with AI features enabled', async () => {
		store.add(registerAgentsChatPartActions());
		const submenuWhen = MenuRegistry.getMenuItems(Menus.SessionBarToolbar).find(item => !isIMenuItem(item) && item.submenu === AgentsChatPartChatTabsMenu)?.when?.serialize();

		assert.deepStrictEqual({
			submenuWhen,
			choices: MenuRegistry.getMenuItems(AgentsChatPartChatTabsMenu).filter(isIMenuItem).map(item => [item.command.id, item.command.precondition?.serialize()]),
		}, {
			submenuWhen: 'chatIsEnabled && inAgentsChatPart',
			choices: [['workbench.action.agentsView.showMultipleChatTabs', 'chatIsEnabled'], ['workbench.action.agentsView.showSingleChat', 'chatIsEnabled']],
		});
	});

	test('choosing Multiple or Single in the chat part sets sessions.showChatTabs', async () => {
		store.add(registerAgentsChatPartActions());
		const updates: [string, unknown][] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, upcastPartial<IConfigurationService>({
			updateValue: async (key: string, value: unknown) => { updates.push([key, value]); },
		}));
		const choose = async (id: string) => {
			await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(id)!.handler(accessor));
			return updates[updates.length - 1];
		};

		assert.deepStrictEqual(
			[await choose('workbench.action.agentsView.showMultipleChatTabs'), await choose('workbench.action.agentsView.showSingleChat')],
			[[SESSIONS_CHAT_TABS_SETTING, 'multiple'], [SESSIONS_CHAT_TABS_SETTING, 'single']]);
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

	test('New Session shows in the header of the sessions list, but not in the Chat view\'s, whose title has New Chat already', () => {
		store.add(registerAgentsChatPartActions());
		const when = MenuRegistry.getMenuItems(Menus.SidebarSessionsHeader).filter(isIMenuItem).find(item => item.command.id === 'workbench.action.agentsView.newSession')?.when;
		const shows = (view: string) => !!when?.evaluate({ getValue: <T>(key: string) => (key === 'view' ? view : key === ChatContextKeys.enabled.key ? true : undefined) as T });

		assert.deepStrictEqual({ agentsView: shows('workbench.view.agents.sessions'), chatView: shows(ChatViewId) }, { agentsView: true, chatView: false });
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

	test('the More Actions of a header of the chat part start with Close, which closes that chat only, then Close All, which closes all its chats, while it shows them as tabs; then Rename... and View Mode, as the Agents window\'s; none show in the Agents window', async () => {
		const before = new Set(MenuRegistry.getMenuItems(Menus.SessionBarToolbar));
		store.add(registerAgentsChatPartActions());
		const session = buildTestSession({ id: 's', title: 's', chats: [{ id: 'peer', title: 'Peer' }] });
		const closed: string[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IAgentsChatPartService, upcastPartial<IAgentsChatPartService>({
			closeChat: async (resource: URI) => { closed.push(resource.toString()); },
			closeAllChats: async () => { closed.push('all'); },
		}));
		const main = session.mainChat.chat.resource;
		const peer = session.chats.get('peer')!.chat;
		const run = (id: string, ...args: unknown[]) => instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(id)!.handler(accessor, ...args));
		await run(AGENTS_CHAT_PART_CLOSE_CHAT_COMMAND_ID, session.session, undefined);
		await run(AGENTS_CHAT_PART_CLOSE_CHAT_COMMAND_ID, session.session, peer);
		await run(AGENTS_CHAT_PART_CLOSE_ALL_CHATS_COMMAND_ID, session.session, undefined);
		// Its commands, and the View Mode submenu: other features add submenus of their own, such as how the chat part shows its chats
		const added = MenuRegistry.getMenuItems(Menus.SessionBarToolbar).filter(item => !before.has(item) && (isIMenuItem(item) || item.submenu === MenuId.ChatViewMode));
		const keys: Record<string, unknown> = { [ChatContextKeys.enabled.key]: true, [SessionIsCreatedContext.key]: true, [SessionSupportsRenameContext.key]: true, [AgentsChatPartVisibleContext.key]: true };
		// As sessions.showChatTabs says: its chats as tabs ('multiple'), or one at a time ('single')
		const shown = (inChatPart: boolean, chatTabs = 'multiple') => added
			.filter(item => item.when?.evaluate({ getValue: <T>(key: string) => (key === InAgentsChatPartContext.key ? inChatPart : key === 'config.sessions.showChatTabs' ? chatTabs : keys[key]) as T }) ?? true)
			.map(item => isIMenuItem(item) ? `${item.group} ${item.order} ${typeof item.command.title === 'string' ? item.command.title : item.command.title.value}` : `${item.group} ${item.order} ${item.submenu.id}`);
		const keybinding = KeybindingsRegistry.getDefaultKeybindings().find(item => item.command === AGENTS_CHAT_PART_CLOSE_CHAT_COMMAND_ID);

		assert.deepStrictEqual({ closed, chatPart: shown(true), single: shown(true, 'single'), agentsWindow: shown(false), keybindingWhen: keybinding?.when?.serialize() }, {
			closed: [main.toString(), peer.resource.toString(), 'all'],
			chatPart: [
				'secondary/0_pane 10 Close',
				'secondary/0_pane 20 Close All',
				'secondary/4_manage 5 Rename...',
				`secondary/4_manage 10 ${MenuId.ChatViewMode.id}`,
			],
			single: [
				'secondary/0_pane 10 Close',
				'secondary/4_manage 5 Rename...',
				`secondary/4_manage 10 ${MenuId.ChatViewMode.id}`,
			],
			agentsWindow: [],
			keybindingWhen: ContextKeyExpr.and(ChatContextKeys.enabled, InAgentsChatPartContext)?.serialize(),
		});
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
