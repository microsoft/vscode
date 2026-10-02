/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * How completely Agent Host enforces an enterprise policy.
 *
 * - `enforced`: the policy governs Agent Host sessions as it governs Local sessions.
 * - `partial`: coverage is incomplete across paths or policy delivery sources.
 * - `notEnforced`: Agent Host sessions ignore the policy.
 * - `notApplicable`: the governed behavior is outside the Copilot Agent Host scope.
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
 * remote hosts are noted next to the entry. Shared editor-owned controls are
 * included; `enforced` for those controls does not imply a runtime enforcement point.
 *
 * Status is conservative across delivery channels. The Copilot runtime reads
 * Copilot managed settings (GitHub organization settings, `com.github.copilot`
 * or `GitHubCopilot` native MDM, and `managed-settings.json`) itself; it does
 * not see values delivered only through VS Code policy. A policy the runtime
 * enforces only when delivered through Copilot managed settings is `partial`.
 *
 * This inventory is not a runtime enforcement certification. Source-confirmed
 * delivery gaps and runtime behavior that still needs execution evidence are
 * distinguished in the comments.
 *
 * The policy export fails for a policy without an entry here, and the build
 * tests fail when `policyData.jsonc` contains a policy without a status.
 */
export const agentHostPolicySupport: Readonly<Record<string, IAgentHostPolicySupport>> = {
	// #region Tool approval, sandbox, and network

	// Forwarded to every host as `autoApprovePolicyRestricted`; Copilot, Claude, and Codex honor it.
	ChatToolsAutoApprove: { status: 'enforced' },
	// The bridge disables bypass session-wide but does not force per-tool confirmation in other
	// approval modes. #337540
	ChatToolsEligibleForAutoApproval: { status: 'partial' },
	// The bridge requires managed approval for native shell requests. Custom terminal tools report
	// custom-tool requests instead, so their host-side approval paths still need a parity audit.
	ChatToolsTerminalEnableAutoApprove: { status: 'partial' },
	// Connection-owned legacy requirements block direct session Off on supported platforms (#339144).
	// Policy loading versus withdrawal and last-client disconnect-grace transitions still need
	// end-to-end verification. Copilot only.
	ChatAgentSandboxEnabled: { status: 'partial' },
	// Forwarded as the SDK sandbox `allowOutbound`. Copilot only.
	ChatAgentSandboxAllowNetwork: { status: 'enforced' },
	// Forwarded as the SDK sandbox `allowBypass`. Copilot only.
	ChatAgentSandboxAllowUnsandboxedCommands: { status: 'enforced' },
	// Not read by Agent Host; Copilot auto-approves every sandboxed shell command. Not yet tracked.
	ChatAgentSandboxAllowAutoApprove: { status: 'notEnforced' },
	// The default-on bridge covers supported denies and empty-list deny-all, but not allowlists
	// or every VS Code domain pattern. #337538, #337539
	ChatAgentNetworkFilter: { status: 'partial' },
	// Shared browser tools and the custom terminal sandbox consume the lists; native SDK
	// sandboxing ignores them, and the permissions bridge does not translate allowlists.
	ChatAgentAllowedNetworkDomains: { status: 'partial' },
	ChatAgentDeniedNetworkDomains: { status: 'partial' },

	// #endregion

	// #region MCP

	// The workbench filters forwarded collections, but independent runtime discovery does not
	// consult VS Code MCP access. #328241
	ChatMCP: { status: 'partial' },
	// Workbench server starts apply these restrictions, but VS Code-only values are not reverse-
	// forwarded to runtime discovery. Runtime-native managed-setting enforcement, including
	// host-supplied servers and built-in exemptions, still needs execution verification. #328241
	ChatAllowedMcpServers: { status: 'partial' },
	ChatDeniedMcpServers: { status: 'partial' },
	ChatAllowManagedMcpServersOnly: { status: 'partial' },
	// Governs gallery browsing and installation in the workbench.
	McpGalleryServiceUrl: { status: 'enforced' },
	// Forwarded MCP auth drops OAuth configuration and uses resource authorization servers, not
	// Local's enterprise-managed IdP lookup. This does not audit every runtime-owned auth path.
	McpEnterpriseManagedAuthIdp: { status: 'notEnforced' },

	// #endregion

	// #region Plugins, customizations, and hooks

	// The workbench filters the plugins it synchronizes, but runtime configuration discovery and Claude's
	// native plugin scan find plugins independently. Not yet tracked.
	ChatPluginsEnabled: { status: 'partial' },
	// Policy-disabled plugins are synchronized as a global customization decision, not an immutable
	// policy floor: more specific session/workspace decisions can override it.
	ChatEnabledPlugins: { status: 'partial' },
	// Shared marketplace discovery and installation honor these settings. VS Code-only values do
	// not reach runtime-owned marketplace operations, whose enforcement needs separate verification.
	// Extra marketplaces are additive; strict marketplaces do not disable already-installed plugins.
	ChatExtraMarketplaces: { status: 'partial' },
	ChatStrictMarketplaces: { status: 'partial' },
	// The workbench filters synchronized customizations; independent runtime discovery is not
	// governed by the VS Code-only value. Instructions are sent to the SDK too; runtime-native
	// lockdown across every customization type still needs execution verification.
	ChatStrictPluginOnlyCustomization: { status: 'partial' },
	// Documented as Local-only; Agent Host enables runtime file hooks regardless.
	ChatHooks: { status: 'notEnforced' },
	// Shared prompt discovery filters hooks, but VS Code-only values do not govern runtime file
	// hooks. Runtime-native enforcement and its effect on SDK callbacks remain unverified here.
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

	// Other-provider availability is outside this Copilot-only inventory. These are not certified
	// process-denial controls: inherited environment/root configuration can still register a provider.
	Claude3PIntegration: { status: 'notApplicable' },
	Codex3PIntegration: { status: 'notApplicable' },
	// Directly controls Copilot's custom-shell creation.
	ChatAgentHostCustomTerminalTool: { status: 'enforced' },
	// Explicit false clears destinations initially, but separately configured destinations or the
	// DB recorder can re-enable host telemetry in resolveAgentHostOTelConfig.
	CopilotOtelEnabled: { status: 'partial' },
	// Forwarded exporter type can be overridden by inherited OTLP protocol in the host consumer.
	CopilotOtelProtocol: { status: 'partial' },
	// Policy-priority forwarding and host consumption; remote hosts do not receive them.
	CopilotOtelEndpoint: { status: 'enforced' },
	CopilotOtelOtlpProtocol: { status: 'enforced' },
	CopilotOtelOutfile: { status: 'enforced' },
	CopilotOtelResourceAttributes: { status: 'enforced' },
	CopilotOtelServiceName: { status: 'enforced' },
	CopilotOtelCaptureContent: { status: 'enforced' },
	// Policy-priority forwarding and host identity capture/suppression are implemented (#339045).
	// Authenticated runtime account attribution still needs runtime adoption and verification;
	// direct runtime exports use their own identity controls rather than the host's filter.
	CopilotOtelCaptureIdentity: { status: 'partial' },
	// Missing from VS Code policy forwarding. Runtime-native telemetry policy does not establish
	// enforcement for the host's own telemetry pipeline; that coverage remains unverified here.
	CopilotOtelHeaders: { status: 'partial' },
	// Mirrored into the root config of every host.
	TelemetryLevel: { status: 'enforced' },

	// #endregion

	// #region Shared editor-owned controls

	// Shared voice/dictation entry points and service honor policy-backed configuration.
	AgentsVoice: { status: 'enforced' },
	DictationEnabled: { status: 'enforced' },
	DictationLLMCleanup: { status: 'enforced' },
	DictationModel: { status: 'enforced' },
	// Governs VS Code extensions, their updater and gallery, not SDK runtime extensions/plugins.
	AllowedExtensions: { status: 'enforced' },
	ExtensionsAutoUpdate: { status: 'enforced' },
	ExtensionsAutoUpdateDelay: { status: 'enforced' },
	ExtensionGalleryAuthProvider: { status: 'enforced' },
	ExtensionGalleryServiceUrl: { status: 'enforced' },
	EnableFeedback: { status: 'enforced' },
	UpdateMode: { status: 'enforced' },

	// #endregion

	// #region Not implemented by Copilot Agent Host

	CopilotReviewAgent: { status: 'notApplicable' },
	CopilotReviewSelection: { status: 'notApplicable' },
	CopilotNextEditSuggestions: { status: 'notApplicable' },

	// #endregion
};
