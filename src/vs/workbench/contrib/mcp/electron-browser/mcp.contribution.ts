/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { mcpDiscoveryRegistry } from '../common/discovery/mcpDiscovery.js';
import { IWorkbenchMcpGatewayService } from '../common/mcpGatewayService.js';
import { IMcpDevModeDebugging } from '../common/mcpDevMode.js';
import { McpDevModeDebuggingNode } from './mcpDevModeDebuggingNode.js';
import { NativeMcpDiscovery } from './nativeMpcDiscovery.js';
import { WorkbenchMcpGatewayService } from './mcpGatewayService.js';
import { McpGatewayToolBrokerContribution } from './mcpGatewayToolBrokerContribution.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';

mcpDiscoveryRegistry.register(new SyncDescriptor(NativeMcpDiscovery));
registerSingleton(IMcpDevModeDebugging, McpDevModeDebuggingNode, InstantiationType.Delayed);
registerSingleton(IWorkbenchMcpGatewayService, WorkbenchMcpGatewayService, InstantiationType.Delayed);
registerWorkbenchContribution2('mcpGatewayToolBrokerLocal', McpGatewayToolBrokerContribution, WorkbenchPhase.AfterRestored);
