/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../base/common/arrays.js';
import { assertNever } from '../../../../base/common/assert.js';
import { DeferredPromise, IntervalTimer } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { canLog, ILogger, log, LogLevel } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IMcpMessageTransport } from './mcpRegistryTypes.js';
import { IMcpClientMethods, McpConnectionState, McpError, MpcResponseError } from './mcpTypes.js';
import { MCP } from './modelContextProtocol.js';

/**
 * Maps request IDs to handlers.
 */
interface PendingRequest {
	promise: DeferredPromise<MCP.Result>;
}

export interface McpRoot {
	uri: string;
	name?: string;
}

export interface IMcpServerRequestHandlerOptions extends IMcpClientMethods {
	/** MCP message transport */
	launch: IMcpMessageTransport;
	/** Logger instance. */
	logger: ILogger;
	/** Log level MCP messages is logged at */
	requestLogLevel?: LogLevel;
}

/**
 * Request handler for communicating with an MCP server.
 *
 * Handles sending requests and receiving responses, with automatic
 * handling of ping requests and typed client request methods.
 */
export class McpServerRequestHandler extends Disposable {
	private _nextRequestId = 1;
	private readonly _pendingRequests = new Map<MCP.RequestId, PendingRequest>();

	private _hasAnnouncedRoots = false;
	private _roots: MCP.Root[] = [];

	public set roots(roots: MCP.Root[]) {
		if (!equals(this._roots, roots)) {
			this._roots = roots;
			if (this._hasAnnouncedRoots) {
				this.sendNotification({ method: 'notifications/roots/list_changed' });
				this._hasAnnouncedRoots = false;
			}
		}
	}

	private _serverInit!: MCP.InitializeResult;
	public get capabilities(): MCP.ServerCapabilities {
		return this._serverInit.capabilities;
	}

	public get serverInfo(): MCP.Implementation {
		return this._serverInit.serverInfo;
	}

	public get serverInstructions(): string | undefined {
		return this._serverInit.instructions;
	}

	// Event emitters for server notifications
	private readonly _onDidReceiveCancelledNotification = this._register(new Emitter<MCP.CancelledNotification>());
	readonly onDidReceiveCancelledNotification = this._onDidReceiveCancelledNotification.event;

	private readonly _onDidReceiveProgressNotification = this._register(new Emitter<MCP.ProgressNotification>());
	readonly onDidReceiveProgressNotification = this._onDidReceiveProgressNotification.event;

	private readonly _onDidChangeResourceList = this._register(new Emitter<void>());
	readonly onDidChangeResourceList = this._onDidChangeResourceList.event;

	private readonly _onDidUpdateResource = this._register(new Emitter<MCP.ResourceUpdatedNotification>());
	readonly onDidUpdateResource = this._onDidUpdateResource.event;

	private readonly _onDidChangeToolList = this._register(new Emitter<void>());
	readonly onDidChangeToolList = this._onDidChangeToolList.event;

	private readonly _onDidChangePromptList = this._register(new Emitter<void>());
	readonly onDidChangePromptList = this._onDidChangePromptList.event;

	/**
	 * Connects to the MCP server and does the initialization handshake.
	 * @throws MpcResponseError if the server fails to initialize.
	 */
	public static async create(instaService: IInstantiationService, opts: IMcpServerRequestHandlerOptions, token?: CancellationToken) {
		const mcp = new McpServerRequestHandler(opts);
		const store = new DisposableStore();
		try {
			const timer = store.add(new IntervalTimer());
			timer.cancelAndSet(() => {
				opts.logger.info('Waiting for server to respond to `initialize` request...');
			}, 5000);

			await instaService.invokeFunction(async accessor => {
				const productService = accessor.get(IProductService);
				const initialized = await mcp.sendRequest<MCP.InitializeRequest, MCP.InitializeResult>({
					method: 'initialize',
					params: {
						protocolVersion: MCP.LATEST_PROTOCOL_VERSION,
						capabilities: {
							roots: { listChanged: true },
							sampling: opts.createMessageRequestHandler ? {} : undefined,
							elicitation: opts.elicitationRequestHandler ? {} : undefined,
						},
						clientInfo: {
							name: productService.nameLong,
							version: productService.version,
						}
					}
				}, token);

				mcp._serverInit = initialized;
				mcp._sendLogLevelToServer(opts.logger.getLevel());

				mcp.sendNotification<MCP.InitializedNotification>({
					method: 'notifications/initialized'
				});
			});

			return mcp;
		} catch (e) {
			mcp.dispose();
			throw e;
		} finally {
			store.dispose();
		}
	}

