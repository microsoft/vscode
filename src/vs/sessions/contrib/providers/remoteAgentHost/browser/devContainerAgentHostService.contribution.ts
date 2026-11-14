/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IDevContainerAgentHostService } from '../../../../../workbench/contrib/sessions/common/devContainerAgentHostService.js';
import { DevContainerAgentHostService } from '../../../../../workbench/contrib/sessions/providers/remoteAgentHost/browser/devContainerAgentHostService.js';

registerSingleton(IDevContainerAgentHostService, DevContainerAgentHostService, InstantiationType.Delayed);
