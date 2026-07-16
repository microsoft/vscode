/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { fromNow } from '../../../../base/common/date.js';
import { hash } from '../../../../base/common/hash.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IReader } from '../../../../base/common/observable.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuRegistry, MenuId, registerAction2, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { InputFocusedContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { EditorAreaFocusContext, IsAuxiliaryWindowContext, IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { getQuickNavigateHandler, inQuickPickContext } from '../../../../workbench/browser/quickaccess.js';
import { Menus } from '../../../browser/menus.js';
import { SessionsCategories } from '../../../common/categories.js';
import { CanGoBackContext, CanGoForwardContext, SessionProviderIdContext, MultipleSessionsVisibleContext, SessionIsArchivedContext, SessionIsCreatedContext, SessionIsMaximizedContext, SessionIsStickyContext, SessionsFocusContext, SessionSupportsMultipleChatsContext, SessionsWelcomeVisibleContext, SessionIdContext, SessionHasMultipleCommittedChatsContext, SessionShouldShowChatTabsContext, SessionHasMultipleOpenChatsContext, SessionsPickerVisibleContext, SessionActiveChatIsClosableContext, SessionActiveChatIsDeletableContext, SessionChatsPickerVisibleContext, SessionActiveChatHasSubagentsContext, SessionsTitleBarNewSessionEnabledContext } from '../../../common/contextkeys.js';
import { ANY_AGENT_HOST_PROVIDER_RE } from '../../../common/agentHostSessionsProvider.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ChatOriginKind, getChatCapabilities, getUntitledSessionTitle, IChat, ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsPartService } from '../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsListModelService } from '../../../services/sessions/browser/sessionsListModelService.js';
import { $, append, EventHelper, reset } from '../../../../base/browser/dom.js';
import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { KeybindingLabel } from '../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { IAction } from '../../../../base/common/actions.js';
import { OS } from '../../../../base/common/platform.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { asCssVariable } from '../../../../platform/theme/common/colorRegistry.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { markOnboardingTarget } from '../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { IWorkbenchAssignmentService } from '../../../../workbench/services/assignment/common/assignmentService.js';
import { agentsNewSessionButtonBackground, agentsNewSessionButtonBorder, agentsNewSessionButtonForeground, agentsNewSessionButtonHoverBackground } from '../../../common/theme.js';
import { logSessionsInteraction, SessionsInteractionSource } from '../../../common/sessionsTelemetry.js';
import { NEW_SESSION_ACTION_ID } from '../../chat/common/constants.js';
import './media/newSessionActionViewItem.css';

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
				mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.KeyR },
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
		const contextKeyService = accessor.get(IContextKeyService);

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
			const title = session.title.get() || getUntitledSessionTitle(session.isQuickChat?.get() ?? false);

			// Status icon, mirroring the sessions list and session header.
			const status = session.status.get();
			const isRead = session.isRead.get();
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

		// Expose a context key while the picker is open so the navigate
		// keybindings (bound to the same chord as this command) can advance the
		// selection instead of re-opening the picker.
		const pickerVisibleContext = SessionsPickerVisibleContext.bindTo(contextKeyService);
		pickerVisibleContext.set(true);
		disposables.add(toDisposable(() => pickerVisibleContext.reset()));

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

// -- Sessions Picker Quick Navigation --
// While the sessions picker is open, pressing the same chord again advances the
// active item (and Shift goes backwards), so the user can hold the modifier and
// tab through sessions, then release to open the focused one.

const SESSIONS_PICKER_NAVIGATE_NEXT_ID = 'sessions.showSessionsPicker.navigateNext';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: SESSIONS_PICKER_NAVIGATE_NEXT_ID,
	weight: KeybindingWeight.SessionsContrib + 50,
	handler: getQuickNavigateHandler(SESSIONS_PICKER_NAVIGATE_NEXT_ID, true),
	when: SessionsPickerVisibleContext,
	primary: KeyMod.CtrlCmd | KeyCode.KeyR,
	mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.KeyR },
});

const SESSIONS_PICKER_NAVIGATE_PREVIOUS_ID = 'sessions.showSessionsPicker.navigatePrevious';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: SESSIONS_PICKER_NAVIGATE_PREVIOUS_ID,
	weight: KeybindingWeight.SessionsContrib + 50,
	handler: getQuickNavigateHandler(SESSIONS_PICKER_NAVIGATE_PREVIOUS_ID, false),
	when: SessionsPickerVisibleContext,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR,
	mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyMod.Shift | KeyCode.KeyR },
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

// -- Chat tab navigation, new chat, & close (within the active session's tab strip) --

// These chords sit just above the session-level navigation/close commands so
// they win while a multi-chat session is focused, falling back to the
// session-level commands when the tab strip is not shown.
const CHAT_TAB_KEYBINDING_WEIGHT = KeybindingWeight.SessionsContrib + 10;