	public readonly logger: ILogger;
	private readonly _launch: IMcpMessageTransport;
	private readonly _requestLogLevel: LogLevel;
	private readonly _createMessageRequestHandler: IMcpServerRequestHandlerOptions['createMessageRequestHandler'];
	private readonly _elicitationRequestHandler: IMcpServerRequestHandlerOptions['elicitationRequestHandler'];

	protected constructor({
		launch,
		logger,
		createMessageRequestHandler,
		elicitationRequestHandler,
		requestLogLevel = LogLevel.Debug,
	}: IMcpServerRequestHandlerOptions) {
		super();
		this._launch = launch;
		this.logger = logger;
		this._requestLogLevel = requestLogLevel;
		this._createMessageRequestHandler = createMessageRequestHandler;
		this._elicitationRequestHandler = elicitationRequestHandler;

		this._register(launch.onDidReceiveMessage(message => this.handleMessage(message)));
		this._register(autorun(reader => {
			const state = launch.state.read(reader).state;
			// the handler will get disposed when the launch stops, but if we're still
			// create()'ing we need to make sure to cancel the initialize request.
			if (state === McpConnectionState.Kind.Error || state === McpConnectionState.Kind.Stopped) {
				this.cancelAllRequests();
			}
		}));

		// Listen for log level changes and forward them to the MCP server
		this._register(logger.onDidChangeLogLevel((logLevel) => {
			this._sendLogLevelToServer(logLevel);
		}));
	}

	/**
	 * Send a client request to the server and return the response.
	 *
	 * @param request The request to send
	 * @param token Cancellation token
	 * @param timeoutMs Optional timeout in milliseconds
	 * @returns A promise that resolves with the response
	 */
	private async sendRequest<T extends MCP.ClientRequest, R extends MCP.ServerResult>(
		request: Pick<T, 'params' | 'method'>,
		token: CancellationToken = CancellationToken.None
	): Promise<R> {
		if (this._store.isDisposed) {
			return Promise.reject(new CancellationError());
		}

		const id = this._nextRequestId++;

		// Create the full JSON-RPC request
		const jsonRpcRequest: MCP.JSONRPCRequest = {
			jsonrpc: MCP.JSONRPC_VERSION,
			id,
			...request
		};

		const promise = new DeferredPromise<MCP.ServerResult>();
		// Store the pending request
		this._pendingRequests.set(id, { promise });
		// Set up cancellation
		const cancelListener = token.onCancellationRequested(() => {
			if (!promise.isSettled) {
				this._pendingRequests.delete(id);
				this.sendNotification({ method: 'notifications/cancelled', params: { requestId: id } });
				promise.cancel();
			}
			cancelListener.dispose();
		});

		// Send the request
		this.send(jsonRpcRequest);
		const ret = promise.p.finally(() => {
			cancelListener.dispose();
			this._pendingRequests.delete(id);
		});

		return ret as Promise<R>;
	}

	private send(mcp: MCP.JSONRPCMessage) {
		if (canLog(this.logger.getLevel(), this._requestLogLevel)) { // avoid building the string if we don't need to
			log(this.logger, this._requestLogLevel, `[editor -> server] ${JSON.stringify(mcp)}`);
		}

		this._launch.send(mcp);
	}

