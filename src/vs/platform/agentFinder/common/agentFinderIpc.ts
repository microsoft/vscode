/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { revive } from '../../../base/common/marshalling.js';
import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { IAgentFinderPage, IAgentFinderQuery, IAgentFinderService } from './agentFinderService.js';

export const AGENT_FINDER_CHANNEL_NAME = 'agentFinder';

export class AgentFinderChannel implements IServerChannel {
	constructor(private readonly service: IAgentFinderService) { }

	listen<T>(_context: unknown, _event: string): Event<T> {
		throw new Error('Invalid listen');
	}

	call<T>(_context: unknown, command: string, query?: IAgentFinderQuery, token: CancellationToken = CancellationToken.None): Promise<T> {
		switch (command) {
			case 'query':
				return this.service.query(query ?? {}, token) as Promise<T>;
		}
		throw new Error('Invalid call');
	}
}

export class AgentFinderChannelClient implements IAgentFinderService {
	declare readonly _serviceBrand: undefined;

	constructor(private readonly channel: IChannel) { }

	async query(options: IAgentFinderQuery, token: CancellationToken): Promise<IAgentFinderPage> {
		return revive<IAgentFinderPage>(await this.channel.call<IAgentFinderPage>('query', options, token));
	}
}
