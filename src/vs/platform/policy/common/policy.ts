/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export type PolicyName = string;
export type PolicyValue = string | boolean;

export const IPolicyService = createDecorator<IPolicyService>('policy');

export interface IPolicyService {
	readonly _serviceBrand: undefined;

	readonly onDidChange: Event<readonly PolicyName[]>;
	initialize(): Promise<{ [name: PolicyName]: PolicyValue }>;
	getPolicyValue(name: PolicyName): PolicyValue | undefined;
}

export class NullPolicyService implements IPolicyService {
	readonly _serviceBrand: undefined;
	readonly onDidChange = Event.None;
	async initialize() { return {}; }
	getPolicyValue() { return undefined; }
}

export class MultiPolicyService implements IPolicyService {

	readonly _serviceBrand: undefined;

	readonly onDidChange: Event<readonly PolicyName[]>;

	constructor(private policyServices: readonly IPolicyService[]) {
		this.onDidChange = Event.any(...policyServices.map(p => p.onDidChange));
	}

	async initialize() {
		const result = await Promise.all(this.policyServices.map(p => p.initialize()));
		return result.reduce((r, o) => ({ ...r, ...o }), {});
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
