/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IChannel, IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { IPolicyService, Policies, PolicyName, PolicyValue } from 'vs/platform/policy/common/policy';

export class PolicyChannel implements IServerChannel {

	private readonly disposables = new DisposableStore();

	constructor(private service: IPolicyService) { }

	listen(_: unknown, event: string): Event<any> {
		switch (event) {
			case 'onDidChange': return Event.map(
				this.service.onDidChange,
				names => new Map(
					names
						.map(name => [name, this.service.getPolicyValue(name)])
						.filter(pair => pair[1] !== undefined) as [PolicyName, PolicyValue][]),
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

	private policies: Policies = new Map();

	private readonly _onDidChange = new Emitter<readonly string[]>();
	readonly onDidChange: Event<readonly string[]> = this._onDidChange.event;

	constructor(private readonly channel: IChannel) {
		this.channel.listen<Policies>('onDidChange')(policies => {
			for (const [name, value] of policies) {
				if (value === undefined) {
					this.policies.delete(name);
				} else {
					this.policies.set(name, value);
				}
			}
		});
	}

	initialize(): Promise<void> {
		return this.channel.call('initialize');
	}

	getPolicyValue(name: PolicyName): PolicyValue | undefined {
		return this.policies.get(name);
	}
}
