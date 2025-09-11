/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../base/common/collections.js';
import { IDefaultAccount } from '../../../base/common/defaultAccount.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Iterable } from '../../../base/common/iterator.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { PolicyName } from '../../../base/common/policy.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export type PolicyValue = string | number | boolean;
export type PolicyDefinition = {
	type: 'string' | 'number' | 'boolean';
	value?: (account: IDefaultAccount) => string | number | boolean | undefined;
};

export type IPolicyParseError = [policyName: string, error: string];

export const IPolicyService = createDecorator<IPolicyService>('policy');

export interface IPolicyService {
	readonly _serviceBrand: undefined;

	readonly onDidChange: Event<readonly PolicyName[]>;
	readonly onDidParseErrors: Event<readonly IPolicyParseError[] | undefined>;
	updatePolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<IStringDictionary<PolicyValue>>;
	updatePolicyErrors(policyErrors: IPolicyParseError[]): Promise<void>;
	getPolicyValue(name: PolicyName): PolicyValue | undefined;
	getPolicyErrors(): IPolicyParseError[];
	serialize(): IStringDictionary<{ definition: PolicyDefinition; value: PolicyValue }> | undefined;
	readonly policyDefinitions: IStringDictionary<PolicyDefinition>;
}

export abstract class AbstractPolicyService extends Disposable implements IPolicyService {
	readonly _serviceBrand: undefined;

	public policyDefinitions: IStringDictionary<PolicyDefinition> = {};
	protected policies = new Map<PolicyName, PolicyValue>();
	protected parseErrors: IPolicyParseError[] = [];

	protected readonly _onDidChange = this._register(new Emitter<readonly PolicyName[]>());
	readonly onDidChange = this._onDidChange.event;

	protected readonly _onDidParseErrors = this._register(new Emitter<IPolicyParseError[] | undefined>());
	readonly onDidParseErrors = this._onDidParseErrors.event;

	async updatePolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<IStringDictionary<PolicyValue>> {
		const size = Object.keys(this.policyDefinitions).length;
		this.policyDefinitions = { ...policyDefinitions, ...this.policyDefinitions };

		if (size !== Object.keys(this.policyDefinitions).length) {
			await this._updatePolicyDefinitions(this.policyDefinitions);
		}

		return Iterable.reduce(this.policies.entries(), (r, [name, value]) => ({ ...r, [name]: value }), {});
	}

	async updatePolicyErrors(policyErrors: IPolicyParseError[]): Promise<void> {
		if (policyErrors.length === 0) {
			this.parseErrors = [];
			this._onDidParseErrors.fire(undefined);
			return;
		}

		this.parseErrors = policyErrors;
		this._onDidParseErrors.fire(policyErrors);
	}

	getPolicyValue(name: PolicyName): PolicyValue | undefined {
		return this.policies.get(name);
	}

	getPolicyErrors(): IPolicyParseError[] {
		return this.parseErrors;
	}

	serialize(): IStringDictionary<{ definition: PolicyDefinition; value: PolicyValue }> {
		return Iterable.reduce<[PolicyName, PolicyDefinition], IStringDictionary<{ definition: PolicyDefinition; value: PolicyValue }>>(Object.entries(this.policyDefinitions), (r, [name, definition]) => ({ ...r, [name]: { definition, value: this.policies.get(name)! } }), {});
	}

	protected abstract _updatePolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<void>;
}

export class NullPolicyService implements IPolicyService {
	readonly _serviceBrand: undefined;
	readonly onDidChange = Event.None;
	readonly onDidParseErrors = Event.None;
	async updatePolicyDefinitions() { return {}; }
	async updatePolicyErrors(_policyErrors: IPolicyParseError[]) { }
	getPolicyValue() { return undefined; }
	getPolicyErrors(): IPolicyParseError[] { return []; }
	serialize() { return undefined; }
	policyDefinitions: IStringDictionary<PolicyDefinition> = {};
}
