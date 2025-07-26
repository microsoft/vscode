/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { markdownCommandLink, MarkdownString } from '../../../../base/common/htmlContent.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/objects.js';
import { autorun } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { StorageScope } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ChatResponseResource, getAttachableImageExtension } from '../../chat/common/chatModel.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, IToolResultInputOutputDetails, ToolDataSource, ToolProgress, ToolSet } from '../../chat/common/languageModelToolsService.js';
import { McpCommandIds } from './mcpCommandIds.js';
import { IMcpRegistry } from './mcpRegistryTypes.js';
import { IMcpServer, IMcpService, IMcpTool, McpResourceURI } from './mcpTypes.js';

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
					const metadata = server.serverMetadata.get();
					const source: ToolDataSource = {
						type: 'mcp',
						serverLabel: metadata?.serverName,
						instructions: metadata?.serverInstructions,
						label: server.definition.label,
						collectionId: server.collection.id,
						definitionId: server.definition.id
					};
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

		store.add(autorun(reader => {
			const toDelete = new Set(tools.keys());

			// toRegister is deferred until deleting tools that moving a tool between
			// servers (or deleting one instance of a multi-instance server) doesn't cause an error.
			const toRegister: (() => void)[] = [];
			const registerTool = (tool: IMcpTool, toolData: IToolData, store: DisposableStore) => {
				store.add(this._toolsService.registerToolData(toolData));
				store.add(this._toolsService.registerToolImplementation(tool.id, this._instantiationService.createInstance(McpToolImplementation, tool, server)));
				store.add(collectionData.value.toolSet.addTool(toolData));
			};

			for (const tool of server.tools.read(reader)) {
				const existing = tools.get(tool.id);
				const collection = this._mcpRegistry.collections.get().find(c => c.id === server.collection.id);
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
}

class McpToolImplementation implements IToolImpl {
	constructor(
		private readonly _tool: IMcpTool,
		private readonly _server: IMcpServer,
		@IProductService private readonly _productService: IProductService,
		@IFileService private readonly _fileService: IFileService,
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
			const addAsInlineData = async (mimeType: string, value: string, uri?: URI) => {
				details.output.push({ type: 'embed', mimeType, value, uri });
				if (isForModel) {
					const resized = await this.resizeImage(value, mimeType)
						.then(data => VSBuffer.wrap(data))
						.catch(() => decodeBase64(value));
					result.content.push({
						kind: 'data',
						value: { mimeType, data: resized }
					});
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
				addAsInlineData(item.mimeType || 'image/png', item.data);
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
					addAsInlineData(item.resource.mimeType, item.resource.blob, uri);
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

	// TODO: @justschen create media service
	async resizeImage(data: Uint8Array | string, mimeType?: string): Promise<Uint8Array> {
		const isGif = mimeType === 'image/gif';

		if (typeof data === 'string') {
			data = this.convertStringToUInt8Array(data);
		}

		return new Promise((resolve, reject) => {
			const blob = new Blob([data as Uint8Array<ArrayBuffer>], { type: mimeType });
			const img = new Image();
			const url = URL.createObjectURL(blob);
			img.src = url;

			img.onload = () => {
				URL.revokeObjectURL(url);
				let { width, height } = img;

				if ((width <= 768 || height <= 768) && !isGif) {
					resolve(data);
					return;
				}

				// Calculate the new dimensions while maintaining the aspect ratio
				if (width > 2048 || height > 2048) {
					const scaleFactor = 2048 / Math.max(width, height);
					width = Math.round(width * scaleFactor);
					height = Math.round(height * scaleFactor);
				}

				const scaleFactor = 768 / Math.min(width, height);
				width = Math.round(width * scaleFactor);
				height = Math.round(height * scaleFactor);

				const canvas = document.createElement('canvas');
				canvas.width = width;
				canvas.height = height;
				const ctx = canvas.getContext('2d');
				if (ctx) {
					ctx.drawImage(img, 0, 0, width, height);
					canvas.toBlob((blob) => {
						if (blob) {
							const reader = new FileReader();
							reader.onload = () => {
								resolve(new Uint8Array(reader.result as ArrayBuffer));
							};
							reader.onerror = (error) => reject(error);
							reader.readAsArrayBuffer(blob);
						} else {
							reject(new Error('Failed to create blob from canvas'));
						}
					}, 'image/png');
				} else {
					reject(new Error('Failed to get canvas context'));
				}
			};
			img.onerror = (error) => {
				URL.revokeObjectURL(url);
				reject(error);
			};
		});
	}

	convertStringToUInt8Array(data: string): Uint8Array {
		const base64Data = data.includes(',') ? data.split(',')[1] : data;
		if (this.isValidBase64(base64Data)) {
			return Uint8Array.from(atob(base64Data), char => char.charCodeAt(0));
		}
		return new TextEncoder().encode(data);
	}

	isValidBase64(str: string): boolean {
		// checks if the string is a valid base64 string that is NOT encoded
		return /^[A-Za-z0-9+/]*={0,2}$/.test(str) && (() => {
			try {
				atob(str);
				return true;
			} catch {
				return false;
			}
		})();
	}
}
