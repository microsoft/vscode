/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { decodeBase64 } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { markdownCommandLink, MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, IReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/objects.js';
import { autorun, IObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { StorageScope } from '../../../../platform/storage/common/storage.js';
import { ChatResponseResource, getAttachableImageExtension } from '../../chat/common/chatModel.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolResult, IToolResultInputOutputDetails, ToolDataSource, ToolProgress, ToolSet } from '../../chat/common/languageModelToolsService.js';
import { McpCommandIds } from './mcpCommandIds.js';
import { IMcpRegistry } from './mcpRegistryTypes.js';
import { McpServer, McpServerMetadataCache } from './mcpServer.js';
import { IMcpServer, IMcpService, IMcpTool, McpCollectionDefinition, McpResourceURI, McpServerCacheState, McpServerDefinition, McpToolName } from './mcpTypes.js';

interface ISyncedToolData {
	toolData: IToolData;
	store: DisposableStore;
}

type IMcpServerRec = IReference<IMcpServer> & { toolPrefix: string };

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

		const updateThrottle = this._store.add(new RunOnceScheduler(() => this.updateCollectedServers(), 500));

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

		this.updateCollectedServers();

		// Discover any newly-collected servers with unknown tools
		const todo: Promise<unknown>[] = [];
		for (const { object: server } of this._servers.get()) {
			if (collectionIds.has(server.collection.id)) {
				const state = server.cacheState.get();
				if (state === McpServerCacheState.Unknown) {
					todo.push(server.start());
				}
			}
		}

		await Promise.all(todo);
	}

	private _syncTools(server: McpServer, toolSet: ToolSet, source: ToolDataSource, store: DisposableStore) {
		const tools = new Map</* tool ID */string, ISyncedToolData>();

		store.add(autorun(reader => {
			const toDelete = new Set(tools.keys());

			// toRegister is deferred until deleting tools that moving a tool between
			// servers (or deleting one instance of a multi-instance server) doesn't cause an error.
			const toRegister: (() => void)[] = [];
			const registerTool = (tool: IMcpTool, toolData: IToolData, store: DisposableStore) => {
				store.add(this._toolsService.registerToolData(toolData));
				store.add(this._toolsService.registerToolImplementation(tool.id, this._instantiationService.createInstance(McpToolImplementation, tool, server)));
				store.add(toolSet.addTool(toolData));
			};

			for (const tool of server.tools.read(reader)) {
				const existing = tools.get(tool.id);
				const collection = this._mcpRegistry.collections.get().find(c => c.id === server.collection.id);
				const toolData: IToolData = {
					id: tool.id,
					source,
					icon: Codicon.tools,
					// duplicative: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/813
					displayName: tool.definition.annotations?.title || tool.definition.title || tool.definition.name,
					toolReferenceName: tool.referenceName,
					modelDescription: tool.definition.description ?? '',
					userDescription: tool.definition.description ?? '',
					inputSchema: tool.definition.inputSchema,
					canBeReferencedInPrompt: true,
					alwaysDisplayInputOutput: true,
					runsInWorkspace: collection?.scope === StorageScope.WORKSPACE || !!collection?.remoteAuthority,
					tags: ['mcp'],
				};

				if (existing) {
					if (!equals(existing.toolData, toolData)) {
						existing.toolData = toolData;
						existing.store.clear();
						// We need to re-register both the data and implementation, as the
						// implementation is discarded when the data is removed (#245921)
						registerTool(tool, toolData, store);
					}
					toDelete.delete(tool.id);
				} else {
					const store = new DisposableStore();
					toRegister.push(() => registerTool(tool, toolData, store));
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

			for (const fn of toRegister) {
				fn();
			}
		}));

		store.add(toDisposable(() => {
			for (const tool of tools.values()) {
				tool.store.dispose();
			}
		}));
	}

	public updateCollectedServers() {
		const prefixGenerator = new McpPrefixGenerator();
		const definitions = this._mcpRegistry.collections.get().flatMap(collectionDefinition =>
			collectionDefinition.serverDefinitions.get().map(serverDefinition => {
				const toolPrefix = prefixGenerator.generate(serverDefinition.label);
				return { serverDefinition, collectionDefinition, toolPrefix };
			})
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
			const match = definitions.find(d => defsEqual(server.object, d) && server.toolPrefix === d.toolPrefix);
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
				def.toolPrefix,
			);

			const source: ToolDataSource = { type: 'mcp', label: object.definition.label, collectionId: object.collection.id, definitionId: object.definition.id };
			const toolSet = this._toolsService.createToolSet(
				source,
				def.serverDefinition.id, def.serverDefinition.label,
				{
					icon: Codicon.mcp,
					description: localize('mcp.toolset', "{0}: All Tools", def.serverDefinition.label)
				}
			);
			store.add(toolSet);
			store.add(object);
			this._syncTools(object, toolSet, source, store);

			nextServers.push({ object, dispose: () => store.dispose(), toolPrefix: def.toolPrefix });
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
			"Note that MCP servers or malicious conversation content may attempt to misuse '{0}' through tools.",
			this._productService.nameShort
		);

		const needsConfirmation = !tool.definition.annotations?.readOnlyHint;
		// duplicative: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/813
		const title = tool.definition.annotations?.title || tool.definition.title || ('`' + tool.definition.name + '`');
		const subtitle = localize('msg.subtitle', "{0} (MCP Server)", server.definition.label);

		return {
			confirmationMessages: needsConfirmation ? {
				title: new MarkdownString(localize('msg.title', "Run {0}", title)),
				message: new MarkdownString(tool.definition.description, { supportThemeIcons: true }),
				disclaimer: mcpToolWarning,
				allowAutoConfirm: true,
			} : undefined,
			invocationMessage: new MarkdownString(localize('msg.run', "Running {0}", title)),
			pastTenseMessage: new MarkdownString(localize('msg.ran', "Ran {0} ", title)),
			originMessage: new MarkdownString(markdownCommandLink({
				id: McpCommandIds.ShowConfiguration,
				title: subtitle,
				arguments: [server.collection.id, server.definition.id],
			}), { isTrusted: true }),
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

		const callResult = await this._tool.callWithProgress(invocation.parameters as Record<string, any>, progress, { chatRequestId: invocation.chatRequestId, chatSessionId: invocation.context?.sessionId }, token);
		const details: IToolResultInputOutputDetails = {
			input: JSON.stringify(invocation.parameters, undefined, 2),
			output: [],
			isError: callResult.isError === true,
		};

		for (const item of callResult.content) {
			const audience = item.annotations?.audience || ['assistant'];
			if (audience.includes('user')) {
				if (item.type === 'text') {
					progress.report({ message: item.text });
				}
			}

			// Rewrite image rsources to images so they are inlined nicely
			const addAsInlineData = (mimeType: string, value: string, uri?: URI) => {
				details.output.push({ mimeType, value, uri });
				if (isForModel) {
					result.content.push({
						kind: 'data',
						value: { mimeType, data: decodeBase64(value) }
					});
				}
			};

			const isForModel = audience.includes('assistant');
			if (item.type === 'text') {
				details.output.push({ isText: true, value: item.text });
				if (isForModel) {
					result.content.push({
						kind: 'text',
						value: item.text
					});
				}
			} else if (item.type === 'image' || item.type === 'audio') {
				// default to some image type if not given to hint
				addAsInlineData(item.mimeType || 'image/png', item.data);
			} else if (item.type === 'resource_link') {
				// todo@connor4312 look at what we did before #250329 and use that here
			} else if (item.type === 'resource') {
				const uri = McpResourceURI.fromServer(this._server.definition, item.resource.uri);
				if (item.resource.mimeType && getAttachableImageExtension(item.resource.mimeType) && 'blob' in item.resource) {
					addAsInlineData(item.resource.mimeType, item.resource.blob, uri);
				} else {
					details.output.push({
						uri,
						isText: 'text' in item.resource,
						mimeType: item.resource.mimeType,
						value: 'blob' in item.resource ? item.resource.blob : item.resource.text,
						asResource: true,
					});

					if (isForModel) {
						const permalink = invocation.chatRequestId && invocation.context && ChatResponseResource.createUri(invocation.context.sessionId, invocation.chatRequestId, invocation.callId, result.content.length, basename(uri));

						result.content.push({
							kind: 'text',
							value: 'text' in item.resource ? item.resource.text : `The tool returns a resource which can be read from the URI ${permalink || uri}`,
						});
					}
				}
			}
		}

		result.toolResultDetails = details;
		return result;
	}
}

// Helper class for generating unique MCP tool prefixes
class McpPrefixGenerator {
	private readonly seenPrefixes = new Set<string>();

	generate(label: string): string {
		const baseToolPrefix = McpToolName.Prefix + label.toLowerCase().replace(/[^a-z0-9_.-]+/g, '_').slice(0, McpToolName.MaxPrefixLen - McpToolName.Prefix.length - 1);
		let toolPrefix = baseToolPrefix + '_';
		for (let i = 2; this.seenPrefixes.has(toolPrefix); i++) {
			toolPrefix = baseToolPrefix + i + '_';
		}
		this.seenPrefixes.add(toolPrefix);
		return toolPrefix;
	}
}
