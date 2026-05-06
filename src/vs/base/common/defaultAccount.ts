/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IQuotaSnapshotData {
	readonly overage_count: number;
	readonly overage_permitted: boolean;
	readonly percent_remaining: number;
	readonly unlimited: boolean;
	readonly quota_reset_at?: number;
	readonly token_based_billing?: boolean;
	readonly entitlement?: string;
	readonly has_quota?: boolean;
}

export interface ILegacyQuotaSnapshotData {
	readonly limited_user_quotas?: {
		readonly chat: number;
		readonly completions: number;
	};
	readonly monthly_quotas?: {
		readonly chat: number;
		readonly completions: number;
	};
}

export interface IEntitlementsData extends ILegacyQuotaSnapshotData {
	readonly access_type_sku: string;
	readonly chat_enabled: boolean;
	readonly assigned_date: string;
	readonly can_signup_for_limited: boolean;
	readonly copilot_plan: string;
	readonly organization_login_list: string[];
	readonly analytics_tracking_id: string;
	readonly limited_user_reset_date?: string; 	// for Copilot Free
	readonly quota_reset_date?: string; 		// for all other Copilot SKUs
	readonly quota_reset_date_utc?: string; 	// for all other Copilot SKUs (includes time)
	readonly token_based_billing?: boolean;
	readonly quota_snapshots?: {
		chat?: IQuotaSnapshotData;
		completions?: IQuotaSnapshotData;
		premium_interactions?: IQuotaSnapshotData;
	};
}

export const enum CopilotSessionSearchPolicy {
	Unknown = 0,
	Enabled = 1,
	Disabled = 2,
	Unconfigured = 3,
	NoPolicy = 4,
}

export interface IPolicyData {
	readonly mcp?: boolean;
	readonly chat_preview_features_enabled?: boolean;
	readonly chat_agent_enabled?: boolean;
	readonly session_search?: CopilotSessionSearchPolicy;
	readonly mcpRegistryUrl?: string;
	readonly mcpAccess?: 'allow_all' | 'registry_only';
}

export interface ICopilotTokenInfo {
	readonly sn?: string;
	readonly fcv1?: string;
}

export interface IDefaultAccountAuthenticationProvider {
	readonly id: string;
	readonly name: string;
	readonly enterprise: boolean;
}

export interface IDefaultAccount {
	readonly authenticationProvider: IDefaultAccountAuthenticationProvider;
	readonly accountName: string;
	readonly sessionId: string;
	readonly enterprise: boolean;
	readonly entitlementsData?: IEntitlementsData | null;
}
