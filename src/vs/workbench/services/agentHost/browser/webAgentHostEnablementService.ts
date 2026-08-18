/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AgentHostEnablementService } from '../../../../platform/agentHost/browser/agentHostEnablementService.js';
import { IAgentHostEnablementService } from '../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { INativeManagedSettingsService } from '../../../../platform/policy/common/copilotManagedSettings.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';

export class WebAgentHostEnablementService extends AgentHostEnablementService {
	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@INativeManagedSettingsService nativeManagedSettingsService: INativeManagedSettingsService,
		@IDefaultAccountService defaultAccountService: IDefaultAccountService,
	) {
		super(!!environmentService.remoteAuthority, configurationService, contextKeyService, nativeManagedSettingsService, defaultAccountService, undefined);
	}
}

registerSingleton(IAgentHostEnablementService, WebAgentHostEnablementService, InstantiationType.Eager);
