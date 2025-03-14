/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, autorunWithStore, derived, IObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier, IRelaxedExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ILanguageModelToolsService, IToolResult } from '../../chat/common/languageModelToolsService.js';
import { mcpActivationEvent } from './mcpConfiguration.js';
import { IMcpRegistry } from './mcpRegistryTypes.js';
import { McpServer, McpServerMetadataCache } from './mcpServer.js';
import { extensionMcpCollectionPrefix, IMcpServer, IMcpService, McpCollectionDefinition, McpCollectionSortOrder, McpServerDefinition } from './mcpTypes.js';

interface IExtensionCollectionsRec {
	extensionId: ExtensionIdentifier;
	collectionId: string;
	/**
	 * Servers created from the cache. Servers are only here until the extension
	 * activates and confirms they still exist. Undefined for new extensions
	 * with unknown servers.
	 */
	pendingServers: IMcpServer[] | undefined;
}

export class McpService extends Disposable implements IMcpService {

	declare _serviceBrand: undefined;

	private readonly _extensionCollectionIdsToPersist = new Set<string>();
	protected readonly _extensionServers = observableValue<readonly IExtensionCollectionsRec[]>(this, []);
	private readonly _publishedServers = observableValue<readonly IMcpServer[]>(this, []);
	public readonly servers: IObservable<readonly IMcpServer[]> = derived(reader => {
		const extensionServers = this._extensionServers.read(reader).flatMap(e => e.pendingServers || []);
		const publishedServers = this._publishedServers.read(reader);
		return [...extensionServers, ...publishedServers];
	});

	public readonly hasExtensionsWithUnknownServers = derived(reader => this._extensionServers.read(reader).some(r => r.pendingServers === undefined));

	protected readonly userCache: McpServerMetadataCache;
	protected readonly workspaceCache: McpServerMetadataCache;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IProductService productService: IProductService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IStorageService storageService: IStorageService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(storageService.onWillSaveState(() => {
			for (const collectionId of this._extensionCollectionIdsToPersist) {
				const publishedServers = this._mcpRegistry.collections.get().find(c => c.id === collectionId)?.serverDefinitions.get();
				if (publishedServers) {
					this.userCache.storeServers(collectionId, { servers: publishedServers.map(McpServerDefinition.toSerialized) });
				}
			}
		}));

		this.userCache = this._register(_instantiationService.createInstance(McpServerMetadataCache, StorageScope.PROFILE));
		this.workspaceCache = this._register(_instantiationService.createInstance(McpServerMetadataCache, StorageScope.WORKSPACE));

		const updateThrottle = this._store.add(new RunOnceScheduler(() => this._updateCollectedServers(), 500));

		// Throttle changes so that if a collection is changed, or a server is
		// unregistered/registered, we don't stop servers unnecessarily.
		this._register(autorun(reader => {
			for (const collection of this._mcpRegistry.collections.read(reader)) {
				collection.serverDefinitions.read(reader);
			}
			this._extensionServers.read(reader);
			updateThrottle.schedule(500);
		}));

		// Handle servers contributed by extensions.
		this._register(_extensionService.onDidChangeExtensions(e => {
			this._onExtensions(e.added);
		}));
		this._register(_extensionService.onDidChangeExtensionsStatus(() => {
			this._onExtensionStatus();
		}));
		this._extensionService.whenInstalledExtensionsRegistered().then(() => {
			this._onExtensions(_extensionService.extensions);
		});

