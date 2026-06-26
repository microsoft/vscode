/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { fromNow } from '../../../../base/common/date.js';
import { hash } from '../../../../base/common/hash.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IReader } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuRegistry, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { EditorAreaFocusContext, IsAuxiliaryWindowContext, IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { Menus } from '../../../browser/menus.js';
import { SessionsCategories } from '../../../common/categories.js';
import { CanGoBackContext, CanGoForwardContext, SessionProviderIdContext, MultipleSessionsVisibleContext, SessionIsArchivedContext, SessionIsCreatedContext, SessionIsMaximizedContext, SessionIsStickyContext, SessionsFocusContext, SessionSupportsMultipleChatsContext, SessionsWelcomeVisibleContext, SessionIdContext, SessionHasMultipleCommittedChatsContext } from '../../../common/contextkeys.js';
import { ANY_AGENT_HOST_PROVIDER_RE } from '../../../common/agentHostSessionsProvider.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsPartService } from '../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsListModelService } from '../../../services/sessions/browser/sessionsListModelService.js';

// -- Show Sessions Picker --

export const SHOW_SESSIONS_PICKER_COMMAND_ID = 'sessions.showSessionsPicker';

registerAction2(class ShowSessionsPickerAction extends Action2 {
	constructor() {
		super({
			id: SHOW_SESSIONS_PICKER_COMMAND_ID,
			title: localize2('showSessionsPicker', "Show Sessions Picker"),
			f1: true,
			category: SessionsCategories.Sessions,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.KeyR,
				mac: { primary: KeyMod.WinCtrl | KeyCode.KeyR },
				weight: KeybindingWeight.SessionsContrib,
				when: IsSessionsWindowContext,
			},
		});
	}

	override async run(accessor: ServicesAccessor) {
		const sessionsService = accessor.get(ISessionsService);
		const quickInputService = accessor.get(IQuickInputService);
		const sessionsPartService = accessor.get(ISessionsPartService);
		const sessionsListModelService = accessor.get(ISessionsListModelService);

		const { recent, other } = sessionsService.getRecentlyOpenedSessions();
		const recentSessions = recent.filter(s => !s.isArchived.get());
		const otherSessions = other.filter(s => !s.isArchived.get());

		const activeSessionId = sessionsService.activeSession.get()?.sessionId;

		interface ISessionPickItem extends IQuickPickItem {
			session?: ISession;
		}

		const items: (ISessionPickItem | IQuickPickSeparator)[] = [];

		// New session item
		items.push({
			label: `$(add) ${localize('newSession', "New Session")}`,
			session: undefined,
		});

		let activeItem: ISessionPickItem | undefined;

		const toPickItem = (session: ISession): ISessionPickItem => {
			const title = session.title.get() || localize('untitledSession', "New Session");

			// Status icon, mirroring the sessions list and session header. Use the
			// list model service's read state (not session.isRead) so the icon
			// matches what the sessions list shows.
			const status = session.status.get();
			const isRead = sessionsListModelService.isSessionRead(session);
			const isArchived = session.isArchived.get();
			const workspace = session.workspace.get();
			const pullRequestIcon = workspace?.folders[0]?.gitRepository?.gitHubInfo.get()?.pullRequest?.icon;
			const icon = sessionsListModelService.getStatusIcon(status, isRead, isArchived, pullRequestIcon);

			// Second row: workspace (with its icon, like the session header /
			// list) and the relative time. A leading blank icon aligns the
			// workspace icon under the title text (the status icon sits in the
			// left gutter).
			const detailParts: string[] = [];
			if (workspace?.label) {
				const isWorkspaceFolder = workspace.folders.length > 0 && workspace.folders[0]?.gitRepository?.workTreeUri === undefined;
				const workspaceIcon = workspace.isVirtualWorkspace ? Codicon.cloud : isWorkspaceFolder ? Codicon.folder : Codicon.worktree;
				detailParts.push(`$(${Codicon.blank.id}) $(${workspaceIcon.id}) ${workspace.label}`);
			} else {
				detailParts.push(`$(${Codicon.blank.id})`);
			}
			detailParts.push(fromNow(session.updatedAt.get(), true, true));

			const isActive = activeSessionId !== undefined && session.sessionId === activeSessionId;
			const item: ISessionPickItem = {
				label: title,
				detail: detailParts.join(' \u00B7 '),
				iconClass: ThemeIcon.asClassName(icon),
				session,
				picked: isActive,
			};
			if (isActive) {
				activeItem = item;
			}
			return item;
		};

		if (recentSessions.length > 0) {
			items.push({ type: 'separator', label: localize('recentlyOpened', "recently opened") });
			for (const session of recentSessions) {
				items.push(toPickItem(session));
			}
		}

		if (otherSessions.length > 0) {
			items.push({ type: 'separator', label: localize('otherSessions', "other sessions") });
			for (const session of otherSessions) {
				items.push(toPickItem(session));
			}
		}

		const picker = quickInputService.createQuickPick<ISessionPickItem>({ useSeparators: true });
		picker.items = items;
		picker.placeholder = localize('searchSessions', "Search sessions by name or folder");
		picker.canAcceptInBackground = true;
		// Match on the detail row too so sessions can be found by their folder.
		picker.matchOnDetail = true;

		// Default to the currently active session so it is selected on open.
		if (activeItem) {
			picker.activeItems = [activeItem];
		}

		const disposables = new DisposableStore();
		disposables.add(picker);

		const openSelected = (selected: ISessionPickItem, inBackground: boolean, toSide: boolean): void => {
			if (!selected.session) {
				sessionsService.openNewSession();
				sessionsPartService.focusSession(sessionsService.activeSession.get());
				return;
			}

			// Open to the side: place the session in a new grid slot next to the
			// currently active session instead of replacing it. Falls back to a
			// normal open when there is no active session to anchor against or the
			// session is already the active one.
			if (toSide && activeSessionId !== undefined && selected.session.sessionId !== activeSessionId) {
				sessionsService.insertAt(selected.session, activeSessionId, 'right', !inBackground);
			} else {
				sessionsService.openSession(selected.session.resource, { preserveFocus: inBackground });
			}
		};

		disposables.add(picker.onDidAccept(e => {
			const [selected] = picker.selectedItems;
			if (selected) {
				const toSide = picker.keyMods.ctrlCmd || picker.keyMods.alt;
				openSelected(selected, e.inBackground, toSide);
			}
			// Background accept (e.g. Right Arrow) keeps the picker open so the
			// user can continue navigating, mirroring editor quick open.
			if (!e.inBackground) {
				picker.hide();
			}
		}));
		disposables.add(picker.onDidHide(() => disposables.dispose()));

		picker.show();
	}
});

