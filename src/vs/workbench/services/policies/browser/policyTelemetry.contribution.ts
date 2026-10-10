/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { PolicyName } from '../../../../base/common/policy.js';
import { IPolicyService, PolicyValue, PolicyValueSource } from '../../../../platform/policy/common/policy.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';

const enum PolicyNames {
	DefaultModel = 'ChatDefaultModel',
	ToolsAutoApprove = 'ChatToolsAutoApprove',
	EnabledPlugins = 'ChatEnabledPlugins',
	ExtraMarketplaces = 'ChatExtraMarketplaces',
	StrictMarketplaces = 'ChatStrictMarketplaces',
	ApprovedOrgs = 'ChatApprovedAccountOrganizations',
	OtelEnabled = 'CopilotOtelEnabled',
	TelemetryLevel = 'TelemetryLevel',
	EnableFeedback = 'EnableFeedback',
	ToolsEligibleForAutoApproval = 'ChatToolsEligibleForAutoApproval',
	ToolsTerminalEnableAutoApprove = 'ChatToolsTerminalEnableAutoApprove',
	McpAccess = 'ChatMCP',
	AllowedMcpServers = 'ChatAllowedMcpServers',
	DeniedMcpServers = 'ChatDeniedMcpServers',
	AllowManagedMcpServersOnly = 'ChatAllowManagedMcpServersOnly',
	McpEnterpriseManagedAuthIdp = 'McpEnterpriseManagedAuthIdp',
	PluginsEnabled = 'ChatPluginsEnabled',
	StrictPluginOnlyCustomization = 'ChatStrictPluginOnlyCustomization',
	Hooks = 'ChatHooks',
	AllowManagedHooksOnly = 'ChatAllowManagedHooksOnly',
	AgentMode = 'ChatAgentMode',
	OtelProtocol = 'CopilotOtelProtocol',
	OtelCaptureIdentity = 'CopilotOtelCaptureIdentity',
	OtelHeaders = 'CopilotOtelHeaders',
	AgentNetworkFilter = 'ChatAgentNetworkFilter',
	AgentAllowedNetworkDomains = 'ChatAgentAllowedNetworkDomains',
	AgentDeniedNetworkDomains = 'ChatAgentDeniedNetworkDomains',
}

type PolicySource = PolicyValueSource | 'none';

type PolicyAppliedEvent = {
	devicePolicyCount: number;
	nativeMdmPolicyCount: number;
	serverManagedSettingsPolicyCount: number;
	fileManagedSettingsPolicyCount: number;
	mixedManagedSettingsPolicyCount: number;
	accountPolicyCount: number;
	accountGatePolicyCount: number;
	defaultModelSet: boolean;
	toolsAutoApproveSet: boolean;
	enabledPluginsSet: boolean;
	extraMarketplacesSet: boolean;
	strictMarketplacesSet: boolean;
	approvedOrgsSet: boolean;
	otelSet: boolean;
	telemetryLevelSet: boolean;
	enableFeedbackSet: boolean;
	defaultModelForcedToAuto: boolean;
	toolsAutoApproveForcedOff: boolean;
	strictMarketplacesLockdown: boolean;
	otelForcedEnabled: boolean;
	telemetryLevel: string | undefined;
	toolsEligibleForAutoApprovalSource: PolicySource;
	toolsTerminalEnableAutoApproveSource: PolicySource;
	mcpAccessSource: PolicySource;
	allowedMcpServersSource: PolicySource;
	deniedMcpServersSource: PolicySource;
	allowManagedMcpServersOnlySource: PolicySource;
	mcpEnterpriseManagedAuthIdpSource: PolicySource;
	pluginsEnabledSource: PolicySource;
	enabledPluginsSource: PolicySource;
	extraMarketplacesSource: PolicySource;
	strictMarketplacesSource: PolicySource;
	strictPluginOnlyCustomizationSource: PolicySource;
	hooksSource: PolicySource;
	allowManagedHooksOnlySource: PolicySource;
	agentModeSource: PolicySource;
	otelEnabledSource: PolicySource;
	otelProtocolSource: PolicySource;
	otelCaptureIdentitySource: PolicySource;
	otelHeadersSource: PolicySource;
	agentNetworkFilterSource: PolicySource;
	agentAllowedNetworkDomainsSource: PolicySource;
	agentDeniedNetworkDomainsSource: PolicySource;
};

