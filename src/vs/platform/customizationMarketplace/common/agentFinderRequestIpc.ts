/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { Lazy } from '../../../base/common/lazy.js';
import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { AgentFinderRequestResult, IAgentFinderRequestService, isValidAgentFinderFeedId } from './agentFinderRequestService.js';

export const AGENT_FINDER_REQUEST_CHANNEL_NAME = 'agentFinderRequest';

export class AgentFinderRequestChannel implements IServerChannel {
	private readonly service: Lazy<IAgentFinderRequestService>;

	constructor(createService: () => IAgentFinderRequestService) {
		this.service = new Lazy(createService);
	}

	listen(): Event<never> {
		throw new Error('Invalid listen');
	}

	call<T>(context: unknown, command: string, args: unknown, token: CancellationToken = CancellationToken.None): Promise<T> {
		if (command !== 'request' || !Array.isArray(args) || args.length !== 2 ||
			!isValidAgentFinderFeedId(args[0]) || typeof args[1] !== 'string' || !args[1]) {
			throw new Error('Invalid Agent Finder request');
		}
		return this.service.value.request(args[0], args[1], token) as Promise<T>;
	}
}

export class AgentFinderRequestChannelClient implements IAgentFinderRequestService {
	declare readonly _serviceBrand: undefined;

	constructor(private readonly channel: IChannel) { }

	request(feedId: string, accessToken: string, token: CancellationToken): Promise<AgentFinderRequestResult> {
		return this.channel.call('request', [feedId, accessToken], token);
	}
}
