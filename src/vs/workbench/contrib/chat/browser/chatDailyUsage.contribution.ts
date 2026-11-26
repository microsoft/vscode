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
import { ChatEntitlement, getQuotaUsage, IChatEntitlementService, isProUser, QuotaUsageKind } from '../../../services/chat/common/chatEntitlementService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { ILifecycleService, LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IChatService } from '../common/chatService/chatService.js';
import { ChatDailyUsage, IChatDailyUsageTelemetry } from '../common/chatDailyUsage.js';

interface ICreditUsage {
	readonly creditsUsed: number | undefined;
	readonly creditsTotal: number | undefined;
}

type ChatDailyUsageEvent = IChatDailyUsageTelemetry & ICreditUsage & {
	readonly plan: string;
	readonly aiFeaturesDisabled: boolean;
};

type ChatDailyUsageClassification = {
	plan: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Copilot plan of the signed-in user as a ChatEntitlement name, e.g. Free, Pro or Business.' };
	aiFeaturesDisabled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether built-in AI features are disabled and hidden in the window that sent this event, e.g. by the chat.disableAIFeatures setting or an account policy. Same as chatHidden in chatEntitlements. The setting can differ per workspace.' };
	creditsUsed: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Included AI credits the user consumed in the current billing period, as last reported to this window. Only for users on usage-based billing. Excludes additional spend. Absent when unknown.' };
	creditsTotal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Included AI credits of the user for the current billing period, as last reported to this window. Only for users on usage-based billing. Excludes additional spend. Absent for unlimited organization plans and when unknown. creditsTotal minus creditsUsed is the remaining credits.' };
	messagesLast7Days: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Chat messages the user sent on this machine during the current and previous 6 UTC days.' };
	messagesLast30Days: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Chat messages the user sent on this machine during the current and previous 29 UTC days.' };
	messagesTotal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Chat messages the user sent on this machine. Starts from editor chat messages and Agents Window session starts recorded before tracking began, so it is a lower bound.' };
	sessionsLast7Days: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Chats and sessions the user started on this machine, by sending their first message, during the current and previous 6 UTC days.' };
	sessionsLast30Days: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Chats and sessions the user started on this machine, by sending their first message, during the current and previous 29 UTC days.' };
	sessionsTotal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Chats and sessions the user started on this machine. Starts from editor chat and Agents Window sessions recorded before tracking began.' };
	activeDaysLast7Days: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'UTC days, among the current and previous 6, on which the user sent at least one chat message on this machine.' };
	activeDaysLast30Days: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'UTC days, among the current and previous 29, on which the user sent at least one chat message on this machine.' };
	activeDaysTotal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'UTC days on which the user sent at least one chat message on this machine since it started recording daily chat usage. Unlike the message and session totals, it does not include usage from before tracking began.' };
	minutesSinceLastMessage: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Minutes since the user last sent a chat message on this machine. Like the message counts, excludes messages sent by agents, tools or automations. Before tracking began, falls back to the last editor chat message or Agents Window session start recorded by older counters. Absent when no usage was recorded.' };
	trackedDays: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'UTC days since this machine started recording daily chat usage, capped at 30. The 7 and 30 day counts cover all of their days once this reaches 7 and 30.' };
	owner: 'benibenj';
	comment: 'Daily summary of chat messages, active days, new chats or sessions across all windows on this machine and included AI credits, sent at most once per UTC day for users with a Copilot plan, including users who disabled AI features.';
};

const reportCheckInterval = 60 * 60 * 1000;

function hasCopilotPlan(entitlement: ChatEntitlement): boolean {
	return entitlement === ChatEntitlement.Free || isProUser(entitlement);
}

/**
 * Included AI credits of users on usage-based billing, from the quota the Copilot status dashboard shows as credits.
 * Unlimited organization plans only report credits used.
 */
export function getCreditUsage(entitlement: ChatEntitlement, quotas: IChatEntitlementService['quotas']): ICreditUsage {
	if (!quotas.usageBasedBilling) {
		return { creditsUsed: undefined, creditsTotal: undefined };
	}
	// Copilot Free counts its credits in the chat quota rather than the premium one.
	const usage = getQuotaUsage(entitlement === ChatEntitlement.Free ? quotas.chat : quotas.premiumChat);
	switch (usage?.kind) {
		case QuotaUsageKind.Percentage:
			return { creditsUsed: usage.used, creditsTotal: usage.total };
		case QuotaUsageKind.CreditsUsed:
			return { creditsUsed: usage.creditsUsed, creditsTotal: undefined };
		default:
			return { creditsUsed: undefined, creditsTotal: undefined };
	}
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
			const aiFeaturesDisabled = chatEntitlementService.sentiment.hidden === true;
			const credits = getCreditUsage(entitlement, chatEntitlementService.quotas);
			// Only a focused window tries to claim the day's report, and the atomic claim lets at most one window send it.
			if (!startupCompleted || !hostService.hasFocus || !hasCopilotPlan(entitlement)) {
				return;
			}
			const telemetry = await usage.takeDailyReport();
			if (telemetry) {
				telemetryService.publicLog2<ChatDailyUsageEvent, ChatDailyUsageClassification>('chatDailyUsage', { plan: ChatEntitlement[entitlement], aiFeaturesDisabled, ...credits, ...telemetry });
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
