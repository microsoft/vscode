/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { AgentFinderRestProvider } from '../../../../../platform/agentFinder/common/agentFinderRestProvider.js';
import { AgentFinderService, IAgentFinderPage, IAgentFinderQuery, IAgentFinderService } from '../../../../../platform/agentFinder/common/agentFinderService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatConfiguration } from '../../common/constants.js';

export class AgentFinderWorkbenchService implements IAgentFinderService {
	declare readonly _serviceBrand: undefined;
	private readonly service: Lazy<AgentFinderService>;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		this.service = new Lazy(() => {
			const provider = instantiationService.createInstance(AgentFinderRestProvider);
			return new AgentFinderService(provider, provider);
		});
	}

	query(options: IAgentFinderQuery, token: CancellationToken): Promise<IAgentFinderPage> {
		if (this.configurationService.getValue<boolean>(ChatConfiguration.AgentFinderEnabled) !== true || token.isCancellationRequested) {
			return Promise.reject(new CancellationError());
		}
		return this.service.value.query(options, token);
	}
}