type PolicyAppliedClassification = {
	owner: 'joshspicer';
	comment: 'Reports effective policy presence, delivery sources, and selected value buckets, not runtime enforcement. Sources are none, device, nativeMdm, serverManagedSettings, fileManagedSettings, mixedManagedSettings, account, or accountGate. No raw policy values are collected.';
	devicePolicyCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of effective policy values from OS or device policy, including values without more specific tracked provenance.' };
	nativeMdmPolicyCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of effective policy values caused by managed settings delivered through native MDM.' };
	serverManagedSettingsPolicyCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of effective policy values caused by managed settings delivered from GitHub services.' };
	fileManagedSettingsPolicyCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of effective policy values caused by managed settings delivered through a policy file.' };
	mixedManagedSettingsPolicyCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of effective policy values caused by managed settings from more than one delivery channel.' };
	accountPolicyCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of effective policy values derived from GitHub account policy or entitlement data.' };
	accountGatePolicyCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of effective policy values forced by an unsatisfied approved-account gate.' };
	defaultModelSet: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'True if the default chat model policy is applied.' };
	toolsAutoApproveSet: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'True if the tools auto-approve policy is applied.' };
	enabledPluginsSet: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'True if the enabled-plugins policy is applied.' };
	extraMarketplacesSet: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'True if the extra-marketplaces policy is applied.' };
	strictMarketplacesSet: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'True if the strict-marketplaces policy is applied.' };
	approvedOrgsSet: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'True if the approved-account-organizations policy is applied.' };
	otelSet: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'True if the OpenTelemetry-enabled policy is applied.' };
	telemetryLevelSet: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'True if the telemetry-level policy is applied.' };
	enableFeedbackSet: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'True if the enable-feedback policy is applied.' };
	defaultModelForcedToAuto: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'True if the default chat model policy forces the "auto" model.' };
	toolsAutoApproveForcedOff: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'True if the tools auto-approve policy forces auto-approve off.' };
	strictMarketplacesLockdown: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'True if the strict-marketplaces policy is an empty allowlist (blocks all marketplaces).' };
	otelForcedEnabled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'True if the OpenTelemetry policy forces export enabled.' };
	telemetryLevel: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The forced telemetry level bucket (off/crash/error/all, or "unknown") when the telemetry-level policy is applied.' };
	toolsEligibleForAutoApprovalSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Effective delivery source of ChatToolsEligibleForAutoApproval, or none when unset.' };
	toolsTerminalEnableAutoApproveSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Effective delivery source of ChatToolsTerminalEnableAutoApprove, or none when unset.' };
	mcpAccessSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Effective delivery source of ChatMCP, or none when unset.' };
	allowedMcpServersSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Effective delivery source of ChatAllowedMcpServers, or none when unset.' };
	deniedMcpServersSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Effective delivery source of ChatDeniedMcpServers, or none when unset.' };
	allowManagedMcpServersOnlySource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Effective delivery source of ChatAllowManagedMcpServersOnly, or none when unset.' };
	mcpEnterpriseManagedAuthIdpSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Effective delivery source of McpEnterpriseManagedAuthIdp, or none when unset.' };
	pluginsEnabledSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Effective delivery source of ChatPluginsEnabled, or none when unset.' };
	enabledPluginsSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Effective delivery source of ChatEnabledPlugins, or none when unset.' };
	extraMarketplacesSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Effective delivery source of ChatExtraMarketplaces, or none when unset.' };
	strictMarketplacesSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Effective delivery source of ChatStrictMarketplaces, or none when unset.' };
	strictPluginOnlyCustomizationSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Effective delivery source of ChatStrictPluginOnlyCustomization, or none when unset.' };
	hooksSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Effective delivery source of ChatHooks, or none when unset.' };
	allowManagedHooksOnlySource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Effective delivery source of ChatAllowManagedHooksOnly, or none when unset.' };
	agentModeSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Effective delivery source of ChatAgentMode, or none when unset.' };
	otelEnabledSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Effective delivery source of CopilotOtelEnabled, or none when unset.' };
	otelProtocolSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Effective delivery source of CopilotOtelProtocol, or none when unset.' };
	otelCaptureIdentitySource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Effective delivery source of CopilotOtelCaptureIdentity, or none when unset.' };
	otelHeadersSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Effective delivery source of CopilotOtelHeaders, or none when unset.' };
	agentNetworkFilterSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Effective delivery source of ChatAgentNetworkFilter, or none when unset.' };
	agentAllowedNetworkDomainsSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Effective delivery source of ChatAgentAllowedNetworkDomains, or none when unset.' };
	agentDeniedNetworkDomainsSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Effective delivery source of ChatAgentDeniedNetworkDomains, or none when unset.' };
};