// -- Go Back --

registerAction2(class GoBackAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.goBack',
			title: {
				...localize2('sessionsGoBack', "Go Back"),
				mnemonicTitle: localize({ key: 'miSessionsBack', comment: ['&& denotes a mnemonic'] }, "&&Back")
			},
			f1: true,
			icon: Codicon.arrowLeft,
			tooltip: localize('sessionsGoBackTooltip', "Go Back One Session"),
			category: SessionsCategories.Sessions,
			precondition: CanGoBackContext,
			keybinding: {
				// Higher than `WorkbenchContrib` so the `Ctrl+Shift+Tab` secondary wins over the
				// editor quick-open actions (which bind the same chord at `WorkbenchContrib`).
				weight: KeybindingWeight.SessionsContrib,
				win: { primary: KeyMod.Alt | KeyCode.LeftArrow, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Tab] },
				mac: { primary: KeyMod.WinCtrl | KeyCode.Minus, secondary: [KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Tab] },
				linux: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Minus, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Tab] },
				when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated()),
			},
			menu: [{
				id: Menus.TitleBarCenterLeft,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated()),
			}, {
				id: Menus.GoMenu,
				group: '1_history_nav',
				order: 1,
			}]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(ISessionsService).openPreviousSession();
	}
});

// -- Go Forward --

registerAction2(class GoForwardAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.goForward',
			title: {
				...localize2('sessionsGoForward', "Go Forward"),
				mnemonicTitle: localize({ key: 'miSessionsForward', comment: ['&& denotes a mnemonic'] }, "&&Forward")
			},
			f1: true,
			icon: Codicon.arrowRight,
			tooltip: localize('sessionsGoForwardTooltip', "Go Forward One Session"),
			category: SessionsCategories.Sessions,
			precondition: CanGoForwardContext,
			keybinding: {
				// Higher than `WorkbenchContrib` so the `Ctrl+Tab` secondary wins over the
				// editor quick-open actions (which bind the same chord at `WorkbenchContrib`).
				weight: KeybindingWeight.SessionsContrib,
				win: { primary: KeyMod.Alt | KeyCode.RightArrow, secondary: [KeyMod.CtrlCmd | KeyCode.Tab] },
				mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Minus, secondary: [KeyMod.WinCtrl | KeyCode.Tab] },
				linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Minus, secondary: [KeyMod.CtrlCmd | KeyCode.Tab] },
				when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated()),
			},
			menu: [{
				id: Menus.TitleBarCenterLeft,
				group: 'navigation',
				order: 2,
				when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated()),
			}, {
				id: Menus.GoMenu,
				group: '1_history_nav',
				order: 2,
			}]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(ISessionsService).openNextSession();
	}
});

