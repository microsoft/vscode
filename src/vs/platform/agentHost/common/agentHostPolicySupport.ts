/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * How completely Agent Host enforces an enterprise policy.
 *
 * - `enforced`: the policy governs Agent Host sessions as it governs Local sessions.
 * - `partial`: some paths honor the policy, but at least one path bypasses it.
 * - `notEnforced`: Agent Host sessions ignore the policy.
 * - `notApplicable`: the policy governs behavior that Agent Host does not implement.
 */
export type AgentHostPolicySupportStatus = 'enforced' | 'partial' | 'notEnforced' | 'notApplicable';

/** Agent Host enforcement metadata for one enterprise policy. */
export interface IAgentHostPolicySupport {
	readonly status: AgentHostPolicySupportStatus;
}

/**
 * Agent Host enforcement status for every enterprise policy in
 * `build/lib/policies/policyData.jsonc`, keyed by policy name.
 *
 * Status describes the Copilot agent on a local Agent Host, which is the
 * candidate default replacement for Local. Differences for Claude, Codex, and
 * remote hosts are noted next to the entry.
 *
 * Status is conservative across delivery channels. The Copilot runtime reads
 * Copilot managed settings (GitHub organization settings, `com.github.copilot`
 * or `GitHubCopilot` native MDM, and `managed-settings.json`) itself; it does
 * not see values delivered only through VS Code policy. A policy the runtime
 * enforces only when delivered through Copilot managed settings is `partial`.
 *
 * The policy export fails for a policy without an entry here, and the build
 * tests fail when `policyData.jsonc` contains a policy without a status.
 */
