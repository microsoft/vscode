/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { McpRegistry } from '../common/mcpRegistry.js';
import { IMcpRegistry } from '../common/mcpRegistryTypes.js';
import { McpService } from '../common/mcpService.js';
import { IMcpService } from '../common/mcpTypes.js';

import './mcpCommands.js';
import { McpDiscovery } from './mcpDiscovery.js';

registerSingleton(IMcpRegistry, McpRegistry, InstantiationType.Delayed);
registerSingleton(IMcpService, McpService, InstantiationType.Delayed);

registerWorkbenchContribution2('mcpDiscovery', McpDiscovery, WorkbenchPhase.AfterRestored);
