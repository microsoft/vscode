/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { PolicyName } from '../../../../base/common/policy.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { IFileManagedSettingsService, INativeManagedSettingsService, MANAGED_SETTINGS_CHANNELS, ManagedSettingsChannel, pickManagedSettings } from '../../../../platform/policy/common/copilotManagedSettings.js';
import { IPolicyService, PolicyValue } from '../../../../platform/policy/common/policy.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { AccountPolicyGateState, AccountPolicyGateUnsatisfiedReason, IAccountPolicyGateService } from '../common/accountPolicyService.js';

/**
 * The delivery source attributed to an applied policy. Extends the managed-settings channels
 * (native MDM / server / file) with the non-managed-settings origins a policy can also have:
 * `osPolicy` (OS Group Policy / MDM config registry), `accountData` (the value is resolved from the
 * GitHub account's server-delivered policy data, not from a managed-settings channel), and
 * `accountGate` (the value is forced by the restricted Account Policy gate). `none` is used when a
 * policy has no applied value.
 */
type PolicySource = ManagedSettingsChannel | 'osPolicy' | 'accountData' | 'accountGate' | 'none';

/**
 * Policy names whose applied values this contribution reports on, kept in one place for reuse.
 * Keep these in sync with their declarations:
 * - Chat policies: src/vs/workbench/contrib/chat/browser/chat.shared.contribution.ts
 * - OTel policy: src/vs/platform/agentHost/common/agentHostStarter.config.contribution.ts
 * - Telemetry policies: src/vs/platform/telemetry/common/telemetryService.ts
 */
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
}

type PolicyAppliedEvent = {
	policyCount: number;

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

	sourceOsPolicyActive: boolean;
	sourceNativeMdmActive: boolean;
	sourceServerActive: boolean;
	sourceFileActive: boolean;
	sourceAccountDataActive: boolean;
	serverFetchStatus: string | undefined;

	defaultModelSource: PolicySource;
	toolsAutoApproveSource: PolicySource;
	otelSource: PolicySource;
	telemetryLevelSource: PolicySource;
};

type PolicyAppliedClassification = {
	owner: 'digitarald';
	comment: 'Reports which enterprise-managed settings and device policies are applied, their value buckets, and their delivery source, to understand managed-configuration adoption. No raw policy values are collected.';

	policyCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of policies with an applied value (the "applied" denominator).' };

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

	sourceOsPolicyActive: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'True if at least one applied policy is delivered by OS Group Policy / config registry.' };
	sourceNativeMdmActive: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'True if at least one applied policy is delivered by the native MDM managed-settings channel.' };
	sourceServerActive: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'True if at least one applied policy is delivered by the server managed-settings channel.' };
	sourceFileActive: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'True if at least one applied policy is delivered by the file managed-settings channel.' };
	sourceAccountDataActive: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'True if at least one applied policy is resolved from the GitHub account server policy data (not a managed-settings channel).' };
	serverFetchStatus: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Outcome bucket of the last managed-settings server fetch (ok/no-url/no-response/parse-error/HTTP status).' };

	defaultModelSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Delivery source of the default chat model policy.' };
	toolsAutoApproveSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Delivery source of the tools auto-approve policy.' };
	otelSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Delivery source of the OpenTelemetry-enabled policy.' };
	telemetryLevelSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Delivery source of the telemetry-level policy.' };
};

/**
 * Observability contribution that reports which managed settings and device policies are applied,
 * their value buckets, and the delivery source of each policy of interest. Emits one consolidated
 * `policy.applied` event at startup and whenever the resolved policy state changes (deduped on the
 * event payload, and debounced against bursts). Reports no raw policy values.
 */
