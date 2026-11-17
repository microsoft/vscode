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
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { SESSIONS_LIST_MARK_READ_COMMAND_ID, SESSIONS_LIST_MARK_UNREAD_COMMAND_ID } from '../../../../../common/chatSessionCommands.js';
import { EditorInput } from '../../../../../common/editor/editorInput.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ISession, ISessionWorkspace } from '../../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../common/sessionsManagement.js';
import { EditorWindowSessionsPresenterService, getEditorWindowComposerTarget, IEditorWindowPresenterOpenOptions, IEditorWindowSessionsPresenter, IEditorWindowSessionsPresenterService } from '../../../browser/editorWindow/editorWindowSessionsPresenter.js';
import { IChatViewHostService, IChatViewHostNewChatOptions, IChatViewNewChatTarget } from '../../../../chat/browser/chatViewHost.js';
import { IAgentsViewProvidersService } from '../../../browser/agentsView/agentsViewProviders.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IAgentsChatPartService } from '../../../browser/agentsView/agentsChatPart.js';
import { AGENTS_CHAT_PART_CLOSE_ALL_CHATS_COMMAND_ID, AGENTS_CHAT_PART_CLOSE_CHAT_COMMAND_ID, AgentsChatPartVisibleContext, registerAgentsChatPartActions, registerAgentsViewNewSessionActions } from '../../../browser/agentsView/agentsChatPartActions.js';
import { InAgentsChatPartContext } from '../../../browser/agentsView/agentsChatPartContext.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Menus } from '../../../browser/menus.js';
import { SessionIsCreatedContext, SessionSupportsRenameContext } from '../../../common/contextkeys.js';
import { INewSessionTarget } from '../../../browser/parts/chatView.js';
import { ISessionSection, SessionItemContextMenuId, SessionSectionToolbarMenuId } from '../../../browser/views/sessionsList.js';
import { buildTestSession } from '../../common/testSessionBuilder.js';
import { Event } from '../../../../../../base/common/event.js';
import { isEqual, isEqualOrParent } from '../../../../../../base/common/resources.js';
import { EditorWindowComposerFoldersService, IEditorWindowComposerFolderOptions, IEditorWindowComposerFoldersService } from '../../../browser/editorWindow/editorWindowComposerFolders.js';
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

	/** Runs `commandId` while the chat part presents the window's sessions, else while the Chat view does. */
	function run(commandId: string, arg: unknown, folderOptions?: IEditorWindowComposerFolderOptions, chatPart = true) {
		const opened: { readonly target: INewSessionTarget | undefined; readonly newComposer: boolean | undefined }[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({ onDidChangeWorkspaceFolders: Event.None, getWorkspace: () => upcastPartial<IWorkspace>({ folders: [] }) }));
		const composerFolders = instantiationService.createInstance(EditorWindowComposerFoldersService);
		if (folderOptions) {
			store.add(composerFolders.setComposerFolderOptions(() => folderOptions));
		}
		instantiationService.stub(IEditorWindowComposerFoldersService, composerFolders);
		instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({
			newChat: async (target?: IChatViewNewChatTarget, options?: IChatViewHostNewChatOptions) => {
				opened.push({ target: target && { folderUri: target.folder, providerId: target.providerId, sessionTypeId: target.sessionType }, newComposer: options?.ownChat });
				return true;
			},
		}));
		instantiationService.stub(IAgentsViewProvidersService, upcastPartial<IAgentsViewProvidersService>({ registerReleaseParticipant: () => Disposable.None }));
		const presenterService = store.add(instantiationService.createInstance(EditorWindowSessionsPresenterService));
		if (chatPart) {
			store.add(presenterService.registerPresenter(upcastPartial<IEditorWindowSessionsPresenter>({
				openComposer: async (target: INewSessionTarget | undefined, options?: IEditorWindowPresenterOpenOptions) => { opened.push({ target, newComposer: options?.newComposer }); },
			})));
		}
		instantiationService.stub(IEditorWindowSessionsPresenterService, presenterService);
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

	test('starts a new session in the folder of a session or a Worktree section in the Chat view, while no chat part presents the window\'s sessions', async () => {
		store.add(registerAgentsViewNewSessionActions());
		const session = createSession('session', '/work/repo', '/work/repo.worktrees/feature', 1);
		const section = upcastPartial<ISessionSection>({ id: `worktree:${URI.file('/work/repo.worktrees/feature').toString()}`, label: 'feature', sessions: [session] });

		assert.deepStrictEqual({
			worktree: await run('workbench.action.agentsView.newSessionInWorktree', section, undefined, false),
			sameFolder: await run('workbench.action.agentsView.newSessionInSameFolder', session, undefined, false),
		}, {
			worktree: [{ folder: '/work/repo.worktrees/feature', providerId: 'local-agent-host', sessionTypeId: 'copilotcli', noWorkspace: false, newComposer: true }],
			sameFolder: [{ folder: '/work/repo.worktrees/feature', providerId: 'local-agent-host', sessionTypeId: 'copilotcli', noWorkspace: false, newComposer: true }],
		});
	});

	test('starts a new session in the allowed folder that the session\'s folder is, or that it is inside, also by another form of either, else in the window\'s folder', async () => {
		store.add(registerAgentsViewNewSessionActions());
		// The window offers a worktree by a link, whose real path its sessions report, and its repository's folder
		const link = URI.file('/links/feature');
		const worktree = URI.file('/work/repo.worktrees/feature');
		const folderOptions: IEditorWindowComposerFolderOptions = {
			allowedFolders: constObservable([link, URI.file('/work/repo')]),
			isSameFolder: (folder, uri) => isEqual(folder, uri) || (isEqual(folder, link) && isEqual(uri, worktree)),
			isInFolder: (folder, uri) => isEqualOrParent(uri, folder) || (isEqual(folder, link) && isEqualOrParent(uri, worktree)),
		};
		const aliased = createSession('aliased', '/work/repo', worktree.path, 1);
		const inside = createSession('inside', '/work/repo', '/work/repo/packages/a', 1);
		const insideAliased = createSession('insideAliased', '/work/repo', `${worktree.path}/packages/a`, 1);
		const outside = createSession('outside', '/elsewhere', '/elsewhere', 1);
		const folderOf = async (commandId: string, arg: unknown) => (await run(commandId, arg, folderOptions)).map(({ folder }) => folder ?? 'the window\'s');

		assert.deepStrictEqual({
			worktreeSection: await folderOf('workbench.action.agentsView.newSessionInWorktree', upcastPartial<ISessionSection>({ id: `worktree:${worktree.toString()}`, label: 'feature', sessions: [aliased] })),
			aliased: await folderOf('workbench.action.agentsView.newSessionInSameFolder', aliased),
			inside: await folderOf('workbench.action.agentsView.newSessionInSameFolder', inside),
			insideAliased: await folderOf('workbench.action.agentsView.newSessionInSameFolder', insideAliased),
			outside: await folderOf('workbench.action.agentsView.newSessionInSameFolder', outside),
		}, {
			worktreeSection: ['/links/feature'],
			aliased: ['/links/feature'],
			inside: ['/work/repo'],
			insideAliased: ['/links/feature'],
			outside: ['the window\'s'],
		});
	});

	test('an editor window offers no New Quick Chat: it has no chat without a workspace', () => {
		store.add(registerAgentsChatPartActions());

		assert.strictEqual(CommandsRegistry.getCommand('workbench.action.agentsView.newQuickChat'), undefined);
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

	test('the More Actions of a header of the chat part start with Close, which closes that chat only, while it shows its chats as tabs; showing one at a time, Close is the last of its toolbar instead, right before More Actions; then Rename... and View Mode, as the Agents window\'s, and last, in a group of its own, Close All, which closes all its chats, either way; none show in the Agents window', async () => {
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
				'secondary/9_close 0 Close All',
				'secondary/4_manage 5 Rename...',
				`secondary/4_manage 10 ${MenuId.ChatViewMode.id}`,
			],
			single: [
				'navigation 1000 Close',
				'secondary/9_close 0 Close All',
				'secondary/4_manage 5 Rename...',
				`secondary/4_manage 10 ${MenuId.ChatViewMode.id}`,
			],
			agentsWindow: [],
			keybindingWhen: ContextKeyExpr.and(ChatContextKeys.enabled, InAgentsChatPartContext)?.serialize(),
		});
	});

	test('the chat part registers the sessions list\'s Mark as Read and Mark as Unread that its chat tabs run, also while no sessions list shows, until its actions are disposed', async () => {
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
		const before = [SESSIONS_LIST_MARK_READ_COMMAND_ID, SESSIONS_LIST_MARK_UNREAD_COMMAND_ID].map(id => CommandsRegistry.getCommand(id));
		const registration = registerAgentsChatPartActions();
		// What a chat tab runs, of a side chat and of a session's main chat
		for (const [id, context] of [[SESSIONS_LIST_MARK_READ_COMMAND_ID, { session, chat: side }], [SESSIONS_LIST_MARK_UNREAD_COMMAND_ID, { session, chat: main }]] as const) {
			await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(id)!.handler(accessor, context));
		}
		registration.dispose();

		assert.deepStrictEqual({ marked, restoredAfterDispose: [SESSIONS_LIST_MARK_READ_COMMAND_ID, SESSIONS_LIST_MARK_UNREAD_COMMAND_ID].map((id, index) => CommandsRegistry.getCommand(id) === before[index]) }, {
			marked: ['read chat side', 'unread s1'],
			restoredAfterDispose: [true, true],
		});
	});
});
