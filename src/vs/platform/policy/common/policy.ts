/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../base/common/collections.js';
import { IPolicyData } from '../../../base/common/defaultAccount.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Iterable } from '../../../base/common/iterator.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IManagedSettingsPolicyDefinitions, PolicyName } from '../../../base/common/policy.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export type PolicyValue = string | number | boolean;
/** The source family that produced an effective policy value. */
export const enum PolicyValueSource {
	Device = 'device',
	NativeMdm = 'nativeMdm',
	ServerManagedSettings = 'serverManagedSettings',
	FileManagedSettings = 'fileManagedSettings',
	MixedManagedSettings = 'mixedManagedSettings',
	Account = 'account',
	AccountGate = 'accountGate',
}
export type PolicyDefinition = {
	type: 'string' | 'number' | 'boolean';
	/** Must be pure and deterministic because source attribution can evaluate it more than once. */
	value?: (policyData: IPolicyData) => string | number | boolean | undefined;
	managedSettings?: IManagedSettingsPolicyDefinitions;
	restrictedValue?: PolicyValue;
};

/** Returns a structured-clone-safe copy of `definition`, dropping the non-cloneable `value` callback. */
export function toSerializablePolicyDefinition(definition: PolicyDefinition): PolicyDefinition {
	return { type: definition.type, managedSettings: definition.managedSettings, restrictedValue: definition.restrictedValue };
}

/**
 * Returns the value to apply for `definition` when the account-policy gate is active
 * but not satisfied. Uses `definition.restrictedValue` when specified, otherwise falls
 * back to a type-driven safe default.
 */
export function getRestrictedPolicyValue(definition: PolicyDefinition): PolicyValue {
	if (definition.restrictedValue !== undefined) {
		return definition.restrictedValue;
	}
	switch (definition.type) {
		case 'boolean': return false;
		case 'number': return 0;
		case 'string': return '';
	}
}

export const IPolicyService = createDecorator<IPolicyService>('policy');

export interface IPolicyService {
	readonly _serviceBrand: undefined;

	readonly onDidChange: Event<readonly PolicyName[]>;
	updatePolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<IStringDictionary<PolicyValue>>;
	getPolicyValue(name: PolicyName): PolicyValue | undefined;
	/** Returns the source of the effective value, or `undefined` when no value is set. */
	getPolicyValueSource(name: PolicyName): PolicyValueSource | undefined;
	serialize(): IStringDictionary<{ definition: PolicyDefinition; value: PolicyValue }> | undefined;
	readonly policyDefinitions: IStringDictionary<PolicyDefinition>;
}

export abstract class AbstractPolicyService extends Disposable implements IPolicyService {
	readonly _serviceBrand: undefined;

	public policyDefinitions: IStringDictionary<PolicyDefinition> = {};
	protected policies = new Map<PolicyName, PolicyValue>();
	private readonly policyValueSources = new Map<PolicyName, PolicyValueSource>();

	protected readonly _onDidChange = this._register(new Emitter<readonly PolicyName[]>());
	readonly onDidChange = this._onDidChange.event;

	async updatePolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<IStringDictionary<PolicyValue>> {
		// Replace existing definitions; identity comparison avoids redundant watcher churn.
		let changed = false;
		for (const name of Object.keys(policyDefinitions)) {
			if (this.policyDefinitions[name] !== policyDefinitions[name]) {
				this.policyDefinitions[name] = policyDefinitions[name];
				changed = true;
			}
		}

		if (changed) {
			await this._updatePolicyDefinitions(this.policyDefinitions);
		}

		return this.getPolicyValues();
	}

	getPolicyValue(name: PolicyName): PolicyValue | undefined {
		return this.policies.get(name);
	}

	getPolicyValueSource(name: PolicyName): PolicyValueSource | undefined {
		return this.getStoredPolicyValueSource(name);
	}

	private getStoredPolicyValueSource(name: PolicyName): PolicyValueSource | undefined {
		if (!this.policies.has(name)) {
			return undefined;
		}
		return this.policyValueSources.get(name) ?? PolicyValueSource.Device;
	}

	serialize(): IStringDictionary<{ definition: PolicyDefinition; value: PolicyValue }> {
		return Iterable.reduce<[PolicyName, PolicyDefinition], IStringDictionary<{ definition: PolicyDefinition; value: PolicyValue }>>(Object.entries(this.policyDefinitions), (r, [name, definition]) => ({ ...r, [name]: { definition: toSerializablePolicyDefinition(definition), value: this.policies.get(name)! } }), {});
	}

	protected getPolicyValues(): IStringDictionary<PolicyValue> {
		return Iterable.reduce(this.policies.entries(), (r, [name, value]) => ({ ...r, [name]: value }), {});
	}

	protected updatePolicyValue(name: PolicyName, value: PolicyValue | undefined, source: PolicyValueSource = PolicyValueSource.Device): boolean {
		if (value === undefined) {
			const valueDeleted = this.policies.delete(name);
			const sourceDeleted = this.policyValueSources.delete(name);
			return valueDeleted || sourceDeleted;
		}

		const valueChanged = this.policies.get(name) !== value;
		const sourceChanged = this.getStoredPolicyValueSource(name) !== source;
		if (!valueChanged && !sourceChanged) {
			return false;
		}

		this.policies.set(name, value);
		this.policyValueSources.set(name, source);
		return true;
	}

	protected clearPolicyValues(): void {
		this.policies.clear();
		this.policyValueSources.clear();
	}

	protected abstract _updatePolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<void>;
}

export class NullPolicyService implements IPolicyService {
	readonly _serviceBrand: undefined;
	readonly onDidChange = Event.None;
	async updatePolicyDefinitions() { return {}; }
	getPolicyValue() { return undefined; }
	getPolicyValueSource() { return undefined; }
	serialize() { return undefined; }
	policyDefinitions: IStringDictionary<PolicyDefinition> = {};
}