export class PolicyTelemetryContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.policyTelemetry';

	private lastSignature: string | undefined;

	private readonly scheduler = this._register(new RunOnceScheduler(() => this.report(), 500));

	constructor(
		@IPolicyService private readonly policyService: IPolicyService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@INativeManagedSettingsService private readonly nativeManagedSettingsService: INativeManagedSettingsService,
		@IFileManagedSettingsService private readonly fileManagedSettingsService: IFileManagedSettingsService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IAccountPolicyGateService private readonly accountPolicyGateService: IAccountPolicyGateService,
	) {
		super();

		this.report();
		// Re-report whenever anything that feeds the payload changes — not only policy values, but
		// also the delivery source or the server fetch status (which can change while the effective
		// value stays the same). The payload dedupe drops redundant emits. Managed-settings change
		// events are `Event.None` (no-op) on hosts without those channels (e.g. web).
		this._register(this.policyService.onDidChange(() => this.scheduler.schedule()));
		this._register(this.defaultAccountService.onDidChangePolicyData(() => this.scheduler.schedule()));
		this._register(this.nativeManagedSettingsService.onDidChangeManagedSettings(() => this.scheduler.schedule()));
		this._register(this.fileManagedSettingsService.onDidChangeManagedSettings(() => this.scheduler.schedule()));
		this._register(this.accountPolicyGateService.onDidChangeGateInfo(() => this.scheduler.schedule()));
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
		const serialized = this.policyService.serialize();

		// `NullPolicyService` (no policy backend) returns undefined — report an explicit empty state
		// so the "applied" denominator still has a data point.
		if (serialized === undefined) {
			return this.emptyEvent();
		}

		const definitions = this.policyService.policyDefinitions;
		const value = (name: PolicyName): PolicyValue | undefined => this.policyService.getPolicyValue(name);

		let policyCount = 0;
		for (const name in definitions) {
			if (this.policyService.getPolicyValue(name) !== undefined) {
				policyCount++;
			}
		}

		// Per-key managed-settings resolution, exactly as policy evaluation applies it, so source
		// attribution can never drift from what is actually enforced.
		const pick = pickManagedSettings(
			this.nativeManagedSettingsService.managedSettings,
			this.defaultAccountService.policyData?.managedSettings,
			this.fileManagedSettingsService.managedSettings,
		);

		const gateInfo = this.accountPolicyGateService.gateInfo;
		const gateRestricted = gateInfo.state === AccountPolicyGateState.Restricted
			&& gateInfo.reason !== AccountPolicyGateUnsatisfiedReason.PolicyNotResolved;

		const sourceOf = (name: PolicyName): PolicySource => {
			if (value(name) === undefined) {
				return 'none';
			}
			const definition = definitions[name];
			// When the gate actively restricts, a policy that carries its own value/restricted value
			// is forced to the gate's restricted value regardless of managed settings.
			if (gateRestricted && definition && (definition.value !== undefined || definition.restrictedValue !== undefined)) {
				return 'accountGate';
			}
			const declaredKeys = definition?.managedSettings ? Object.keys(definition.managedSettings) : [];
			for (const channel of MANAGED_SETTINGS_CHANNELS) {
				if (declaredKeys.some(key => pick.resolutions.get(key)?.source === channel)) {
					return channel;
				}
			}
			// A value produced by the policy's own `value()` callback (with no winning managed-settings
			// channel) is resolved from the GitHub account's server-delivered policy data. Policies
			// without a `value()` callback get their value from the OS Group Policy / config-registry
			// channel instead.
			if (definition?.value !== undefined) {
				return 'accountData';
			}
			return 'osPolicy';
		};

		// Aggregate the delivery sources across every applied policy for the channel-active flags.
		const activeSources = new Set<PolicySource>();
		for (const name in definitions) {
			if (this.policyService.getPolicyValue(name) !== undefined) {
				activeSources.add(sourceOf(name));
			}
		}

		const defaultModel = value(PolicyNames.DefaultModel);
		const toolsAutoApprove = value(PolicyNames.ToolsAutoApprove);
		const strictMarketplaces = value(PolicyNames.StrictMarketplaces);
		const otel = value(PolicyNames.OtelEnabled);
		const telemetryLevel = value(PolicyNames.TelemetryLevel);

		return {
			policyCount,

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

			sourceOsPolicyActive: activeSources.has('osPolicy'),
			sourceNativeMdmActive: activeSources.has('nativeMdm'),
			sourceServerActive: activeSources.has('server'),
			sourceFileActive: activeSources.has('file'),
			sourceAccountDataActive: activeSources.has('accountData'),
			serverFetchStatus: fetchStatusLabel(this.defaultAccountService.managedSettingsFetchStatus),

			defaultModelSource: sourceOf(PolicyNames.DefaultModel),
			toolsAutoApproveSource: sourceOf(PolicyNames.ToolsAutoApprove),
			otelSource: sourceOf(PolicyNames.OtelEnabled),
			telemetryLevelSource: sourceOf(PolicyNames.TelemetryLevel),
		};
	}

	private emptyEvent(): PolicyAppliedEvent {
		return {
			policyCount: 0,

			defaultModelSet: false,
			toolsAutoApproveSet: false,
			enabledPluginsSet: false,
			extraMarketplacesSet: false,
			strictMarketplacesSet: false,
			approvedOrgsSet: false,
			otelSet: false,
			telemetryLevelSet: false,
			enableFeedbackSet: false,

			defaultModelForcedToAuto: false,
			toolsAutoApproveForcedOff: false,
			strictMarketplacesLockdown: false,
			otelForcedEnabled: false,
			telemetryLevel: undefined,

			sourceOsPolicyActive: false,
			sourceNativeMdmActive: false,
			sourceServerActive: false,
			sourceFileActive: false,
			sourceAccountDataActive: false,
			serverFetchStatus: fetchStatusLabel(this.defaultAccountService.managedSettingsFetchStatus),

			defaultModelSource: 'none',
			toolsAutoApproveSource: 'none',
			otelSource: 'none',
			telemetryLevelSource: 'none',
		};
	}
}

/**
 * The strict-marketplaces policy carries a JSON-encoded array of allowlisted sources; an empty
 * array (`[]`) is the "lockdown" case that blocks all marketplaces. Returns true only for that.
 */
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

/** Normalize the managed-settings fetch status to a stable string bucket for telemetry. */
function fetchStatusLabel(status: number | 'ok' | 'no-url' | 'no-response' | 'parse-error' | null | undefined): string | undefined {
	if (status === null || status === undefined) {
		return undefined;
	}
	return typeof status === 'number' ? `status:${status}` : status;
}

const KNOWN_TELEMETRY_LEVELS: ReadonlySet<string> = new Set(['off', 'crash', 'error', 'all']);

/**
 * Bucket the telemetry-level policy value into a known enum value, guarding the "no raw values"
 * contract: an unexpected string is reported as `'unknown'` rather than leaked verbatim.
 */
function telemetryLevelBucket(rawValue: PolicyValue | undefined): string | undefined {
	if (typeof rawValue !== 'string') {
		return undefined;
	}
	return KNOWN_TELEMETRY_LEVELS.has(rawValue) ? rawValue : 'unknown';
}

