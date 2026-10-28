/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { URI } from '../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { EditorAreaFocusContext, SideBarVisibleContext } from '../../../../workbench/common/contextkeys.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { INewSessionInAgentsWindowOptions } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { Menus } from '../../../browser/menus.js';
import { resolveDevContainerSourceWorkspace } from '../../../browser/openInVSCodeUtils.js';
import { isAgentHostProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../common/agentHostSessionsProvider.js';
import { SessionsListRearrangeContext, SessionsTitleBarNewSessionEnabledContext, SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { ISessionsPartService } from '../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsRecentWorkspacesService } from '../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { inheritableSessionTarget, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { NEW_SESSION_ACTION_ID } from '../common/constants.js';
import { INewSessionComposerService } from './newSessionComposerService.js';

export class NewChatInSessionsWindowAction extends Action2 {

	constructor() {
		super({
			id: NEW_SESSION_ACTION_ID,
			title: localize2('sessions.newSession.label', "New Session"),
			category: CHAT_CATEGORY,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				// Leave the standard editor commands in charge when the editor area has focus.
				when: EditorAreaFocusContext.negate(),
				primary: KeyMod.CtrlCmd | KeyCode.KeyN,
				secondary: [KeyMod.CtrlCmd | KeyCode.KeyL],
				mac: {
					primary: KeyMod.CtrlCmd | KeyCode.KeyN,
					secondary: [KeyMod.WinCtrl | KeyCode.KeyL]
				},
			},
			menu: [
				{
					id: Menus.SidebarSessionsHeader,
					group: 'navigation',
					order: 0,
					when: SessionsListRearrangeContext.negate(),
				},
				{
					id: Menus.TitleBarLeftLayout,
					group: 'navigation',
					order: 1,
					when: ContextKeyExpr.and(SideBarVisibleContext.toNegated(), SessionsWelcomeVisibleContext.toNegated(), SessionsTitleBarNewSessionEnabledContext)
				}
			]
		});
	}

	override async run(accessor: ServicesAccessor, options?: INewSessionInAgentsWindowOptions): Promise<URI | undefined> {
		accessor.get(INewSessionComposerService).notifyUserNavigation();
		const sessionsService = accessor.get(ISessionsService);
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const sessionsPartService = options?.prompt ? accessor.get(ISessionsPartService) : undefined;
		const activeSession = sessionsService.activeSession.get();
		const sendPrompt = (): void => {
			if (!options?.prompt) {
				return;
			}
			const sessionId = sessionsService.activeSession.get()?.sessionId;
			const sessionView = sessionsPartService?.getSessionView(sessionId);
			if (!sessionView) {
				throw new Error(localize('sessions.newSession.chatUnavailable', "The new session chat is unavailable."));
			}
			if (options.prefillPrompt) {
				sessionView.prefillInput(options.prompt);
			} else {
				sessionView.sendQuery(options.prompt);
			}
		};
		if (options?.noWorkspace) {
			const target = options.agentHostProvider ? {
				providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
				sessionTypeId: options.agentHostProvider,
			} : activeSession ? {
				providerId: activeSession.providerId,
				sessionTypeId: activeSession.sessionType,
			} : undefined;
			const availableTarget = target && sessionsManagementService.isQuickChatTargetAvailable(target) ? target : undefined;
			if (options.agentHostProvider && !availableTarget) {
				throw new Error(localize('sessions.newSession.agentUnavailable', "The requested Agent Host provider '{0}' is unavailable.", options.agentHostProvider));
			}
			const session = sessionsService.openQuickChat(availableTarget, true);
			if (options.agentHostProvider && !session) {
				throw new Error(localize('sessions.newSession.creationFailed', "Could not create a session for Agent Host provider '{0}'.", options.agentHostProvider));
			}
			sendPrompt();
			return session?.resource;
		}
		// Clear the no-workspace latch before unsetNewSession(), or the replacement composer recreates the quick chat.
		const isQuickChat = activeSession?.isQuickChat?.get() ?? false;
		if (isQuickChat && activeSession?.isCreated?.get() === false && !options?.toSide) {
			const recentWorkspacesService = accessor.get(ISessionsRecentWorkspacesService);
			if (recentWorkspacesService.isNoWorkspaceChecked()) {
				recentWorkspacesService.clearCheckedWorkspace();
			}
			sessionsService.unsetNewSession();
			const replacementSessionId = sessionsService.activeSession.get()?.sessionId;
			accessor.get(ISessionsPartService).getSessionView(replacementSessionId)?.focusWorkspacePicker();
			sendPrompt();
			return;
		}
		const activeFolderUri = isQuickChat ? undefined : activeSession?.workspace.get()?.uri;
		const activeProvider = activeFolderUri && activeSession
			? accessor.get(ISessionsProvidersService).getProvider(activeSession.providerId)
			: undefined;
		const devContainerSource = resolveDevContainerSourceWorkspace(activeProvider);
		const folderUri = devContainerSource?.folderUri ?? activeFolderUri;
		const draftRequestsDevContainer = !!activeSession && !!activeProvider && isAgentHostProvider(activeProvider)
			&& activeProvider.isDevContainerRequested?.(activeSession.sessionId) === true;
		const containerSourceProviderId = devContainerSource?.providerId ?? (draftRequestsDevContainer ? activeSession?.providerId : undefined);
		const inheritedTarget = inheritableSessionTarget(
			sessionsManagementService,
			devContainerSource && activeSession
				? { providerId: devContainerSource.providerId, sessionType: activeSession.sessionType }
				: activeSession,
			folderUri,
		);
		const { session } = await sessionsService.openNewSession({
			folderUri,
			toSide: options?.toSide,
			...(containerSourceProviderId ? { providerId: containerSourceProviderId } : {}),
			...inheritedTarget,
			...(containerSourceProviderId ? { requireDevContainer: true } : {}),
		});
		sendPrompt();
		return session?.resource;
	}
}
