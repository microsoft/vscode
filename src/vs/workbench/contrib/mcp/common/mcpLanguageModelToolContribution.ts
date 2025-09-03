/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/objects.js';
import { autorun, autorunSelfDisposable } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IImageResizeService } from '../../../../platform/imageResize/common/imageResizeService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { StorageScope } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ChatResponseResource, getAttachableImageExtension } from '../../chat/common/chatModel.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, IToolResultInputOutputDetails, ToolDataSource, ToolProgress, ToolSet } from '../../chat/common/languageModelToolsService.js';
import { IMcpRegistry } from './mcpRegistryTypes.js';
import { IMcpServer, IMcpService, IMcpTool, LazyCollectionState, McpResourceURI, McpServerCacheState } from './mcpTypes.js';
import { mcpServerToSourceData } from './mcpTypesUtils.js';

interface ISyncedToolData {
	toolData: IToolData;
	store: DisposableStore;
}

export class McpLanguageModelToolContribution extends Disposable implements IWorkbenchContribution {

	public static readonly ID = 'workbench.contrib.mcp.languageModelTools';

	constructor(
		@ILanguageModelToolsService private readonly _toolsService: ILanguageModelToolsService,
		@IMcpService mcpService: IMcpService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
	) {
		super();

		// 1. Auto-discover extensions with new MCP servers
		const lazyCollectionState = mcpService.lazyCollectionState.map(s => s.state);
		this._register(autorun(reader => {
			if (lazyCollectionState.read(reader) === LazyCollectionState.HasUnknown) {
				mcpService.activateCollections();
			}
		}));

		// 2. Keep tools in sync with the tools service.
		const previous = this._register(new DisposableMap<IMcpServer, DisposableStore>());
		this._register(autorun(reader => {
			const servers = mcpService.servers.read(reader);

			const toDelete = new Set(previous.keys());
			for (const server of servers) {
				if (previous.has(server)) {
					toDelete.delete(server);
					continue;
				}

				const store = new DisposableStore();
				const toolSet = new Lazy(() => {
					const source = mcpServerToSourceData(server);
					const toolSet = store.add(this._toolsService.createToolSet(
						source,
						server.definition.id, server.definition.label,
						{
							icon: Codicon.mcp,
							description: localize('mcp.toolset', "{0}: All Tools", server.definition.label)
						}
					));

					return { toolSet, source };
				});

				this._syncTools(server, toolSet, store);
				previous.set(server, store);
			}

			for (const key of toDelete) {
				previous.deleteAndDispose(key);
			}
		}));
	}