// "New Chat" starts a new chat. Hidden once the session has more than one open
// chat, since the chat tab strip then offers New Chat at the end of the tabs.
const ADD_CHAT_TO_SESSION_ACTION_ID = 'sessions.chatCompositeBar.addChat';

registerAction2(class AddChatToSessionAction extends Action2 {
	constructor() {
		super({
			id: ADD_CHAT_TO_SESSION_ACTION_ID,
			title: localize2('chatCompositeBar.addChat', "New Chat"),
			icon: Codicon.add,
			keybinding: {
				weight: CHAT_TAB_KEYBINDING_WEIGHT,
				// Like Cmd/Ctrl+T in a browser — opens a new chat tab within the
				// active session. Scoped so it does not steal the shortcut outside
				// the agents window or when the session does not support multiple chats.
				when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated(), SessionIsCreatedContext, SessionSupportsMultipleChatsContext, SessionIsArchivedContext.negate()),
				primary: KeyMod.CtrlCmd | KeyCode.KeyT,
			},
			menu: {
				id: Menus.SessionBarToolbar,
				group: 'navigation',
				order: 0,
				when: ContextKeyExpr.and(SessionIsCreatedContext, SessionSupportsMultipleChatsContext, SessionIsArchivedContext.negate(), SessionShouldShowChatTabsContext.negate()),
			},
		});
	}

	override async run(accessor: ServicesAccessor, session?: IActiveSession): Promise<void> {
		const sessionsService = accessor.get(ISessionsService);
		const sessionsPartService = accessor.get(ISessionsPartService);
		// From the menu: session is forwarded as context. From the keybinding:
		// fall back to the active session.
		const target = session ?? sessionsService.activeSession.get();
		if (!target) {
			return;
		}
		await sessionsService.openNewChatInSession(target);
		sessionsPartService.focusSession(target);
	}
});

function navigateChatTab(accessor: ServicesAccessor, direction: 'next' | 'previous'): void {
	const sessionsService = accessor.get(ISessionsService);
	const sessionsPartService = accessor.get(ISessionsPartService);
	const extUri = accessor.get(IUriIdentityService).extUri;
	const session = sessionsService.activeSession.get();
	if (!session) {
		return;
	}
	const tabs = session.visibleChatTabs.get();
	if (tabs.length < 2) {
		return;
	}
	const activeChat = session.activeChat.get();
	const currentIndex = activeChat ? tabs.findIndex(chat => extUri.isEqual(chat.resource, activeChat.resource)) : -1;
	const from = currentIndex === -1 ? 0 : currentIndex;
	const delta = direction === 'next' ? 1 : -1;
	const target = tabs[(from + delta + tabs.length) % tabs.length];
	sessionsService.openChat(session, target.resource);
	sessionsPartService.focusSession(session);
}

registerAction2(class NavigateNextChatAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.chatCompositeBar.navigateNextChat',
			title: localize2('navigateNextChat', "Go to Next Chat"),
			f1: true,
			category: SessionsCategories.Sessions,
			precondition: SessionHasMultipleOpenChatsContext,
			keybinding: {
				weight: CHAT_TAB_KEYBINDING_WEIGHT,
				when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated(), SessionHasMultipleOpenChatsContext),
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketRight,
			},
		});
	}
	override run(accessor: ServicesAccessor): void {
		navigateChatTab(accessor, 'next');
	}
});

registerAction2(class NavigatePreviousChatAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.chatCompositeBar.navigatePreviousChat',
			title: localize2('navigatePreviousChat', "Go to Previous Chat"),
			f1: true,
			category: SessionsCategories.Sessions,
			precondition: SessionHasMultipleOpenChatsContext,
			keybinding: {
				weight: CHAT_TAB_KEYBINDING_WEIGHT,
				when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated(), SessionHasMultipleOpenChatsContext),
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketLeft,
			},
		});
	}
	override run(accessor: ServicesAccessor): void {
		navigateChatTab(accessor, 'previous');
	}
});

// The close-chat action is both a keybinding (Ctrl/Cmd+W closes the active chat)
// and a per-tab toolbar action contributed to {@link Menus.SessionChatTab}: the
// chat tab strip renders this menu and forwards the tab's {@link IChatTabContext}
// as the action argument so the button closes that specific tab.
export interface IChatTabContext {
	readonly session: IActiveSession;
	readonly chat: IChat;
}