export class PolicyTelemetryContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.policyTelemetry';

	private lastSignature: string | undefined;
	private readonly scheduler = this._register(new RunOnceScheduler(() => this.report(), 500));

	constructor(
		@IPolicyService private readonly policyService: IPolicyService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();
		this.scheduler.schedule();
		this._register(this.policyService.onDidChange(() => this.scheduler.schedule()));
	}

	private report(): void {
		const event = this.buildEvent();
		const signature = JSON.stringify(event);
		if (signature === this.lastSignature) {
			return;
		}
		this.lastSignature = signature;
		this.telemetryService.publicLog2<PolicyAppliedEvent, PolicyAppliedClassification>('policy.applied', event);
	}

	private buildEvent(): PolicyAppliedEvent {
		const value = (name: PolicyName): PolicyValue | undefined => this.policyService.getPolicyValue(name);
		const source = (name: PolicyName): PolicySource => value(name) === undefined
			? 'none'
			: this.policyService.getPolicyValueSource(name) ?? PolicyValueSource.Device;
		let devicePolicyCount = 0;
		let nativeMdmPolicyCount = 0;
		let serverManagedSettingsPolicyCount = 0;
		let fileManagedSettingsPolicyCount = 0;
		let mixedManagedSettingsPolicyCount = 0;
		let accountPolicyCount = 0;
		let accountGatePolicyCount = 0;
		for (const name in this.policyService.policyDefinitions) {
			if (value(name) !== undefined) {
				switch (this.policyService.getPolicyValueSource(name) ?? PolicyValueSource.Device) {
					case PolicyValueSource.Device:
						devicePolicyCount++;
						break;
					case PolicyValueSource.NativeMdm:
						nativeMdmPolicyCount++;
						break;
					case PolicyValueSource.ServerManagedSettings:
						serverManagedSettingsPolicyCount++;
						break;
					case PolicyValueSource.FileManagedSettings:
						fileManagedSettingsPolicyCount++;
						break;
					case PolicyValueSource.MixedManagedSettings:
						mixedManagedSettingsPolicyCount++;
						break;
					case PolicyValueSource.Account:
						accountPolicyCount++;
						break;
					case PolicyValueSource.AccountGate:
						accountGatePolicyCount++;
						break;
				}
			}
		}

		const defaultModel = value(PolicyNames.DefaultModel);
		const toolsAutoApprove = value(PolicyNames.ToolsAutoApprove);
		const strictMarketplaces = value(PolicyNames.StrictMarketplaces);
		const otel = value(PolicyNames.OtelEnabled);
		const telemetryLevel = value(PolicyNames.TelemetryLevel);

		return {
			devicePolicyCount,
			nativeMdmPolicyCount,
			serverManagedSettingsPolicyCount,
			fileManagedSettingsPolicyCount,
			mixedManagedSettingsPolicyCount,
			accountPolicyCount,
			accountGatePolicyCount,
			defaultModelSet: defaultModel !== undefined,
			toolsAutoApproveSet: toolsAutoApprove !== undefined,
			enabledPluginsSet: value(PolicyNames.EnabledPlugins) !== undefined,
			extraMarketplacesSet: value(PolicyNames.ExtraMarketplaces) !== undefined,
			strictMarketplacesSet: strictMarketplaces !== undefined,
			approvedOrgsSet: value(PolicyNames.ApprovedOrgs) !== undefined,
			otelSet: otel !== undefined,
			telemetryLevelSet: telemetryLevel !== undefined,
			enableFeedbackSet: value(PolicyNames.EnableFeedback) !== undefined,
			defaultModelForcedToAuto: defaultModel === 'auto',
			toolsAutoApproveForcedOff: toolsAutoApprove === false,
			strictMarketplacesLockdown: isEmptyMarketplaceAllowlist(strictMarketplaces),
			otelForcedEnabled: otel === true,
			telemetryLevel: telemetryLevelBucket(telemetryLevel),
			toolsEligibleForAutoApprovalSource: source(PolicyNames.ToolsEligibleForAutoApproval),
			toolsTerminalEnableAutoApproveSource: source(PolicyNames.ToolsTerminalEnableAutoApprove),
			mcpAccessSource: source(PolicyNames.McpAccess),
			allowedMcpServersSource: source(PolicyNames.AllowedMcpServers),
			deniedMcpServersSource: source(PolicyNames.DeniedMcpServers),
			allowManagedMcpServersOnlySource: source(PolicyNames.AllowManagedMcpServersOnly),
			mcpEnterpriseManagedAuthIdpSource: source(PolicyNames.McpEnterpriseManagedAuthIdp),
			pluginsEnabledSource: source(PolicyNames.PluginsEnabled),
			enabledPluginsSource: source(PolicyNames.EnabledPlugins),
			extraMarketplacesSource: source(PolicyNames.ExtraMarketplaces),
			strictMarketplacesSource: source(PolicyNames.StrictMarketplaces),
			strictPluginOnlyCustomizationSource: source(PolicyNames.StrictPluginOnlyCustomization),
			hooksSource: source(PolicyNames.Hooks),
			allowManagedHooksOnlySource: source(PolicyNames.AllowManagedHooksOnly),
			agentModeSource: source(PolicyNames.AgentMode),
			otelEnabledSource: source(PolicyNames.OtelEnabled),
			otelProtocolSource: source(PolicyNames.OtelProtocol),
			otelCaptureIdentitySource: source(PolicyNames.OtelCaptureIdentity),
			otelHeadersSource: source(PolicyNames.OtelHeaders),
			agentNetworkFilterSource: source(PolicyNames.AgentNetworkFilter),
			agentAllowedNetworkDomainsSource: source(PolicyNames.AgentAllowedNetworkDomains),
			agentDeniedNetworkDomainsSource: source(PolicyNames.AgentDeniedNetworkDomains),
		};
	}
}

function isEmptyMarketplaceAllowlist(rawValue: PolicyValue | undefined): boolean {
	if (typeof rawValue !== 'string') {
		return false;
	}
	try {
		const parsed = JSON.parse(rawValue);
		return Array.isArray(parsed) && parsed.length === 0;
	} catch {
		return false;
	}
}

const KNOWN_TELEMETRY_LEVELS: ReadonlySet<string> = new Set(['off', 'crash', 'error', 'all']);

function telemetryLevelBucket(rawValue: PolicyValue | undefined): string | undefined {
	if (rawValue === undefined) {
		return undefined;
	}
	return typeof rawValue === 'string' && KNOWN_TELEMETRY_LEVELS.has(rawValue) ? rawValue : 'unknown';
}

registerWorkbenchContribution2(PolicyTelemetryContribution.ID, PolicyTelemetryContribution, WorkbenchPhase.AfterRestored);
