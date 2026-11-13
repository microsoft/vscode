/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { URI } from '../../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ActiveEditorContext, EditorAreaFocusContext } from '../../../../common/contextkeys.js';
import { CHAT_CATEGORY } from '../../../chat/browser/actions/chatActions.js';
import { INewSessionInAgentsWindowOptions } from '../../../chat/common/chatSessionsService.js';
import { Menus } from '../menus.js';
import { resolveDevContainerSourceWorkspace } from '../openInVSCodeUtils.js';
import { isAgentHostProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../common/agentHostSessionsProvider.js';
import { SessionsListRearrangeContext } from '../../common/contextkeys.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsProvidersService } from '../sessionsProvidersService.js';
import { ISessionsRecentWorkspacesService } from '../sessionsRecentWorkspacesService.js';
import { ISessionsService } from '../sessionsService.js';
import { getMainWindowHost, ISessionHostService } from '../../../../services/sessions/browser/sessionHost.js';
import { ICustomViewService } from '../customView.js';
import { WindowCanvasInput, IWindowCanvasService } from '../windowCanvas.js';
import { ICreateNewSessionOptions, inheritableSessionTarget, ISessionsManagementService } from '../../common/sessionsManagement.js';
import { NEW_SESSION_ACTION_ID } from '../../common/chatConstants.js';
import { INewSessionComposerService } from '../newSessionComposerService.js';
import { ISessionDraftsService } from '../sessionDraftsService.js';
import { ISession, isSessionCreated } from '../../../../services/sessions/common/session.js';

/** The folder, provider and agent a new session inherits ({@link getInheritedNewSessionTarget}). */
export interface IInheritedNewSessionTarget extends Pick<ICreateNewSessionOptions, 'providerId' | 'sessionTypeId'> {
	readonly folderUri?: URI;
	/** Whether the new session starts in a Dev Container, as `session` does. */
	readonly requireDevContainer?: boolean;
}

/**
 * What a new session started from `session` inherits: its workspace folder (the source folder of its Dev Container), and
 * its provider and agent where that folder offers them. Nothing without a session or a workspace, such as for a
 * quick chat, for which callers pass no session.
 */
export function getInheritedNewSessionTarget(sessionsManagementService: ISessionsManagementService, sessionsProvidersService: ISessionsProvidersService, session: ISession | undefined): IInheritedNewSessionTarget {
	const activeFolderUri = session?.workspace.get()?.uri;
	const activeProvider = activeFolderUri && session ? sessionsProvidersService.getProvider(session.providerId, session.sessionId) : undefined;
	const devContainerSource = resolveDevContainerSourceWorkspace(activeProvider);
	const folderUri = devContainerSource?.folderUri ?? activeFolderUri;
	const draftRequestsDevContainer = !!session && !!activeProvider && isAgentHostProvider(activeProvider)
		&& activeProvider.isDevContainerRequested?.(session.sessionId) === true;
	const containerSourceProviderId = devContainerSource?.providerId ?? (draftRequestsDevContainer ? session?.providerId : undefined);
	const inheritedTarget = inheritableSessionTarget(
		sessionsManagementService,
		devContainerSource && session
			? { providerId: devContainerSource.providerId, sessionType: session.sessionType }
			: session,
		folderUri,
	);
	return {
		folderUri,
		...(containerSourceProviderId ? { providerId: containerSourceProviderId } : {}),
		...inheritedTarget,
		...(containerSourceProviderId ? { requireDevContainer: true } : {}),
	};
}

export class NewChatInSessionsWindowAction extends Action2 {

	constructor() {
		super({
			id: NEW_SESSION_ACTION_ID,
			title: localize2('sessions.newSession.label', "New Session"),
			icon: Codicon.add,
			category: CHAT_CATEGORY,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				when: ContextKeyExpr.or(EditorAreaFocusContext.negate(), ActiveEditorContext.isEqualTo(WindowCanvasInput.EDITOR_ID)),
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
			]
		});
	}

	override async run(accessor: ServicesAccessor, options?: INewSessionInAgentsWindowOptions): Promise<URI | undefined> {
		accessor.get(INewSessionComposerService).notifyUserNavigation();
		if (!options?.toSide && !options?.prompt && !options?.prefillPrompt && !options?.noWorkspace && !options?.agentHostProvider) {
			const request = accessor.get(ICustomViewService).activeCustomView.get()?.openNewSession?.()
				?? accessor.get(IWindowCanvasService).openNewSession();
			if (request) {
				await request;
				return;
			}
		}
		const sessionsService = accessor.get(ISessionsService);
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const sessionsPartService = options?.prompt ? accessor.get(ISessionsPartService) : undefined;
		// New sessions open in the main window, from the session it shows.
		const mainWindowHost = getMainWindowHost(accessor.get(ISessionHostService));
		const activeSession = mainWindowHost.session.get();
		if (!options?.toSide) {
			accessor.get(ISessionDraftsService).stowAndClear();
		}
		const sendPrompt = (): void => {
			if (!options?.prompt) {
				return;
			}
			const sessionView = sessionsPartService?.getSessionView(mainWindowHost.session.get()?.sessionId);
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
		if (isQuickChat && activeSession && !isSessionCreated(activeSession) && !options?.toSide) {
			const recentWorkspacesService = accessor.get(ISessionsRecentWorkspacesService);
			const partService = accessor.get(ISessionsPartService);
			if (recentWorkspacesService.isNoWorkspaceChecked()) {
				recentWorkspacesService.clearCheckedWorkspace();
			}
			sessionsService.unsetNewSession();
			await sessionsService.openNewSession();
			partService.getSessionView(mainWindowHost.session.get()?.sessionId)?.focusWorkspacePicker();
			sendPrompt();
			return;
		}
		const { session } = await sessionsService.openNewSession({
			toSide: options?.toSide,
			...getInheritedNewSessionTarget(sessionsManagementService, accessor.get(ISessionsProvidersService), isQuickChat ? undefined : activeSession),
		});
		sendPrompt();
		return session?.resource;
	}
}