registerAction2(class CloseChatAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.chatCompositeBar.closeChat',
			title: localize2('closeActiveChat', "Close Chat"),
			icon: Codicon.close,
			// Hidden from the palette: closing a specific chat is contextual (the
			// keybinding targets the active chat; the menu targets a tab).
			f1: false,
			category: SessionsCategories.Sessions,
			keybinding: {
				weight: CHAT_TAB_KEYBINDING_WEIGHT,
				// Intercept Ctrl/Cmd+W (which otherwise closes the session) only
				// while the active chat is a closeable non-main chat, so it closes
				// the chat tab instead — like closing a tab vs the window.
				when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated(), SessionActiveChatIsClosableContext),
				primary: KeyMod.CtrlCmd | KeyCode.KeyW,
				win: { primary: KeyMod.CtrlCmd | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyCode.KeyW] },
			},
			// Rendered as the tab's close button by the chat tab strip; the main
			// chat's tab does not render this menu, so no per-tab gating is needed.
			menu: {
				id: Menus.SessionChatTab,
				group: 'navigation',
				order: 10,
			},
		});
	}
	override async run(accessor: ServicesAccessor, context?: IChatTabContext): Promise<void> {
		const sessionsService = accessor.get(ISessionsService);
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const extUri = accessor.get(IUriIdentityService).extUri;
		// From the tab menu: act on the forwarded tab's chat. From the keybinding:
		// act on the active chat of the active session.
		const session = context?.session ?? sessionsService.activeSession.get();
		if (!session) {
			return;
		}
		const chat = context?.chat ?? session.activeChat.get();
		if (!chat || extUri.isEqual(chat.resource, session.mainChat.get().resource)) {
			return;
		}
		// An untitled (in-composer) draft has nothing to reopen, so delete it
		// outright; a committed chat is hidden (reopenable).
		if (chat.status.get() === SessionStatus.Untitled) {
			await sessionsManagementService.deleteChat(session, chat.resource, { skipConfirmation: true });
		} else {
			await sessionsService.closeChat(session, chat);
		}
	}
});

registerAction2(class CloseAllChatsAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.chatCompositeBar.closeAllChats',
			title: localize2('closeAllChats', "Close All Chats"),
			f1: true,
			category: SessionsCategories.Sessions,
			// Enabled (palette + keybinding) only while the active session has more
			// than one open chat, so the chord targets the focused session and
			// stays inert for single-chat sessions.
			precondition: SessionHasMultipleOpenChatsContext,
			keybinding: {
				weight: CHAT_TAB_KEYBINDING_WEIGHT,
				when: ContextKeyExpr.and(
					IsSessionsWindowContext,
					// While a modal editor has focus, let VS Code's own
					// closeEditorsInGroup (same chord) act on the editor group.
					EditorAreaFocusContext.toNegated(),
					SessionHasMultipleOpenChatsContext
				),
				// Mirror VS Code's "Close All Editors in Group" chord (Ctrl/Cmd+K W):
				// a session is the Agents-window analogue of an editor group. Note
				// "Close All Sessions" already owns Ctrl/Cmd+K Ctrl/Cmd+W.
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyW),
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const sessionsService = accessor.get(ISessionsService);
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const extUri = accessor.get(IUriIdentityService).extUri;
		const session = sessionsService.activeSession.get();
		if (!session) {
			return;
		}

		const mainResource = session.mainChat.get().resource;
		const chatsToClose = session.openChats.get().filter(chat => !extUri.isEqual(chat.resource, mainResource));
		for (const chat of chatsToClose) {
			if (chat.status.get() === SessionStatus.Untitled) {
				await sessionsManagementService.deleteChat(session, chat.resource, { skipConfirmation: true });
			} else {
				await sessionsService.closeChat(session, chat);
			}
		}
	}
});

registerAction2(class DeleteChatAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.chatCompositeBar.deleteChat',
			title: localize2('deleteActiveChat', "Delete Chat"),
			f1: true,
			category: SessionsCategories.Sessions,
			keybinding: {
				weight: CHAT_TAB_KEYBINDING_WEIGHT,
				// Delete / Cmd+Backspace (Mac) — mirrors the file-delete keybinding
				// in the Explorer. Scoped so it never fires while typing in an input
				// (chat composer, rename field, etc.) or on the session's main chat.
				when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated(), InputFocusedContext.toNegated(), SessionActiveChatIsDeletableContext),
				primary: KeyCode.Delete,
				mac: {
					primary: KeyMod.CtrlCmd | KeyCode.Backspace,
					secondary: [KeyCode.Delete],
				},
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const sessionsService = accessor.get(ISessionsService);
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const session = sessionsService.activeSession.get();
		if (!session) {
			return;
		}
		const chat = session.activeChat.get();
		// The main chat and worker (subagent) chats report `canDelete: false`.
		if (!chat || !getChatCapabilities(chat, session, undefined).canDelete) {
			return;
		}
		await sessionsManagementService.deleteChat(session, chat.resource);
	}
});

registerAction2(class ReopenLastClosedChatAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.chatCompositeBar.reopenLastClosedChat',
			title: localize2('chatCompositeBar.reopenLastClosedChat', "Reopen Last Closed Chat"),
			f1: true,
			category: SessionsCategories.Sessions,
			precondition: SessionSupportsMultipleChatsContext,
			keybinding: {
				weight: CHAT_TAB_KEYBINDING_WEIGHT,
				// Like Cmd/Ctrl+Shift+T in a browser — reopens the most recently
				// closed chat tab. Scoped to the agents window, outside editor area.
				when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated(), SessionIsCreatedContext, SessionSupportsMultipleChatsContext),
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyT,
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const sessionsService = accessor.get(ISessionsService);
		const sessionsPartService = accessor.get(ISessionsPartService);
		const session = sessionsService.activeSession.get();
		if (!session) {
			return;
		}
		const lastClosed = session.lastClosedChat;
		if (!lastClosed) {
			return;
		}
		await sessionsService.openChat(session, lastClosed.resource);
		sessionsPartService.focusSession(session);
	}
});

