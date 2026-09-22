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
import { CustomizationMarketplaceConfiguration, ICustomizationMarketplacePage, ICustomizationMarketplaceQuery, ICustomizationMarketplaceService, ICustomizationMarketplaceSourceDescriptor } from './customizationMarketplaceService.js';

export const CUSTOMIZATION_MARKETPLACE_CHANNEL_NAME = 'customizationMarketplace';

export class CustomizationMarketplaceChannel implements IServerChannel {
	private readonly service: Lazy<ICustomizationMarketplaceService>;

	constructor(getService: () => ICustomizationMarketplaceService) {
		this.service = new Lazy(getService);
	}

	listen<T>(_context: unknown, _event: string): Event<T> {
		throw new Error('Invalid listen');
	}

	call<T>(_context: unknown, command: string, query?: ICustomizationMarketplaceQuery, token: CancellationToken = CancellationToken.None): Promise<T> {
		switch (command) {
			case 'getSources':
				return (this.service.value.getSources?.() ?? Promise.resolve([])) as Promise<T>;
			case 'query':
				if (token.isCancellationRequested) {
					return Promise.reject(new CancellationError());
				}
				return this.service.value.query(query ?? {}, token) as Promise<T>;
		}
		throw new Error('Invalid call');
	}
}

export class CustomizationMarketplaceChannelClient implements ICustomizationMarketplaceService {
	declare readonly _serviceBrand: undefined;

	constructor(
		private readonly channel: IChannel,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) { }

	async getSources(): Promise<readonly ICustomizationMarketplaceSourceDescriptor[]> {
		return this.channel.call<readonly ICustomizationMarketplaceSourceDescriptor[]>('getSources');
	}

	async query(options: ICustomizationMarketplaceQuery, token: CancellationToken): Promise<ICustomizationMarketplacePage> {
		if (this.configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.Enabled) !== true || token.isCancellationRequested) {
			throw new CancellationError();
		}
		return revive<ICustomizationMarketplacePage>(await this.channel.call<ICustomizationMarketplacePage>('query', options, token));
	}
}
