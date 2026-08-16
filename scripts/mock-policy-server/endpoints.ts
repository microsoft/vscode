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
 * policy pipeline offline. The same paths are also served under a system proxy
 * rule, which is how a stable/Insiders build or the CLI reaches this server.
 *
 * Endpoints not marked `mockedByDefault` start in passthrough: the server
 * forwards them to the real API so a blanket proxy rule stays safe.
 *
 * NOTE: The server uses `module.stripTypeScriptTypes()` to serve this file to
 * the browser as plain JavaScript — no build step is needed.
 */

export interface EndpointPreset {
	id: string;
	label: string;
	description: string;
	status?: number;
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
	/**
	 * Whether this endpoint is mocked when the server starts. Everything else
	 * is proxied to the real API, so a blanket proxy rule stays safe: only the
	 * endpoints you deliberately turn on get faked.
	 */
	mockedByDefault?: boolean;
	/** Validate 2xx bodies against the managed-settings JSON schema. */
	schema?: boolean;
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
			mockedByDefault: true,
			schema: true,
			presets: [
				{
					id: 'empty',
					label: 'Empty (no policy file)',
					description: 'An empty object is a successful "no enterprise policy file present" response.',
					status: 200,
					body: {}
				},
				{
					id: 'disable-bypass-permissions',
					label: 'Disable bypass permissions',
					description: 'Disables bypass permissions mode.',
					status: 200,
					body: {
						permissions: {
							disableBypassPermissionsMode: 'disable'
						}
					}
				},
				{
					id: 'model-auto',
					label: 'Model: auto',
					description: 'Sets the managed model to auto.',
					status: 200,
					body: {
						model: 'auto'
					}
				},
				{
					id: 'extra-known-marketplaces',
					label: 'Extra known marketplaces',
					description: 'Adds marketplaces with managed auto-update settings.',
					status: 200,
					body: {
						extraKnownMarketplaces: {
							'vscode-team-kit': {
								source: {
									source: 'github',
									repo: 'microsoft/vscode-team-kit'
								},
								autoUpdate: true
							},
							'awesome-copilot': {
								source: {
									source: 'github',
									repo: 'github/awesome-copilot',
									ref: 'marketplace'
								},
								autoUpdate: false
							}
						}
					}
				},
				{
					id: 'customization-lockdown',
					label: 'Customization lockdown',
					description: 'Allows only managed plugins, MCP servers, and hooks, and forces a remote settings refresh.',
					status: 200,
					body: {
						strictPluginOnlyCustomization: true,
						allowManagedMcpServersOnly: true,
						allowManagedHooksOnly: true,
						forceRemoteSettingsRefresh: true
					}
				},
				{
					id: 'not-configured',
					label: 'Not configured (404)',
					description: 'No server-managed policy is configured.',
					status: 404,
					body: {}
				},
				{
					id: 'update-required',
					label: 'Client update required (466)',
					description: 'Rejects the client because it cannot enforce the effective managed settings.',
					status: 466,
					body: {
						error_code: 'client_update_required',
						client_id: 'vscode',
						client_version: '1.132.0',
						minimum_client_version: '1.133.0'
					}
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