// A no-input quick pick (pure switcher) over the active session's open chats,
// each shown with a chat icon. Driven by Ctrl+Tab / Ctrl+Shift+Tab in
// editor-switcher (MRU) style: opens with quick navigate active, so holding the
// modifier and pressing Tab cycles and releasing accepts the focused chat. These
// are gated to sessions with more than one open chat at a higher weight than the
// session-history secondary on the same chord, so they fall back to session
// navigation otherwise. The same picker is also reachable from the palette ("Go
// to Chat in Session"), which additionally lists closed chats and skips drafts.

export const SHOW_CHATS_PICKER_COMMAND_ID = 'sessions.showChatsPicker';
const QUICK_SWITCH_NEXT_CHAT_ID = 'sessions.quickSwitchNextChat';
const QUICK_SWITCH_PREVIOUS_CHAT_ID = 'sessions.quickSwitchPreviousChat';
const CHATS_PICKER_QUICK_NAVIGATE_NEXT_ID = 'sessions.chatsPicker.quickNavigateNext';
const CHATS_PICKER_QUICK_NAVIGATE_PREVIOUS_ID = 'sessions.chatsPicker.quickNavigatePrevious';

// The open chords are gated to not fire while another quick pick is already
// showing (inQuickPickContext negated), so e.g. the editor's own Ctrl+Tab picker
// keeps the chord for its own navigation instead of this opening on top of it.
// The Ctrl+Tab MRU switcher cycles open chats only, so it is gated on more than
// one open tab. (The palette command, which also lists closed chats, is gated on
// more than one committed chat instead.)
const ChatsPickerScopeContext = ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated(), SessionHasMultipleOpenChatsContext, inQuickPickContext.negate());

function openChatsPicker(accessor: ServicesAccessor, mru?: { readonly backward: boolean }): void {
	const sessionsService = accessor.get(ISessionsService);
	const quickInputService = accessor.get(IQuickInputService);
	const sessionsPartService = accessor.get(ISessionsPartService);
	const contextKeyService = accessor.get(IContextKeyService);
	const keybindingService = accessor.get(IKeybindingService);

	const session = sessionsService.activeSession.get();
	if (!session) {
		return;
	}
	const extUri = accessor.get(IUriIdentityService).extUri;

	interface IChatPickItem extends IQuickPickItem {
		readonly chat: IChat;
	}

	const toItem = (chat: IChat): IChatPickItem => ({
		label: chat.title.get()?.trim() || localize('untitledChat', "Untitled Chat"),
		description: fromNow(chat.updatedAt.get(), true, true),
		iconClass: ThemeIcon.asClassName(Codicon.commentDiscussion),
		chat,
	});

	// MRU mode cycles every open tab (including in-composer drafts) so the set of
	// switchable chats matches the SessionHasMultipleOpenChatsContext gate. The
	// searchable palette flow instead skips untitled drafts (no meaningful title,
	// mirroring the Conversations submenu) and adds the closed chats below.
	const openItems = (mru
		? session.visibleChatTabs.get()
		: session.visibleChatTabs.get().filter(chat => chat.status.get() !== SessionStatus.Untitled)
	).map(toItem);
	// Closed chats are hidden from the tab strip but still reopenable. They are
	// only offered in the searchable palette flow — not the Ctrl+Tab MRU switcher,
	// which mirrors the editor switcher and cycles open items only.
	const closedItems = mru ? [] : session.closedChats.get()
		.filter(chat => chat.status.get() !== SessionStatus.Untitled && chat.origin?.kind !== ChatOriginKind.Tool)
		.map(toItem);

	// Navigation order: open chats first, then closed chats.
	const pickItems = [...openItems, ...closedItems];
	if (pickItems.length === 0) {
		return;
	}

	const displayItems: (IChatPickItem | IQuickPickSeparator)[] = closedItems.length === 0
		? openItems
		: [
			{ type: 'separator', label: localize('openChatsGroup', "Open") },
			...openItems,
			{ type: 'separator', label: localize('closedChatsGroup', "Closed") },
			...closedItems,
		];

	const activeChat = session.activeChat.get();
	const activeIndex = Math.max(0, activeChat ? pickItems.findIndex(item => extUri.isEqual(item.chat.resource, activeChat.resource)) : -1);
	// MRU style starts on the adjacent chat so a single tap+release switches to
	// it; palette invocation (non-MRU) focuses the active chat.
	const startIndex = mru ? (activeIndex + (mru.backward ? -1 : 1) + pickItems.length) % pickItems.length : activeIndex;

	const disposables = new DisposableStore();
	const picker = disposables.add(quickInputService.createQuickPick<IChatPickItem>({ useSeparators: true }));
	picker.items = displayItems;
	picker.activeItems = [pickItems[startIndex]];
	if (mru) {
		// Editor-switcher style: no filter input, and quick navigate stays active so
		// releasing the modifier accepts the focused chat. The modifier is taken
		// from the quick-navigate keybinding's chord.
		picker.hideInput = true;
		picker.quickNavigate = { keybindings: keybindingService.lookupKeybindings(CHATS_PICKER_QUICK_NAVIGATE_NEXT_ID) };
	} else {
		// Palette flow: a searchable list across the Open and Closed groups.
		picker.placeholder = localize('searchChats', "Search chats by name");
		picker.matchOnDescription = true;
	}

	// Expose a context key while the picker is open so the navigate keybindings
	// (bound to the same chords) advance the selection instead of re-opening.
	const pickerVisibleContext = SessionChatsPickerVisibleContext.bindTo(contextKeyService);
	pickerVisibleContext.set(true);
	disposables.add(toDisposable(() => pickerVisibleContext.reset()));

	disposables.add(picker.onDidAccept(() => {
		const [selected] = picker.selectedItems;
		if (selected) {
			sessionsService.openChat(session, selected.chat.resource);
			sessionsPartService.focusSession(session);
		}
		picker.hide();
	}));
	disposables.add(picker.onDidHide(() => disposables.dispose()));

	picker.show();
}

