/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../base/common/arrays.js';
import { assertNever, softAssertNever } from '../../../../base/common/assert.js';
import { DeferredPromise, disposableTimeout, IntervalTimer } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, ISettableObservable, ObservablePromise, observableValue, transaction } from '../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { canLog, ILogger, log, LogLevel } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IMcpMessageTransport } from './mcpRegistryTypes.js';
import { IMcpTaskInternal, McpTaskManager } from './mcpTaskManager.js';
import { IMcpClientMethods, McpConnectionState, McpError, MpcResponseError } from './mcpTypes.js';
import { isTaskResult } from './mcpTypesUtils.js';
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
	/** Task manager for server-side MCP tasks (shared across reconnections) */
	taskManager: McpTaskManager;
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

	private readonly _onDidReceiveElicitationCompleteNotification = this._register(new Emitter<MCP.ElicitationCompleteNotification>());
	readonly onDidReceiveElicitationCompleteNotification = this._onDidReceiveElicitationCompleteNotification.event;

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
							elicitation: opts.elicitationRequestHandler ? { form: {}, url: {} } : undefined,
							tasks: {
								list: {},
								cancel: {},
								requests: {
									sampling: opts.createMessageRequestHandler ? { createMessage: {} } : undefined,
									elicitation: opts.elicitationRequestHandler ? { create: {} } : undefined,
								},
							},
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
	private readonly _taskManager: McpTaskManager;

	protected constructor({
		launch,
		logger,
		createMessageRequestHandler,
		elicitationRequestHandler,
		requestLogLevel = LogLevel.Debug,
		taskManager,
	}: IMcpServerRequestHandlerOptions) {
		super();
		this._launch = launch;
		this.logger = logger;
		this._requestLogLevel = requestLogLevel;
		this._createMessageRequestHandler = createMessageRequestHandler;
		this._elicitationRequestHandler = elicitationRequestHandler;
		this._taskManager = taskManager;

		// Attach this handler to the task manager
		this._taskManager.setHandler(this);
		this._register(this._taskManager.onDidUpdateTask(task => {
			this.send({
				jsonrpc: MCP.JSONRPC_VERSION,
				method: 'notifications/tasks/status',
				params: task
			} satisfies MCP.TaskStatusNotification);
		}));
		this._register(toDisposable(() => this._taskManager.setHandler(undefined)));

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
				// Check if this is a task-augmented request
				if (request.params.task) {
					const taskResult = this._taskManager.createTask(
						request.params.task.ttl ?? null,
						(token) => this._createMessageRequestHandler!(request.params, token)
					);
					taskResult._meta ??= {};
					taskResult._meta['io.modelcontextprotocol/related-task'] = { taskId: taskResult.task.taskId };
					response = taskResult;
				} else {
					response = await this._createMessageRequestHandler(request.params);
				}
			} else if (request.method === 'elicitation/create' && this._elicitationRequestHandler) {
				// Check if this is a task-augmented request
				if (request.params.task) {
					const taskResult = this._taskManager.createTask(
						request.params.task.ttl ?? null,
						(token) => this._elicitationRequestHandler!(request.params, token)
					);
					taskResult._meta ??= {};
					taskResult._meta['io.modelcontextprotocol/related-task'] = { taskId: taskResult.task.taskId };
					response = taskResult;
				} else {
					response = await this._elicitationRequestHandler(request.params);
				}
			} else if (request.method === 'tasks/get') {
				response = this._taskManager.getTask(request.params.taskId);
			} else if (request.method === 'tasks/result') {
				response = await this._taskManager.getTaskResult(request.params.taskId);
			} else if (request.method === 'tasks/cancel') {
				response = this._taskManager.cancelTask(request.params.taskId);
			} else if (request.method === 'tasks/list') {
				response = this._taskManager.listTasks();
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
			case 'notifications/elicitation/complete':
				this._onDidReceiveElicitationCompleteNotification.fire(request);
				return;
			case 'notifications/tasks/status':
				this._taskManager.getClientTask(request.params.taskId)?.onDidUpdateState(request.params);
				return;
			default:
				softAssertNever(request);
		}
	}

	private handleCancelledNotification(request: MCP.CancelledNotification): void {
		if (request.params.requestId) {
			const pendingRequest = this._pendingRequests.get(request.params.requestId);
			if (pendingRequest) {
				this._pendingRequests.delete(request.params.requestId);
				pendingRequest.promise.cancel();
			}
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
	 * Call a specific tool. Supports tasks automatically if `task` is set on the request.
	 */
	async callTool(params: MCP.CallToolRequest['params'] & MCP.Request['params'], token?: CancellationToken): Promise<MCP.CallToolResult> {
		const response = await this.sendRequest<MCP.CallToolRequest, MCP.CallToolResult | MCP.CreateTaskResult>({ method: 'tools/call', params }, token);

		if (isTaskResult(response)) {
			const task = new McpTask<MCP.CallToolResult>(response.task, token);
			this._taskManager.adoptClientTask(task);
			task.setHandler(this);
			return task.result.finally(() => {
				this._taskManager.abandonClientTask(task.id);
			});
		}

		return response;

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

	/**
	 * Get task status
	 */
	getTask(params: { taskId: string }, token?: CancellationToken): Promise<MCP.GetTaskResult> {
		return this.sendRequest<MCP.GetTaskRequest, MCP.GetTaskResult>({ method: 'tasks/get', params }, token);
	}

	/**
	 * Get task result
	 */
	getTaskResult(params: { taskId: string }, token?: CancellationToken): Promise<MCP.GetTaskPayloadResult> {
		return this.sendRequest<MCP.GetTaskPayloadRequest, MCP.GetTaskPayloadResult>({ method: 'tasks/result', params }, token);
	}

	/**
	 * Cancel a task
	 */
	cancelTask(params: { taskId: string }, token?: CancellationToken): Promise<MCP.CancelTaskResult> {
		return this.sendRequest<MCP.CancelTaskRequest, MCP.CancelTaskResult>({ method: 'tasks/cancel', params }, token);
	}

	/**
	 * List all tasks
	 */
	listTasks(params?: MCP.ListTasksRequest['params'], token?: CancellationToken): Promise<MCP.Task[]> {
		return Iterable.asyncToArrayFlat(
			this.sendRequestPaginated<MCP.ListTasksRequest, MCP.ListTasksResult, MCP.Task>(
				'tasks/list', result => result.tasks, params, token
			)
		);
	}
}

function isTaskInTerminalState(task: MCP.Task): boolean {
	return task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled';
}

/**
 * Implementation of a task that handles polling, status notifications, and handler reconnections. It implements the task polling loop internally and can also be
 * updated externally via `onDidUpdateState`, when notifications are received
 * for example.
 * @internal
 */
export class McpTask<T extends MCP.Result> extends Disposable implements IMcpTaskInternal {
	private readonly promise = new DeferredPromise<T>();

	public get result(): Promise<T> {
		return this.promise.p;
	}

	public get id() {
		return this._task.taskId;
	}

	private _lastTaskState: ISettableObservable<MCP.Task>;
	private _handler = observableValue<McpServerRequestHandler | undefined>('mcpTaskHandler', undefined);

	constructor(
		private readonly _task: MCP.Task,
		_token: CancellationToken = CancellationToken.None
	) {
		super();

		const expiresAt = _task.ttl ? (Date.now() + _task.ttl) : undefined;
		this._lastTaskState = observableValue('lastTaskState', this._task);

		const store = this._register(new DisposableStore());

		// Handle external cancellation token
		if (_token.isCancellationRequested) {
			this._lastTaskState.set({ ...this._task, status: 'cancelled' }, undefined);
		} else {
			store.add(_token.onCancellationRequested(() => {
				const current = this._lastTaskState.get();
				if (!isTaskInTerminalState(current)) {
					this._lastTaskState.set({ ...current, status: 'cancelled' }, undefined);
				}
			}));
		}

		// Handle TTL expiration with an explicit timeout
		if (expiresAt) {
			const ttlTimeout = expiresAt - Date.now();
			if (ttlTimeout <= 0) {
				this._lastTaskState.set({ ...this._task, status: 'cancelled', statusMessage: 'Task timed out.' }, undefined);
			} else {
				store.add(disposableTimeout(() => {
					const current = this._lastTaskState.get();
					if (!isTaskInTerminalState(current)) {
						this._lastTaskState.set({ ...current, status: 'cancelled', statusMessage: 'Task timed out.' }, undefined);
					}
				}, ttlTimeout));
			}
		}

		// A `tasks/result` call triggered by an input_required state.
		const inputRequiredLookup = observableValue<ObservablePromise<MCP.Task> | undefined>('activeResultLookup', undefined);

		// 1. Poll for task updates when the task isn't in a terminal state
		store.add(autorun(reader => {
			const current = this._lastTaskState.read(reader);
			if (isTaskInTerminalState(current)) {
				return;
			}

			// When a task goes into the input_required state, by spec we should call
			// `tasks/result` which can return an SSE stream of task updates. No need
			// to poll while such a lookup is going on, but once it resolves we should
			// clear and update our state.
			const lookup = inputRequiredLookup.read(reader);
			if (lookup) {
				const result = lookup.promiseResult.read(reader);
				return transaction(tx => {
					if (!result) {
						// still ongoing
					} else if (result.data) {
						inputRequiredLookup.set(undefined, tx);
						this._lastTaskState.set(result.data, tx);
					} else {
						inputRequiredLookup.set(undefined, tx);
						if (result.error instanceof McpError && result.error.code === MCP.INVALID_PARAMS) {
							this._lastTaskState.set({ ...current, status: 'cancelled' }, undefined);
						} else {
							// Maybe a connection error -- start polling again
							this._lastTaskState.set({ ...current, status: 'working' }, undefined);
						}
					}
				});
			}

			const handler = this._handler.read(reader);
			if (!handler) {
				return;
			}

			const pollInterval = _task.pollInterval ?? 2000;
			const cts = new CancellationTokenSource(_token);
			reader.store.add(toDisposable(() => cts.dispose(true)));
			reader.store.add(disposableTimeout(() => {
				handler.getTask({ taskId: current.taskId }, cts.token)
					.catch((e): MCP.Task | undefined => {
						if (e instanceof McpError && e.code === MCP.INVALID_PARAMS) {
							return { ...current, status: 'cancelled' };
						} else {
							return { ...current }; // errors are already logged, keep in current state
						}
					})
					.then(r => {
						if (r && !cts.token.isCancellationRequested) {
							this._lastTaskState.set(r, undefined);
						}
					});
			}, pollInterval));
		}));

		// 2. Get the result once it's available (or propagate errors). Trigger
		// input_required handling as needed. Only react when the status itself changes.
		const lastStatus = this._lastTaskState.map(task => task.status);
		store.add(autorun(reader => {
			const status = lastStatus.read(reader);
			if (status === 'failed') {
				const current = this._lastTaskState.read(undefined);
				this.promise.error(new Error(`Task ${current.taskId} failed: ${current.statusMessage ?? 'unknown error'}`));
				store.dispose();
			} else if (status === 'cancelled') {
				this.promise.cancel();
				store.dispose();
			} else if (status === 'input_required') {
				const handler = this._handler.read(reader);
				if (handler) {
					const current = this._lastTaskState.read(undefined);
					const cts = new CancellationTokenSource(_token);
					reader.store.add(toDisposable(() => cts.dispose(true)));
					inputRequiredLookup.set(new ObservablePromise<MCP.Task>(handler.getTask({ taskId: current.taskId }, cts.token)), undefined);
				}
			} else if (status === 'completed') {
				const handler = this._handler.read(reader);
				if (handler) {
					this.promise.settleWith(handler.getTaskResult({ taskId: _task.taskId }, _token) as Promise<T>);
					store.dispose();
				}
			} else if (status === 'working') {
				// no-op
			} else {
				softAssertNever(status);
			}
		}));
	}

	onDidUpdateState(task: MCP.Task) {
		this._lastTaskState.set(task, undefined);
	}

	setHandler(handler: McpServerRequestHandler | undefined): void {
		this._handler.set(handler, undefined);
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
