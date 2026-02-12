/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IAgentTitleBarStatusService, AgentStatusMode } from './agentTitleBarStatusService.js';
import { IAgentSessionsService } from '../agentSessionsService.js';
import { isSessionInProgressStatus, AgentSessionStatus } from '../agentSessionsModel.js';
import { IAgentSessionStatusMainService, AgentSessionNativeStatusMode, IAgentSessionNativeStatusInfo } from '../../../../../platform/agentSession/common/agentSession.js';
import { IChatWidgetService } from '../../chat.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';

/**
 * Contribution that synchronizes agent session status from the workbench
 * to the native menu bar/system tray in the main process.
 */
export class AgentSessionNativeStatusContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'chat.agentSessionNativeStatus';

	constructor(
		@IAgentTitleBarStatusService private readonly agentTitleBarStatusService: IAgentTitleBarStatusService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IAgentSessionStatusMainService private readonly agentSessionStatusMainService: IAgentSessionStatusMainService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
	) {
		super();

		// Only enable this feature if Chat is enabled and not hidden
		if (this.chatEntitlementService.sentiment.hidden) {
			return;
		}

		// Initial update
		this._updateNativeStatus();

		// Update when status mode or session info changes
		this._register(this.agentTitleBarStatusService.onDidChangeMode(() => {
			this._updateNativeStatus();
		}));

		this._register(this.agentTitleBarStatusService.onDidChangeSessionInfo(() => {
			this._updateNativeStatus();
		}));

		// Update when sessions change (for counts)
		this._register(this.agentSessionsService.model.onDidChangeSessions(() => {
			this._updateNativeStatus();
		}));

		// Update when chat entitlement changes (e.g., user disables AI features)
		this._register(this.chatEntitlementService.onDidChangeSentiment(() => {
			if (this.chatEntitlementService.sentiment.hidden) {
				// Clear the native status when AI features are disabled
				this.agentSessionStatusMainService.updateStatus({
					mode: AgentSessionNativeStatusMode.Default,
					sessionTitle: undefined,
					activeSessionsCount: 0,
					unreadSessionsCount: 0,
					attentionNeededCount: 0,
				});
			} else {
				this._updateNativeStatus();
			}
		}));
	}

	private _updateNativeStatus(): void {
		// Don't update if AI features are hidden
		if (this.chatEntitlementService.sentiment.hidden) {
			return;
		}

		const mode = this.agentTitleBarStatusService.mode;
		const sessionInfo = this.agentTitleBarStatusService.sessionInfo;

		// Calculate session statistics
		const sessions = this.agentSessionsService.model.sessions;
		const activeSessions = sessions.filter(s => isSessionInProgressStatus(s.status) && !s.isArchived());
		const unreadSessions = sessions.filter(s => !s.isRead());
		const attentionNeededSessions = sessions.filter(s =>
			s.status === AgentSessionStatus.NeedsInput &&
			!this.chatWidgetService.getWidgetBySessionResource(s.resource)
		);

		// Map workbench mode to native status mode
		let nativeMode: AgentSessionNativeStatusMode;
		switch (mode) {
			case AgentStatusMode.Session:
				nativeMode = AgentSessionNativeStatusMode.Session;
				break;
			case AgentStatusMode.SessionReady:
				nativeMode = AgentSessionNativeStatusMode.SessionReady;
				break;
			case AgentStatusMode.Default:
			default:
				nativeMode = AgentSessionNativeStatusMode.Default;
				break;
		}

		// Build status info
		const statusInfo: IAgentSessionNativeStatusInfo = {
			mode: nativeMode,
			sessionTitle: sessionInfo?.title,
			activeSessionsCount: activeSessions.length,
			unreadSessionsCount: unreadSessions.length,
			attentionNeededCount: attentionNeededSessions.length,
		};

		// Send to main process
		this.agentSessionStatusMainService.updateStatus(statusInfo);
	}
}