registerAction2(class ShowChatsPickerAction extends Action2 {
	constructor() {
		super({
			id: SHOW_CHATS_PICKER_COMMAND_ID,
			title: localize2('showChatsPicker', "Go to Chat in Session"),
			f1: true,
			category: SessionsCategories.Sessions,
			precondition: SessionHasMultipleCommittedChatsContext,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated(), inQuickPickContext.negate()),
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyO,
			},
		});
	}
	override run(accessor: ServicesAccessor): void {
		openChatsPicker(accessor);
	}
});

// Ctrl+Tab / Ctrl+Shift+Tab open the picker in editor-switcher (MRU) mode. Hidden
// from the palette (f1: false) since they only make sense held; the chord wins
// over the session-history secondary via the higher weight while multi-chat.
registerAction2(class QuickSwitchNextChatAction extends Action2 {
	constructor() {
		super({
			id: QUICK_SWITCH_NEXT_CHAT_ID,
			title: localize2('quickSwitchNextChat', "Quick Switch to Next Chat"),
			f1: false,
			category: SessionsCategories.Sessions,
			precondition: SessionHasMultipleOpenChatsContext,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib + 1,
				when: ChatsPickerScopeContext,
				primary: KeyMod.CtrlCmd | KeyCode.Tab,
				mac: { primary: KeyMod.WinCtrl | KeyCode.Tab },
			},
		});
	}
	override run(accessor: ServicesAccessor): void {
		openChatsPicker(accessor, { backward: false });
	}
});

registerAction2(class QuickSwitchPreviousChatAction extends Action2 {
	constructor() {
		super({
			id: QUICK_SWITCH_PREVIOUS_CHAT_ID,
			title: localize2('quickSwitchPreviousChat', "Quick Switch to Previous Chat"),
			f1: false,
			category: SessionsCategories.Sessions,
			precondition: SessionHasMultipleOpenChatsContext,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib + 1,
				when: ChatsPickerScopeContext,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Tab,
				mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Tab },
			},
		});
	}
	override run(accessor: ServicesAccessor): void {
		openChatsPicker(accessor, { backward: true });
	}
});

// While the picker is open, Ctrl+Tab / Ctrl+Shift+Tab cycle forward / backward.
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: CHATS_PICKER_QUICK_NAVIGATE_NEXT_ID,
	weight: KeybindingWeight.SessionsContrib + 50,
	handler: getQuickNavigateHandler(CHATS_PICKER_QUICK_NAVIGATE_NEXT_ID, true),
	when: SessionChatsPickerVisibleContext,
	primary: KeyMod.CtrlCmd | KeyCode.Tab,
	mac: { primary: KeyMod.WinCtrl | KeyCode.Tab },
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: CHATS_PICKER_QUICK_NAVIGATE_PREVIOUS_ID,
	weight: KeybindingWeight.SessionsContrib + 50,
	handler: getQuickNavigateHandler(CHATS_PICKER_QUICK_NAVIGATE_PREVIOUS_ID, false),
	when: SessionChatsPickerVisibleContext,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Tab,
	mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Tab },
});

/**
 * Base class for the compact pill button rendered in the sessions UI (e.g. the "New" session/chat
 * buttons, the empty file editor's "Search Files" button). Subclasses provide the command id,
 * label and hover/aria text.
 */
export abstract class CompactButtonActionViewItem extends BaseActionViewItem {

	constructor(
		action: IAction,
		@IKeybindingService protected readonly keybindingService: IKeybindingService,
		@IHoverService private readonly hoverService: IHoverService,
		@IContextKeyService protected readonly contextKeyService: IContextKeyService,
	) {
		super(undefined, action);
	}

