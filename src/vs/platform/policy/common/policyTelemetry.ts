/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IPolicyService, PolicyValue } from './policy.js';
import { PolicyName } from '../../../base/common/policy.js';

type PolicyValueSetEvent = {
	readonly name: string;
	readonly hasValue: boolean;
	readonly dataType: string;
};

type PolicyValueSetClassification = {
	readonly owner: 'jospicer';
	readonly comment: 'Fired when a policy value is resolved to understand which policies are actively used';
	readonly name: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Policy identifier being set' };
	readonly hasValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the policy has an active value' };
	readonly dataType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Type of the policy value' };
};

type PolicyConfigurationSnapshotEvent = {
	readonly count: number;
	readonly names: string;
};

type PolicyConfigurationSnapshotClassification = {
	readonly owner: 'jospicer';
	readonly comment: 'Snapshot of active policy configuration to understand adoption and common combinations';
	readonly count: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total count of active policies' };
	readonly names: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Sorted comma-delimited policy names' };
};

export class PolicyTelemetryReporter extends Disposable {

	constructor(
		private readonly policyService: IPolicyService,
		private readonly telemetryService: ITelemetryService
	) {
		super();
		this._register(this.policyService.onDidChange(names => this.reportPolicyChanges(names)));
	}

	reportInitialSnapshot(): void {
		const serialized = this.policyService.serialize();
		if (!serialized) {
			return;
		}

		const activePolicies: string[] = [];
		for (const [name, entry] of Object.entries(serialized)) {
			if (entry.value !== undefined) {
				activePolicies.push(name);
				this.reportPolicyValue(name, entry.value);
			}
		}

		if (activePolicies.length > 0) {
			this.telemetryService.publicLog2<PolicyConfigurationSnapshotEvent, PolicyConfigurationSnapshotClassification>(
				'policyConfigurationSnapshot',
				{
					count: activePolicies.length,
					names: activePolicies.sort().join(',')
				}
			);
		}
	}

	private reportPolicyChanges(names: readonly PolicyName[]): void {
		for (const name of names) {
			const value = this.policyService.getPolicyValue(name);
			this.reportPolicyValue(name, value);
		}
	}

	private reportPolicyValue(name: PolicyName, value: PolicyValue | undefined): void {
		this.telemetryService.publicLog2<PolicyValueSetEvent, PolicyValueSetClassification>(
			'policyValueSet',
			{
				name,
				hasValue: value !== undefined,
				dataType: value === undefined ? 'undefined' : typeof value
			}
		);
	}
}
