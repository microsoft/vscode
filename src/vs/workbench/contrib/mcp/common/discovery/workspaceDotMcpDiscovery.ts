/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../../platform/files/common/files.js';
import { StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { IMcpRegistry } from '../mcpRegistryTypes.js';
import { McpCollectionSortOrder, McpDiscoveryFormat, McpDiscoveryScope, McpDiscoverySource, McpServerDefinition, McpServerTrust, WORKSPACE_DOT_MCP_COLLECTION_ID_PREFIX } from '../mcpTypes.js';
import { IMcpDiscovery, IMcpDiscoveryTelemetrySnapshot } from './mcpDiscovery.js';
import { mcpCandidate, mcpHost } from './mcpDiscoveryTelemetry.js';
import { claudeConfigToServerDefinition } from './nativeMcpDiscoveryAdapters.js';

/**
 * Discovers MCP servers defined in `.mcp.json` files at workspace folder roots.
 * Uses the Claude-style format: `{ "mcpServers": { ... } }`.
 */
export class WorkspaceDotMcpDiscovery extends Disposable implements IMcpDiscovery {
	readonly fromGallery = false;

	private readonly _collections = this._register(new DisposableMap<string, IDisposable>());
	private readonly _telemetryByFolder = new Map<string, IMcpDiscoveryTelemetrySnapshot | undefined>();
	private readonly _folderGenerations = new Map<string, number>();
	private readonly _telemetrySnapshot = observableValue<IMcpDiscoveryTelemetrySnapshot | undefined>(this, undefined);
	readonly telemetrySnapshot = this._telemetrySnapshot;

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
	) {
		super();
	}

	start(): void {
		this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(e => {
			for (const removed of e.removed) {
				const key = removed.uri.toString();
				if (this._collections.has(key)) {
					this._collections.deleteAndDispose(key);
				} else {
					this._folderGenerations.set(key, (this._folderGenerations.get(key) ?? 0) + 1);
					this._telemetryByFolder.delete(key);
				}
			}
			for (const added of e.added) {
				this._watchFolder(added);
			}
			this._publishTelemetry();
		}));

		for (const folder of this._workspaceContextService.getWorkspace().folders) {
			this._watchFolder(folder);
		}
		if (this._workspaceContextService.getWorkspace().folders.length === 0) {
			this._telemetrySnapshot.set({ candidates: [], configurations: [] }, undefined);
		}
	}

	private _watchFolder(folder: IWorkspaceFolder) {
		const telemetryKey = folder.uri.toString();
		const folderGeneration = (this._folderGenerations.get(telemetryKey) ?? 0) + 1;
		this._folderGenerations.set(telemetryKey, folderGeneration);
		this._telemetryByFolder.set(telemetryKey, undefined);
		const configFile = joinPath(folder.uri, '.mcp.json');
		const collectionId = `${WORKSPACE_DOT_MCP_COLLECTION_ID_PREFIX}${folder.index}`;
		const serverDefinitions = observableValue<readonly McpServerDefinition[]>(this, []);

		const collection = {
			id: collectionId,
			label: `${folder.name}/.mcp.json`,
			remoteAuthority: this._remoteAgentService.getConnection()?.remoteAuthority || null,
			scope: StorageScope.WORKSPACE,
			trustBehavior: McpServerTrust.Kind.TrustedOnNonce as const,
			serverDefinitions,
			configTarget: ConfigurationTarget.WORKSPACE_FOLDER,
			order: McpCollectionSortOrder.WorkspaceFolder + 1,
			discovery: {
				source: McpDiscoverySource.WorkspaceDotMcp,
				format: McpDiscoveryFormat.ClaudeMcpServers,
				scope: McpDiscoveryScope.WorkspaceFolder,
				host: mcpHost(this._remoteAgentService.getConnection()?.remoteAuthority),
			},
			presentation: {
				origin: configFile,
			},
		};

		const store = new DisposableStore();
		const collectionRegistration = store.add(new MutableDisposable());
		let updateGeneration = 0;
		store.add(toDisposable(() => {
			updateGeneration++;
			if (this._folderGenerations.get(telemetryKey) === folderGeneration) {
				this._folderGenerations.set(telemetryKey, folderGeneration + 1);
				this._telemetryByFolder.delete(telemetryKey);
				this._publishTelemetry();
			}
		}));

		const updateFile = async () => {
			const generation = ++updateGeneration;
			const isCurrent = () => generation === updateGeneration
				&& this._folderGenerations.get(telemetryKey) === folderGeneration
				&& !store.isDisposed;
			let definitions: McpServerDefinition[] = [];
			let configurationPresent = 0;
			let parseErrorCount = 0;
			let unreadableCount = 0;
			try {
				const contents = await this._fileService.readFile(configFile);
				if (!isCurrent()) {
					return;
				}
				configurationPresent = 1;
				try {
					const defs = await claudeConfigToServerDefinition(collectionId, contents.value, { defaultCwd: folder.uri });
					if (!isCurrent()) {
						return;
					}
					if (defs) {
						for (const d of defs) {
							d.roots = [folder.uri];
						}
						definitions = defs;
					} else {
						parseErrorCount = 1;
					}
				} catch {
					parseErrorCount = 1;
				}
			} catch (error) {
				if (!isCurrent()) {
					return;
				}
				if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
					configurationPresent = 1;
					unreadableCount = 1;
				}
			}
			if (!isCurrent()) {
				return;
			}
			const host = mcpHost(this._remoteAgentService.getConnection()?.remoteAuthority);
			this._telemetryByFolder.set(telemetryKey, {
				candidates: definitions.map(() => mcpCandidate(McpDiscoverySource.WorkspaceDotMcp, McpDiscoveryFormat.ClaudeMcpServers, McpDiscoveryScope.WorkspaceFolder, host, 'loaded')).concat(
					parseErrorCount ? [mcpCandidate(McpDiscoverySource.WorkspaceDotMcp, McpDiscoveryFormat.ClaudeMcpServers, McpDiscoveryScope.WorkspaceFolder, host, 'parseError')] : [],
					unreadableCount ? [mcpCandidate(McpDiscoverySource.WorkspaceDotMcp, McpDiscoveryFormat.ClaudeMcpServers, McpDiscoveryScope.WorkspaceFolder, host, 'unreadable')] : [],
				),
				configurations: [{
					source: McpDiscoverySource.WorkspaceDotMcp,
					format: McpDiscoveryFormat.ClaudeMcpServers,
					scope: McpDiscoveryScope.WorkspaceFolder,
					host,
					configurationPresent,
					configuredEntryCount: definitions.length,
					parseErrorCount,
					unreadableCount,
				}],
			});
			this._publishTelemetry();

			if (!definitions.length) {
				collectionRegistration.clear();
			} else {
				serverDefinitions.set(definitions, undefined);
				if (!collectionRegistration.value) {
					collectionRegistration.value = this._mcpRegistry.registerCollection(collection);
				}
			}
		};

		const throttler = store.add(new RunOnceScheduler(updateFile, 500));
		const watcher = store.add(this._fileService.createWatcher(configFile, { recursive: false, excludes: [] }));
		store.add(watcher.onDidChange(() => throttler.schedule()));
		updateFile();

		this._collections.set(folder.uri.toString(), store);
	}

	private _publishTelemetry(): void {
		const snapshots = [...this._telemetryByFolder.values()];
		if (snapshots.some(snapshot => snapshot === undefined)) {
			return;
		}
		this._telemetrySnapshot.set({
			candidates: snapshots.flatMap(snapshot => snapshot?.candidates ?? []),
			configurations: snapshots.flatMap(snapshot => snapshot?.configurations ?? []),
		}, undefined);
	}
}
