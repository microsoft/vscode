/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Event } from '../../../base/common/event.js';
import { Lazy } from '../../../base/common/lazy.js';
import { revive } from '../../../base/common/marshalling.js';
import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { AgentFinderConfiguration, IAgentFinderPage, IAgentFinderQuery, IAgentFinderService } from './agentFinderService.js';

export const AGENT_FINDER_CHANNEL_NAME = 'agentFinder';

export class AgentFinderChannel implements IServerChannel {
	private readonly service: Lazy<IAgentFinderService>;

	constructor(getService: () => IAgentFinderService) {
		this.service = new Lazy(getService);
	}

	listen<T>(_context: unknown, _event: string): Event<T> {
		throw new Error('Invalid listen');
	}

	call<T>(_context: unknown, command: string, query?: IAgentFinderQuery, token: CancellationToken = CancellationToken.None): Promise<T> {
		switch (command) {
			case 'query':
				if (token.isCancellationRequested) {
					return Promise.reject(new CancellationError());
				}
				return this.service.value.query(query ?? {}, token) as Promise<T>;
		}
		throw new Error('Invalid call');
	}
}

export class AgentFinderChannelClient implements IAgentFinderService {
	declare readonly _serviceBrand: undefined;

	constructor(
		private readonly channel: IChannel,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) { }

	async query(options: IAgentFinderQuery, token: CancellationToken): Promise<IAgentFinderPage> {
		if (this.configurationService.getValue<boolean>(AgentFinderConfiguration.Enabled) !== true || token.isCancellationRequested) {
			throw new CancellationError();
		}
		return revive<IAgentFinderPage>(await this.channel.call<IAgentFinderPage>('query', options, token));
	}
}
