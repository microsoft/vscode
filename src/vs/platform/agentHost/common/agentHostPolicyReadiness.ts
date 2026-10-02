/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../configuration/common/configuration.js';
import { Extensions, IConfigurationRegistry } from '../../configuration/common/configurationRegistry.js';
import { AgentNetworkDomainSettingId } from '../../networkFilter/common/settings.js';
import { Registry } from '../../registry/common/platform.js';
import { AgentSandboxEnabledSettingValue, AgentSandboxSettingId, isAgentSandboxEnabledValue } from '../../sandbox/common/settings.js';
import { localize } from '../../../nls.js';
import { agentHostPolicySupport, AgentHostPolicySupportStatus } from './agentHostPolicySupport.js';

export interface IAgentHostPolicyGap {
	readonly policyName: string;
	readonly settingId: string;
	readonly status: AgentHostPolicySupportStatus;
}

/** Diagnostic only: conservative across sources, without changing harness selection or enforcement. */
export function getAgentHostPolicyGaps(configurationService: IConfigurationService): readonly IAgentHostPolicyGap[] {
	const gaps: IAgentHostPolicyGap[] = [];
	for (const [policyName, settingId] of Registry.as<IConfigurationRegistry>(Extensions.Configuration).getPolicyConfigurations()) {
		const support = agentHostPolicySupport[policyName];
		if (support?.status !== 'partial' && support?.status !== 'notEnforced') {
			continue;
		}
		const value = configurationService.inspect(settingId).policyValue;
		if (value !== undefined && hasPolicyRequirement(policyName, value, configurationService)) {
			gaps.push({ policyName, settingId, status: support.status });
		}
	}
	return gaps.sort((a, b) => a.policyName.localeCompare(b.policyName));
}

/** User-visible impact without exposing policy values, endpoints, or credentials. */
export function getAgentHostPolicyGapImpact(policyName: string): string {
	switch (policyName) {
		case 'ChatToolsEligibleForAutoApproval':
			return localize('policyGap.toolApproval', "Allow All is disabled session-wide, but tools excluded by policy can still be approved automatically through other approval paths.");
		case 'ChatToolsTerminalEnableAutoApprove':
			return localize('policyGap.terminalApproval', "Native shell commands require approval through the bridge. Custom terminal tools do not have equivalent managed-ask coverage in every approval mode.");
		case 'ChatAgentSandboxEnabled':
			return localize('policyGap.sandbox', "Policy-required sandboxing blocks direct session Off overrides on supported platforms. Verify delayed policy loading and loss/reapplication of the last client's requirement across disconnect-grace expiry.");
		case 'ChatAgentNetworkFilter':
		case 'ChatAgentAllowedNetworkDomains':
		case 'ChatAgentDeniedNetworkDomains':
			return localize('policyGap.network', "Shared browser tools and custom terminal sandboxing honor domain lists, but native SDK sandboxing does not apply those lists. The bridge covers only supported runtime URL denies. Access may be allowed or blocked differently from Local.");
		case 'ChatMCP':
			return localize('policyGap.mcpAccess', "The workbench filters forwarded MCP collections, but Agent Host can independently discover and run MCP servers despite the VS Code MCP access restriction.");
		case 'ChatAllowedMcpServers':
		case 'ChatDeniedMcpServers':
		case 'ChatAllowManagedMcpServersOnly':
			return localize('policyGap.mcpLists', "VS Code-only server restrictions are not delivered to all Agent Host discovery paths. Runtime managed settings have separate enforcement; this report does not assume the two sources are equivalent.");
		case 'McpEnterpriseManagedAuthIdp':
			return localize('policyGap.mcpAuth', "Forwarded MCP authentication does not use Local's enterprise-managed identity-provider lookup. Enterprise single sign-on may be unavailable; runtime-owned authentication paths are not certified by this check.");
		case 'ChatPluginsEnabled':
		case 'ChatEnabledPlugins':
			return localize('policyGap.plugins', "The workbench filters synchronized plugins, but runtime discovery and more specific customization decisions do not have equivalent policy coverage.");
		case 'ChatExtraMarketplaces':
		case 'ChatStrictMarketplaces':
			return localize('policyGap.marketplaces', "Shared marketplace discovery and installation honor these controls. Runtime-owned marketplace operations do not receive VS Code-only values and need separate verification. Strict marketplace rules do not retroactively disable installed plugins.");
		case 'ChatStrictPluginOnlyCustomization':
			return localize('policyGap.customizations', "The workbench filters synchronized customizations, but runtime discovery and standalone instructions do not have equivalent coverage across policy sources.");
		case 'ChatHooks':
			return localize('policyGap.hooks', "The Local-only hooks switch does not disable runtime-discovered Agent Host hooks.");
		case 'ChatAllowManagedHooksOnly':
			return localize('policyGap.managedHooks', "Shared prompt discovery filters hooks, but the VS Code-only requirement is not delivered to runtime file hooks. Runtime-native managed-hook and SDK callback behavior needs separate verification.");
		case 'ChatAgentMode':
			return localize('policyGap.agentMode', "Agent Host session targets can remain available in the editor even when agent mode is disabled by policy.");
		case 'CopilotOtelEnabled':
			return localize('policyGap.otelEnabled', "A policy disabling OpenTelemetry can be overridden by a separately configured export destination or database recorder in the host's telemetry configuration.");
		case 'CopilotOtelProtocol':
			return localize('policyGap.otelProtocol', "Inherited OTLP protocol configuration can override the policy-selected exporter type.");
		case 'CopilotOtelCaptureIdentity':
			return localize('policyGap.otelIdentity', "The Agent Host pipeline honors identity capture and suppression. Authenticated runtime account attribution still requires a runtime update and end-to-end verification; direct runtime exports use their own identity controls.");
		case 'CopilotOtelHeaders':
			return localize('policyGap.otelHeaders', "VS Code-only exporter headers do not reach Agent Host. Export requiring those headers may fail; runtime-managed telemetry does not establish coverage of the host's own exporter.");
		default:
			return localize('policyGap.unknown', "Agent Host does not fully enforce this configured requirement. Review its policy support before migrating.");
	}
}