	/** Command id used to look up the trailing keybinding hint. */
	protected abstract get commandId(): string;

	/** Visible pill label (e.g. "New", "New Chat"). */
	protected abstract get label(): string;

	/** Hover text; receives the resolved keybinding label, if any. */
	protected abstract getHoverContent(keybindingLabel: string | undefined): string;

	/** Accessible name; receives the resolved keybinding aria label, if any. */
	protected abstract getAriaLabel(keybindingAriaLabel: string | undefined): string;

	/** Optional onboarding spotlight target id for the pill. */
	protected get onboardingTargetId(): string | undefined {
		return undefined;
	}

	/** Whether to render the trailing keybinding hint chip in the label. */
	protected get showKeybindingHint(): boolean {
		return true;
	}

	/** Hook invoked right before the action runs (e.g. for telemetry). */
	protected onRun(): void { }

	override render(container: HTMLElement): void {
		super.render(container);

		if (!this.element) {
			return;
		}

		const button = this._register(new Button(this.element, {
			...defaultButtonStyles,
			buttonSecondaryBackground: asCssVariable(agentsNewSessionButtonBackground),
			buttonSecondaryForeground: asCssVariable(agentsNewSessionButtonForeground),
			buttonSecondaryHoverBackground: asCssVariable(agentsNewSessionButtonHoverBackground),
			buttonSecondaryBorder: asCssVariable(agentsNewSessionButtonBorder),
			secondary: true,
			supportIcons: true,
		}));
		button.element.classList.add('agent-sessions-compact-new-button');
		const onboardingTargetId = this.onboardingTargetId;
		if (onboardingTargetId) {
			this._register(markOnboardingTarget(button.element, onboardingTargetId));
		}
		this._register(button.onDidClick(e => {
			// Stop propagation so the parent <li> click handler doesn't run the action twice.
			EventHelper.stop(e, true);
			if (!this.action.enabled) {
				return;
			}
			this.onRun();
			this.actionRunner.run(this.action, this._context);
		}));

		const buttonLabel = $('span.new-session-button-label', undefined, this.label);
		const keybindingHint = $('span.new-session-keybinding-hint');
		const keybindingHintLabel = this.showKeybindingHint
			? this._register(new KeybindingLabel(keybindingHint, OS, {
				disableTitle: true,
				keybindingLabelBackground: 'transparent',
				keybindingLabelForeground: 'inherit',
				keybindingLabelBorder: 'transparent',
				keybindingLabelBottomBorder: undefined,
				keybindingLabelShadow: undefined,
			}))
			: undefined;
		reset(button.element, buttonLabel);

		const getKeybinding = () => {
			const primaryKeybinding = this.keybindingService.lookupKeybinding(this.commandId, this.contextKeyService, true);
			const resolvedKeybindings = this.keybindingService.lookupKeybindings(this.commandId);
			return primaryKeybinding ?? resolvedKeybindings[0];
		};

		this._register(this.hoverService.setupDelayedHover(button.element, () => ({
			content: this.getHoverContent(getKeybinding()?.getLabel() ?? undefined),
			appearance: { compact: true },
			position: { hoverPosition: HoverPosition.BELOW },
		})));

		let lastRenderedKeybindingLabel: string | undefined | null = null;
		let lastRenderedKeybindingAriaLabel: string | undefined | null = null;
		const updateButton = () => {
			const keybinding = getKeybinding();
			const keybindingLabel = keybinding?.getLabel() ?? undefined;
			const keybindingAriaLabel = keybinding?.getAriaLabel() ?? undefined;
			if (lastRenderedKeybindingLabel === keybindingLabel && lastRenderedKeybindingAriaLabel === keybindingAriaLabel) {
				return;
			}

			lastRenderedKeybindingLabel = keybindingLabel;
			lastRenderedKeybindingAriaLabel = keybindingAriaLabel;

			keybindingHintLabel?.set(keybinding);
			if (keybindingHintLabel && keybinding) {
				if (keybindingHint.parentElement !== button.element) {
					append(button.element, keybindingHint);
				}
			} else {
				keybindingHint.remove();
			}

			button.element.setAttribute('aria-label', this.getAriaLabel(keybindingAriaLabel));
		};
		this._register(Event.runAndSubscribe(this.keybindingService.onDidUpdateKeybindings, updateButton));
	}
}

/**
 * Renders the new-session action as the compact "New" pill, shared by the sessions sidebar
 * header and the titlebar.
 */
class NewSessionActionViewItem extends CompactButtonActionViewItem {

	constructor(
		action: IAction,
		private readonly telemetrySource: SessionsInteractionSource,
		@IKeybindingService keybindingService: IKeybindingService,
		@IHoverService hoverService: IHoverService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(action, keybindingService, hoverService, contextKeyService);
	}

	protected override get commandId(): string {
		return NEW_SESSION_ACTION_ID;
	}

	protected override get label(): string {
		return localize('newCompact', "New");
	}

