/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, IReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/objects.js';
import { autorun, IObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { StorageScope } from '../../../../platform/storage/common/storage.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolResult, ToolProgress } from '../../chat/common/languageModelToolsService.js';
import { IMcpRegistry } from './mcpRegistryTypes.js';
import { McpServer, McpServerMetadataCache } from './mcpServer.js';
import { IMcpServer, IMcpService, IMcpTool, McpCollectionDefinition, McpServerDefinition, McpServerToolsState } from './mcpTypes.js';

interface ISyncedToolData {
	toolData: IToolData;
	store: DisposableStore;
}

type IMcpServerRec = IReference<IMcpServer>;

export class McpService extends Disposable implements IMcpService {

	declare _serviceBrand: undefined;

	private readonly _servers = observableValue<readonly IMcpServerRec[]>(this, []);
	public readonly servers: IObservable<readonly IMcpServer[]> = this._servers.map(servers => servers.map(s => s.object));

	public get lazyCollectionState() { return this._mcpRegistry.lazyCollectionState; }

	protected readonly userCache: McpServerMetadataCache;
	protected readonly workspaceCache: McpServerMetadataCache;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
		@ILanguageModelToolsService private readonly _toolsService: ILanguageModelToolsService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this.userCache = this._register(_instantiationService.createInstance(McpServerMetadataCache, StorageScope.PROFILE));
		this.workspaceCache = this._register(_instantiationService.createInstance(McpServerMetadataCache, StorageScope.WORKSPACE));

		const updateThrottle = this._store.add(new RunOnceScheduler(() => this._updateCollectedServers(), 500));

		// Throttle changes so that if a collection is changed, or a server is
		// unregistered/registered, we don't stop servers unnecessarily.
		this._register(autorun(reader => {
			for (const collection of this._mcpRegistry.collections.read(reader)) {
				collection.serverDefinitions.read(reader);
			}
			updateThrottle.schedule(500);
		}));
	}

	public resetCaches(): void {
		this.userCache.reset();
		this.workspaceCache.reset();
	}

	public async activateCollections(): Promise<void> {
		const collections = await this._mcpRegistry.discoverCollections();
		const collectionIds = new Set(collections.map(c => c.id));

		this._updateCollectedServers();

		// Discover any newly-collected servers with unknown tools
		const todo: Promise<unknown>[] = [];
		for (const { object: server } of this._servers.get()) {
			if (collectionIds.has(server.collection.id)) {
				const state = server.toolsState.get();
				if (state === McpServerToolsState.Unknown) {
					todo.push(server.start());
				}
			}
		}

		await Promise.all(todo);
	}

	private _syncTools(server: McpServer, store: DisposableStore) {
		const tools = new Map</* tool ID */string, ISyncedToolData>();

		store.add(autorun(reader => {
			const toDelete = new Set(tools.keys());
			for (const tool of server.tools.read(reader)) {
				const existing = tools.get(tool.id);
				const collection = this._mcpRegistry.collections.get().find(c => c.id === server.collection.id);
				const toolData: IToolData = {
					id: tool.id,
					source: { type: 'mcp', label: server.definition.label, collectionId: server.collection.id, definitionId: server.definition.id },
					icon: Codicon.tools,
					displayName: tool.definition.annotations?.title || tool.definition.name,
					toolReferenceName: tool.definition.name,
					modelDescription: tool.definition.description ?? '',
					userDescription: tool.definition.description ?? '',
					inputSchema: tool.definition.inputSchema,
					canBeReferencedInPrompt: true,
					supportsToolPicker: true,
					runsInWorkspace: collection?.scope === StorageScope.WORKSPACE || !!collection?.remoteAuthority,
					tags: ['mcp'],
				};

				const registerTool = (store: DisposableStore) => {
					store.add(this._toolsService.registerToolData(toolData));
					store.add(this._toolsService.registerToolImplementation(tool.id, this._instantiationService.createInstance(McpToolImplementation, tool, server)));
				};


				if (existing) {
					if (!equals(existing.toolData, toolData)) {
						existing.toolData = toolData;
						existing.store.clear();
						// We need to re-register both the data and implementation, as the
						// implementation is discarded when the data is removed (#245921)
						registerTool(store);
					}
					toDelete.delete(tool.id);
				} else {
					const store = new DisposableStore();
					registerTool(store);
					tools.set(tool.id, { toolData, store });
				}
			}

			for (const id of toDelete) {
				const tool = tools.get(id);
				if (tool) {
					tool.store.dispose();
					tools.delete(id);
				}
			}
		}));

		store.add(toDisposable(() => {
			for (const tool of tools.values()) {
				tool.store.dispose();
			}
		}));
	}

	private _updateCollectedServers() {
		const definitions = this._mcpRegistry.collections.get().flatMap(collectionDefinition =>
			collectionDefinition.serverDefinitions.get().map(serverDefinition => ({
				serverDefinition,
				collectionDefinition,
			}))
		);

		const nextDefinitions = new Set(definitions);
		const currentServers = this._servers.get();
		const nextServers: IMcpServerRec[] = [];
		const pushMatch = (match: (typeof definitions)[0], rec: IMcpServerRec) => {
			nextDefinitions.delete(match);
			nextServers.push(rec);
			const connection = rec.object.connection.get();
			// if the definition was modified, stop the server; it'll be restarted again on-demand
			if (connection && !McpServerDefinition.equals(connection.definition, match.serverDefinition)) {
				rec.object.stop();
				this._logService.debug(`MCP server ${rec.object.definition.id} stopped because the definition changed`);
			}
		};

		// Transfer over any servers that are still valid.
		for (const server of currentServers) {
			const match = definitions.find(d => defsEqual(server.object, d));
			if (match) {
				pushMatch(match, server);
			} else {
				server.dispose();
			}
		}

		// Create any new servers that are needed.
		for (const def of nextDefinitions) {
			const store = new DisposableStore();
			const object = this._instantiationService.createInstance(
				McpServer,
				def.collectionDefinition,
				def.serverDefinition,
				def.serverDefinition.roots,
				!!def.collectionDefinition.lazy,
				def.collectionDefinition.scope === StorageScope.WORKSPACE ? this.workspaceCache : this.userCache,
			);
			store.add(object);
			this._syncTools(object, store);

			nextServers.push({ object, dispose: () => store.dispose() });
		}

		transaction(tx => {
			this._servers.set(nextServers, tx);
		});
	}

	public override dispose(): void {
		this._servers.get().forEach(s => s.dispose());
		super.dispose();
	}
}

