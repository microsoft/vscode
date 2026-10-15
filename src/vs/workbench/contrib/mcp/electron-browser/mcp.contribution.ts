/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkbenchMcpGatewayService } from '../common/mcpGatewayService.js';
import { IMcpDevModeDebugging } from '../common/mcpDevMode.js';
import { McpDevModeDebuggingNode } from './mcpDevModeDebuggingNode.js';
import { WorkbenchMcpGatewayService } from './mcpGatewayService.js';
import { IMcpCopilotGlobalConfigurationService } from '../common/mcpCopilotGlobalConfigurationService.js';
import { NativeMcpCopilotGlobalConfigurationService } from './mcpCopilotGlobalConfigurationService.js';

// AI removed: native MCP discovery and the local gateway tool broker are no
// longer registered; services remain for injectors.
registerSingleton(IMcpCopilotGlobalConfigurationService, NativeMcpCopilotGlobalConfigurationService, InstantiationType.Delayed);
registerSingleton(IMcpDevModeDebugging, McpDevModeDebuggingNode, InstantiationType.Delayed);
registerSingleton(IWorkbenchMcpGatewayService, WorkbenchMcpGatewayService, InstantiationType.Delayed);