	/**
	 * Handles paginated requests by making multiple requests until all items are retrieved.
	 *
	 * @param method The method name to call
	 * @param getItems Function to extract the array of items from a result
	 * @param initialParams Initial parameters
	 * @param token Cancellation token
	 * @returns Promise with all items combined
	 */
	private async *sendRequestPaginated<T extends MCP.PaginatedRequest & MCP.ClientRequest, R extends MCP.PaginatedResult, I>(method: T['method'], getItems: (result: R) => I[], initialParams?: Omit<T['params'], 'jsonrpc' | 'id'>, token: CancellationToken = CancellationToken.None): AsyncIterable<I[]> {
		let nextCursor: MCP.Cursor | undefined = undefined;

		do {
			const params: T['params'] = {
				...initialParams,
				cursor: nextCursor
			};

			const result: R = await this.sendRequest<T, R>({ method, params }, token);
			yield getItems(result);
			nextCursor = result.nextCursor;
		} while (nextCursor !== undefined && !token.isCancellationRequested);
	}

	private sendNotification<N extends MCP.ClientNotification>(notification: Omit<N, 'jsonrpc'>): void {
		this.send({ ...notification, jsonrpc: MCP.JSONRPC_VERSION });
	}

	/**
	 * Handle incoming messages from the server
	 */
	private handleMessage(message: MCP.JSONRPCMessage): void {
		if (canLog(this.logger.getLevel(), this._requestLogLevel)) { // avoid building the string if we don't need to
			log(this.logger, this._requestLogLevel, `[server -> editor] ${JSON.stringify(message)}`);
		}

		// Handle responses to our requests
		if ('id' in message) {
			if ('result' in message) {
				this.handleResult(message);
			} else if ('error' in message) {
				this.handleError(message);
			}
		}

		// Handle requests from the server
		if ('method' in message) {
			if ('id' in message) {
				this.handleServerRequest(message as MCP.JSONRPCRequest & MCP.ServerRequest);
			} else {
				this.handleServerNotification(message as MCP.JSONRPCNotification & MCP.ServerNotification);
			}
		}
	}

	/**
	 * Handle successful responses
	 */
	private handleResult(response: MCP.JSONRPCResponse): void {
		const request = this._pendingRequests.get(response.id);
		if (request) {
			this._pendingRequests.delete(response.id);
			request.promise.complete(response.result);
		}
	}

	/**
	 * Handle error responses
	 */
	private handleError(response: MCP.JSONRPCError): void {
		const request = this._pendingRequests.get(response.id);
		if (request) {
			this._pendingRequests.delete(response.id);
			request.promise.error(new MpcResponseError(response.error.message, response.error.code, response.error.data));
		}
	}

	/**
	 * Handle incoming server requests
	 */
	private async handleServerRequest(request: MCP.JSONRPCRequest & MCP.ServerRequest): Promise<void> {
		try {
			let response: MCP.Result | undefined;
			if (request.method === 'ping') {
				response = this.handlePing(request);
			} else if (request.method === 'roots/list') {
				response = this.handleRootsList(request);
			} else if (request.method === 'sampling/createMessage' && this._createMessageRequestHandler) {
				response = await this._createMessageRequestHandler(request.params as MCP.CreateMessageRequest['params']);
			} else if (request.method === 'elicitation/create' && this._elicitationRequestHandler) {
				response = await this._elicitationRequestHandler(request.params as MCP.ElicitRequest['params']);
			} else {
				throw McpError.methodNotFound(request.method);
			}
			this.respondToRequest(request, response);
		} catch (e) {
			if (!(e instanceof McpError)) {
				this.logger.error(`Error handling request ${request.method}:`, e);
				e = McpError.unknown(e);
			}

			const errorResponse: MCP.JSONRPCError = {
				jsonrpc: MCP.JSONRPC_VERSION,
				id: request.id,
				error: {
					code: e.code,
					message: e.message,
					data: e.data,
				}
			};

			this.send(errorResponse);
		}
	}
	/**
	 * Handle incoming server notifications
	 */
	private handleServerNotification(request: MCP.JSONRPCNotification & MCP.ServerNotification): void {
		switch (request.method) {
			case 'notifications/message':
				return this.handleLoggingNotification(request);
			case 'notifications/cancelled':
				this._onDidReceiveCancelledNotification.fire(request);
				return this.handleCancelledNotification(request);
			case 'notifications/progress':
				this._onDidReceiveProgressNotification.fire(request);
				return;
			case 'notifications/resources/list_changed':
				this._onDidChangeResourceList.fire();
				return;
			case 'notifications/resources/updated':
				this._onDidUpdateResource.fire(request);
				return;
			case 'notifications/tools/list_changed':
				this._onDidChangeToolList.fire();
				return;
			case 'notifications/prompts/list_changed':
				this._onDidChangePromptList.fire();
				return;
		}
	}

