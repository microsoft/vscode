/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import { Event } from '../../../util/vs/base/common/event';
import { IHeaders } from '../../networking/common/fetcherService';

/**
 * This is the quota info we get from the `copilot_internal/user` endpoint.
 * It is accessed via the copilot token object
 */
export interface CopilotUserQuotaInfo {
	quota_reset_date?: string;
	quota_snapshots?: {
		chat: {
			quota_id: string;
			entitlement: number;
			remaining: number;
			unlimited: boolean;
			overage_count: number;
			overage_permitted: boolean;
			percent_remaining: number;
		};
		completions: {
			quota_id: string;
			entitlement: number;
			remaining: number;
			unlimited: boolean;
			overage_count: number;
			overage_permitted: boolean;
			percent_remaining: number;
		};
		premium_interactions: {
			quota_id: string;
			entitlement: number;
			remaining: number;
			unlimited: boolean;
			overage_count: number;
			overage_permitted: boolean;
			percent_remaining: number;
		};
	};
}

export interface IChatQuota {
	quota: number;
	percentRemaining: number;
	unlimited: boolean;
	additionalUsageUsed: number;
	additionalUsageEnabled: boolean;
	resetDate: Date;
}

export interface QuotaSnapshot {
	/** String representation of the entitlement count, "-1" for unlimited. */
	readonly entitlement: string;
	/** Percentage of quota remaining (0–100), rounded up to 1 decimal. */
	readonly percent_remaining: number;
	/** Whether additional usage (usage beyond included credits) is permitted. */
	readonly overage_permitted: boolean;
	/** Number of additional usage units consumed, rounded up to 1 decimal. */
	readonly overage_count: number;
	/** ISO 8601 date when the quota resets, if applicable. */
	readonly reset_date?: string;
}

export type QuotaSnapshots = Record<string, QuotaSnapshot>;

export interface IChatQuotaChangeEvent {
	/**
	 * AIC credits consumed by the chat request that produced this event.
	 *
	 * Present only when fired from {@link IChatQuotaService.setLastCopilotUsage},
	 * i.e. after the response body has been fully consumed and the server has
	 * reported `copilot_usage.total_nano_aiu`.
	 *
	 * The accompanying {@link IChatQuotaService.quotaInfo} reflects the **pre-request**
	 * state (the server returns quota data as of *before* the request was processed).
	 * Consumers can combine the stale `quotaInfo` with `creditsUsed` to estimate
	 * the true post-request usage and decide whether to call
	 * {@link IChatQuotaService.refreshQuota} for an authoritative update.
	 */
	readonly creditsUsed?: number;
}

export interface IChatQuotaService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<IChatQuotaChangeEvent>;
	readonly quotaInfo: IChatQuota | undefined;
	readonly rateLimitInfo: { readonly session: IChatQuota | undefined; readonly weekly: IChatQuota | undefined };
	quotaExhausted: boolean;
	additionalUsageEnabled: boolean;
	/** AIC credits accumulated for the given turn, from copilot_usage.total_nano_aiu. */
	getCreditsForTurn(turnId: string): number | undefined;
	processQuotaHeaders(headers: IHeaders): void;
	processQuotaSnapshots(snapshots: QuotaSnapshots): void;
	/** Accumulate per-request cost from copilot_usage.total_nano_aiu (in nano-AIUs), scoped to a turn. */
	setLastCopilotUsage(totalNanoAiu: number, turnId: string): void;
	/** Reset accumulated credits for the given turn. */
	resetTurnCredits(turnId: string): void;
	clearQuota(): void;
	/**
	 * Triggers a debounced fetch to the `copilot_internal/user` endpoint
	 * to get up-to-date quota data. Fire-and-forget — errors are logged.
	 */
	refreshQuota(): void;
}

export const IChatQuotaService = createServiceIdentifier<IChatQuotaService>('IChatQuotaService');