	private _syncTools(server: IMcpServer, collectionData: Lazy<{ toolSet: ToolSet; source: ToolDataSource }>, store: DisposableStore) {
		const tools = new Map</* tool ID */string, ISyncedToolData>();

		const collectionObservable = this._mcpRegistry.collections.map(collections =>
			collections.find(c => c.id === server.collection.id));

		// If the server is extension-provided and was marked outdated automatically start it
		store.add(autorunSelfDisposable(reader => {
			const collection = collectionObservable.read(reader);
			if (!collection) {
				return;
			}

			if (!(collection.source instanceof ExtensionIdentifier)) {
				reader.dispose();
				return;
			}

			const cacheState = server.cacheState.read(reader);
			if (cacheState === McpServerCacheState.Unknown || cacheState === McpServerCacheState.Outdated) {
				reader.dispose();
				server.start();
			}
		}));

		store.add(autorun(reader => {
			const toDelete = new Set(tools.keys());

			// toRegister is deferred until deleting tools that moving a tool between
			// servers (or deleting one instance of a multi-instance server) doesn't cause an error.
			const toRegister: (() => void)[] = [];
			const registerTool = (tool: IMcpTool, toolData: IToolData, store: DisposableStore) => {
				store.add(this._toolsService.registerTool(toolData, this._instantiationService.createInstance(McpToolImplementation, tool, server)));
				store.add(collectionData.value.toolSet.addTool(toolData));
			};

			const collection = collectionObservable.read(reader);
			for (const tool of server.tools.read(reader)) {
				const existing = tools.get(tool.id);
				const toolData: IToolData = {
					id: tool.id,
					source: collectionData.value.source,
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
						registerTool(tool, toolData, existing.store);
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
}

class McpToolImplementation implements IToolImpl {
	constructor(
		private readonly _tool: IMcpTool,
		private readonly _server: IMcpServer,
		@IProductService private readonly _productService: IProductService,
		@IFileService private readonly _fileService: IFileService,
		@IImageResizeService private readonly _imageResizeService: IImageResizeService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext): Promise<IPreparedToolInvocation> {
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

		return {
			confirmationMessages: needsConfirmation ? {
				title: new MarkdownString(localize('msg.title', "Run {0}", title)),
				message: new MarkdownString(tool.definition.description, { supportThemeIcons: true }),
				disclaimer: mcpToolWarning,
				allowAutoConfirm: true,
			} : undefined,
			invocationMessage: new MarkdownString(localize('msg.run', "Running {0}", title)),
			pastTenseMessage: new MarkdownString(localize('msg.ran', "Ran {0} ", title)),
			originMessage: localize('msg.subtitle', "{0} (MCP Server)", server.definition.label),
			toolSpecificData: {
				kind: 'input',
				rawInput: context.parameters
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

			// Rewrite image resources to images so they are inlined nicely
			const addAsInlineData = async (mimeType: string, value: string, uri?: URI): Promise<VSBuffer | void> => {
				details.output.push({ type: 'embed', mimeType, value, uri });
				if (isForModel) {
					let finalData: VSBuffer;
					try {
						const resized = await this._imageResizeService.resizeImage(decodeBase64(value).buffer, mimeType);
						finalData = VSBuffer.wrap(resized);
					} catch {
						finalData = decodeBase64(value);
					}
					result.content.push({ kind: 'data', value: { mimeType, data: finalData } });
				}
			};

			const isForModel = audience.includes('assistant');
			if (item.type === 'text') {
				details.output.push({ type: 'embed', isText: true, value: item.text });
				// structured content 'represents the result of the tool call', so take
				// that in place of any textual description when present.
				if (isForModel && !callResult.structuredContent) {
					result.content.push({
						kind: 'text',
						value: item.text
					});
				}
			} else if (item.type === 'image' || item.type === 'audio') {
				// default to some image type if not given to hint
				await addAsInlineData(item.mimeType || 'image/png', item.data);
			} else if (item.type === 'resource_link') {
				const uri = McpResourceURI.fromServer(this._server.definition, item.uri);
				details.output.push({
					type: 'ref',
					uri,
					mimeType: item.mimeType,
				});

				if (isForModel) {
					if (item.mimeType && getAttachableImageExtension(item.mimeType)) {
						result.content.push({
							kind: 'data',
							value: {
								mimeType: item.mimeType,
								data: await this._fileService.readFile(uri).then(f => f.value).catch(() => VSBuffer.alloc(0)),
							}
						});
					} else {
						result.content.push({
							kind: 'text',
							value: `The tool returns a resource which can be read from the URI ${uri}\n`,
						});
					}
				}
			} else if (item.type === 'resource') {
				const uri = McpResourceURI.fromServer(this._server.definition, item.resource.uri);
				if (item.resource.mimeType && getAttachableImageExtension(item.resource.mimeType) && 'blob' in item.resource) {
					await addAsInlineData(item.resource.mimeType, item.resource.blob, uri);
				} else {
					details.output.push({
						type: 'embed',
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
							value: 'text' in item.resource ? item.resource.text : `The tool returns a resource which can be read from the URI ${permalink || uri}\n`,
						});
					}
				}
			}
		}

		if (callResult.structuredContent) {
			details.output.push({ type: 'embed', isText: true, value: JSON.stringify(callResult.structuredContent, null, 2) });
			result.content.push({ kind: 'text', value: JSON.stringify(callResult.structuredContent) });
		}

		result.toolResultDetails = details;
		return result;
	}

}