	private handleCancelledNotification(request: MCP.CancelledNotification): void {
		const pendingRequest = this._pendingRequests.get(request.params.requestId);
		if (pendingRequest) {
			this._pendingRequests.delete(request.params.requestId);
			pendingRequest.promise.cancel();
		}
	}

	private handleLoggingNotification(request: MCP.LoggingMessageNotification): void {
		let contents = typeof request.params.data === 'string' ? request.params.data : JSON.stringify(request.params.data);
		if (request.params.logger) {
			contents = `${request.params.logger}: ${contents}`;
		}

		switch (request.params?.level) {
			case 'debug':
				this.logger.debug(contents);
				break;
			case 'info':
			case 'notice':
				this.logger.info(contents);
				break;
			case 'warning':
				this.logger.warn(contents);
				break;
			case 'error':
			case 'critical':
			case 'alert':
			case 'emergency':
				this.logger.error(contents);
				break;
			default:
				this.logger.info(contents);
				break;
		}
	}

	/**
	 * Send a generic response to a request
	 */
	private respondToRequest(request: MCP.JSONRPCRequest, result: MCP.Result): void {
		const response: MCP.JSONRPCResponse = {
			jsonrpc: MCP.JSONRPC_VERSION,
			id: request.id,
			result
		};
		this.send(response);
	}

	/**
	 * Send a response to a ping request
	 */
	private handlePing(_request: MCP.PingRequest): {} {
		return {};
	}

	/**
	 * Send a response to a roots/list request
	 */
	private handleRootsList(_request: MCP.ListRootsRequest): MCP.ListRootsResult {
		this._hasAnnouncedRoots = true;
		return { roots: this._roots };
	}

	private cancelAllRequests() {
		this._pendingRequests.forEach(pending => pending.promise.cancel());
		this._pendingRequests.clear();
	}

	public override dispose(): void {
		this.cancelAllRequests();
		super.dispose();
	}

	/**
	 * Forwards log level changes to the MCP server if it supports logging
	 */
	private async _sendLogLevelToServer(logLevel: LogLevel): Promise<void> {
		try {
			// Only send if the server supports logging capabilities
			if (!this.capabilities.logging) {
				return;
			}

			await this.setLevel({ level: mapLogLevelToMcp(logLevel) });
		} catch (error) {
			this.logger.error(`Failed to set MCP server log level: ${error}`);
		}
	}

	/**
	 * Send an initialize request
	 */
	initialize(params: MCP.InitializeRequest['params'], token?: CancellationToken): Promise<MCP.InitializeResult> {
		return this.sendRequest<MCP.InitializeRequest, MCP.InitializeResult>({ method: 'initialize', params }, token);
	}

	/**
	 * List available resources
	 */
	listResources(params?: MCP.ListResourcesRequest['params'], token?: CancellationToken): Promise<MCP.Resource[]> {
		return Iterable.asyncToArrayFlat(this.listResourcesIterable(params, token));
	}

	/**
	 * List available resources (iterable)
	 */
	listResourcesIterable(params?: MCP.ListResourcesRequest['params'], token?: CancellationToken): AsyncIterable<MCP.Resource[]> {
		return this.sendRequestPaginated<MCP.ListResourcesRequest, MCP.ListResourcesResult, MCP.Resource>('resources/list', result => result.resources, params, token);
	}

	/**
	 * Read a specific resource
	 */
	readResource(params: MCP.ReadResourceRequest['params'], token?: CancellationToken): Promise<MCP.ReadResourceResult> {
		return this.sendRequest<MCP.ReadResourceRequest, MCP.ReadResourceResult>({ method: 'resources/read', params }, token);
	}

