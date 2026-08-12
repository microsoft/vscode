/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ChatSessionArchiveActionWording, ChatSessionArchiveActionWordingSettingId, getChatSessionArchiveActionWording } from '../../../../platform/chat/common/sessionArchiveActions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';
import { IChatSlashCommandService } from '../../../../workbench/contrib/chat/common/participants/chatSlashCommands.js';
import { IWorkbenchEnvironmentService } from '../../../../workbench/services/environment/common/environmentService.js';
import { SessionIsArchivedContext, SessionIsCreatedContext } from '../../../common/contextkeys.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

/**
 * `/clear` for the Agents window.
 *
 * The classic workbench registers its own `/clear` in
 * `workbench/contrib/chat/browser/chatSlashCommands.ts`, but that one archives
 * through `IAgentSessionsService` and starts a new chat through
 * `ACTION_ID_NEW_CHAT` — neither of which reaches the Agents window, whose
 * sessions are owned by the sessions providers and whose new-session flow is
 * `ISessionsService.openNewSession`. The core registration is skipped in this
 * window so this one can take its place.
 */
export class ClearSlashCommandContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.clearSlashCommand';

	constructor(
		@IChatSlashCommandService slashCommandService: IChatSlashCommandService,
		@ISessionsService sessionsService: ISessionsService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@ILogService logService: ILogService,
		@INotificationService notificationService: INotificationService,
	) {
		super();

		if (!environmentService.isSessionsWindow) {
			return;
		}

		const registration = this._register(new MutableDisposable());
		const register = () => {
			const wording = getChatSessionArchiveActionWording(configurationService);
			registration.clear();
			registration.value = slashCommandService.registerSlashCommand({
				command: 'clear',
				detail: wording === ChatSessionArchiveActionWording.MarkAsDone
					? localize('clear.markDone', "Start a new chat and mark the current one as done")
					: localize('clear.archive', "Start a new chat and archive the current one"),
				sortText: 'z2_clear',
				executeImmediately: true,
				// Archiving hides the session, so adding a `/clear` turn to it
				// would only leave a stray request behind.
				silent: true,
				locations: [ChatAgentLocation.Chat],
				when: ContextKeyExpr.and(
					IsSessionsWindowContext,
					SessionIsCreatedContext,
					SessionIsArchivedContext.negate(),
				),
			}, async (_prompt, _progress, _history, _location, sessionResource) => {
				const found = sessionsManagementService.getSessionForChatResource(sessionResource);
				if (!found) {
					logService.warn(`[clear] No session found for chat resource ${sessionResource.toString()}`);
					notificationService.warn(localize('clear.sessionUnavailable', "This conversation cannot be cleared."));
					return;
				}

				const { session } = found;
				if (!session.isArchived.get()) {
					await sessionsManagementService.archiveSession(session);
				}
				await sessionsService.openNewSession();
			});
		};
		register();
		this._register(configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(ChatSessionArchiveActionWordingSettingId)) {
				register();
			}
		}));
	}
}

registerWorkbenchContribution2(ClearSlashCommandContribution.ID, ClearSlashCommandContribution, WorkbenchPhase.Eventually);
