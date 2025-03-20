/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableMap, IDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { IMcpRegistry } from '../mcpRegistryTypes.js';
import { McpCollectionSortOrder } from '../mcpTypes.js';
import { IMcpDiscovery } from './mcpDiscovery.js';
import { FilesytemMcpDiscovery, WritableMcpCollectionDefinition } from './nativeMcpDiscoveryAbstract.js';
import { claudeConfigToServerDefinition } from './nativeMcpDiscoveryAdapters.js';

export class CursorWorkspaceMcpDiscoveryAdapter extends FilesytemMcpDiscovery implements IMcpDiscovery {
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
			if (!this._fsDiscoveryEnabled.get()) {
				return;
			}

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
			label: `From ${folder.name}/.cursor/mcp.json`,
			remoteAuthority: this._remoteAgentService.getConnection()?.remoteAuthority || null,
			scope: StorageScope.WORKSPACE,
			isTrustedByDefault: false,
			serverDefinitions: observableValue(this, []),
			presentation: {
				origin: configFile,
				order: McpCollectionSortOrder.WorkspaceFolder + 1,
			},
		};

		return this.watchFile(
			URI.joinPath(folder.uri, '.cursor', 'mcp.json'),
			collection,
			contents => {
				const defs = claudeConfigToServerDefinition(collection.id, contents, folder.uri);
				defs?.forEach(d => d.roots = [folder.uri]);
				return defs;
			}
		);
	}
}
