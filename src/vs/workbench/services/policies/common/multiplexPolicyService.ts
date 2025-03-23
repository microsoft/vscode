/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../base/common/collections.js';
import { PolicyName } from '../../../../base/common/policy.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { AbstractPolicyService, IPolicyService, PolicyDefinition } from '../../../../platform/policy/common/policy.js';

export class MultiplexPolicyService extends AbstractPolicyService implements IPolicyService {

	constructor(
		private readonly policyServices: ReadonlyArray<IPolicyService>,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		// Forward policy changes from child services
		for (const service of policyServices) {
			this._register(service.onDidChange(names => this.onDidChangePolicies(names, service)));
		}
	}

	protected async _updatePolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<void> {
		// Update all policy services with the new definitions
		const results = await Promise.all(this.policyServices.map(service => service.updatePolicyDefinitions(policyDefinitions)));
		// Check that no results have overlapping keys
		const changed = new Set<string>();
		for (const result of results) {
			for (const key in result) {
				if (changed.has(key)) {
					this.logService.warn(`MultiplexPolicyService#_updatePolicyDefinitions - Found overlapping keys in policy services: ${key}`);
				}
				changed.add(key);
			}
		}
	}

	private onDidChangePolicies(names: readonly PolicyName[], service: IPolicyService): void {
		// When a policy changes in any service, update our policies and fire change event
		for (const name of names) {
			const value = service.getPolicyValue(name);
			if (value !== undefined) {
				this.policies.set(name, value);
			}
		}

		this._onDidChange.fire(names);
	}
}