	/**
	 * List available resource templates
	 */
	listResourceTemplates(params?: MCP.ListResourceTemplatesRequest['params'], token?: CancellationToken): Promise<MCP.ResourceTemplate[]> {
		return Iterable.asyncToArrayFlat(this.sendRequestPaginated<MCP.ListResourceTemplatesRequest, MCP.ListResourceTemplatesResult, MCP.ResourceTemplate>('resources/templates/list', result => result.resourceTemplates, params, token));
	}

	/**
	 * Subscribe to resource updates
	 */
	subscribe(params: MCP.SubscribeRequest['params'], token?: CancellationToken): Promise<MCP.EmptyResult> {
		return this.sendRequest<MCP.SubscribeRequest, MCP.EmptyResult>({ method: 'resources/subscribe', params }, token);
	}

	/**
	 * Unsubscribe from resource updates
	 */
	unsubscribe(params: MCP.UnsubscribeRequest['params'], token?: CancellationToken): Promise<MCP.EmptyResult> {
		return this.sendRequest<MCP.UnsubscribeRequest, MCP.EmptyResult>({ method: 'resources/unsubscribe', params }, token);
	}

	/**
	 * List available prompts
	 */
	listPrompts(params?: MCP.ListPromptsRequest['params'], token?: CancellationToken): Promise<MCP.Prompt[]> {
		return Iterable.asyncToArrayFlat(this.sendRequestPaginated<MCP.ListPromptsRequest, MCP.ListPromptsResult, MCP.Prompt>('prompts/list', result => result.prompts, params, token));
	}

	/**
	 * Get a specific prompt
	 */
	getPrompt(params: MCP.GetPromptRequest['params'], token?: CancellationToken): Promise<MCP.GetPromptResult> {
		return this.sendRequest<MCP.GetPromptRequest, MCP.GetPromptResult>({ method: 'prompts/get', params }, token);
	}

	/**
	 * List available tools
	 */
	listTools(params?: MCP.ListToolsRequest['params'], token?: CancellationToken): Promise<MCP.Tool[]> {
		return Iterable.asyncToArrayFlat(this.sendRequestPaginated<MCP.ListToolsRequest, MCP.ListToolsResult, MCP.Tool>('tools/list', result => result.tools, params, token));
	}

	/**
	 * Call a specific tool
	 */
	callTool(params: MCP.CallToolRequest['params'] & MCP.Request['params'], token?: CancellationToken): Promise<MCP.CallToolResult> {
		return this.sendRequest<MCP.CallToolRequest, MCP.CallToolResult>({ method: 'tools/call', params }, token);
	}

	/**
	 * Set the logging level
	 */
	setLevel(params: MCP.SetLevelRequest['params'], token?: CancellationToken): Promise<MCP.EmptyResult> {
		return this.sendRequest<MCP.SetLevelRequest, MCP.EmptyResult>({ method: 'logging/setLevel', params }, token);
	}

	/**
	 * Find completions for an argument
	 */
	complete(params: MCP.CompleteRequest['params'], token?: CancellationToken): Promise<MCP.CompleteResult> {
		return this.sendRequest<MCP.CompleteRequest, MCP.CompleteResult>({ method: 'completion/complete', params }, token);
	}
}


/**
 * Maps VSCode LogLevel to MCP LoggingLevel
 */
function mapLogLevelToMcp(logLevel: LogLevel): MCP.LoggingLevel {
	switch (logLevel) {
		case LogLevel.Trace:
			return 'debug'; // MCP doesn't have trace, use debug
		case LogLevel.Debug:
			return 'debug';
		case LogLevel.Info:
			return 'info';
		case LogLevel.Warning:
			return 'warning';
		case LogLevel.Error:
			return 'error';
		case LogLevel.Off:
			return 'emergency'; // MCP doesn't have off, use emergency
		default:
			return assertNever(logLevel); // Off and other levels are not supported
	}
}