		const tools = this._register(new MutableDisposable());
		this._register(autorunWithStore((reader, store) => {

			const servers = this._publishedServers.read(reader);

			// TODO@jrieken wasteful, needs some diff'ing/change-info
			const newStore = new DisposableStore();

			tools.clear();

			for (const server of servers) {

				for (const tool of server.tools.read(reader)) {

					const ctxKey = new RawContextKey<boolean>(`mcp.tool.${tool.id}.enabled`, true);
					const ctxInst = contextKeyService.createKey<boolean>(ctxKey.key, true);
					store.add(toDisposable(() => ctxInst.reset()));
					store.add(autorun(reader => {
						ctxInst.set(tool.enabled.read(reader));
					}));

					newStore.add(toolsService.registerToolData({
						id: tool.id,
						displayName: tool.definition.name,
						modelDescription: tool.definition.description ?? '',
						inputSchema: tool.definition.inputSchema,
						when: ctxKey.isEqualTo(true),
						tags: ['mcp', 'vscode_editing']
					}));
					newStore.add(toolsService.registerToolImplementation(tool.id, {

						async prepareToolInvocation(parameters, token) {

							const mcpToolWarning = localize(
								'mcp.tool.warning',
								"MCP servers or malicious conversation content may attempt to misuse '{0}' through the installed tools. Please carefully review any requested actions.",
								productService.nameShort
							);

							return {
								confirmationMessages: {
									title: localize('msg.title', "Run `{0}` from $(server) `{1}` (MCP server)", tool.definition.name, server.definition.label),
									message: new MarkdownString(localize('msg.msg', "{0}\n\nInput:\n\n```json\n{1}\n```\n\n$(warning) {2}", tool.definition.description, JSON.stringify(parameters, undefined, 2), mcpToolWarning), { supportThemeIcons: true })
								},
								invocationMessage: new MarkdownString(localize('msg.run', "Running `{0}`", tool.definition.name, server.definition.label)),
								pastTenseMessage: new MarkdownString(localize('msg.ran', "Ran `{0}` ", tool.definition.name, server.definition.label))
							};
						},

						async invoke(invocation, countTokens, token) {

							const result: IToolResult = {
								content: []
							};

							const callResult = await tool.call(invocation.parameters as Record<string, any>, token);
							for (const item of callResult.content) {
								if (item.type === 'text') {
									result.content.push({
										kind: 'text',
										value: item.text
									});
								} else {
									// TODO@jrieken handle different item types
								}
							}

							// result.toolResultMessage = new MarkdownString(localize('reuslt.pattern', "```json\n{0}\n```", JSON.stringify(callResult, undefined, 2)));

							return result;
						},
					}));
				}
			}

			tools.value = newStore;

		}));
	}

	public async activateExtensionServers(): Promise<void> {
		const toActivate = new Set(this._extensionServers.get().filter(r => r.pendingServers === undefined).map(r => r.collectionId));

		await Promise.all([...toActivate].map(collectionId =>
			this._extensionService.activateByEvent(mcpActivationEvent(collectionId.slice(extensionMcpCollectionPrefix.length)))));

		await this._waitForInitialProvidersToPublish();

		await Promise.all(this._publishedServers.get()
			.filter(s => toActivate.has(s.collection.id))
			.map(server => server.start()));
	}

	public resetCaches(): void {
		this.userCache.reset();
		this.workspaceCache.reset();
	}

	private async _waitForInitialProvidersToPublish() {
		await Promise.all(this._mcpRegistry.delegates
			.map(r => r.waitForInitialProviderPromises()));
	}

	private _updateCollectedServers() {
		const definitions = this._mcpRegistry.collections.get().flatMap(collectionDefinition =>
			collectionDefinition.serverDefinitions.get().map(serverDefinition => ({
				serverDefinition,
				collectionDefinition,
			}))
		);

		const nextDefinitions = new Set(definitions);
		const currentServers = this._publishedServers.get();
		const nextServers: IMcpServer[] = [];
		const pushMatch = (match: (typeof definitions)[0], server: IMcpServer) => {
			nextDefinitions.delete(match);
			nextServers.push(server);
			const connection = server.connection.get();
			// if the definition was modified, stop the server; it'll be restarted again on-demand
			if (connection && !McpServerDefinition.equals(connection.definition, match.serverDefinition)) {
				server.stop();
				this._logService.debug(`MCP server ${server.definition.id} stopped because the definition changed`);
			}
		};

		// Transfer over any servers that are still valid.
		for (const server of currentServers) {
			const match = definitions.find(d => defsEqual(server, d));
			if (match) {
				pushMatch(match, server);
			} else {
				server.dispose();
			}
		}

		// Adopt any servers that are pending from extensions.
		let extensionServers = this._extensionServers.get();
		for (const definition of nextDefinitions) {
			for (const rec of extensionServers) {
				const server = rec.pendingServers?.find(s => defsEqual(s, definition));
				if (server !== undefined) {
					pushMatch(definition, server);
					this._logService.debug(`MCP server ${server.definition.id} adopted from extension ${rec.extensionId.value}`);

					const pendingServers = rec.pendingServers!.filter(s => s !== server);
					extensionServers = extensionServers.map(rec2 => rec2 === rec ? { ...rec, pendingServers } : rec2);
					break;
				}
			}
		}

		// Create any new servers that are needed.
		for (const def of nextDefinitions) {
			nextServers.push(this._instantiationService.createInstance(McpServer, def.collectionDefinition, def.serverDefinition, false, def.collectionDefinition.scope === StorageScope.WORKSPACE ? this.workspaceCache : this.userCache));
		}

		transaction(tx => {
			this._publishedServers.set(nextServers, tx);
			this._extensionServers.set(extensionServers, tx);
		});
	}

	private _onExtensions(extensions: readonly Readonly<IRelaxedExtensionDescription>[]) {
		const newRecs: IExtensionCollectionsRec[] = [];
		for (const extension of extensions) {
			const collections = extension.contributes?.modelContextServerCollections;
			if (!collections) {
				continue;
			}

			for (const collection of collections) {
				const id = extensionMcpCollectionPrefix + collection.id;
				const pendingServers = this.workspaceCache.getServers(id)?.servers.map(server =>
					this._instantiationService.createInstance(McpServer, { id, label: collection.label, presentation: { order: McpCollectionSortOrder.Extension } }, McpServerDefinition.fromSerialized(server), true, this.workspaceCache));
				this._logService.debug(`MCP collection ${collection.id} hydrated for extension ${extension.identifier.value} (${pendingServers?.length})`);

				newRecs.push({
					extensionId: extension.identifier,
					collectionId: id,
					pendingServers
				});
			}
		}

		if (newRecs.length) {
			this._extensionServers.set(this._extensionServers.get().concat(newRecs), undefined);
		}
	}

	private async _onExtensionStatus() {
		// This fires on activation but before providers might have published.
		// Take the extensions that are active now, wait for all them to publish,
		// then prune inactive servers.
		const wereActive = Object.entries(this._extensionService.getExtensionsStatus())
			.filter(([, status]) => !!status.activationTimes)
			.map(([id]) => id);
		await this._waitForInitialProvidersToPublish();

		this._updateCollectedServers(); // ensure any pendingServers we know about were handled

		// we move servers out of _extensionServers as they're registered. Once
		// an extension finishes being activated, if there are any orphaned servers,
		// then they are removed.
		const toKeep: IExtensionCollectionsRec[] = [];
		const currentRecs = this._extensionServers.get();
		for (const rec of currentRecs) {
			if (!wereActive.includes(rec.extensionId.value)) {
				toKeep.push(rec); // keep waiting
				continue;
			}

			this._extensionCollectionIdsToPersist.add(rec.collectionId);

			if (rec.pendingServers) {
				for (const server of rec.pendingServers) {
					this._logService.debug(`Cached MCP server ${server.definition.id} removed because the extension no longer publishes it`);
					server.dispose();
				}
			}
		}

		if (toKeep.length !== currentRecs.length) {
			this._extensionServers.set(toKeep, undefined);
		}
	}

	public override dispose(): void {
		this._extensionServers.get().forEach(server => server.pendingServers?.forEach(s => s.dispose()));
		this._publishedServers.get().forEach(server => server.dispose());
		super.dispose();
	}
}

function defsEqual(server: IMcpServer, def: { serverDefinition: McpServerDefinition; collectionDefinition: McpCollectionDefinition }) {
	return server.collection.id === def.collectionDefinition.id && server.definition.id === def.serverDefinition.id;
}