// -- Focus Active Session --

registerAction2(class FocusActiveSessionAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.focusActiveSession',
			title: localize2('focusActiveSession', "Focus Active Session"),
			f1: true,
			category: SessionsCategories.Sessions,
			keybinding: {
				// Must outrank the workbench `workbench.action.chat.open` binding
				// (WorkbenchContrib) so that in the sessions window the chord
				// focuses the active session. Using the normal open chat action will not work for new session views.
				weight: KeybindingWeight.SessionsContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyI,
				mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KeyI },
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const sessionsPartService = accessor.get(ISessionsPartService);
		const sessionsService = accessor.get(ISessionsService);
		sessionsPartService.focusSession(sessionsService.activeSession.get());
	}
});

// -- Focus Nth Session in the Grid (Cmd/Ctrl+1..9) --
// Mirrors VS Code's "Focus Editor Group N": Ctrl/Cmd+1..8 focus that grid slot
// and Ctrl/Cmd+9 focuses the LAST slot. Does nothing when the slot doesn't exist.

for (let index = 0; index < 9; index++) {
	const position = index + 1;
	const isLast = position === 9;
	registerAction2(class FocusSessionByPositionAction extends Action2 {
		constructor() {
			super({
				id: `sessions.focusSessionInGrid${position}`,
				title: isLast
					? localize2('focusLastSessionInGrid', "Focus Last Session in Grid")
					: localize2('focusSessionInGrid', "Focus Session {0} in Grid", position),
				f1: true,
				category: SessionsCategories.Sessions,
				keybinding: {
					weight: KeybindingWeight.SessionsContrib,
					primary: KeyMod.CtrlCmd | (KeyCode.Digit1 + index),
					when: IsSessionsWindowContext,
				},
			});
		}

		override async run(accessor: ServicesAccessor): Promise<void> {
			const sessionsService = accessor.get(ISessionsService);
			const sessionsPartService = accessor.get(ISessionsPartService);

			const visible = sessionsService.visibleSessions.get();
			const targetIndex = isLast ? visible.length - 1 : index;
			if (targetIndex < 0 || targetIndex >= visible.length) {
				return;
			}

			const session = visible[targetIndex];
			sessionsService.setActive(session);
			sessionsPartService.focusSession(session);
		}
	});
}

// -- Close All Sessions --

registerAction2(class CloseAllSessionsAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.closeAllSessions',
			title: localize2('closeAllSessions', "Close All Sessions"),
			f1: true,
			category: SessionsCategories.Sessions,
			precondition: IsSessionsWindowContext,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyW),
				// Only fire from the keyboard while a session (its chat view) has focus.
				when: ContextKeyExpr.and(IsSessionsWindowContext, SessionsFocusContext),
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		accessor.get(ISessionsService).closeAllSessions();
	}
});

// The "New Chat" toolbar entry starts a new chat in the session. It is shown in
// the session header while the session has at most one committed chat (so it
// stays available even when an in-composer draft has surfaced the tab strip).
// Once the session has more than one committed chat this toolbar slot shows the
// "Conversations" dropdown instead; the tab strip also renders its own "New
// Chat" button at the end of the tabs whenever it is visible.
registerAction2(class AddChatToSessionAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.chatCompositeBar.addChat',
			title: localize2('chatCompositeBar.addChat', "New Chat"),
			icon: Codicon.add,
			menu: {
				id: Menus.SessionBarToolbar,
				group: 'navigation',
				order: 10,
				when: ContextKeyExpr.and(SessionIsCreatedContext, SessionSupportsMultipleChatsContext, SessionIsArchivedContext.negate(), SessionHasMultipleCommittedChatsContext.negate()),
			},
		});
	}

	override async run(accessor: ServicesAccessor, session: IActiveSession | undefined): Promise<void> {
		if (!session) {
			return;
		}
		const sessionsService = accessor.get(ISessionsService);
		const sessionsPartService = accessor.get(ISessionsPartService);
		await sessionsService.openNewChatInSession(session);
		sessionsPartService.focusSession(session);
	}
});