	protected override get onboardingTargetId(): string {
		return 'sessions.newSession.button';
	}

	protected override getHoverContent(keybindingLabel: string | undefined): string {
		return keybindingLabel
			? localize('newSessionButtonTitle', "New Session ({0})", keybindingLabel)
			: localize('newSessionButtonTitleWithoutKeybinding', "New Session");
	}

	protected override getAriaLabel(keybindingAriaLabel: string | undefined): string {
		return keybindingAriaLabel
			? localize('newSessionButtonAriaLabel', "New Session ({0})", keybindingAriaLabel)
			: localize('newSessionButtonAriaLabelWithoutKeybinding', "New Session");
	}

	protected override onRun(): void {
		logSessionsInteraction(this.telemetryService, 'newSession', this.telemetrySource);
	}
}

/**
 * Registers {@link NewSessionActionViewItem} in the sessions sidebar header and the titlebar.
 * The titlebar entry is gated behind an A/B experiment via {@link SessionsTitleBarNewSessionEnabledContext}.
 */
export class NewSessionActionViewItemContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.newSessionActionViewItem';

	/** ExP treatment that shows the new-session button in the titlebar. */
	private static readonly NEW_SESSION_TITLEBAR_TREATMENT = 'agentSessionsTitleBarNewSession';

	private readonly titleBarEnabledContext: IContextKey<boolean>;

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
	) {
		super();

		this.titleBarEnabledContext = SessionsTitleBarNewSessionEnabledContext.bindTo(contextKeyService);

		const onDidRegister = this._register(new Emitter<void>());
		const menus: MenuId[] = [Menus.SidebarSessionsHeader, Menus.TitleBarLeftLayout];
		for (const menu of menus) {
			const source: SessionsInteractionSource = menu === Menus.TitleBarLeftLayout ? 'titleBar' : 'sidebar';
			this._register(actionViewItemService.register(menu, NEW_SESSION_ACTION_ID, (action, _options, instantiationService) => {
				if (!(action instanceof MenuItemAction)) {
					return undefined;
				}
				return instantiationService.createInstance(NewSessionActionViewItem, action, source);
			}, onDidRegister.event));
		}
		onDidRegister.fire();

		// Resolve the titlebar experiment now and on refetch.
		this._register(this.assignmentService.onDidRefetchAssignments(() => this.updateTitleBarTreatment()));
		this.updateTitleBarTreatment();
	}

	private async updateTitleBarTreatment(): Promise<void> {
		// Always show in dev builds (running from sources) to ease development, regardless of the experiment.
		if (!this.environmentService.isBuilt) {
			this.titleBarEnabledContext.set(true);
			return;
		}
		const enabled = await this.assignmentService.getTreatment<boolean>(NewSessionActionViewItemContribution.NEW_SESSION_TITLEBAR_TREATMENT);
		this.titleBarEnabledContext.set(enabled === true);
	}
}

/**
 * Renders the "New Chat" action in the session header as the compact pill, matching the
 * "New" session pill in the sessions list header / titlebar.
 */
class NewChatActionViewItem extends CompactButtonActionViewItem {

	protected override get commandId(): string {
		return ADD_CHAT_TO_SESSION_ACTION_ID;
	}

	protected override get label(): string {
		return localize('chatCompositeBar.addChat.compact', "New Chat");
	}

	protected override get showKeybindingHint(): boolean {
		return false;
	}

	protected override getHoverContent(keybindingLabel: string | undefined): string {
		return keybindingLabel
			? localize('newChatButtonTitle', "New Chat ({0})", keybindingLabel)
			: localize('newChatButtonTitleWithoutKeybinding', "New Chat");
	}

	protected override getAriaLabel(keybindingAriaLabel: string | undefined): string {
		return keybindingAriaLabel
			? localize('newChatButtonAriaLabel', "New Chat ({0})", keybindingAriaLabel)
			: localize('newChatButtonAriaLabelWithoutKeybinding', "New Chat");
	}
}

export class SessionNewChatActionViewItemContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.newChatActionViewItem';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();

		// Fire once after registering so a header toolbar that was already built
		// (e.g. for a session restored before this contribution runs) re-renders and
		// picks up this factory; otherwise New Chat stays icon-only until its menu
		// next changes.
		const onDidRegister = this._register(new Emitter<void>());
		this._register(actionViewItemService.register(Menus.SessionBarToolbar, ADD_CHAT_TO_SESSION_ACTION_ID, (action, _options, instantiationService) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(NewChatActionViewItem, action);
		}, onDidRegister.event));
		onDidRegister.fire();
	}
}

