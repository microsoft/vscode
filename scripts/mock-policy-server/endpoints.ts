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
			description: 'Enterprise Copilot policy from .github/copilot/settings.json. A 200 with {} means "a policy exists but sets nothing"; 404 means "no policy for this account".',
			mockedByDefault: true,
			schema: true,
			presets: [
				{
					id: 'empty',
					label: 'Empty (no policy set)',
					description: 'A 200 with an empty object: policy resolved successfully and constrains nothing.',
					status: 200,
					body: {}
				},
				{
					id: 'locked-down',
					label: 'Locked down (everything on)',
					description: 'Bypass blocked, sandbox forced, remote control off, model pinned to auto.',
					status: 200,
					body: {
						model: 'auto',
						permissions: {
							disableBypassPermissionsMode: 'disable',
							deny: ['shell(rm)', 'shell(curl)', 'write(**/.env)'],
							ask: ['shell(git push)'],
							allow: ['shell(ls)', 'shell(cat)', 'read(**)']
						},
						remoteControl: { mode: 'disabled' },
						sandbox: { enabled: true, allowBypass: false },
						telemetry: { enabled: true }
					}
				},
				{
					id: 'bypass-disabled',
					label: 'Bypass permissions disabled',
					description: 'Blocks every allow-all / "yolo" escalation, including advisory auto-approval.',
					status: 200,
					body: { permissions: { disableBypassPermissionsMode: 'disable' } }
				},
				{
					id: 'bypass-auto-only',
					label: 'Bypass: allow-auto-only',
					description: 'Blocks full allow-all but still permits advisory auto-approval.',
					status: 200,
					body: { permissions: { disableBypassPermissionsMode: 'allow-auto-only' } }
				},
				{
					id: 'mcp-policy',
					label: 'MCP allow/deny policy',
					description: 'Restricts which MCP servers may load. A deny entry always wins over an allow entry.',
					status: 200,
					body: {
						allowedMcpServers: [
							{ serverUrl: 'https://api.githubcopilot.com/mcp/*' },
							{ serverName: 'internal-tools' }
						],
						deniedMcpServers: [
							{ serverCommand: ['npx', '-y', '@contoso/unreviewed-mcp'] }
						]
					}
				},
				{
					id: 'remote-control-sso',
					label: 'Remote control requires SSO',
					description: 'Control from other devices only when SSO-authorized for the listed organization.',
					status: 200,
					body: {
						remoteControl: {
							mode: 'requireSSO',
							githubDotComOrganizations: ['contoso']
						}
					}
				},
				{
					id: 'plugins',
					label: 'Plugin / marketplace policy',
					description: 'Pins plugin enablement and restricts which marketplaces may be used.',
					status: 200,
					body: {
						enabledPlugins: {
							'code-review@contoso': true,
							'unreviewed-plugin@community': false
						},
						extraKnownMarketplaces: {
							contoso: {
								autoUpdate: true,
								source: { source: 'github', repo: 'contoso/copilot-marketplace' }
							}
						},
						strictKnownMarketplaces: [
							{ source: 'github', repo: 'contoso/copilot-marketplace' }
						]
					}
				},
				{
					id: 'force-refresh',
					label: 'Force remote settings refresh',
					description: 'Tells the client to re-fetch on next startup instead of trusting its fresh disk cache.',
					status: 200,
					body: { forceRemoteSettingsRefresh: true }
				},
				{
					id: 'not-configured',
					label: 'No policy (404)',
					description: 'No server-managed policy is configured for this account.',
					status: 404,
					body: { message: 'Not Found' }
				},
				{
					id: 'server-error',
					label: 'Server error (500)',
					description: 'Exercises the cache-fallback path: the client falls back to its last cached policy.',
					status: 500,
					body: { message: 'Internal Server Error' }
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
					status: 200,
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
					id: 'individual',
					label: 'Individual, chat enabled',
					description: 'No organization, no cloud session storage.',
					status: 200,
					body: {
						access_type_sku: 'copilot_for_individuals',
						chat_enabled: true,
						copilot_plan: 'individual',
						can_signup_for_limited: false,
						organization_login_list: [],
						cloud_session_storage_enabled: false
					}
				},
				{
					id: 'chat-disabled',
					label: 'Chat disabled',
					description: 'Stops the flow early: no token and no managed-settings fetch follow.',
					status: 200,
					body: {
						access_type_sku: 'copilot_enterprise_seat',
						chat_enabled: false,
						copilot_plan: 'enterprise',
						can_signup_for_limited: false,
						organization_login_list: ['contoso']
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
					status: 200,
					body: { token: 'agent_mode=1;editor_preview_features=1;mcp=1;sn=dev;fcv1=dev:devsignature' }
				},
				{
					id: 'mcp-disabled',
					label: 'MCP disabled',
					description: 'mcp=0, so the MCP registry is never fetched.',
					status: 200,
					body: { token: 'agent_mode=1;editor_preview_features=1;mcp=0;sn=dev;fcv1=dev:devsignature' }
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
					status: 200,
					body: { mcp_registries: [{ url: 'https://mcp.contoso.example/registry', registry_access: 'registry_only' }] }
				},
				{
					id: 'none',
					label: 'No registries',
					description: 'No enterprise registry is configured.',
					status: 200,
					body: { mcp_registries: [] }
				}
			]
		}
	];

	return endpoints;
});