export const agentHostPolicySupport: Readonly<Record<string, IAgentHostPolicySupport>> = {
	// #region Tool approval, sandbox, and network

	// Forwarded to every host as `autoApprovePolicyRestricted`; Copilot, Claude, and Codex honor it.
	ChatToolsAutoApprove: { status: 'enforced' },
	// Only mapped when the legacy managed-settings bridge is enabled (off by default), and then only
	// to the session-wide bypass lock, because the SDK rule grammar has no tool-name family. #337540
	ChatToolsEligibleForAutoApproval: { status: 'notEnforced' },
	// Host-side terminal rules honor it, but Copilot auto-approves sandboxed shell commands without
	// consulting it. Not yet tracked.
	ChatToolsTerminalEnableAutoApprove: { status: 'partial' },
	// Forwarded to every host, but a per-session sandbox toggle can turn it off; the toggle only locks
	// for the runtime-managed `sandbox.enabled` floor. Copilot only. Not yet tracked.
	ChatAgentSandboxEnabled: { status: 'partial' },
	// Forwarded as the SDK sandbox `allowOutbound`. Copilot only.
	ChatAgentSandboxAllowNetwork: { status: 'enforced' },
	// Forwarded as the SDK sandbox `allowBypass`. Copilot only.
	ChatAgentSandboxAllowUnsandboxedCommands: { status: 'enforced' },
	// Not read by Agent Host; Copilot auto-approves every sandboxed shell command. Not yet tracked.
	ChatAgentSandboxAllowAutoApprove: { status: 'notEnforced' },
	// Domain lists are not forwarded to the SDK sandbox, and the runtime `web_fetch` tool bypasses the
	// network filter. The legacy managed-settings bridge maps only the deny list. #337538, #337539
	ChatAgentNetworkFilter: { status: 'notEnforced' },
	ChatAgentAllowedNetworkDomains: { status: 'notEnforced' },
	ChatAgentDeniedNetworkDomains: { status: 'notEnforced' },

	// #endregion

	// #region MCP

	// Agent Host discovers and launches MCP servers without consulting MCP access. #328241
	ChatMCP: { status: 'notEnforced' },
	// The Copilot runtime gates every non-built-in server, including host-supplied servers, when these
	// are delivered through Copilot managed settings. Values delivered only through VS Code policy do
	// not reach Agent Host, and Claude and Codex ignore both channels. #328241
	ChatAllowedMcpServers: { status: 'partial' },
	ChatDeniedMcpServers: { status: 'partial' },
	ChatAllowManagedMcpServersOnly: { status: 'partial' },
	// Governs gallery browsing and installation in the workbench.
	McpGalleryServiceUrl: { status: 'notApplicable' },
	// Agent Host routes MCP authentication to the workbench, but enterprise-managed IdP handling on
	// that path has not been audited. Not yet tracked.
	McpEnterpriseManagedAuthIdp: { status: 'notEnforced' },

	// #endregion

	// #region Plugins, customizations, and hooks

	// The workbench filters the plugins it synchronizes, but runtime configuration discovery and Claude's
	// native plugin scan find plugins independently. Not yet tracked.
	ChatPluginsEnabled: { status: 'partial' },
	// Policy-disabled plugins are synchronized as globally disabled, but a more specific session or
	// workspace decision can override that, Claude reads its own `enabledPlugins`, and the runtime does not
	// apply `enabledPlugins` to host-supplied plugin directories. Not yet tracked.
	ChatEnabledPlugins: { status: 'partial' },
	// Governs marketplace registration and installation; host-supplied plugin directories bypass it.
	ChatExtraMarketplaces: { status: 'partial' },
	ChatStrictMarketplaces: { status: 'partial' },
	// The workbench filters synchronized customizations, and the runtime locks skills, agents, hooks, and
	// MCP servers when delivered through Copilot managed settings. The runtime has no instructions surface.
	ChatStrictPluginOnlyCustomization: { status: 'partial' },
	// Documented as Local-only; Agent Host enables runtime file hooks regardless.
	ChatHooks: { status: 'notEnforced' },
	// Enforced by the runtime only when delivered through Copilot managed settings. It then also drops the
	// SDK callback hooks Agent Host registers for its own tool handling. Not yet tracked.
	ChatAllowManagedHooksOnly: { status: 'partial' },

	// #endregion

	// #region Tools and feature gates

	// Agent Host client tools come from the language model tools service, which filters extension tools.
	ChatAgentExtensionTools: { status: 'enforced' },
	// Browser tools reach Agent Host through the same filtered client tool list.
	BrowserChatTools: { status: 'enforced' },
	// Blocks the Agents window. In the editor it only switches the chat mode; Agent Host session targets
	// remain available. Not yet tracked.
	ChatAgentMode: { status: 'partial' },
	// Disables all AI features in the workbench, including Agent Host sessions.
	ChatApprovedAccountOrganizations: { status: 'enforced' },
	ChatDefaultModel: { status: 'enforced' },
	ChatEditorPreferCopilotHarness: { status: 'enforced' },
	// Mirrored into the root config of every host.
	CopilotSessionSync: { status: 'enforced' },

	// #endregion

	// #region Agent Host process configuration

	// Read when the local host starts; remote hosts decide for themselves.
	Claude3PIntegration: { status: 'enforced' },
	Codex3PIntegration: { status: 'enforced' },
	ChatAgentHostCustomTerminalTool: { status: 'enforced' },
	// Passed to the local host process at startup; remote hosts do not receive them.
	CopilotOtelEnabled: { status: 'enforced' },
	CopilotOtelProtocol: { status: 'enforced' },
	CopilotOtelEndpoint: { status: 'enforced' },
	CopilotOtelOtlpProtocol: { status: 'enforced' },
	CopilotOtelOutfile: { status: 'enforced' },
	CopilotOtelResourceAttributes: { status: 'enforced' },
	CopilotOtelServiceName: { status: 'enforced' },
	CopilotOtelCaptureContent: { status: 'enforced' },
	// Never delivered to Agent Host; the runtime applies them only when delivered through Copilot
	// managed settings.
	CopilotOtelCaptureIdentity: { status: 'partial' },
	CopilotOtelHeaders: { status: 'partial' },
	// Mirrored into the root config of every host.
	TelemetryLevel: { status: 'enforced' },

	// #endregion

	// #region Not implemented by Agent Host

	AgentsVoice: { status: 'notApplicable' },
	DictationEnabled: { status: 'notApplicable' },
	DictationLLMCleanup: { status: 'notApplicable' },
	DictationModel: { status: 'notApplicable' },
	AllowedExtensions: { status: 'notApplicable' },
	ExtensionsAutoUpdate: { status: 'notApplicable' },
	ExtensionsAutoUpdateDelay: { status: 'notApplicable' },
	ExtensionGalleryAuthProvider: { status: 'notApplicable' },
	ExtensionGalleryServiceUrl: { status: 'notApplicable' },
	CopilotReviewAgent: { status: 'notApplicable' },
	CopilotReviewSelection: { status: 'notApplicable' },
	CopilotNextEditSuggestions: { status: 'notApplicable' },
	EnableFeedback: { status: 'notApplicable' },
	UpdateMode: { status: 'notApplicable' },

	// #endregion
};
