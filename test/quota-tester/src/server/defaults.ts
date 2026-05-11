/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AppState, IQuotaSnapshotData, PlanConfig, QuotaId } from '../types.js';

/** Helper: creates a snapshot with sensible defaults, overridden by provided values. */
export function snap(overrides: Partial<IQuotaSnapshotData> = {}): IQuotaSnapshotData {
	const result = {
		overage_count: 0,
		overage_permitted: false,
		percent_remaining: 100,
		unlimited: false,
		quota_reset_at: 0,
		has_quota: false,
		remaining: 0,
		entitlement: 0,
		quota_remaining: 0,
		timestamp_utc: new Date().toISOString(),
		...overrides,
	};
	if (!Object.prototype.hasOwnProperty.call(overrides, 'has_quota')) {
		result.has_quota = result.percent_remaining !== 0;
	}
	return result;
}

export function monthEndIso(): string {
	const d = new Date();
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
}

function freePlan(): PlanConfig {
	return {
		planId: 'free',
		label: 'Copilot Free (TBB)',
		access_type_sku: 'free_limited_copilot',
		copilot_plan: 'individual',
		chat_enabled: true,
		codex_agent_enabled: true,
		includeSnapshots: ['chat', 'completions', 'premium_interactions'],
		snapshots: {
			chat: snap({ percent_remaining: 97.8, quota_remaining: 195.7, remaining: 195, entitlement: 200, token_based_billing: true }),
			completions: snap({ has_quota: true, quota_remaining: 4000, remaining: 4000, entitlement: 4000, token_based_billing: true }),
			premium_interactions: snap({ percent_remaining: 0, token_based_billing: true }),
		},
	};
}

function proPlan(): PlanConfig {
	return {
		planId: 'pro',
		label: 'Copilot Pro / EDU (TBB)',
		access_type_sku: 'free_educational_quota',
		copilot_plan: 'individual',
		chat_enabled: true,
		codex_agent_enabled: true,
		includeSnapshots: ['chat', 'completions', 'premium_interactions'],
		snapshots: {
			chat: snap({ unlimited: true }),
			completions: snap({ unlimited: true, has_quota: true }),
			premium_interactions: snap({ remaining: 300, entitlement: 300, quota_remaining: 300, token_based_billing: true }),
		},
	};
}

function proPlusPlan(): PlanConfig {
	return {
		planId: 'pro_plus',
		label: 'Copilot Pro+',
		access_type_sku: 'plus_monthly_subscriber_quota',
		copilot_plan: 'individual_pro',
		chat_enabled: true,
		codex_agent_enabled: true,
		includeSnapshots: ['chat', 'completions', 'premium_interactions'],
		snapshots: {
			chat: snap({ unlimited: true }),
			completions: snap({ unlimited: true, overage_permitted: true, has_quota: true }),
			premium_interactions: snap({ overage_permitted: true, remaining: 1500, entitlement: 1500, quota_remaining: 1500, token_based_billing: true }),
		},
	};
}

function maxPlan(): PlanConfig {
	return {
		planId: 'max',
		label: 'Copilot Max Monthly (TBB)',
		access_type_sku: 'max_monthly_subscriber_quota',
		copilot_plan: 'individual_max',
		chat_enabled: true,
		codex_agent_enabled: true,
		includeSnapshots: ['chat', 'completions', 'premium_interactions'],
		snapshots: {
			chat: snap({ unlimited: true }),
			completions: snap({ unlimited: true, has_quota: true }),
			premium_interactions: snap({ remaining: 5000, entitlement: 5000, quota_remaining: 5000, token_based_billing: true }),
		},
	};
}

function businessPlan(): PlanConfig {
	return {
		planId: 'business',
		label: 'Copilot Business (TBB)',
		access_type_sku: 'copilot_for_business_seat',
		copilot_plan: 'business',
		chat_enabled: true,
		codex_agent_enabled: true,
		includeSnapshots: ['chat', 'completions', 'premium_interactions'],
		snapshots: {
			chat: snap({ unlimited: true }),
			completions: snap({ unlimited: true }),
			premium_interactions: snap({ unlimited: true }),
		},
	};
}

function enterprisePlan(): PlanConfig {
	return {
		planId: 'enterprise',
		label: 'Copilot Enterprise (TBB)',
		access_type_sku: 'copilot_enterprise_seat_multi_quota',
		copilot_plan: 'enterprise',
		chat_enabled: true,
		codex_agent_enabled: true,
		includeSnapshots: ['chat', 'completions', 'premium_interactions'],
		snapshots: {
			chat: snap({ unlimited: true }),
			completions: snap({ unlimited: true }),
			premium_interactions: snap({ unlimited: true }),
		},
	};
}

export function defaultState(): AppState {
	return {
		activePlan: 'free',
		plans: {
			free: freePlan(),
			pro: proPlan(),
			pro_plus: proPlusPlan(),
			max: maxPlan(),
			business: businessPlan(),
			enterprise: enterprisePlan(),
		},
	};
}

export const ALL_QUOTA_IDS: QuotaId[] = [
	'chat',
	'completions',
	'premium_interactions',
];
