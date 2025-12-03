/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IDefaultAccount {
	readonly sessionId: string;
	readonly enterprise: boolean;
	readonly access_type_sku?: string;
	readonly copilot_plan?: string;
	readonly assigned_date?: string;
	readonly can_signup_for_limited?: boolean;
	readonly chat_enabled?: boolean;
	readonly chat_preview_features_enabled?: boolean;
	readonly mcp?: boolean;
	readonly mcpRegistryUrl?: string;
	readonly mcpAccess?: 'allow_all' | 'registry_only';
	readonly analytics_tracking_id?: string;
	readonly limited_user_quotas?: {
		readonly chat: number;
		readonly completions: number;
	};
	readonly monthly_quotas?: {
		readonly chat: number;
		readonly completions: number;
	};
	readonly limited_user_reset_date?: string;
	readonly chat_agent_enabled?: boolean;
}
