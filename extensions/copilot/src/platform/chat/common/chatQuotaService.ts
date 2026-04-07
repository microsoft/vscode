/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
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
	used: number;
	unlimited: boolean;
	overageUsed: number;
	overageEnabled: boolean;
	resetDate: Date;
}

export interface QuotaSnapshot {
	/** String representation of the entitlement count, "-1" for unlimited. */
	readonly entitlement: string;
	/** Percentage of quota remaining (0–100), rounded up to 1 decimal. */
	readonly percent_remaining: number;
	/** Whether overage (usage beyond entitlement) is permitted. */
	readonly overage_permitted: boolean;
	/** Number of overage units consumed, rounded up to 1 decimal. */
	readonly overage_count: number;
	/** ISO 8601 date when the quota resets, if applicable. */
	readonly reset_date?: string;
}

export type QuotaSnapshots = Record<string, QuotaSnapshot>;

export interface IChatQuotaService {
	readonly _serviceBrand: undefined;
	quotaExhausted: boolean;
	overagesEnabled: boolean;
	processQuotaHeaders(headers: IHeaders): void;
	processQuotaSnapshots(snapshots: QuotaSnapshots): void;
	clearQuota(): void;
}

export const IChatQuotaService = createServiceIdentifier<IChatQuotaService>('IChatQuotaService');