// The "Conversations" toolbar entry is a submenu (rendered as a dropdown): it
// lists every chat in the session with a checkbox. Checked chats are shown as
// tabs; unchecked chats are closed (hidden from the tab strip). Toggling an entry
// closes or reopens the corresponding chat. The main chat is always shown and
// cannot be closed, so its entry is checked and disabled.
//
// It surfaces in one of two places depending on whether the chat tab strip is
// shown: when the strip is hidden it lives in the session header toolbar; once the
// session has more than one open chat (the tab strip is shown) it moves to the
// chat tab bar action menu at the end of the strip instead (see
// Menus.SessionChatTabBar below). It also surfaces when the active chat has
// subagents (a separate group at the bottom lists them), even if that is the only
// committed chat.
MenuRegistry.appendMenuItem(Menus.SessionBarToolbar, {
	submenu: Menus.SessionConversations,
	title: localize2('chatCompositeBar.conversations', "Conversations"),
	icon: Codicon.commentDiscussion,
	group: 'navigation',
	order: 10,
	when: ContextKeyExpr.and(SessionIsCreatedContext, SessionSupportsMultipleChatsContext, SessionIsArchivedContext.negate(), ContextKeyExpr.or(SessionHasMultipleCommittedChatsContext, SessionActiveChatHasSubagentsContext), SessionShouldShowChatTabsContext.negate()),
});

// Mirror of the header Conversations submenu, rendered at the end of the chat tab
// bar action menu while the tab strip is shown (more than one open chat). The two
// `when` clauses are mutually exclusive on SessionShouldShowChatTabsContext so
// the Conversations menu only ever appears in one place at a time.
MenuRegistry.appendMenuItem(Menus.SessionChatTabBar, {
	submenu: Menus.SessionConversations,
	title: localize2('chatCompositeBar.conversations', "Conversations"),
	icon: Codicon.commentDiscussion,
	group: 'navigation',
	order: 10,
	when: ContextKeyExpr.and(SessionIsCreatedContext, SessionSupportsMultipleChatsContext, SessionIsArchivedContext.negate(), ContextKeyExpr.or(SessionHasMultipleCommittedChatsContext, SessionActiveChatHasSubagentsContext), SessionShouldShowChatTabsContext),
});

/**
 * Populates the {@link Menus.SessionConversations} submenu for every visible
 * session. {@link Menus.SessionBarToolbar} is rendered once per session view
 * (header/floating toolbar) against that view's scoped context key service, so
 * the submenu items are scoped per session via {@link SessionIdContext}: each
 * session's per-chat toggle actions only render in (and act on) their own
 * session's toolbar. The actions are (re)registered whenever the set of visible
 * sessions or their chat lists change.
 */
export class SessionConversationsMenuContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.conversationsMenu';

	constructor(
		@ISessionsService private readonly _sessionsService: ISessionsService,
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

		const allChats = session.chats.read(reader);
		const mainResource = session.mainChat.read(reader).resource;
		const visibleChatTabs = session.visibleChatTabs.read(reader);
		const activeChatResource = session.activeChat.read(reader).resource;

		const registerToggle = (chat: IChat, group: string, order: number) => {
			const chatResource = chat.resource;
			// Whether the chat is currently shown as a tab. For regular chats this
			// mirrors `openChats`; for subagents it reflects the shown-subagent set,
			// which is what open/close toggles.
			const isShown = visibleChatTabs.some(c => extUri.isEqual(c.resource, chatResource));
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
						toggled: isShown ? ContextKeyExpr.true() : undefined,
						precondition: isMain ? ContextKeyExpr.false() : undefined,
						menu: { id: Menus.SessionConversations, group, order, when: scopedToSession },
					});
				}
				override async run(_accessor: ServicesAccessor, forwardedSession?: IActiveSession): Promise<void> {
					const target = forwardedSession ?? session;
					const targetChat = target.chats.get().find(c => extUri.isEqual(c.resource, chatResource));
					if (!targetChat) {
						return;
					}
					if (target.visibleChatTabs.get().some(c => extUri.isEqual(c.resource, chatResource))) {
						await that._sessionsService.closeChat(target, targetChat);
					} else {
						// Opening a closed chat (or hidden subagent) un-hides it in the tab strip.
						await that._sessionsService.openChat(target, targetChat.resource);
					}
				}
			}));
		};

		allChats.forEach((chat, index) => {
			// Skip untitled (in-composer) draft chats: they are transient "New
			// Chat" drafts that can't be meaningfully closed/reopened, and listing
			// them here (titled "New Chat") just duplicates the New Chat action.
			if (chat.status.read(reader) === SessionStatus.Untitled) {
				return;
			}
			// Subagent (tool-origin) chats are surfaced in their own group below,
			// scoped to the currently-active chat.
			if (chat.origin?.kind === ChatOriginKind.Tool) {
				return;
			}
			registerToggle(chat, '1_chats', index);
		});

		// Subagents of the currently-active chat, shown as a separate group at the
		// bottom (a separator divides them from the session's chats). This group
		// changes as the active chat changes.
		allChats
			.filter(chat =>
				chat.origin?.kind === ChatOriginKind.Tool &&
				!!chat.origin.parentChat &&
				extUri.isEqual(chat.origin.parentChat, activeChatResource))
			.forEach((chat, index) => registerToggle(chat, '2_subagents', index));

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
