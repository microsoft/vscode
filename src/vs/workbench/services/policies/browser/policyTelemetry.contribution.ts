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
import { AccountPolicyGateState, IAccountPolicyGateService, isAccountPolicyGateBlocked } from '../common/accountPolicyService.js';
import { CORE_POLICY_NAMES } from '../common/policyTelemetry.js';

const enum PolicyNames {
	DefaultModel = 'ChatDefaultModel',
	ToolsAutoApprove = 'ChatToolsAutoApprove',
	StrictMarketplaces = 'ChatStrictMarketplaces',
	OtelEnabled = 'CopilotOtelEnabled',
	TelemetryLevel = 'TelemetryLevel',
}

type ReportedPolicyValueSource = Exclude<PolicyValueSource, PolicyValueSource.AccountGate>;
type TelemetryLevelBucket = 'off' | 'crash' | 'error' | 'all' | 'unknown' | undefined;

type PolicyAppliedEvent = {
	devicePolicyCount: number;
	nativeMdmPolicyCount: number;
	serverManagedSettingsPolicyCount: number;
	fileManagedSettingsPolicyCount: number;
	mixedManagedSettingsPolicyCount: number;
	accountPolicyCount: number;
	accountGateActive: boolean;
	accountGateBlocked: boolean;
	defaultModelForcedToAuto: boolean;
	toolsAutoApproveForcedOff: boolean;
	strictMarketplacesLockdown: boolean;
	otelForcedEnabled: boolean;
	telemetryLevel: TelemetryLevelBucket;
	devicePolicyKeys: string;
	nativeMdmPolicyKeys: string;
	serverManagedSettingsPolicyKeys: string;
	fileManagedSettingsPolicyKeys: string;
	mixedManagedSettingsPolicyKeys: string;
	accountPolicyKeys: string;
};

type PolicyAppliedClassification = {
	owner: 'joshspicer';
	comment: 'Reports effective policy values by privacy-safe delivery source and selected value buckets, to distinguish device policy, managed-settings channels, and account-driven restrictions. No raw policy values are collected.';
	devicePolicyCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of all effective non-gate policy values, including dynamically registered policies, from OS or device policy or without more specific tracked provenance.' };
	nativeMdmPolicyCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of all effective non-gate policy values, including dynamically registered policies, caused by managed settings delivered through native MDM.' };
	serverManagedSettingsPolicyCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of all effective non-gate policy values, including dynamically registered policies, caused by managed settings delivered from GitHub services.' };
	fileManagedSettingsPolicyCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of all effective non-gate policy values, including dynamically registered policies, caused by managed settings delivered through a policy file.' };
	mixedManagedSettingsPolicyCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of all effective non-gate policy values, including dynamically registered policies, caused by managed settings from more than one delivery channel.' };
	accountPolicyCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of all effective non-gate policy values, including dynamically registered policies, derived from GitHub account policy or entitlement data.' };
	accountGateActive: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'True when an approved-account gate is configured, whether it is satisfied or restrictive.' };
	accountGateBlocked: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'True when an unsatisfied approved-account gate actively restricts access to AI features.' };
	defaultModelForcedToAuto: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'True if the default chat model policy forces the "auto" model.' };
	toolsAutoApproveForcedOff: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'True if the tools auto-approve policy forces auto-approve off.' };
	strictMarketplacesLockdown: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'True if the strict-marketplaces policy is an empty allowlist (blocks all marketplaces).' };
	otelForcedEnabled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'True if the OpenTelemetry policy forces export enabled.' };
	telemetryLevel: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The forced telemetry level bucket (off/crash/error/all, or "unknown") when the telemetry-level policy is applied.' };
	devicePolicyKeys: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Comma-separated, lexicographically sorted names of effective core VS Code policies from OS or device policy. Contains no policy values or dynamically registered policy names.' };
	nativeMdmPolicyKeys: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Comma-separated, lexicographically sorted names of effective core VS Code policies caused by native MDM settings. Contains no policy values or dynamically registered policy names.' };
	serverManagedSettingsPolicyKeys: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Comma-separated, lexicographically sorted names of effective core VS Code policies caused by server-managed settings. Contains no policy values or dynamically registered policy names.' };
	fileManagedSettingsPolicyKeys: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Comma-separated, lexicographically sorted names of effective core VS Code policies caused by a policy file. Contains no policy values or dynamically registered policy names.' };
	mixedManagedSettingsPolicyKeys: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Comma-separated, lexicographically sorted names of effective core VS Code policies caused by multiple managed-settings channels. Contains no policy values or dynamically registered policy names.' };
	accountPolicyKeys: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Comma-separated, lexicographically sorted names of effective core VS Code policies derived from GitHub account policy or entitlement data. Contains no policy values or dynamically registered policy names.' };
};

