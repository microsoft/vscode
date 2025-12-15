/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import * as jsonContributionRegistry from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { mcpAccessConfig, McpAccessValue } from '../../../../platform/mcp/common/mcpManagement.js';
import { IQuickAccessRegistry, Extensions as QuickAccessExtensions } from '../../../../platform/quickinput/common/quickAccess.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { IConfigurationMigrationRegistry, Extensions as ConfigurationMigrationExtensions, ConfigurationKeyValuePairs } from '../../../common/configuration.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { EditorExtensions } from '../../../common/editor.js';
import { mcpSchemaId } from '../../../services/configuration/common/configuration.js';
import { ExtensionMcpDiscovery } from '../common/discovery/extensionMcpDiscovery.js';
import { InstalledMcpServersDiscovery } from '../common/discovery/installedMcpServersDiscovery.js';
import { mcpDiscoveryRegistry } from '../common/discovery/mcpDiscovery.js';
import { RemoteNativeMpcDiscovery } from '../common/discovery/nativeMcpRemoteDiscovery.js';
import { CursorWorkspaceMcpDiscoveryAdapter } from '../common/discovery/workspaceMcpDiscoveryAdapter.js';
import { McpCommandIds } from '../common/mcpCommandIds.js';
import { mcpServerSchema } from '../common/mcpConfiguration.js';
import { McpContextKeysController } from '../common/mcpContextKeys.js';
import { IMcpDevModeDebugging, McpDevModeDebugging } from '../common/mcpDevMode.js';
import { McpLanguageModelToolContribution } from '../common/mcpLanguageModelToolContribution.js';
import { McpRegistry } from '../common/mcpRegistry.js';
import { IMcpRegistry } from '../common/mcpRegistryTypes.js';
import { McpResourceFilesystem } from '../common/mcpResourceFilesystem.js';
import { McpSamplingService } from '../common/mcpSamplingService.js';
import { McpService } from '../common/mcpService.js';
import { IMcpElicitationService, IMcpSamplingService, IMcpService, IMcpWorkbenchService } from '../common/mcpTypes.js';
import { McpAddContextContribution } from './mcpAddContextContribution.js';
import { AddConfigurationAction, EditStoredInput, ListMcpServerCommand, McpBrowseCommand, McpBrowseResourcesCommand, McpConfigureSamplingModels, McpConfirmationServerOptionsCommand, MCPServerActionRendering, McpServerOptionsCommand, McpSkipCurrentAutostartCommand, McpStartPromptingServerCommand, OpenRemoteUserMcpResourceCommand, OpenUserMcpResourceCommand, OpenWorkspaceFolderMcpResourceCommand, OpenWorkspaceMcpResourceCommand, RemoveStoredInput, ResetMcpCachedTools, ResetMcpTrustCommand, RestartServer, ShowConfiguration, ShowInstalledMcpServersCommand, ShowOutput, StartServer, StopServer } from './mcpCommands.js';
import { McpDiscovery } from './mcpDiscovery.js';
import { McpElicitationService } from './mcpElicitationService.js';
import { McpLanguageFeatures } from './mcpLanguageFeatures.js';
import { McpConfigMigrationContribution } from './mcpMigration.js';
import { McpResourceQuickAccess } from './mcpResourceQuickAccess.js';
import { McpServerEditor } from './mcpServerEditor.js';
import { McpServerEditorInput } from './mcpServerEditorInput.js';
import { McpServersViewsContribution } from './mcpServersView.js';
import { MCPContextsInitialisation, McpWorkbenchService } from './mcpWorkbenchService.js';

registerSingleton(IMcpRegistry, McpRegistry, InstantiationType.Delayed);
registerSingleton(IMcpService, McpService, InstantiationType.Delayed);
registerSingleton(IMcpWorkbenchService, McpWorkbenchService, InstantiationType.Eager);
registerSingleton(IMcpDevModeDebugging, McpDevModeDebugging, InstantiationType.Delayed);
registerSingleton(IMcpSamplingService, McpSamplingService, InstantiationType.Delayed);
registerSingleton(IMcpElicitationService, McpElicitationService, InstantiationType.Delayed);

mcpDiscoveryRegistry.register(new SyncDescriptor(RemoteNativeMpcDiscovery));
mcpDiscoveryRegistry.register(new SyncDescriptor(InstalledMcpServersDiscovery));
mcpDiscoveryRegistry.register(new SyncDescriptor(ExtensionMcpDiscovery));
mcpDiscoveryRegistry.register(new SyncDescriptor(CursorWorkspaceMcpDiscoveryAdapter));

registerWorkbenchContribution2('mcpDiscovery', McpDiscovery, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2('mcpContextKeys', McpContextKeysController, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2('mcpLanguageFeatures', McpLanguageFeatures, WorkbenchPhase.Eventually);
registerWorkbenchContribution2('mcpResourceFilesystem', McpResourceFilesystem, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(McpLanguageModelToolContribution.ID, McpLanguageModelToolContribution, WorkbenchPhase.AfterRestored);

registerAction2(ListMcpServerCommand);
registerAction2(McpServerOptionsCommand);
registerAction2(McpConfirmationServerOptionsCommand);
registerAction2(ResetMcpTrustCommand);
registerAction2(ResetMcpCachedTools);
registerAction2(AddConfigurationAction);
registerAction2(RemoveStoredInput);
registerAction2(EditStoredInput);
registerAction2(StartServer);
registerAction2(StopServer);
registerAction2(ShowOutput);
registerAction2(RestartServer);
registerAction2(ShowConfiguration);
registerAction2(McpBrowseCommand);
registerAction2(OpenUserMcpResourceCommand);
registerAction2(OpenRemoteUserMcpResourceCommand);
registerAction2(OpenWorkspaceMcpResourceCommand);
registerAction2(OpenWorkspaceFolderMcpResourceCommand);
registerAction2(ShowInstalledMcpServersCommand);
registerAction2(McpBrowseResourcesCommand);
registerAction2(McpConfigureSamplingModels);
registerAction2(McpStartPromptingServerCommand);
registerAction2(McpSkipCurrentAutostartCommand);

registerWorkbenchContribution2('mcpActionRendering', MCPServerActionRendering, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2('mcpAddContext', McpAddContextContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(MCPContextsInitialisation.ID, MCPContextsInitialisation, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(McpConfigMigrationContribution.ID, McpConfigMigrationContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(McpServersViewsContribution.ID, McpServersViewsContribution, WorkbenchPhase.AfterRestored);

const jsonRegistry = <jsonContributionRegistry.IJSONContributionRegistry>Registry.as(jsonContributionRegistry.Extensions.JSONContribution);
jsonRegistry.registerSchema(mcpSchemaId, mcpServerSchema);

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		McpServerEditor,
		McpServerEditor.ID,
		localize('mcpServer', "MCP Server")
	),
	[
		new SyncDescriptor(McpServerEditorInput)
	]);

Registry.as<IQuickAccessRegistry>(QuickAccessExtensions.Quickaccess).registerQuickAccessProvider({
	ctor: McpResourceQuickAccess,
	prefix: McpResourceQuickAccess.PREFIX,
	placeholder: localize('mcp.quickaccess.placeholder', "Filter to an MCP resource"),
	helpEntries: [{
		description: localize('mcp.quickaccess.add', "MCP Server Resources"),
		commandId: McpCommandIds.AddConfiguration
	}]
});


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
