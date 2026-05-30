/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { fromNow } from '../../../../base/common/date.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { Menus } from '../../../browser/menus.js';
import { SessionsCategories } from '../../../common/categories.js';
import { CanGoBackContext, CanGoForwardContext, MultipleSessionsVisibleContext, SessionIsCreatedContext, SessionIsMaximizedContext, SessionIsStickyContext, SessionSupportsMultipleChatsContext, SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionsPartService } from '../../../browser/parts/sessionsPartService.js';

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
				weight: KeybindingWeight.WorkbenchContrib + 1,
				when: IsSessionsWindowContext,
			},
		});
	}

	override async run(accessor: ServicesAccessor) {
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const quickInputService = accessor.get(IQuickInputService);

		const sessions = sessionsManagementService.getSessions()
			.filter(s => !s.isArchived.get())
			.sort((a, b) => b.updatedAt.get().getTime() - a.updatedAt.get().getTime());

		const activeSessionId = sessionsManagementService.activeSession.get()?.sessionId;

		interface ISessionPickItem extends IQuickPickItem {
			session?: ISession;
		}

		const items: (ISessionPickItem | IQuickPickSeparator)[] = [];

		// New session item
		items.push({
			label: `$(add) ${localize('newSession', "New Session")}`,
			session: undefined,
		});

		if (sessions.length > 0) {
			items.push({ type: 'separator', label: localize('recentSessions', "Recent Sessions") });

			for (const session of sessions) {
				const title = session.title.get() || localize('untitledSession', "New Session");
				const workspace = session.workspace.get();
				const parts: string[] = [];
				if (workspace) {
					parts.push(workspace.label);
				}
				parts.push(fromNow(session.updatedAt.get(), true, true));

				items.push({
					label: title,
					description: parts.join(' \u00B7 '),
					iconClass: ThemeIcon.asClassName(session.icon),
					session,
					picked: activeSessionId !== undefined && session.sessionId === activeSessionId,
				});
			}
		}

		const picker = quickInputService.createQuickPick<ISessionPickItem>({ useSeparators: true });
		picker.items = items;
		picker.placeholder = localize('searchSessions', "Search sessions by name");
		picker.canAcceptInBackground = true;

		const disposables = new DisposableStore();
		disposables.add(picker);

		disposables.add(picker.onDidAccept(() => {
			const [selected] = picker.selectedItems;
			if (selected) {
				if (selected.session) {
					sessionsManagementService.openSession(selected.session.resource);
				} else {
					sessionsManagementService.openNewSessionView();
				}
			}
			picker.hide();
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
			category: SessionsCategories.Sessions,
			precondition: CanGoBackContext,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				win: { primary: KeyMod.Alt | KeyCode.LeftArrow },
				mac: { primary: KeyMod.WinCtrl | KeyCode.Minus },
				linux: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Minus },
				when: ContextKeyExpr.and(IsSessionsWindowContext, EditorContextKeys.editorTextFocus.toNegated()),
			},
			menu: [{
				id: Menus.TitleBarLeftLayout,
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
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		await sessionsManagementService.openPreviousSession();
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
			category: SessionsCategories.Sessions,
			precondition: CanGoForwardContext,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				win: { primary: KeyMod.Alt | KeyCode.RightArrow },
				mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Minus },
				linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Minus },
				when: ContextKeyExpr.and(IsSessionsWindowContext, EditorContextKeys.editorTextFocus.toNegated()),
			},
			menu: [{
				id: Menus.TitleBarLeftLayout,
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
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		await sessionsManagementService.openNextSession();
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
				weight: KeybindingWeight.WorkbenchContrib + 1,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyI,
				mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KeyI },
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const sessionsPartService = accessor.get(ISessionsPartService);
		sessionsPartService.focusSession(sessionsManagementService.activeSession.get());
	}
});

registerAction2(class AddChatToSessionBarAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.chatCompositeBar.addChat',
			title: localize2('chatCompositeBar.addChat', "New Chat"),
			icon: Codicon.add,
			menu: {
				id: Menus.SessionBarInlineToolbar,
				when: ContextKeyExpr.and(SessionIsCreatedContext, SessionSupportsMultipleChatsContext),
				group: 'navigation',
				order: 10,
			},
		});
	}

	override async run(accessor: ServicesAccessor, session: IActiveSession | undefined): Promise<void> {
		if (!session) {
			return;
		}
		accessor.get(ISessionsManagementService).openNewChatInSession(session);
	}
});

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
				group: 'navigation',
				order: 10,
				when: SessionIsCreatedContext,
			},
		});
	}

	override async run(accessor: ServicesAccessor, session: IActiveSession | undefined): Promise<void> {
		if (!session) {
			return;
		}
		accessor.get(ISessionsManagementService).toggleSessionStickiness(session);
	}
});

registerAction2(class CloseSessionAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.chatCompositeBar.close',
			title: localize2('chatCompositeBar.close', "Close"),
			icon: Codicon.close,
			menu: {
				id: Menus.SessionBarToolbar,
				when: ContextKeyExpr.or(SessionIsCreatedContext, MultipleSessionsVisibleContext),
				group: 'navigation',
				order: 30,
			},
		});
	}

	override async run(accessor: ServicesAccessor, session: IActiveSession | undefined): Promise<void> {
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const sessionsPartService = accessor.get(ISessionsPartService);

		sessionsManagementService.closeSession(session);
		sessionsPartService.focusSession(sessionsManagementService.activeSession.get());
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
				group: 'navigation',
				order: 20,
			},
		});
	}

	override async run(accessor: ServicesAccessor, session: IActiveSession | undefined): Promise<void> {
		accessor.get(ISessionsPartService).toggleMaximizeSession(session);
		accessor.get(ISessionsManagementService).setActive(session);
	}
});