export class PolicyTelemetryContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.policyTelemetry';

	private lastSignature: string | undefined;
	private readonly scheduler = this._register(new RunOnceScheduler(() => this.report(), 500));

	constructor(
		@IPolicyService private readonly policyService: IPolicyService,
		@IAccountPolicyGateService private readonly accountPolicyGateService: IAccountPolicyGateService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();
		this.scheduler.schedule();
		this._register(this.policyService.onDidChange(() => this.scheduler.schedule()));
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
		const value = (name: PolicyName): PolicyValue | undefined => this.policyService.getPolicyValue(name);
		const policyCountsBySource: Record<ReportedPolicyValueSource, number> = {
			[PolicyValueSource.Device]: 0,
			[PolicyValueSource.NativeMdm]: 0,
			[PolicyValueSource.ServerManagedSettings]: 0,
			[PolicyValueSource.FileManagedSettings]: 0,
			[PolicyValueSource.MixedManagedSettings]: 0,
			[PolicyValueSource.Account]: 0,
		};
		const policyKeysBySource: Record<ReportedPolicyValueSource, PolicyName[]> = {
			[PolicyValueSource.Device]: [],
			[PolicyValueSource.NativeMdm]: [],
			[PolicyValueSource.ServerManagedSettings]: [],
			[PolicyValueSource.FileManagedSettings]: [],
			[PolicyValueSource.MixedManagedSettings]: [],
			[PolicyValueSource.Account]: [],
		};
		for (const name in this.policyService.policyDefinitions) {
			if (value(name) === undefined) {
				continue;
			}
			const source = this.policyService.getPolicyValueSource(name) ?? PolicyValueSource.Device;
			if (source !== PolicyValueSource.AccountGate) {
				policyCountsBySource[source]++;
			}
		}
		for (const name of CORE_POLICY_NAMES) {
			if (value(name) === undefined) {
				continue;
			}
			const source = this.policyService.getPolicyValueSource(name) ?? PolicyValueSource.Device;
			if (source !== PolicyValueSource.AccountGate) {
				policyKeysBySource[source].push(name);
			}
		}

		const defaultModel = value(PolicyNames.DefaultModel);
		const toolsAutoApprove = value(PolicyNames.ToolsAutoApprove);
		const strictMarketplaces = value(PolicyNames.StrictMarketplaces);
		const otel = value(PolicyNames.OtelEnabled);
		const telemetryLevel = value(PolicyNames.TelemetryLevel);
		const accountGateInfo = this.accountPolicyGateService.gateInfo;

		return {
			devicePolicyCount: policyCountsBySource[PolicyValueSource.Device],
			nativeMdmPolicyCount: policyCountsBySource[PolicyValueSource.NativeMdm],
			serverManagedSettingsPolicyCount: policyCountsBySource[PolicyValueSource.ServerManagedSettings],
			fileManagedSettingsPolicyCount: policyCountsBySource[PolicyValueSource.FileManagedSettings],
			mixedManagedSettingsPolicyCount: policyCountsBySource[PolicyValueSource.MixedManagedSettings],
			accountPolicyCount: policyCountsBySource[PolicyValueSource.Account],
			accountGateActive: accountGateInfo.state !== AccountPolicyGateState.Inactive,
			accountGateBlocked: isAccountPolicyGateBlocked(accountGateInfo),
			defaultModelForcedToAuto: defaultModel === 'auto',
			toolsAutoApproveForcedOff: toolsAutoApprove === false,
			strictMarketplacesLockdown: isEmptyMarketplaceAllowlist(strictMarketplaces),
			otelForcedEnabled: otel === true,
			telemetryLevel: telemetryLevelBucket(telemetryLevel),
			devicePolicyKeys: policyKeysBySource[PolicyValueSource.Device].join(','),
			nativeMdmPolicyKeys: policyKeysBySource[PolicyValueSource.NativeMdm].join(','),
			serverManagedSettingsPolicyKeys: policyKeysBySource[PolicyValueSource.ServerManagedSettings].join(','),
			fileManagedSettingsPolicyKeys: policyKeysBySource[PolicyValueSource.FileManagedSettings].join(','),
			mixedManagedSettingsPolicyKeys: policyKeysBySource[PolicyValueSource.MixedManagedSettings].join(','),
			accountPolicyKeys: policyKeysBySource[PolicyValueSource.Account].join(','),
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

function telemetryLevelBucket(rawValue: PolicyValue | undefined): TelemetryLevelBucket {
	if (rawValue === undefined) {
		return undefined;
	}
	switch (rawValue) {
		case 'off':
		case 'crash':
		case 'error':
		case 'all':
			return rawValue;
		default:
			return 'unknown';
	}
}

registerWorkbenchContribution2(PolicyTelemetryContribution.ID, PolicyTelemetryContribution, WorkbenchPhase.AfterRestored);
