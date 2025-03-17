/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import * as jsonContributionRegistry from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { mcpSchemaId } from '../../../services/configuration/common/configuration.js';
import { ConfigMcpDiscovery } from '../common/discovery/configMcpDiscovery.js';
import { ExtensionMcpDiscovery } from '../common/discovery/extensionMcpDiscovery.js';
import { mcpDiscoveryRegistry } from '../common/discovery/mcpDiscovery.js';
import { RemoteNativeMpcDiscovery } from '../common/discovery/nativeMcpRemoteDiscovery.js';
import { mcpServerSchema } from '../common/mcpConfiguration.js';
import { McpContextKeysController } from '../common/mcpContextKeys.js';
import { McpRegistry } from '../common/mcpRegistry.js';
import { IMcpRegistry } from '../common/mcpRegistryTypes.js';
import { McpService } from '../common/mcpService.js';
import { IMcpService } from '../common/mcpTypes.js';
import { AddConfigurationAction, ListMcpServerCommand, MCPServerActionRendering, McpServerOptionsCommand, ResetMcpCachedTools, ResetMcpTrustCommand } from './mcpCommands.js';
import { McpDiscovery } from './mcpDiscovery.js';

registerSingleton(IMcpRegistry, McpRegistry, InstantiationType.Delayed);
registerSingleton(IMcpService, McpService, InstantiationType.Delayed);

mcpDiscoveryRegistry.register(new SyncDescriptor(RemoteNativeMpcDiscovery));
mcpDiscoveryRegistry.register(new SyncDescriptor(ConfigMcpDiscovery));
mcpDiscoveryRegistry.register(new SyncDescriptor(ExtensionMcpDiscovery));

registerWorkbenchContribution2('mcpDiscovery', McpDiscovery, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2('mcpContextKeys', McpContextKeysController, WorkbenchPhase.BlockRestore);

registerAction2(ListMcpServerCommand);
registerAction2(McpServerOptionsCommand);
registerAction2(ResetMcpTrustCommand);
registerAction2(ResetMcpCachedTools);
registerAction2(AddConfigurationAction);

registerWorkbenchContribution2('mcpActionRendering', MCPServerActionRendering, WorkbenchPhase.BlockRestore);

const jsonRegistry = <jsonContributionRegistry.IJSONContributionRegistry>Registry.as(jsonContributionRegistry.Extensions.JSONContribution);
jsonRegistry.registerSchema(mcpSchemaId, mcpServerSchema);
