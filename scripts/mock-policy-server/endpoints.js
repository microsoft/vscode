/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

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
 */
(function (root, factory) {
	if (typeof module === 'object' && module.exports) {
		module.exports = factory();
	} else {
		root.MOCK_POLICY_ENDPOINTS = factory();
	}
})(typeof self !== 'undefined' ? self : this, function () {

	/**
	 * @typedef {Object} EndpointPreset
	 * @property {string} id
	 * @property {string} label
	 * @property {string} description
	 * @property {unknown} body
	 */

	/**
	 * @typedef {Object} EndpointDef
	 * @property {string} id            Stable id used by the API + GUI.
	 * @property {string} label         Human label for the GUI tab.
	 * @property {string} path          URL path the server serves / Code OSS calls.
	 * @property {string} productKey    Key under product.json `defaultChatAgent`.
	 * @property {string} description   One-line summary for the GUI.
	 * @property {EndpointPreset[]} presets  First preset is used as the default body.
	 */

	/** @type {EndpointDef[]} */
	const endpoints = [
		{
			id: 'entitlements',
			label: 'Entitlements',
			path: '/copilot_internal/user',
			productKey: 'entitlementUrl',
			description: 'Gates the whole flow: managed_settings and the token are only fetched when chat_enabled is true.',
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
				},
				{
					id: 'chat-disabled',
					label: 'Chat disabled',
					description: 'chat_enabled=false short-circuits token + managed_settings fetches.',
					body: {
						access_type_sku: 'copilot_enterprise_seat',
						chat_enabled: false,
						assigned_date: '2024-01-01T00:00:00Z',
						can_signup_for_limited: false,
						copilot_plan: 'enterprise',
						organization_login_list: ['contoso'],
						analytics_tracking_id: 'dev-analytics-id',
						cloud_session_storage_enabled: false
					}
				},
				{
					id: 'free-limited',
					label: 'Free / limited',
					description: 'Copilot Free user who can sign up for the limited plan.',
					body: {
						access_type_sku: 'free_limited_copilot',
						chat_enabled: true,
						assigned_date: '2024-01-01T00:00:00Z',
						can_signup_for_limited: true,
						copilot_plan: 'free',
						organization_login_list: [],
						analytics_tracking_id: 'dev-analytics-id',
						cloud_session_storage_enabled: false,
						limited_user_reset_date: '2024-02-01'
					}
				}
			]
		},
		{
			id: 'token',
			label: 'Token',
			path: '/copilot_internal/v2/token',
			productKey: 'tokenEntitlementUrl',
			description: 'The token string carries policy flags. Grammar: "key=value;key=value:signature". Flags read: agent_mode, editor_preview_features, mcp, sn, fcv1.',
			presets: [
				{
					id: 'all-enabled',
					label: 'All features enabled',
					description: 'agent_mode=1, editor_preview_features=1, mcp=1.',
					body: { token: 'agent_mode=1;editor_preview_features=1;mcp=1;sn=dev;fcv1=dev:devsignature' }
				},
				{
					id: 'agent-off',
					label: 'Agent mode off',
					description: 'agent_mode=0 disables chat_agent_enabled.',
					body: { token: 'agent_mode=0;editor_preview_features=1;mcp=1;sn=dev;fcv1=dev:devsignature' }
				},
				{
					id: 'preview-off',
					label: 'Preview features off',
					description: 'editor_preview_features=0 disables chat_preview_features_enabled.',
					body: { token: 'agent_mode=1;editor_preview_features=0;mcp=1;sn=dev;fcv1=dev:devsignature' }
				},
				{
					id: 'mcp-off',
					label: 'MCP off',
					description: 'mcp is only enabled when explicitly =1; here it is 0.',
					body: { token: 'agent_mode=1;editor_preview_features=1;mcp=0;sn=dev;fcv1=dev:devsignature' }
				}
			]
		},
		{
			id: 'mcpRegistry',
			label: 'MCP Registry',
			path: '/copilot/mcp_registry',
			productKey: 'mcpRegistryDataUrl',
			description: 'Only fetched when the token enables mcp. Provides the enterprise MCP registry URL and access level.',
			presets: [
				{
					id: 'registry-only',
					label: 'Registry only',
					description: 'Restrict MCP servers to the enterprise registry.',
					body: { mcp_registries: [{ url: 'https://mcp.contoso.example/registry', registry_access: 'registry_only' }] }
				},
				{
					id: 'allow-all',
					label: 'Allow all',
					description: 'Registry present but all MCP servers allowed.',
					body: { mcp_registries: [{ url: 'https://mcp.contoso.example/registry', registry_access: 'allow_all' }] }
				},
				{
					id: 'none',
					label: 'No registry',
					description: 'Empty list -> no enterprise registry.',
					body: { mcp_registries: [] }
				}
			]
		},
		{
			id: 'managedSettings',
			label: 'Managed Settings',
			path: '/copilot_internal/managed_settings',
			productKey: 'managedSettingsUrl',
			description: 'Enterprise .github/copilot/settings.json. {} means "no policy file present" (success).',
			presets: [
				{
					id: 'empty',
					label: 'Empty (no policy file)',
					description: 'An empty object is a successful "no enterprise policy file present" response.',
					body: {}
				},
				{
					id: 'disableBypassPermissionsMode',
					label: 'permissions.disableBypassPermissionsMode',
					description: 'The V0 scalar managed setting. The endpoint encodes booleans as strings.',
					body: { permissions: { disableBypassPermissionsMode: 'true' } }
				},
				{
					id: 'enabledPlugins',
					label: 'enabledPlugins',
					description: 'Enterprise plugin enablement map ({ [pluginId]: boolean }).',
					body: { enabledPlugins: { 'github.pull-request': true, 'some.other-plugin': false } }
				},
				{
					id: 'extraKnownMarketplaces',
					label: 'extraKnownMarketplaces',
					description: 'Enterprise marketplaces keyed by name, each with a github or git source.',
					body: {
						extraKnownMarketplaces: {
							'Contoso Internal': { source: { source: 'github', repo: 'contoso/copilot-marketplace', ref: 'main' } },
							'Contoso Git Mirror': { source: { source: 'git', url: 'https://git.contoso.example/copilot-marketplace.git' } }
						}
					}
				},
				{
					id: 'strictKnownMarketplaces',
					label: 'strictKnownMarketplaces',
					description: 'Restrict plugins to only the enterprise-known marketplaces.',
					body: { strictKnownMarketplaces: true }
				},
				{
					id: 'kitchen-sink',
					label: 'Kitchen sink (all keys)',
					description: 'Every known key combined, plus a forward-compatible unknown scalar.',
					body: {
						permissions: { disableBypassPermissionsMode: 'true' },
						enabledPlugins: { 'github.pull-request': true, 'some.other-plugin': false },
						extraKnownMarketplaces: {
							'Contoso Internal': { source: { source: 'github', repo: 'contoso/copilot-marketplace', ref: 'main' } }
						},
						strictKnownMarketplaces: true,
						someFutureScalar: 'forward-compatible'
					}
				}
			]
		}
	];

	return endpoints;
});
