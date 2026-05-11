/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type QuotaId =
	| 'chat'
	| 'completions'
	| 'premium_interactions';

export interface IQuotaSnapshotData {
	overage_count: number;
	overage_permitted: boolean;
	percent_remaining: number;
	unlimited: boolean;
	quota_reset_at?: number;
	token_based_billing?: boolean;
	timestamp_utc?: string;
	quota_id?: string;
	quota_remaining?: number;
	has_quota?: boolean;
	remaining?: number;
	entitlement?: number;
}

export interface IEntitlementsResponse {
	// Core user info
	login: string;
	access_type_sku: string;
	analytics_tracking_id: string;
	assigned_date: string | null;
	can_signup_for_limited: boolean;
	chat_enabled: boolean;
	copilotignore_enabled: boolean;
	copilot_plan: string;
	is_mcp_enabled: boolean;
	organization_login_list: string[];
	organization_list: Array<{ login: string; name: string | null }>;
	restricted_telemetry: boolean;
	endpoints: {
		api: string;
		'origin-tracker': string;
		proxy: string;
		telemetry: string;
	};

	// Agent features
	codex_agent_enabled?: boolean;

	// Free / limited user (legacy PRU)
	limited_user_quotas?: { chat: number; completions: number };
	limited_user_reset_date?: string;
	limited_user_subscribed_day?: number;
	monthly_quotas?: { chat: number; completions: number };

	// Paid users
	quota_reset_date?: string;
	quota_reset_date_utc?: string;

	quota_snapshots?: Partial<Record<QuotaId, IQuotaSnapshotData>>;

	// Top-level TBB indicator
	token_based_billing?: boolean;
}

export type PlanId = 'free' | 'pro' | 'pro_plus' | 'max' | 'business' | 'enterprise';

export interface PlanConfig {
	planId: PlanId;
	label: string;
	access_type_sku: string;
	copilot_plan: string;
	chat_enabled: boolean;
	codex_agent_enabled: boolean;
	includeSnapshots: QuotaId[];
	snapshots: Partial<Record<QuotaId, IQuotaSnapshotData>>;
	// Free-user legacy fields
	limited_user_quotas?: { chat: number; completions: number };
	monthly_quotas?: { chat: number; completions: number };
}

export interface AppState {
	/** which plan is currently being simulated */
	activePlan: PlanId;
	plans: Record<PlanId, PlanConfig>;
}
