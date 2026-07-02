/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { AgentHostEnabledSettingId } from '../../../../platform/agentHost/common/agentService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IAgentHostEnablementService } from '../common/agentHostEnablementService.js';

export class AgentHostEnablementService extends Disposable implements IAgentHostEnablementService {

	declare readonly _serviceBrand: undefined;

	readonly enabled: boolean;

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		this.enabled = configurationService.getValue<boolean>(AgentHostEnabledSettingId) ?? false;
	}
}

registerSingleton(IAgentHostEnablementService, AgentHostEnablementService, InstantiationType.Delayed);
