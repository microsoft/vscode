/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IChannel, IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { IPolicyService, PolicyName, PolicyValue } from 'vs/platform/policy/common/policy';

type Policies = { [name: PolicyName]: PolicyValue | undefined };

export class PolicyChannel implements IServerChannel {

	private readonly disposables = new DisposableStore();

	constructor(private service: IPolicyService) { }

	listen(_: unknown, event: string): Event<any> {
		switch (event) {
			case 'onDidChange': return Event.map(
				this.service.onDidChange,
				names => names.reduce<Policies>((r, name) => ({ ...r, [name]: this.service.getPolicyValue(name) }), {}),
				this.disposables
			);
		}

		throw new Error(`Event not found: ${event}`);
	}

	call(_: unknown, command: string): Promise<any> {
		switch (command) {
			case 'initialize': return this.service.initialize();
		}

		throw new Error(`Call not found: ${command}`);
	}

	dispose() {
		this.disposables.dispose();
	}
}

export class PolicyChannelClient implements IPolicyService {

	declare readonly _serviceBrand: undefined;

	private policies = new Map<PolicyName, PolicyValue>();

	private readonly _onDidChange = new Emitter<readonly string[]>();
	readonly onDidChange: Event<readonly string[]> = this._onDidChange.event;

	constructor(private readonly channel: IChannel) {
		this.channel.listen<Policies>('onDidChange')(policies => {
			for (const name in policies) {
				const value = policies[name];

				if (value === undefined) {
					this.policies.delete(name);
				} else {
					this.policies.set(name, value);
				}
			}

			this._onDidChange.fire(Object.keys(policies));
		});
	}

	async initialize(): Promise<{ [name: PolicyName]: PolicyValue }> {
		const result = await this.channel.call<{ [name: PolicyName]: PolicyValue }>('initialize');

		for (const name in result) {
			this.policies.set(name, result[name]);
		}

		return result;
	}

	getPolicyValue(name: PolicyName): PolicyValue | undefined {
		return this.policies.get(name);
	}
}