function hasPolicyRequirement(policyName: string, value: unknown, configurationService: IConfigurationService): boolean {
	switch (policyName) {
		case 'ChatAgentMode':
		case 'ChatToolsTerminalEnableAutoApprove':
		case 'ChatPluginsEnabled':
		case 'ChatHooks':
		case 'CopilotOtelEnabled':
			return value !== true;
		case 'ChatAllowManagedMcpServersOnly':
		case 'ChatAllowManagedHooksOnly':
		case 'ChatStrictPluginOnlyCustomization':
			return value !== false;
		case 'ChatAgentSandboxEnabled':
			return value !== 'off' && value !== false;
		case 'ChatMCP':
			return value !== 'all';
		case 'ChatToolsEligibleForAutoApproval':
			return !isObject(value) || Object.values(value).some(eligible => eligible !== true);
		case 'ChatStrictMarketplaces':
		case 'ChatAllowedMcpServers':
			// An empty allowlist denies everything; null means no restriction.
			return value !== null;
		case 'ChatDeniedMcpServers':
			return value !== null && (!Array.isArray(value) || value.length > 0);
		case 'ChatEnabledPlugins':
		case 'ChatExtraMarketplaces':
		case 'CopilotOtelHeaders':
		case 'McpEnterpriseManagedAuthIdp':
			return !isObject(value) || Object.keys(value).length > 0;
		case 'ChatAgentNetworkFilter':
			return configurationService.getValue<boolean>(AgentNetworkDomainSettingId.NetworkFilter) === true;
		case 'ChatAgentAllowedNetworkDomains':
		case 'ChatAgentDeniedNetworkDomains':
			// Local's terminal sandbox consumes domain lists independently of the URL filter.
			return configurationService.getValue<boolean>(AgentNetworkDomainSettingId.NetworkFilter) === true
				|| ((!Array.isArray(value) || value.length > 0) && isAgentSandboxEnabledValue(configurationService.getValue<AgentSandboxEnabledSettingValue>(
					AgentSandboxSettingId.AgentSandboxEnabled)));
		default:
			// Report newly classified requirements until a policy-specific predicate is defined.
			return true;
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
