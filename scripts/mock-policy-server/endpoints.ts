/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared definition of the Copilot "policy" endpoints that
 * `DefaultAccountService` (src/vs/workbench/services/accounts/browser/defaultAccount.ts)
 * calls, together with sample response bodies. This is the single source of
 * truth shared by the Node server (route table + default state) and the browser
 * GUI (endpoint tabs + preset dropdown), exported UMD-style so it loads in both
 * environments without a build step.
 *
 * For the default (github.com) provider these URLs are read verbatim from
 * `product.json` -> `defaultChatAgent.<productKey>`, so pointing all of them at
 * a local server via `product.overrides.json` lets a dev exercise the whole
 * policy pipeline offline.
 *
 * NOTE: The server uses `module.stripTypeScriptTypes()` to serve this file to
 * the browser as plain JavaScript — no build step is needed.
 */

export interface EndpointPreset {
	id: string;
	label: string;
	description: string;
	body: unknown;
}

export interface EndpointDef {
	/** Stable id used by the API + GUI. */
	id: string;
	/** Human label for the GUI tab. */
	label: string;
	/** URL path the server serves / Code OSS calls. */
	path: string;
	/** Key under product.json `defaultChatAgent`. */
	productKey: string;
	/** One-line summary for the GUI. */
	description: string;
	/** First preset is used as the default body. */
	presets: EndpointPreset[];
}

/* eslint-disable-next-line no-var -- UMD global for browser <script> context */
declare var MOCK_POLICY_ENDPOINTS: EndpointDef[];

(function (root: Record<string, unknown> | undefined, factory: () => EndpointDef[]) {
	if (typeof module === 'object' && module.exports) {
		module.exports = factory();
	} else if (root) {
		root.MOCK_POLICY_ENDPOINTS = factory();
	}
})(typeof self !== 'undefined' ? self as unknown as Record<string, unknown> : undefined, function (): EndpointDef[] {

	const endpoints: EndpointDef[] = [
		{
			id: 'managedSettings',
			label: 'Managed Settings',
			path: '/copilot_internal/managed_settings',
			productKey: 'managedSettingsUrl',
			description: 'Enterprise copilot settings from .github/copilot/settings.json. An empty object means no policy file is present.',
			presets: [
				{
					id: 'empty',
					label: 'Empty (no policy file)',
					description: 'An empty object is a successful "no enterprise policy file present" response.',
					body: {}
				}
			]
		},
		{
			id: 'entitlements',
			label: 'Entitlements',
			path: '/copilot_internal/user',
			productKey: 'entitlementUrl',
			description: 'Gates the entire flow — token and managed settings are only fetched when chat_enabled is true.',
			presets: [
				{
					id: 'enterprise-enabled',
					label: 'Enterprise, chat enabled',
					description: 'Chat enabled with cloud session storage; the common dev case.',
					body: {
						access_type_sku: 'copilot_enterprise_seat',
						chat_enabled: true,
						assigned_date: '2024-01-01T00:00:00Z',
						can_signup_for_limited: false,
						copilot_plan: 'enterprise',
						organization_login_list: ['contoso'],
						analytics_tracking_id: 'dev-analytics-id',
						cloud_session_storage_enabled: true
					}
				}
			]
		},
		{
			id: 'token',
			label: 'Token',
			path: '/copilot_internal/v2/token',
			productKey: 'tokenEntitlementUrl',
			description: 'Token string carries policy flags as key=value pairs separated by semicolons. Flags: agent_mode, editor_preview_features, mcp, sn, fcv1.',
			presets: [
				{
					id: 'all-enabled',
					label: 'All features enabled',
					description: 'agent_mode=1, editor_preview_features=1, mcp=1.',
					body: { token: 'agent_mode=1;editor_preview_features=1;mcp=1;sn=dev;fcv1=dev:devsignature' }
				}
			]
		},
		{
			id: 'mcpRegistry',
			label: 'MCP Registry',
			path: '/copilot/mcp_registry',
			productKey: 'mcpRegistryDataUrl',
			description: 'Only fetched when the token has mcp=1. Returns the enterprise MCP registry URL and access level.',
			presets: [
				{
					id: 'registry-only',
					label: 'Registry only',
					description: 'Restrict MCP servers to the enterprise registry.',
					body: { mcp_registries: [{ url: 'https://mcp.contoso.example/registry', registry_access: 'registry_only' }] }
				}
			]
		}
	];

	return endpoints;
});
