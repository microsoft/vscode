/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../base/common/collections.js';
import { Iterable } from '../../../base/common/iterator.js';
import { Event } from '../../../base/common/event.js';
import { ILogService } from '../../log/common/log.js';
import { AbstractPolicyService, IPolicyService, PolicyDefinition, PolicyValue } from './policy.js';

export class MultiplexPolicyService extends AbstractPolicyService implements IPolicyService {

	constructor(
		private readonly policyServices: ReadonlyArray<IPolicyService>,
		@ILogService _logService: ILogService,
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

	/**
	 * Merge policies from all child services using **first-wins** precedence:
	 * services earlier in the array have higher priority.
	 *
	 * After the precedence pass, a second pass enforces **deny-sticky** semantics:
	 * for policy keys with a declared `denyValue`, if *any* service (regardless of
	 * priority) provides that value, it overrides whatever the precedence pass chose.
	 * This implements the "deny always wins" principle from the managed-settings ADR.
	 */
	private updatePolicies(): void {
		this.policies.clear();

		// Collect all definitions from all services
		for (const service of this.policyServices) {
			const definitions = service.policyDefinitions;
			for (const name in definitions) {
				this.policyDefinitions[name] = definitions[name];
			}
		}

		// First pass: first-wins precedence — earlier services have higher priority
		for (const service of this.policyServices) {
			const definitions = service.policyDefinitions;
			for (const name in definitions) {
				if (this.policies.has(name)) {
					continue; // Higher-priority source already set this key
				}
				const value = service.getPolicyValue(name);
				if (value !== undefined) {
					this.policies.set(name, value);
				}
			}
		}

		// Second pass: deny-sticky — if any source provides a denyValue, it wins
		for (const name in this.policyDefinitions) {
			const definition = this.policyDefinitions[name];
			if (definition.denyValue === undefined) {
				continue;
			}
			for (const service of this.policyServices) {
				const value = service.getPolicyValue(name);
				if (value === definition.denyValue) {
					this.policies.set(name, definition.denyValue);
					break;
				}
			}
		}
	}
}
