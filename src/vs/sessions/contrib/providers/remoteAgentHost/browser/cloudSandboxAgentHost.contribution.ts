/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { ICloudSandboxAgentHostService, ICloudSandboxCredentialsService } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { CloudSandboxAgentHostService } from './cloudSandboxAgentHostService.js';
import { CloudSandboxAgentHostContribution } from './cloudSandboxAgentHostContribution.js';
import { CloudSandboxCredentialsService } from './cloudSandboxCredentialsService.js';

registerSingleton(ICloudSandboxCredentialsService, CloudSandboxCredentialsService, InstantiationType.Delayed);
registerSingleton(ICloudSandboxAgentHostService, CloudSandboxAgentHostService, InstantiationType.Delayed);

registerWorkbenchContribution2(CloudSandboxAgentHostContribution.ID, CloudSandboxAgentHostContribution, WorkbenchPhase.AfterRestored);
