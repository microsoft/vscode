/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { IAgentSessionNativeStatusInfo, IAgentSessionStatusMainService } from './agentSession.js';

export class AgentSessionStatusMainChannel implements IServerChannel {

	constructor(private service: IAgentSessionStatusMainService) { }

	listen(_: unknown, event: string): Event<any> {
		switch (event) {
			case 'onDidChangeStatus': return this.service.onDidChangeStatus;
		}

		throw new Error(`Event not found: ${event}`);
	}

	call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'updateStatus': return Promise.resolve(this.service.updateStatus(arg));
		}

		throw new Error(`Call not found: ${command}`);
	}
}

export class AgentSessionStatusMainChannelClient implements IAgentSessionStatusMainService {

	declare readonly _serviceBrand: undefined;

	readonly onDidChangeStatus: Event<IAgentSessionNativeStatusInfo>;

	constructor(private readonly channel: IChannel) {
		this.onDidChangeStatus = this.channel.listen<IAgentSessionNativeStatusInfo>('onDidChangeStatus');
	}

	updateStatus(info: IAgentSessionNativeStatusInfo): void {
		this.channel.call('updateStatus', info);
	}
}
