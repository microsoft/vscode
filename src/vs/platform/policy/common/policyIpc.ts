/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../base/common/collections.js';
import { Event } from '../../../base/common/event.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { AbstractPolicyService, IPolicyService, PolicyDefinition, PolicyName, PolicyValue } from './policy.js';

export class PolicyChannel implements IServerChannel {

	private readonly disposables = new DisposableStore();

	constructor(private service: IPolicyService) { }

	listen(_: unknown, event: string): Event<any> {
		switch (event) {
			case 'onDidChange': return Event.map(
				this.service.onDidChange,
				names => names.reduce<object>((r, name) => ({ ...r, [name]: this.service.getPolicyValue(name) ?? null }), {}),
				this.disposables
			);
		}

		throw new Error(`Event not found: ${event}`);
	}

	call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'updatePolicyDefinitions': return this.service.updatePolicyDefinitions(arg as IStringDictionary<PolicyDefinition>);
		}

		throw new Error(`Call not found: ${command}`);
	}

	dispose() {
		this.disposables.dispose();
	}
}

export class PolicyChannelClient extends AbstractPolicyService implements IPolicyService {

	constructor(policiesData: IStringDictionary<{ definition: PolicyDefinition; value: PolicyValue }>, private readonly channel: IChannel) {
		super();
		for (const name in policiesData) {
			const { definition, value } = policiesData[name];
			this.policyDefinitions[name] = definition;
			if (value !== undefined) {
				this.policies.set(name, value);
			}
		}
		this.channel.listen<object>('onDidChange')(policies => {
			for (const name in policies) {
				const value = policies[name as keyof typeof policies];

				if (value === null) {
					this.policies.delete(name);
				} else {
					this.policies.set(name, value);
				}
			}

			this._onDidChange.fire(Object.keys(policies));
		});
	}

	protected async _updatePolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<void> {
		const result = await this.channel.call<{ [name: PolicyName]: PolicyValue }>('updatePolicyDefinitions', policyDefinitions);
		for (const name in result) {
			this.policies.set(name, result[name]);
		}
	}

}
