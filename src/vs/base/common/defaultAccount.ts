/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtraKnownMarketplaceEntry } from './managedSettings.js';
import type { ManagedSettingsData } from './policy.js';

export interface IQuotaSnapshotData {
	readonly overage_count: number;
	readonly overage_entitlement: number;
	readonly overage_permitted: boolean;
	readonly percent_remaining: number;
	readonly unlimited: boolean;
	readonly quota_reset_at?: number;
	readonly token_based_billing?: boolean;
	readonly entitlement?: string;
	readonly quota_remaining?: number;
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
	readonly can_upgrade_plan?: boolean;
	readonly cloud_session_storage_enabled?: boolean;
	readonly quota_snapshots?: {
		chat?: IQuotaSnapshotData;
		completions?: IQuotaSnapshotData;
		premium_interactions?: IQuotaSnapshotData;
	};
}

export interface IPolicyData {
	readonly mcp?: boolean;
	readonly chat_preview_features_enabled?: boolean;
	readonly chat_agent_enabled?: boolean;
	readonly cloud_session_storage_enabled?: boolean;
	readonly mcpRegistryUrl?: string;
	readonly mcpAccess?: 'allow_all' | 'registry_only';

	/**
	 * Normalized enterprise-managed settings, keyed by dot-separated managed-settings
	 * paths such as `permissions.disableBypassPermissionsMode`.
	 */
	readonly managedSettings?: ManagedSettingsData;

	/**
	 * Enterprise-managed plugin enablement, delivered via the Copilot
	 * `managed_settings` API. Keys are plugin IDs in `<plugin>@<marketplace>`
	 * form; values are explicit enable/disable. Consumers that read
	 * `chat.pluginLocations` should merge these with user-supplied path-keyed
	 * entries via `IConfigurationService.inspect()`.
	 */
	readonly enabledPlugins?: Readonly<Record<string, boolean>>;

	/**
	 * Enterprise-managed marketplace references, delivered via the Copilot
	 * `managed_settings` API. Each entry preserves the marketplace `name`
	 * (used as `displayLabel` so that `enabledPlugins["plugin@<name>"]` keys
	 * resolve) plus the original `source` discriminator. Legacy string entries
	 * are still accepted for forward/backward compatibility.
	 */
	readonly extraKnownMarketplaces?: readonly (string | IExtraKnownMarketplaceEntry)[];

	/**
	 * Enterprise-managed strict-marketplace flag. When true, only marketplaces
	 * listed in `extraKnownMarketplaces` (plus the user's own) are trusted.
	 */
	readonly strictKnownMarketplaces?: boolean;
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
