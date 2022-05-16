/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';

export type PolicyName = string;
export type PolicyValue = string | boolean | number;
export type Policies = Map<PolicyName, PolicyValue>;

export interface IPolicyService {
	readonly onDidChange: Event<readonly PolicyName[]>;
	initialize(): Promise<void>;
	getPolicyValue(name: PolicyName): PolicyValue | undefined;
}

export class NullPolicyService implements IPolicyService {
	readonly onDidChange = Event.None;
	async initialize() { }
	getPolicyValue() { return undefined; }
}

export class MultiPolicyService implements IPolicyService {

	readonly onDidChange: Event<readonly PolicyName[]>;

	constructor(private policyServices: readonly IPolicyService[]) {
		this.onDidChange = Event.any(...policyServices.map(p => p.onDidChange));
	}

	async initialize() {
		await Promise.all(this.policyServices.map(p => p.initialize()));
	}

	getPolicyValue(name: PolicyName) {
		for (const policyService of this.policyServices) {
			const result = policyService.getPolicyValue(name);

			if (typeof result !== 'undefined') {
				return result;
			}
		}

		return undefined;
	}
}
