/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../../../base/common/async.js';
import { decodeBase64 } from '../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError, getErrorMessage, isCancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, IReference, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { equals } from '../../../../../../base/common/objects.js';
import { autorun, derivedOpts, IObservable, observableSignalFromEvent, observableValue, transaction } from '../../../../../../base/common/observable.js';
import { getComparisonKey, isEqual } from '../../../../../../base/common/resources.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { withAgentToolOrigin } from '../../../../../../platform/agentHost/common/meta/agentToolDefinitionMeta.js';
import type { ToolDefinition } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { MCP } from '../../../../mcp/common/modelContextProtocol.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { getAgentHostSessionResource } from '../../../common/constants.js';
import type { IChatModel } from '../../../common/model/chatModel.js';
import { ILanguageModelToolsService, IToolData, IToolInvocation, IToolResult, ToolDataSource } from '../../../common/tools/languageModelToolsService.js';
import type { ChatMcpAppModel } from '../../widget/chatContentParts/toolInvocationParts/chatMcpAppModel.js';
import type { IMcpAppRenderData } from '../../widget/chatContentParts/toolInvocationParts/chatMcpAppSubPart.js';
import { toolDataToDefinition } from './agentHostToolUtils.js';

/**
 * A live MCP App that provides tools registered via the ext-apps `App.registerTool()` API.
 */
export interface IAgentHostMcpAppToolProvider {
	/** Tools the app currently provides, as reported by its latest `tools/list` response. */
	readonly tools: IObservable<readonly MCP.Tool[]>;

	/** Calls one of the app's tools with a host-to-app `tools/call` request. */
	callTool(name: string, args: Record<string, unknown>, token: CancellationToken): Promise<MCP.CallToolResult>;
}

export const IAgentHostMcpAppToolsService = createDecorator<IAgentHostMcpAppToolsService>('agentHostMcpAppToolsService');

export const MCP_APP_KEEP_ALIVE_APP_COUNT = 3;

/**
 * Publishes the tools of live MCP Apps as session-scoped client tools of the agent host chat
 * session the app was rendered in.
 */
export interface IAgentHostMcpAppToolsService {
	readonly _serviceBrand: undefined;

	/** Shares view models and retains hidden tool providers from the latest request and the three most recent apps. */
	acquire(renderData: IMcpAppRenderData, toolCallId: string, create: () => ChatMcpAppModel): IReference<ChatMcpAppModel>;

	/**
	 * Publishes the app's tools to the chat session until the returned
	 * disposable is disposed. When several apps in a session provide a tool
	 * with the same name, the most recently registered app wins.
	 */
	registerApp(sessionResource: URI, provider: IAgentHostMcpAppToolProvider): IDisposable;

	/** Tool definitions shared by frontend chats mapped to the same backend session. */
	getToolDefinitions(sessionResource: URI): IObservable<readonly ToolDefinition[]>;

	/** Resolves an original app tool name only within its owning session. */
	getTool(sessionResource: URI, name: string): IToolData | undefined;

	/** Resolves the canonical tool-owning session through authoritative connection identities. */
	getToolSessionResource(sessionResource: URI): URI;
}

