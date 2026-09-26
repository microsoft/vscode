/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { Lazy } from '../../../base/common/lazy.js';
import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { CopilotConnectorsRequest, ICopilotConnectorsRequestService } from './copilotConnectorsRequestService.js';

export const COPILOT_CONNECTORS_REQUEST_CHANNEL_NAME = 'copilotConnectorsRequest';

export class CopilotConnectorsRequestChannel implements IServerChannel {
	private readonly service: Lazy<ICopilotConnectorsRequestService>;

	constructor(createService: () => ICopilotConnectorsRequestService) {
		this.service = new Lazy(createService);
	}

	listen(): Event<never> {
		throw new Error('Invalid listen');
	}

	call<T>(context: unknown, command: string, args: unknown, token: CancellationToken = CancellationToken.None): Promise<T> {
		if (command !== 'request' || !Array.isArray(args) || args.length !== 2 || !isRequest(args[0]) || typeof args[1] !== 'string' || !args[1]) {
			throw new Error('Invalid Copilot connectors request');
		}
		return this.service.value.request(args[0], args[1], token) as Promise<T>;
	}
}

export class CopilotConnectorsRequestChannelClient implements ICopilotConnectorsRequestService {
	declare readonly _serviceBrand: undefined;

	constructor(private readonly channel: IChannel) { }

	request(request: CopilotConnectorsRequest, accessToken: string, token: CancellationToken): Promise<unknown> {
		return this.channel.call('request', [request, accessToken], token);
	}
}

function isRequest(request: unknown): request is CopilotConnectorsRequest {
	if (!request || typeof request !== 'object' || !('type' in request)) {
		return false;
	}
	return request.type === 'query' ||
		((request.type === 'connect' || request.type === 'disconnect') && 'name' in request && typeof request.name === 'string' &&
			request.name.length > 0 && request.name.length <= 4096 && request.name !== '.' && request.name !== '..');
}
