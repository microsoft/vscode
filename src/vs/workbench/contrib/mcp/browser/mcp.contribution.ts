/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import * as jsonContributionRegistry from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { mcpAccessConfig, McpAccessValue } from '../../../../platform/mcp/common/mcpManagement.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IConfigurationMigrationRegistry, Extensions as ConfigurationMigrationExtensions, ConfigurationKeyValuePairs } from '../../../common/configuration.js';
import { mcpSchemaId } from '../../../services/configuration/common/configuration.js';
import { mcpServerSchema } from '../common/mcpConfiguration.js';
import { IMcpCopilotGlobalConfigurationService, McpCopilotGlobalConfigurationService } from '../common/mcpCopilotGlobalConfigurationService.js';
import { IMcpDevModeDebugging, McpDevModeDebugging } from '../common/mcpDevMode.js';
import { McpRegistry } from '../common/mcpRegistry.js';
import { IMcpRegistry } from '../common/mcpRegistryTypes.js';
import { IMcpSandboxService, McpSandboxService } from '../common/mcpSandboxService.js';
import { McpSamplingService } from '../common/mcpSamplingService.js';
import { McpService } from '../common/mcpService.js';
import { IMcpElicitationService, IMcpSamplingService, IMcpService, IMcpWorkbenchService } from '../common/mcpTypes.js';
import { IWorkbenchMcpGatewayService } from '../common/mcpGatewayService.js';
import { BrowserMcpGatewayService } from './mcpGatewayService.js';
import { McpElicitationService } from './mcpElicitationService.js';
import { McpWorkbenchService } from './mcpWorkbenchService.js';

// AI removed: MCP server discovery (and therefore autostart), the MCP tool
// bridge into chat, MCP commands, the server editor and quick access are no
// longer registered. Services remain because authentication and the extension
// API still inject them; with no discovery they hold no servers.
registerSingleton(IMcpRegistry, McpRegistry, InstantiationType.Delayed);
registerSingleton(IMcpCopilotGlobalConfigurationService, McpCopilotGlobalConfigurationService, InstantiationType.Delayed);
registerSingleton(IMcpSandboxService, McpSandboxService, InstantiationType.Delayed);
registerSingleton(IMcpService, McpService, InstantiationType.Delayed);
registerSingleton(IMcpWorkbenchService, McpWorkbenchService, InstantiationType.Eager);
registerSingleton(IMcpDevModeDebugging, McpDevModeDebugging, InstantiationType.Delayed);
registerSingleton(IMcpSamplingService, McpSamplingService, InstantiationType.Delayed);
registerSingleton(IMcpElicitationService, McpElicitationService, InstantiationType.Delayed);
registerSingleton(IWorkbenchMcpGatewayService, BrowserMcpGatewayService, InstantiationType.Delayed);

const jsonRegistry = <jsonContributionRegistry.IJSONContributionRegistry>Registry.as(jsonContributionRegistry.Extensions.JSONContribution);
jsonRegistry.registerSchema(mcpSchemaId, mcpServerSchema);

Registry.as<IConfigurationMigrationRegistry>(ConfigurationMigrationExtensions.ConfigurationMigration)
	.registerConfigurationMigrations([{
		key: 'chat.mcp.enabled',
		migrateFn: (value, accessor) => {
			const result: ConfigurationKeyValuePairs = [['chat.mcp.enabled', { value: undefined }]];
			if (value === true) {
				result.push([mcpAccessConfig, { value: McpAccessValue.All }]);
			}
			if (value === false) {
				result.push([mcpAccessConfig, { value: McpAccessValue.None }]);
			}
			return result;
		}
	}]);
