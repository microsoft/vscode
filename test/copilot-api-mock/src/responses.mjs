/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Response builders for the mock Copilot API.
 *
 * Each builder produces the EXACT shape that VS Code core's
 * `DefaultAccountProvider` parses. Shapes are pinned to these source files —
 * keep them in sync if core changes:
 *   - Entitlements:     src/vs/base/common/defaultAccount.ts (IEntitlementsData)
 *   - Token parsing:    src/vs/workbench/services/accounts/browser/defaultAccount.ts (extractFromToken / requestTokenEntitlements)
 *   - MCP registry:     src/vs/workbench/services/accounts/browser/defaultAccount.ts (IMcpRegistryResponse)
 *   - Managed settings: src/vs/workbench/services/accounts/browser/managedSettings.ts (IManagedSettingsResponse)
 */

/**
 * Default entitlements. `chat_enabled: true` is REQUIRED — core gates the
 * parallel token + managed-settings fetch on it (see
 * getDefaultAccountFromAuthenticatedSessions: `entitlementsData?.chat_enabled`).
 *
 * @param {Record<string, unknown>} [overrides]
 */
export function buildEntitlements(overrides = {}) {
	return {
		access_type_sku: 'monthly_subscriber',
		analytics_tracking_id: 'copilot-api-mock',
		assigned_date: new Date('2025-01-01T00:00:00Z').toISOString(),
		can_signup_for_limited: false,
		chat_enabled: true,
		copilot_plan: 'individual',
		organization_login_list: [],
		cloud_session_storage_enabled: true,
		...overrides,
	};
}

/**
 * Default token field map. Core reads these keys from the `;`-delimited token
 * string (see requestTokenEntitlements):
 *   - `agent_mode`              : '0' => chat_agent_enabled = false
 *   - `editor_preview_features` : '0' => chat_preview_features_enabled = false
 *   - `mcp`                     : '1' => mcp = true (and only then is mcp_registry fetched)
 *   - `sn`, `fcv1`              : surfaced as ICopilotTokenInfo
 */
export function defaultTokenFields() {
	return {
		tid: 'copilot-api-mock-tenant',
		exp: String(Math.floor(Date.now() / 1000) + 3600),
		agent_mode: '1',
		editor_preview_features: '1',
		mcp: '1',
		sn: 'copilot-api-mock',
		fcv1: 'copilot-api-mock',
	};
}

/**
 * Assembles the `/copilot_internal/v2/token` response. Core parses
 * `token.split(':')[0].split(';')` into `key=value` pairs, so everything before
 * the first colon is the field list and the part after is an opaque signature.
 *
 * @param {Record<string, string>} [fieldOverrides]
 */
export function buildToken(fieldOverrides = {}) {
	const fields = { ...defaultTokenFields(), ...fieldOverrides };
	const fieldList = Object.entries(fields)
		.map(([key, value]) => `${key}=${value}`)
		.join(';');
	return { token: `${fieldList}:copilot-api-mock-signature` };
}

/**
 * `/copilot/mcp_registry` response. Only fetched by core when the token's `mcp`
 * field is `1`. `registry_access` is `allow_all` | `registry_only`.
 *
 * @param {object} [override] When provided with an `mcp_registries` array, returned verbatim.
 */
export function buildMcpRegistry(override) {
	if (override && Array.isArray(override.mcp_registries)) {
		return override;
	}
	return {
		mcp_registries: [
			{
				url: 'https://api.githubcopilot.com/mcp/',
				registry_access: 'allow_all',
				owner: {
					login: 'copilot-api-mock',
					id: 1,
					type: 'Organization',
					parent_login: null,
					priority: 0,
				},
			},
		],
	};
}

/**
 * `/copilot_internal/managed_settings` response — the enterprise-managed policy
 * payload. Served VERBATIM from the active payload: this builder is
 * intentionally shape-agnostic so that adding a new managed-settings key never
 * requires a code change here — the payload is whatever the inspector's editor
 * (or an example) sets, and core's own `adaptManagedSettings` (imported in
 * adapter.mjs) decides what to do with it.
 * An empty object `{}` is a valid "no policy file present" signal.
 *
 * @param {object} [override]
 */
export function buildManagedSettings(override) {
	return override ?? {};
}