function defsEqual(server: IMcpServer, def: { serverDefinition: McpServerDefinition; collectionDefinition: McpCollectionDefinition }) {
	return server.collection.id === def.collectionDefinition.id && server.definition.id === def.serverDefinition.id;
}

class McpToolImplementation implements IToolImpl {
	constructor(
		private readonly _tool: IMcpTool,
		private readonly _server: IMcpServer,
		@IProductService private readonly _productService: IProductService,
	) { }

	async prepareToolInvocation(parameters: any): Promise<IPreparedToolInvocation> {
		const tool = this._tool;
		const server = this._server;

		const mcpToolWarning = localize(
			'mcp.tool.warning',
			"{0} This tool is from \'{1}\' (MCP Server). Note that MCP servers or malicious conversation content may attempt to misuse '{2}' through tools. Please carefully review any requested actions.",
			'$(info)',
			server.definition.label,
			this._productService.nameShort
		);

		const needsConfirmation = !tool.definition.annotations?.readOnlyHint;
		const title = tool.definition.annotations?.title || ('`' + tool.definition.name + '`');

		return {
			confirmationMessages: needsConfirmation ? {
				title: localize('msg.title', "Run {0}", title),
				message: new MarkdownString(localize('msg.msg', "{0}\n\n {1}", tool.definition.description, mcpToolWarning), { supportThemeIcons: true }),
				allowAutoConfirm: true,
			} : undefined,
			invocationMessage: new MarkdownString(localize('msg.run', "Running {0}", title)),
			pastTenseMessage: new MarkdownString(localize('msg.ran', "Ran {0} ", title)),
			toolSpecificData: {
				kind: 'input',
				rawInput: parameters
			}
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, progress: ToolProgress, token: CancellationToken) {

		const result: IToolResult = {
			content: []
		};

		const outputParts: string[] = [];

		const callResult = await this._tool.callWithProgress(invocation.parameters as Record<string, any>, progress, token);
		for (const item of callResult.content) {
			if (item.type === 'text') {
				result.content.push({
					kind: 'text',
					value: item.text
				});

				outputParts.push(item.text);
			} else {
				// TODO@jrieken handle different item types
			}
		}

		result.toolResultDetails = {
			input: JSON.stringify(invocation.parameters, undefined, 2),
			output: outputParts.join('\n')
		};

		return result;
	}
}
