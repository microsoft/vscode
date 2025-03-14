/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import * as jsonContributionRegistry from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { mcpSchemaId } from '../../../services/configuration/common/configuration.js';
import { ConfigMcpDiscovery } from '../common/discovery/configMcpDiscovery.js';
import { mcpDiscoveryRegistry } from '../common/discovery/mcpDiscovery.js';
import { RemoteNativeMpcDiscovery } from '../common/discovery/nativeMcpRemoteDiscovery.js';
import { mcpServerSchema } from '../common/mcpConfiguration.js';
import { McpRegistry } from '../common/mcpRegistry.js';
import { IMcpRegistry } from '../common/mcpRegistryTypes.js';
import { McpService } from '../common/mcpService.js';
import { IMcpService } from '../common/mcpTypes.js';
import { McpDiscovery } from './mcpDiscovery.js';

import { MCPServerActionRendering, ListMcpServerCommand, ResetMcpTrustCommand, McpServerOptionsCommand } from './mcpCommands.js';

import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { McpContextKeysController } from '../common/mcpContextKeys.js';

registerSingleton(IMcpRegistry, McpRegistry, InstantiationType.Delayed);
registerSingleton(IMcpService, McpService, InstantiationType.Delayed);

mcpDiscoveryRegistry.register(new SyncDescriptor(RemoteNativeMpcDiscovery));
mcpDiscoveryRegistry.register(new SyncDescriptor(ConfigMcpDiscovery));

registerWorkbenchContribution2('mcpDiscovery', McpDiscovery, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2('mcpContextKeys', McpContextKeysController, WorkbenchPhase.BlockRestore);

registerAction2(ListMcpServerCommand);
registerAction2(McpServerOptionsCommand);
registerAction2(ResetMcpTrustCommand);
registerWorkbenchContribution2('mcpActionRendering', MCPServerActionRendering, WorkbenchPhase.BlockRestore);

const jsonRegistry = <jsonContributionRegistry.IJSONContributionRegistry>Registry.as(jsonContributionRegistry.Extensions.JSONContribution);
jsonRegistry.registerSchema(mcpSchemaId, mcpServerSchema);
