/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../base/common/collections.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Event } from '../../../../base/common/event.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { AbstractPolicyService, IPolicyService, PolicyDefinition, PolicyValue } from '../../../../platform/policy/common/policy.js';

export class MultiplexPolicyService extends AbstractPolicyService implements IPolicyService {

	constructor(
		private readonly policyServices: ReadonlyArray<IPolicyService>,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.updatePolicies();
		this._register(Event.any(...this.policyServices.map(service => service.onDidChange))(names => {
			this.updatePolicies();
			this._onDidChange.fire(names);
		}));
	}

	override async updatePolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<IStringDictionary<PolicyValue>> {
		await this._updatePolicyDefinitions(policyDefinitions);
		return Iterable.reduce(this.policies.entries(), (r, [name, value]) => ({ ...r, [name]: value }), {});
	}

	protected async _updatePolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<void> {
		await Promise.all(this.policyServices.map(service => service.updatePolicyDefinitions(policyDefinitions)));
		this.updatePolicies();
	}

	private updatePolicies(): void {
		this.policies.clear();
		const updated: string[] = [];
		for (const service of this.policyServices) {
			const definitions = service.policyDefinitions;
			for (const name in definitions) {
				const value = service.getPolicyValue(name);
				this.policyDefinitions[name] = definitions[name];
				if (value !== undefined) {
					updated.push(name);
					this.policies.set(name, value);
				}
			}
		}

		// Check that no results have overlapping keys
		const changed = new Set<string>();
		for (const key of updated) {
			if (changed.has(key)) {
				this.logService.warn(`MultiplexPolicyService#_updatePolicyDefinitions - Found overlapping keys in policy services: ${key}`);
			}
			changed.add(key);
		}
	}
}
