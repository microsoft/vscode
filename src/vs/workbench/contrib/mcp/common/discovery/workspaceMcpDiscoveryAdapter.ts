/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableMap, IDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { DiscoverySource } from '../mcpConfiguration.js';
import { IMcpRegistry } from '../mcpRegistryTypes.js';
import { McpCollectionSortOrder, McpServerTrust } from '../mcpTypes.js';
import { IMcpDiscovery } from './mcpDiscovery.js';
import { FilesystemMcpDiscovery, WritableMcpCollectionDefinition } from './nativeMcpDiscoveryAbstract.js';
import { claudeConfigToServerDefinition } from './nativeMcpDiscoveryAdapters.js';

export class CursorWorkspaceMcpDiscoveryAdapter extends FilesystemMcpDiscovery implements IMcpDiscovery {
	private readonly _collections = this._register(new DisposableMap<string, IDisposable>());

	constructor(
		@IFileService fileService: IFileService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IMcpRegistry mcpRegistry: IMcpRegistry,
		@IConfigurationService configurationService: IConfigurationService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
	) {
		super(configurationService, fileService, mcpRegistry);
	}

	start(): void {
		this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(e => {
			for (const removed of e.removed) {
				this._collections.deleteAndDispose(removed.uri.toString());
			}
			for (const added of e.added) {
				this.watchFolder(added);
			}
		}));

		for (const folder of this._workspaceContextService.getWorkspace().folders) {
			this.watchFolder(folder);
		}
	}

	private watchFolder(folder: IWorkspaceFolder) {
		const configFile = joinPath(folder.uri, '.cursor', 'mcp.json');
		const collection: WritableMcpCollectionDefinition = {
			id: `cursor-workspace.${folder.index}`,
			label: `${folder.name}/.cursor/mcp.json`,
			remoteAuthority: this._remoteAgentService.getConnection()?.remoteAuthority || null,
			scope: StorageScope.WORKSPACE,
			trustBehavior: McpServerTrust.Kind.TrustedOnNonce,
			serverDefinitions: observableValue(this, []),
			configTarget: ConfigurationTarget.WORKSPACE_FOLDER,
			presentation: {
				origin: configFile,
				order: McpCollectionSortOrder.WorkspaceFolder + 1,
			},
		};

		this._collections.set(folder.uri.toString(), this.watchFile(
			URI.joinPath(folder.uri, '.cursor', 'mcp.json'),
			collection,
			DiscoverySource.CursorWorkspace,
			async contents => {
				const defs = await claudeConfigToServerDefinition(collection.id, contents, folder.uri);
				defs?.forEach(d => d.roots = [folder.uri]);
				return defs;
			}
		));
	}
}
