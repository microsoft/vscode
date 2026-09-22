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
import { IAgentFinderMarketplaceService, ICustomizationMarketplacePage, ICustomizationMarketplaceQuery, ICustomizationMarketplaceQueryService, ICustomizationMarketplaceRequest, ICustomizationMarketplaceSourceInfo } from './customizationMarketplaceService.js';
import { CustomizationMarketplaceSources, queryEnabledCustomizationMarketplaceSources } from './customizationMarketplaceSources.js';

export const CUSTOMIZATION_MARKETPLACE_CHANNEL_NAME = 'customizationMarketplace';

export class CustomizationMarketplaceChannel implements IServerChannel {
	private readonly service: Lazy<ICustomizationMarketplaceQueryService>;

	constructor(getService: () => ICustomizationMarketplaceQueryService) {
		this.service = new Lazy(getService);
	}

	listen<T>(_context: unknown, _event: string): Event<T> {
		throw new Error('Invalid listen');
	}

	call<T>(_context: unknown, command: string, query?: ICustomizationMarketplaceRequest, token: CancellationToken = CancellationToken.None): Promise<T> {
		switch (command) {
			case 'query':
				if (token.isCancellationRequested || !query?.sourceIds.length) {
					return Promise.reject(new CancellationError());
				}
				return this.service.value.query(query, token) as Promise<T>;
		}
		throw new Error('Invalid call');
	}
}

export class CustomizationMarketplaceChannelClient implements IAgentFinderMarketplaceService {
	declare readonly _serviceBrand: undefined;
	readonly sources: readonly ICustomizationMarketplaceSourceInfo[] = [CustomizationMarketplaceSources.AgentFinderPublicFeed];

	constructor(
		private readonly channel: IChannel,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) { }

	async query(options: ICustomizationMarketplaceQuery, token: CancellationToken): Promise<ICustomizationMarketplacePage> {
		return revive<ICustomizationMarketplacePage>(await queryEnabledCustomizationMarketplaceSources(
			this.configurationService, this.sources, options, token,
			(request, token) => this.channel.call<ICustomizationMarketplacePage>('query', request, token),
		));
	}
}
