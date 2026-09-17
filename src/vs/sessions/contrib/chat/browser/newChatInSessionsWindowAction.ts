/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { EditorAreaFocusContext, SideBarVisibleContext } from '../../../../workbench/common/contextkeys.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { Menus } from '../../../browser/menus.js';
import { SessionsBoardVisibleContext, SessionsTitleBarNewSessionEnabledContext, SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { ISessionsBoardService } from '../../../services/sessions/browser/sessionsBoardService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { inheritableSessionTarget, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { NEW_SESSION_ACTION_ID } from '../common/constants.js';

export class NewChatInSessionsWindowAction extends Action2 {
	constructor() {
		super({
			id: NEW_SESSION_ACTION_ID,
			title: localize2('sessions.newSession.label', "New Session"),
			category: CHAT_CATEGORY,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				when: EditorAreaFocusContext.negate(),
				primary: KeyMod.CtrlCmd | KeyCode.KeyN,
				secondary: [KeyMod.CtrlCmd | KeyCode.KeyL],
				mac: {
					primary: KeyMod.CtrlCmd | KeyCode.KeyN,
					secondary: [KeyMod.WinCtrl | KeyCode.KeyL],
				},
			},
			menu: [
				{ id: Menus.SidebarSessionsHeader, group: 'navigation', order: 0, when: SessionsBoardVisibleContext.negate() },
				{ id: Menus.SessionsBoardControls, group: 'navigation', order: 0, when: SessionsBoardVisibleContext },
				{
					id: Menus.TitleBarLeftLayout,
					group: 'navigation',
					order: 1,
					when: ContextKeyExpr.and(SideBarVisibleContext.toNegated(), SessionsWelcomeVisibleContext.toNegated(), SessionsTitleBarNewSessionEnabledContext, SessionsBoardVisibleContext.negate()),
				},
			],
		});
	}

	override async run(accessor: ServicesAccessor, options?: { toSide?: boolean }): Promise<void> {
		const sessionsService = accessor.get(ISessionsService);
		if (sessionsService.isSessionBoardVisible.get()) {
			const board = accessor.get(ISessionsBoardService).activeView.get();
			if (!board?.startNewWork) { throw new Error(localize('sessions.newSession.dashboardUnavailable', "The work dashboard is not ready. Reopen it and try again.")); }
			await board.startNewWork();
			return;
		}
		const management = accessor.get(ISessionsManagementService);
		const activeSession = sessionsService.activeSession.get();
		// Quick Chat scratch directories must not seed new workspace sessions.
		const folderUri = activeSession?.isQuickChat?.get() ? undefined : activeSession?.workspace.get()?.uri;
		await sessionsService.openNewSession({
			folderUri,
			toSide: options?.toSide,
			...inheritableSessionTarget(management, activeSession, folderUri),
		});
	}
}
