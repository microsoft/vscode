/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IntervalTimer } from '../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { MessageKind } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ChatEntitlement, IChatEntitlementService, isProUser } from '../../../services/chat/common/chatEntitlementService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { ILifecycleService, LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IChatService } from '../common/chatService/chatService.js';
import { ChatDailyUsage, IChatDailyUsageTelemetry } from '../common/chatDailyUsage.js';

type ChatDailyUsageEvent = IChatDailyUsageTelemetry & {
	readonly plan: string;
};

type ChatDailyUsageClassification = {
	plan: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Copilot plan of the signed-in user as a ChatEntitlement name, e.g. Free, Pro or Business.' };
	messagesLast7Days: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Chat messages the user sent on this machine during the current and previous 6 UTC days.' };
	messagesLast30Days: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Chat messages the user sent on this machine during the current and previous 29 UTC days.' };
	messagesTotal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Chat messages the user sent on this machine. Starts from editor chat messages and Agents Window session starts recorded before tracking began, so it is a lower bound.' };
	sessionsLast7Days: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Chats and sessions the user started on this machine, by sending their first message, during the current and previous 6 UTC days.' };
	sessionsLast30Days: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Chats and sessions the user started on this machine, by sending their first message, during the current and previous 29 UTC days.' };
	sessionsTotal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Chats and sessions the user started on this machine. Starts from editor chat and Agents Window sessions recorded before tracking began.' };
	minutesSinceLastMessage: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Minutes since the user last sent a chat message on this machine. Includes editor chat messages and Agents Window session starts recorded before this event existed. Absent when no usage was recorded.' };
	trackedDays: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'UTC days since this machine started recording daily chat usage, capped at 30. The 7 and 30 day counts cover all of their days once this reaches 7 and 30.' };
	owner: 'benibenj';
	comment: 'Daily summary of chat messages and new chats or sessions across all windows on this machine, sent at most once per UTC day for users with a Copilot plan.';
};

const reportCheckInterval = 60 * 60 * 1000;

function hasCopilotPlan(entitlement: ChatEntitlement): boolean {
	return entitlement === ChatEntitlement.Free || isProUser(entitlement);
}

/** Records the user's chat messages and reports recent usage once per UTC day for users with a Copilot plan. */
export class ChatDailyUsageContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chatDailyUsage';

	constructor(
		@IChatService chatService: IChatService,
		@IStorageService storageService: IStorageService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHostService hostService: IHostService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
	) {
		super();
		const usage = new ChatDailyUsage(storageService);
		usage.startTracking();
		this._register(chatService.onDidAcceptRequest(event => {
			// Messages an agent, tool or automation produced are not the user's own activity.
			if (!event.agentHostMessageOrigin || event.agentHostMessageOrigin.kind === MessageKind.User) {
				usage.recordMessage(event.isNewSession);
			}
		}));

		let startupCompleted = false;
		const report = async () => {
			const entitlement = chatEntitlementService.entitlement;
			// Only a focused window tries to claim the day's report, and the atomic claim lets at most one window send it.
			if (!startupCompleted || !hostService.hasFocus || !hasCopilotPlan(entitlement)) {
				return;
			}
			const telemetry = await usage.takeDailyReport();
			if (telemetry) {
				telemetryService.publicLog2<ChatDailyUsageEvent, ChatDailyUsageClassification>('chatDailyUsage', { plan: ChatEntitlement[entitlement], ...telemetry });
			}
		};
		const reportIfDue = () => {
			report().catch(onUnexpectedError);
		};
		this._register(hostService.onDidChangeFocus(focused => {
			if (focused) {
				reportIfDue();
			}
		}));
		this._register(chatEntitlementService.onDidChangeEntitlement(reportIfDue));
		this._register(new IntervalTimer()).cancelAndSet(reportIfDue, reportCheckInterval);
		lifecycleService.when(LifecyclePhase.Eventually).then(() => {
			if (!this._store.isDisposed) {
				startupCompleted = true;
				reportIfDue();
			}
		});
	}
}