// The "Conversations" toolbar entry is a submenu (rendered as a dropdown): it
// opens with a "New Chat" entry (registered by SessionConversationsMenuContribution
// below), then lists every chat in the session with a checkbox. Checked chats are
// shown as tabs; unchecked chats are closed (hidden from the tab strip). Toggling
// an entry closes or reopens the corresponding chat. The main chat is always shown
// and cannot be closed, so its entry is checked and disabled. It replaces the "New
// Chat" toolbar button once the session has more than one committed chat.
MenuRegistry.appendMenuItem(Menus.SessionBarToolbar, {
	submenu: Menus.SessionConversations,
	title: localize2('chatCompositeBar.conversations', "Conversations"),
	icon: Codicon.commentDiscussion,
	group: 'navigation',
	order: 10,
	when: ContextKeyExpr.and(SessionIsCreatedContext, SessionSupportsMultipleChatsContext, SessionIsArchivedContext.negate(), SessionHasMultipleCommittedChatsContext),
});

/**
 * Populates the {@link Menus.SessionConversations} submenu for every visible
 * session. {@link Menus.SessionBarToolbar} is rendered once per session view
 * (header/floating toolbar) against that view's scoped context key service, so
 * the submenu items are scoped per session via {@link SessionIdContext}: each
 * session's "New Chat" action and per-chat toggle actions only render in (and
 * act on) their own session's toolbar. The actions are (re)registered whenever
 * the set of visible sessions or their chat lists change.
 */
export class SessionConversationsMenuContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.conversationsMenu';

	constructor(
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsPartService private readonly _sessionsPartService: ISessionsPartService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
	) {
		super();
		this._register(autorun(reader => {
			for (const session of this._sessionsService.visibleSessions.read(reader)) {
				if (session) {
					reader.store.add(this._registerSessionConversations(session, reader));
				}
			}
		}));
	}

	private _registerSessionConversations(session: IActiveSession, reader: IReader): IDisposable {
		const store = new DisposableStore();
		const that = this;
		const extUri = this._uriIdentityService.extUri;

		// Scope every entry to this session's toolbar: the submenu is rendered once
		// per session view against its own scoped context key service, where
		// `sessionId` resolves to that view's session.
		const scopedToSession = ContextKeyExpr.equals(SessionIdContext.key, session.sessionId);

		store.add(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `sessions.chatCompositeBar.addChat.${session.sessionId}`,
					title: localize2('chatCompositeBar.addChat', "New Chat"),
					icon: Codicon.add,
					menu: { id: Menus.SessionConversations, group: 'navigation', order: 0, when: scopedToSession },
				});
			}
			override async run(_accessor: ServicesAccessor, forwardedSession?: IActiveSession): Promise<void> {
				const target = forwardedSession ?? session;
				await that._sessionsService.openNewChatInSession(target);
				that._sessionsPartService.focusSession(target);
			}
		}));

		const allChats = session.chats.read(reader);
		const mainResource = session.mainChat.read(reader).resource;
		const openChats = session.openChats.read(reader);

		allChats.forEach((chat, index) => {
			// Skip untitled (in-composer) draft chats: they are transient "New
			// Chat" drafts that can't be meaningfully closed/reopened, and listing
			// them here (titled "New Chat") just duplicates the New Chat action.
			if (chat.status.read(reader) === SessionStatus.Untitled) {
				return;
			}
			const chatResource = chat.resource;
			const isOpen = openChats.some(c => extUri.isEqual(c.resource, chatResource));
			const isMain = extUri.isEqual(chatResource, mainResource);
			const title = chat.title.read(reader) || localize('untitledChat', "Untitled Chat");
			// Action IDs are global, so scope them to the session and a hash of the
			// chat resource (which is stable per chat) rather than embedding the raw
			// URI, which is long and can contain `:`, `/`, `#`.
			store.add(registerAction2(class extends Action2 {
				constructor() {
					super({
						id: `sessions.toggleChat.${session.sessionId}.${hash(chatResource.toString())}`,
						title,
						toggled: isOpen ? ContextKeyExpr.true() : undefined,
						precondition: isMain ? ContextKeyExpr.false() : undefined,
						menu: { id: Menus.SessionConversations, group: '1_chats', order: index, when: scopedToSession },
					});
				}
				override async run(_accessor: ServicesAccessor, forwardedSession?: IActiveSession): Promise<void> {
					const target = forwardedSession ?? session;
					const targetChat = target.chats.get().find(c => extUri.isEqual(c.resource, chatResource));
					if (!targetChat) {
						return;
					}
					if (target.openChats.get().some(c => extUri.isEqual(c.resource, chatResource))) {
						await that._sessionsService.closeChat(target, targetChat);
					} else {
						// Opening a closed chat also un-hides it in the tab strip.
						await that._sessionsService.openChat(target, targetChat.resource);
					}
				}
			}));
		});

		return store;
	}
}