/** Returns apps from the latest request and the three most recent apps overall. */
function getRetainableMcpAppToolCallIds(chatModel: IChatModel): Set<string> {
	const toolCallIds: string[] = [];
	let latestRequestToolCallIds: string[] = [];
	for (const request of chatModel.getRequests()) {
		const requestToolCallIds: string[] = [];
		for (const part of request.response?.response.value ?? []) {
			if ((part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') && part.toolSpecificData?.kind === 'input' && part.toolSpecificData.mcpAppData) {
				requestToolCallIds.push(part.toolCallId);
			}
		}
		latestRequestToolCallIds = requestToolCallIds;
		toolCallIds.push(...requestToolCallIds);
	}
	return new Set([...latestRequestToolCallIds, ...toolCallIds.slice(-MCP_APP_KEEP_ALIVE_APP_COUNT)]);
}

class McpAppEntry extends Disposable {
	public references = 0;
	public readonly retention = this._register(new DisposableStore());

	constructor(public readonly model: ChatMcpAppModel, onDidDisposeChat: Event<void>, dispose: () => void) {
		super();
		this._register(model);
		this._register(Event.once(onDidDisposeChat)(dispose));
	}
}

interface IAppRegistration {
	readonly sessionResource: URI;
	readonly provider: IAgentHostMcpAppToolProvider;
	readonly sequence: number;
}

interface IPublishedAppTool {
	data: IToolData;
	readonly registration: MutableDisposable<IDisposable>;
}

/** Owns live apps and registers their tools as session-scoped tools under opaque execution IDs. */
export class AgentHostMcpAppToolsService extends Disposable implements IAgentHostMcpAppToolsService {
	declare readonly _serviceBrand: undefined;

	private readonly _apps = observableValue<readonly IAppRegistration[]>(this, []);
	private readonly _definitions = observableValue(this, new ResourceMap<readonly ToolDefinition[]>());
	private readonly _published = new ResourceMap<Map<string, IPublishedAppTool>>();
	private readonly _toolRegistrations = this._register(new DisposableMap<string, MutableDisposable<IDisposable>>());
	private readonly _entries = this._register(new DisposableMap<string, McpAppEntry>());
	private _nextSequence = 0;

	constructor(
		@ILanguageModelToolsService private readonly _toolsService: ILanguageModelToolsService,
		@ILogService private readonly _logService: ILogService,
		@IChatService private readonly _chatService: IChatService,
		@IAgentHostConnectionsService private readonly _connectionsService: IAgentHostConnectionsService,
	) {
		super();
		const sessionIdentities = observableSignalFromEvent(this, this._connectionsService.onDidChangeSessionResolution);
		this._register(autorun(reader => {
			sessionIdentities.read(reader);
			const tools = new ResourceMap<Map<string, MCP.Tool>>();
			for (const app of this._apps.read(reader)) {
				const sessionResource = this.getToolSessionResource(app.sessionResource);
				let sessionTools = tools.get(sessionResource);
				if (!sessionTools) {
					sessionTools = new Map();
					tools.set(sessionResource, sessionTools);
				}
				for (const tool of app.provider.tools.read(reader)) {
					sessionTools.set(tool.name, tool);
				}
			}
			this._updateTools(tools);
		}));
	}

	acquire(renderData: IMcpAppRenderData, toolCallId: string, create: () => ChatMcpAppModel): IReference<ChatMcpAppModel> {
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
		const key = JSON.stringify([getComparisonKey(renderData.sessionResource), toolCallId]);
		let entry = this._entries.get(key);
		if (!entry) {
			entry = new McpAppEntry(create(), this._chatService.getSession(renderData.sessionResource)?.onDidDispose ?? Event.None, () => this._entries.deleteAndDispose(key));
			this._entries.set(key, entry);
			entry.references++;
			this._watchRetention(key, entry, renderData, toolCallId);
		} else {
			entry.references++;
		}
		const acquired = entry;
		return Object.assign(toDisposable(() => {
			if (this._entries.get(key) !== acquired || --acquired.references > 0) {
				return;
			}
			this._retainOrDispose(key, acquired, renderData, toolCallId);
		}), { object: acquired.model });
	}

	private _watchRetention(key: string, entry: McpAppEntry, renderData: IMcpAppRenderData, toolCallId: string): void {
		const chatModel = this._chatService.getSession(renderData.sessionResource);
		const reevaluate = () => this._retainOrDispose(key, entry, renderData, toolCallId);
		if (chatModel) {
			const responses = entry.retention.add(new DisposableStore());
			const watchResponses = () => {
				responses.clear();
				for (const request of chatModel.getRequests()) {
					if (request.response) {
						responses.add(request.response.onDidChange(reevaluate));
					}
				}
				reevaluate();
			};
			entry.retention.add(chatModel.onDidChange(watchResponses));
			watchResponses();
		}
		entry.retention.add(autorun(reader => {
			entry.model.tools.read(reader);
			reevaluate();
		}));
	}

	private _retainOrDispose(key: string, entry: McpAppEntry, renderData: IMcpAppRenderData, toolCallId: string): void {
		if (this._entries.get(key) !== entry) {
			return;
		}
		const chatModel = this._chatService.getSession(renderData.sessionResource);
		const eligible = renderData.kind === 'agentHost'
			&& !!chatModel && getRetainableMcpAppToolCallIds(chatModel).has(toolCallId);
		entry.model.setHiddenRetentionEnabled(eligible);
		if (entry.references === 0 && (!eligible || entry.model.tools.get().length === 0)) {
			this._entries.deleteAndDispose(key);
		}
	}

	registerApp(sessionResource: URI, provider: IAgentHostMcpAppToolProvider): IDisposable {
		if (this._store.isDisposed) {
			return Disposable.None;
		}
		const sequence = this._nextSequence++;
		this._apps.set([...this._apps.get(), { sessionResource, provider, sequence }], undefined);
		return toDisposable(() => {
			this._apps.set(this._apps.get().filter(app => app.sequence !== sequence), undefined);
		});
	}

	getToolDefinitions(sessionResource: URI): IObservable<readonly ToolDefinition[]> {
		return derivedOpts({ owner: this, equalsFn: equals }, reader => this._definitions.read(reader).get(this.getToolSessionResource(sessionResource)) ?? []);
	}

	getTool(sessionResource: URI, name: string): IToolData | undefined {
		return this._published.get(this.getToolSessionResource(sessionResource))?.get(name)?.data;
	}

	/** Shares the tool namespace through authoritative identities without changing per-chat model ownership. */
	getToolSessionResource(sessionResource: URI): URI {
		const parent = getAgentHostSessionResource(sessionResource);
		const identity = this._connectionsService.resolveSessionResourceIdentity(parent);
		return identity?.backendSessionIsAdvertised
			? this._connectionsService.findSessionResource(identity.backendSession, identity.connectionAuthority) ?? parent
			: parent;
	}

	private _updateTools(tools: ResourceMap<Map<string, MCP.Tool>>): void {
		for (const [sessionResource, published] of this._published) {
			for (const [name, tool] of published) {
				if (!tools.get(sessionResource)?.has(name)) {
					this._toolRegistrations.deleteAndDispose(tool.data.id);
					published.delete(name);
				}
			}
			if (published.size === 0) {
				this._published.delete(sessionResource);
			}
		}

		const definitions = new ResourceMap<readonly ToolDefinition[]>();
		for (const [sessionResource, sessionTools] of tools) {
			if (sessionTools.size === 0) {
				continue;
			}
			let published = this._published.get(sessionResource);
			if (!published) {
				published = new Map();
				this._published.set(sessionResource, published);
			}
			for (const [name, tool] of sessionTools) {
				let entry = published.get(name);
				const displayName = tool.title ?? tool.annotations?.title ?? name;
				const data: IToolData = {
					id: entry?.data.id ?? `mcpApp.tool.${generateUuid()}`,
					displayName,
					modelDescription: tool.description ?? displayName,
					source: ToolDataSource.Internal,
					inputSchema: tool.inputSchema,
					sessionResource: entry?.data.sessionResource ?? sessionResource,
				};
				if (entry && equals(entry.data, data)) {
					continue;
				}
				if (!entry) {
					const registration = new MutableDisposable<IDisposable>();
					this._toolRegistrations.set(data.id, registration);
					entry = { data, registration };
					published.set(name, entry);
				}
				entry.registration.clear();
				entry.data = data;
				entry.registration.value = this._toolsService.registerTool(data, {
					prepareToolInvocation: async () => ({
						invocationMessage: localize('mcpAppTool.running', "Running {0}", displayName),
						pastTenseMessage: localize('mcpAppTool.ran', "Ran {0}", displayName),
					}),
					invoke: (invocation, _countTokens, _progress, token) => this._invokeTool(sessionResource, name, data.id, invocation, token),
				});
			}
			definitions.set(sessionResource, [...published].map(([name, tool]) => withAgentToolOrigin({ ...toolDataToDefinition(tool.data), name }, 'mcpApp')));
		}
		this._definitions.set(definitions, undefined);
	}

	private async _invokeTool(sessionResource: URI, name: string, id: string, invocation: IToolInvocation, token: CancellationToken): Promise<IToolResult> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const provider = this._published.get(sessionResource)?.get(name)?.data.id === id
			? this._apps.get().findLast(app => isEqual(this.getToolSessionResource(app.sessionResource), sessionResource) && app.provider.tools.get().some(tool => tool.name === name))?.provider
			: undefined;
		if (!provider) {
			return this._errorResult(localize('mcpAppTool.unavailable', "MCP app tool \"{0}\" is no longer available.", name));
		}
		if (!invocation.parameters || typeof invocation.parameters !== 'object' || Array.isArray(invocation.parameters)) {
			return this._errorResult(localize('mcpAppTool.invalidInput', "Invalid input for MCP app tool \"{0}\": expected object parameters.", name));
		}
		try {
			const result = await raceCancellationError(provider.callTool(name, invocation.parameters as Record<string, unknown>, token), token);
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			return this._convertResult(result);
		} catch (error) {
			if (isCancellationError(error)) {
				throw error;
			}
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			this._logService.warn('[AgentHostMcpAppToolsService] App tool failed', error);
			return this._errorResult(localize('mcpAppTool.failed', "MCP app tool \"{0}\" failed: {1}", name, getErrorMessage(error)));
		}
	}

	private _convertResult(result: MCP.CallToolResult): IToolResult {
		const content: IToolResult['content'] = [];
		const errorText: string[] = [];
		for (const item of result.content) {
			switch (item.type) {
				case 'text':
					errorText.push(item.text);
					content.push({ kind: 'text', value: item.text });
					break;
				case 'image':
				case 'audio':
					content.push({ kind: 'data', value: { mimeType: item.mimeType, data: decodeBase64(item.data) } });
					break;
				case 'resource':
					if (hasKey(item.resource, { text: true })) {
						content.push({ kind: 'text', value: item.resource.text });
						errorText.push(item.resource.text);
					} else {
						content.push({ kind: 'data', value: { mimeType: item.resource.mimeType ?? 'application/octet-stream', data: decodeBase64(item.resource.blob) } });
					}
					break;
				case 'resource_link':
					content.push({ kind: 'text', value: item.uri });
					break;
			}
		}
		if (result.structuredContent !== undefined) {
			content.push({ kind: 'text', value: JSON.stringify(result.structuredContent) });
		}
		return {
			content,
			...(result.isError ? { toolResultError: errorText.join('\n') || localize('mcpAppTool.error', "The MCP app tool returned an error.") } : {}),
		};
	}

	private _errorResult(message: string): IToolResult {
		return { content: [{ kind: 'text', value: message }], toolResultError: message };
	}

	override dispose(): void {
		super.dispose();
		this._published.clear();
		transaction(tx => {
			this._apps.set([], tx);
			this._definitions.set(new ResourceMap<readonly ToolDefinition[]>(), tx);
		});
	}
}

registerSingleton(IAgentHostMcpAppToolsService, AgentHostMcpAppToolsService, InstantiationType.Delayed);
