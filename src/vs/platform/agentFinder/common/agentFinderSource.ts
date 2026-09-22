/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { localize } from '../../../nls.js';
import { ICustomizationMarketplaceProvider, ICustomizationMarketplaceSource, ICustomizationMarketplaceSourcePage, ICustomizationMarketplaceSourceQuery } from '../../customizationMarketplace/common/customizationMarketplaceService.js';

export class AgentFinderSource implements ICustomizationMarketplaceSource {
	readonly id = 'agentFinder';
	readonly label = localize('agentFinder.source', "Agent Finder");

	constructor(
		private readonly browseProvider: ICustomizationMarketplaceProvider,
		private readonly searchProvider: ICustomizationMarketplaceProvider,
	) { }

	async query(options: ICustomizationMarketplaceSourceQuery, token: CancellationToken): Promise<ICustomizationMarketplaceSourcePage> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const query = options.query?.trim() ?? '';
		const provider = query ? this.searchProvider : this.browseProvider;
		return provider.query({ ...options, query }, token);
	}
}