registerAction2(class TogglePinSessionAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.chatCompositeBar.togglePin',
			title: localize2('chatCompositeBar.pin', "Pin Session"),
			icon: Codicon.pin,
			toggled: {
				condition: SessionIsStickyContext,
				icon: Codicon.pinned,
				title: localize('chatCompositeBar.unpin', "Unpin Session"),
			},
			menu: {
				id: Menus.SessionBarToolbar,
				group: '1_session',
				order: 10,
				when: ContextKeyExpr.and(SessionIsCreatedContext, SessionIsArchivedContext.negate()),
			},
		});
	}

	override async run(accessor: ServicesAccessor, session: IActiveSession | undefined): Promise<void> {
		if (!session) {
			return;
		}
		accessor.get(ISessionsService).toggleSessionStickiness(session);
	}
});

MenuRegistry.appendMenuItem(Menus.SessionHeaderContext, {
	command: {
		id: 'sessions.chatCompositeBar.togglePin',
		title: localize('chatCompositeBar.pinView', "Pin View"),
		toggled: {
			condition: SessionIsStickyContext,
			title: localize('chatCompositeBar.unpinView', "Unpin View"),
		},
	},
	group: '1_view',
	order: 1,
	when: SessionIsCreatedContext,
});

registerAction2(class RenameSessionHeaderAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.sessionHeader.rename',
			title: localize2('renameSessionHeader', "Rename..."),
			menu: [{
				id: Menus.SessionHeaderContext,
				group: '2_edit',
				order: 1,
				when: ContextKeyExpr.regex(SessionProviderIdContext.key, ANY_AGENT_HOST_PROVIDER_RE),
			}],
		});
	}

	override run(accessor: ServicesAccessor, session: IActiveSession | undefined): void {
		if (!session) {
			return;
		}
		accessor.get(ISessionsPartService).getSessionView(session.sessionId)?.startTitleEditing();
	}
});

registerAction2(class CloseSessionAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.chatCompositeBar.close',
			title: localize2('chatCompositeBar.close', "Close"),
			icon: Codicon.close,
			menu: [{
				id: Menus.SessionBarToolbar,
				when: ContextKeyExpr.or(SessionIsCreatedContext, MultipleSessionsVisibleContext),
				group: '1_session',
				order: 30,
			}, {
				id: Menus.SessionHeaderContext,
				when: ContextKeyExpr.or(SessionIsCreatedContext, MultipleSessionsVisibleContext),
				group: '1_view',
				order: 2,
			}],
		});
	}

	override async run(accessor: ServicesAccessor, session: IActiveSession | undefined): Promise<void> {
		const sessionsService = accessor.get(ISessionsService);
		const sessionsPartService = accessor.get(ISessionsPartService);

		sessionsService.closeSession(session);
		sessionsPartService.focusSession(sessionsService.activeSession.get());
	}
});

registerAction2(class ToggleMaximizeSessionViewAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.chatCompositeBar.toggleMaximize',
			title: localize2('chatCompositeBar.maximize', "Maximize Session"),
			icon: Codicon.screenFull,
			toggled: {
				condition: SessionIsMaximizedContext,
				icon: Codicon.screenNormal,
				title: localize('chatCompositeBar.unmaximize', "Restore Session"),
			},
			menu: {
				id: Menus.SessionBarToolbar,
				when: MultipleSessionsVisibleContext,
				group: '1_session',
				order: 20,
			},
		});
	}

	override async run(accessor: ServicesAccessor, session: IActiveSession | undefined): Promise<void> {
		accessor.get(ISessionsPartService).toggleMaximizeSession(session);
		accessor.get(ISessionsService).setActive(session);
	}
});

// -- Close Editor Area (Watermark Toolbar) --

registerAction2(class CloseEditorAreaAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.closeEditorArea',
			title: localize2('closeEditorArea', "Close Editor Area"),
			icon: Codicon.close,
			category: SessionsCategories.Sessions,
			menu: {
				id: MenuId.EditorGroupWatermarkToolbar,
				group: 'navigation',
				order: 10,
				when: IsSessionsWindowContext,
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		layoutService.setPartHidden(true, Parts.EDITOR_PART);
	}
});
