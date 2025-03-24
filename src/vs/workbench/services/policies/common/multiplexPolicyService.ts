/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../base/common/collections.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { PolicyName } from '../../../../base/common/policy.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { AbstractPolicyService, IPolicyService, PolicyDefinition, PolicyValue } from '../../../../platform/policy/common/policy.js';

export class MultiplexPolicyService extends AbstractPolicyService implements IPolicyService {

	constructor(
		private readonly policyServices: ReadonlyArray<IPolicyService>,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		// Forward policy changes from child services
		const updated: string[] = [];
		for (const service of policyServices) {
			const definitions = service.policyDefinitions;
			for (const name in definitions) {
				const value = service.getPolicyValue(name);
				this.policyDefinitions[name] = definitions[name];
				if (value !== undefined) {
					updated.push(name);
					this.policies.set(name, value);
				}
			}
			this._register(service.onDidChange(names => this.onDidChangePolicies(names, service)));
		}
		this.detectDuplicates(updated);
	}

	private detectDuplicates(keys: string[]): void {
		// Check that no results have overlapping keys
		const changed = new Set<string>();
		for (const key of keys) {
			if (changed.has(key)) {
				this.logService.warn(`MultiplexPolicyService#_updatePolicyDefinitions - Found overlapping keys in policy services: ${key}`);
			}
			changed.add(key);
		}
	}

	override async updatePolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<IStringDictionary<PolicyValue>> {
		await this._updatePolicyDefinitions(policyDefinitions);
		return Iterable.reduce(this.policies.entries(), (r, [name, value]) => ({ ...r, [name]: value }), {});
	}

	protected async _updatePolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<void> {
		const results = await Promise.all(this.policyServices.map(service => service.updatePolicyDefinitions(policyDefinitions)));
		this.detectDuplicates(results.flatMap(result => Object.keys(result)));
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
