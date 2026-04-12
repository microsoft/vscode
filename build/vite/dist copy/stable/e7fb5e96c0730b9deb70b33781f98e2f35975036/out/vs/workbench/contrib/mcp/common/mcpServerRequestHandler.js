/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { equals } from '../../../../base/common/arrays.js';
import { assertNever, softAssertNever } from '../../../../base/common/assert.js';
import { DeferredPromise, disposableTimeout, IntervalTimer, isThenable } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { JsonRpcError, JsonRpcProtocol } from '../../../../base/common/jsonRpcProtocol.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, ObservablePromise, observableValue, transaction } from '../../../../base/common/observable.js';
import { canLog, log, LogLevel } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { McpError, MpcResponseError } from './mcpTypes.js';
import { isTaskResult, translateMcpLogMessage } from './mcpTypesUtils.js';
import { MCP } from './modelContextProtocol.js';
/**
 * Request handler for communicating with an MCP server.
 *
 * Handles sending requests and receiving responses, with automatic
 * handling of ping requests and typed client request methods.
 */
export class McpServerRequestHandler extends Disposable {
    set roots(roots) {
        if (!equals(this._roots, roots)) {
            this._roots = roots;
            if (this._hasAnnouncedRoots) {
                this.sendNotification({ method: 'notifications/roots/list_changed' });
                this._hasAnnouncedRoots = false;
            }
        }
    }
    get capabilities() {
        return this._serverInit.capabilities;
    }
    get serverInfo() {
        return this._serverInit.serverInfo;
    }
    get serverInstructions() {
        return this._serverInit.instructions;
    }
    /**
     * Connects to the MCP server and does the initialization handshake.
     * @throws MpcResponseError if the server fails to initialize.
     */
    static async create(instaService, opts, token) {
        const mcp = new McpServerRequestHandler(opts);
        const store = new DisposableStore();
        try {
            const timer = store.add(new IntervalTimer());
            timer.cancelAndSet(() => {
                opts.logger.info('Waiting for server to respond to `initialize` request...');
            }, 5000);
            await instaService.invokeFunction(async (accessor) => {
                const productService = accessor.get(IProductService);
                const initialized = await mcp.sendRequest({
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
                            extensions: {
                                'io.modelcontextprotocol/ui': {
                                    mimeTypes: ['text/html;profile=mcp-app']
                                }
                            }
                        },
                        clientInfo: {
                            name: productService.nameLong,
                            version: productService.version,
                        }
                    }
                }, token);
                mcp._serverInit = initialized;
                mcp._sendLogLevelToServer(opts.logger.getLevel());
                mcp.sendNotification({
                    method: 'notifications/initialized'
                });
            });
            return mcp;
        }
        catch (e) {
            mcp.dispose();
            throw e;
        }
        finally {
            store.dispose();
        }
    }
    constructor({ launch, logger, createMessageRequestHandler, elicitationRequestHandler, requestLogLevel = LogLevel.Debug, taskManager, }) {
        super();
        this._hasAnnouncedRoots = false;
        this._roots = [];
        // Event emitters for server notifications
        this._onDidReceiveCancelledNotification = this._register(new Emitter());
        this.onDidReceiveCancelledNotification = this._onDidReceiveCancelledNotification.event;
        this._onDidReceiveProgressNotification = this._register(new Emitter());
        this.onDidReceiveProgressNotification = this._onDidReceiveProgressNotification.event;
        this._onDidReceiveElicitationCompleteNotification = this._register(new Emitter());
        this.onDidReceiveElicitationCompleteNotification = this._onDidReceiveElicitationCompleteNotification.event;
        this._onDidChangeResourceList = this._register(new Emitter());
        this.onDidChangeResourceList = this._onDidChangeResourceList.event;
        this._onDidUpdateResource = this._register(new Emitter());
        this.onDidUpdateResource = this._onDidUpdateResource.event;
        this._onDidChangeToolList = this._register(new Emitter());
        this.onDidChangeToolList = this._onDidChangeToolList.event;
        this._onDidChangePromptList = this._register(new Emitter());
        this.onDidChangePromptList = this._onDidChangePromptList.event;
        this._launch = launch;
        this.logger = logger;
        this._requestLogLevel = requestLogLevel;
        this._createMessageRequestHandler = createMessageRequestHandler;
        this._elicitationRequestHandler = elicitationRequestHandler;
        this._taskManager = taskManager;
        this._rpc = this._register(new JsonRpcProtocol(message => this.send(message), {
            handleRequest: (request, token) => this.handleServerRequest(request, token),
            handleNotification: notification => this.handleServerNotification(notification),
        }));
        // Attach this handler to the task manager
        this._taskManager.setHandler(this);
        this._register(this._taskManager.onDidUpdateTask(task => {
            this.send({
                jsonrpc: MCP.JSONRPC_VERSION,
                method: 'notifications/tasks/status',
                params: task
            });
        }));
        this._register(toDisposable(() => this._taskManager.setHandler(undefined)));
        this._register(launch.onDidReceiveMessage(message => {
            if (canLog(this.logger.getLevel(), this._requestLogLevel)) {
                log(this.logger, this._requestLogLevel, `[server -> editor] ${JSON.stringify(message)}`);
            }
            void this._rpc.handleMessage(message);
        }));
        this._register(autorun(reader => {
            const state = launch.state.read(reader).state;
            // the handler will get disposed when the launch stops, but if we're still
            // create()'ing we need to make sure to cancel the initialize request.
            if (state === 3 /* McpConnectionState.Kind.Error */ || state === 0 /* McpConnectionState.Kind.Stopped */) {
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
    async sendRequest(request, token = CancellationToken.None) {
        if (this._store.isDisposed) {
            return Promise.reject(new CancellationError());
        }
        return this._rpc.sendRequest(request, token, id => this.sendNotification({ method: 'notifications/cancelled', params: { requestId: id } })).catch(error => {
            if (error instanceof JsonRpcError) {
                throw new MpcResponseError(error.message, error.code, error.data);
            }
            throw error;
        });
    }
    send(mcp) {
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
    async *sendRequestPaginated(method, getItems, initialParams, token = CancellationToken.None) {
        let nextCursor = undefined;
        do {
            const params = {
                ...initialParams,
                cursor: nextCursor
            };
            const result = await this.sendRequest({ method, params }, token);
            yield getItems(result);
            nextCursor = result.nextCursor;
        } while (nextCursor !== undefined && !token.isCancellationRequested);
    }
    sendNotification(notification) {
        this.send({ ...notification, jsonrpc: MCP.JSONRPC_VERSION });
    }
    /**
     * Handle incoming server requests
     */
    handleServerRequest(request, token) {
        const mapError = (error) => {
            if (error instanceof McpError) {
                return new JsonRpcError(error.code, error.message, error.data);
            }
            this.logger.error(`Error handling request ${request.method}:`, error);
            const mcpError = McpError.unknown(error instanceof Error ? error : new Error(String(error)));
            return new JsonRpcError(mcpError.code, mcpError.message, mcpError.data);
        };
        try {
            let result;
            if (request.method === 'ping') {
                result = this.handlePing(request);
            }
            else if (request.method === 'roots/list') {
                result = this.handleRootsList(request);
            }
            else if (request.method === 'sampling/createMessage' && this._createMessageRequestHandler) {
                // Check if this is a task-augmented request
                if (request.params.task) {
                    const taskResult = this._taskManager.createTask(request.params.task.ttl ?? null, (token) => this._createMessageRequestHandler(request.params, token));
                    taskResult._meta ??= {};
                    taskResult._meta['io.modelcontextprotocol/related-task'] = { taskId: taskResult.task.taskId };
                    result = taskResult;
                }
                else {
                    result = this._createMessageRequestHandler(request.params, token);
                }
            }
            else if (request.method === 'elicitation/create' && this._elicitationRequestHandler) {
                // Check if this is a task-augmented request
                if (request.params.task) {
                    const taskResult = this._taskManager.createTask(request.params.task.ttl ?? null, (token) => this._elicitationRequestHandler(request.params, token));
                    taskResult._meta ??= {};
                    taskResult._meta['io.modelcontextprotocol/related-task'] = { taskId: taskResult.task.taskId };
                    result = taskResult;
                }
                else {
                    result = this._elicitationRequestHandler(request.params, token);
                }
            }
            else if (request.method === 'tasks/get') {
                result = this._taskManager.getTask(request.params.taskId);
            }
            else if (request.method === 'tasks/result') {
                result = this._taskManager.getTaskResult(request.params.taskId);
            }
            else if (request.method === 'tasks/cancel') {
                result = this._taskManager.cancelTask(request.params.taskId);
            }
            else if (request.method === 'tasks/list') {
                result = this._taskManager.listTasks();
            }
            else {
                throw McpError.methodNotFound(request.method);
            }
            if (isThenable(result)) {
                return result.then(undefined, (error) => {
                    throw mapError(error);
                });
            }
            return result;
        }
        catch (e) {
            throw mapError(e);
        }
    }
    /**
     * Handle incoming server notifications
     */
    handleServerNotification(request) {
        try {
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
        catch (error) {
            this.logger.error(`Error handling notification ${request.method}:`, error);
        }
    }
    handleCancelledNotification(request) {
        if (request.params.requestId) {
            this._rpc.cancelPendingRequest(request.params.requestId);
        }
    }
    handleLoggingNotification(request) {
        translateMcpLogMessage(this.logger, request.params);
    }
    /**
     * Send a response to a ping request
     */
    handlePing(_request) {
        return {};
    }
    /**
     * Send a response to a roots/list request
     */
    handleRootsList(_request) {
        this._hasAnnouncedRoots = true;
        return { roots: this._roots };
    }
    cancelAllRequests() {
        this._rpc.cancelAllRequests();
    }
    dispose() {
        this.cancelAllRequests();
        super.dispose();
    }
    /**
     * Forwards log level changes to the MCP server if it supports logging
     */
    async _sendLogLevelToServer(logLevel) {
        try {
            // Only send if the server supports logging capabilities
            if (!this.capabilities.logging) {
                return;
            }
            await this.setLevel({ level: mapLogLevelToMcp(logLevel) });
        }
        catch (error) {
            this.logger.error(`Failed to set MCP server log level: ${error}`);
        }
    }
    /**
     * Send an initialize request
     */
    initialize(params, token) {
        return this.sendRequest({ method: 'initialize', params }, token);
    }
    /**
     * List available resources
     */
    listResources(params, token) {
        return Iterable.asyncToArrayFlat(this.listResourcesIterable(params, token));
    }
    /**
     * List available resources (iterable)
     */
    listResourcesIterable(params, token) {
        return this.sendRequestPaginated('resources/list', result => result.resources, params, token);
    }
    /**
     * Read a specific resource
     */
    readResource(params, token) {
        return this.sendRequest({ method: 'resources/read', params }, token);
    }
    /**
     * List available resource templates
     */
    listResourceTemplates(params, token) {
        return Iterable.asyncToArrayFlat(this.sendRequestPaginated('resources/templates/list', result => result.resourceTemplates, params, token));
    }
    /**
     * Subscribe to resource updates
     */
    subscribe(params, token) {
        return this.sendRequest({ method: 'resources/subscribe', params }, token);
    }
    /**
     * Unsubscribe from resource updates
     */
    unsubscribe(params, token) {
        return this.sendRequest({ method: 'resources/unsubscribe', params }, token);
    }
    /**
     * List available prompts
     */
    listPrompts(params, token) {
        return Iterable.asyncToArrayFlat(this.sendRequestPaginated('prompts/list', result => result.prompts, params, token));
    }
    /**
     * Get a specific prompt
     */
    getPrompt(params, token) {
        return this.sendRequest({ method: 'prompts/get', params }, token);
    }
    /**
     * List available tools
     */
    listTools(params, token) {
        return Iterable.asyncToArrayFlat(this.sendRequestPaginated('tools/list', result => result.tools, params, token));
    }
    /**
     * Call a specific tool. Supports tasks automatically if `task` is set on the request.
     */
    async callTool(params, token, onStatusMessage) {
        const response = await this.sendRequest({ method: 'tools/call', params }, token);
        if (isTaskResult(response)) {
            const task = new McpTask(response.task, token, onStatusMessage);
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
    setLevel(params, token) {
        return this.sendRequest({ method: 'logging/setLevel', params }, token);
    }
    /**
     * Find completions for an argument
     */
    complete(params, token) {
        return this.sendRequest({ method: 'completion/complete', params }, token);
    }
    /**
     * Get task status
     */
    getTask(params, token) {
        return this.sendRequest({ method: 'tasks/get', params }, token);
    }
    /**
     * Get task result
     */
    getTaskResult(params, token) {
        return this.sendRequest({ method: 'tasks/result', params }, token);
    }
    /**
     * Cancel a task
     */
    cancelTask(params, token) {
        return this.sendRequest({ method: 'tasks/cancel', params }, token);
    }
    /**
     * List all tasks
     */
    listTasks(params, token) {
        return Iterable.asyncToArrayFlat(this.sendRequestPaginated('tasks/list', result => result.tasks, params, token));
    }
}
function isTaskInTerminalState(task) {
    return task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled';
}
/**
 * Implementation of a task that handles polling, status notifications, and handler reconnections. It implements the task polling loop internally and can also be
 * updated externally via `onDidUpdateState`, when notifications are received
 * for example.
 * @internal
 */
export class McpTask extends Disposable {
    get result() {
        return this.promise.p;
    }
    get id() {
        return this._task.taskId;
    }
    constructor(_task, _token = CancellationToken.None, _onStatusMessage) {
        super();
        this._task = _task;
        this._onStatusMessage = _onStatusMessage;
        this.promise = new DeferredPromise();
        this._handler = observableValue('mcpTaskHandler', undefined);
        const expiresAt = _task.ttl ? (Date.now() + _task.ttl) : undefined;
        this._lastTaskState = observableValue('lastTaskState', this._task);
        const store = this._register(new DisposableStore());
        // Handle external cancellation token
        if (_token.isCancellationRequested) {
            this._lastTaskState.set({ ...this._task, status: 'cancelled' }, undefined);
        }
        else {
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
            }
            else {
                store.add(disposableTimeout(() => {
                    const current = this._lastTaskState.get();
                    if (!isTaskInTerminalState(current)) {
                        this._lastTaskState.set({ ...current, status: 'cancelled', statusMessage: 'Task timed out.' }, undefined);
                    }
                }, ttlTimeout));
            }
        }
        // A `tasks/result` call triggered by an input_required state.
        const inputRequiredLookup = observableValue('activeResultLookup', undefined);
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
                    }
                    else if (result.data) {
                        inputRequiredLookup.set(undefined, tx);
                        this._lastTaskState.set(result.data, tx);
                    }
                    else {
                        inputRequiredLookup.set(undefined, tx);
                        if (result.error instanceof McpError && result.error.code === MCP.INVALID_PARAMS) {
                            this._lastTaskState.set({ ...current, status: 'cancelled' }, undefined);
                        }
                        else {
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
                    .catch((e) => {
                    if (e instanceof McpError && e.code === MCP.INVALID_PARAMS) {
                        return { ...current, status: 'cancelled' };
                    }
                    else {
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
            }
            else if (status === 'cancelled') {
                this.promise.cancel();
                store.dispose();
            }
            else if (status === 'input_required') {
                const handler = this._handler.read(reader);
                if (handler) {
                    const current = this._lastTaskState.read(undefined);
                    const cts = new CancellationTokenSource(_token);
                    reader.store.add(toDisposable(() => cts.dispose(true)));
                    inputRequiredLookup.set(new ObservablePromise(handler.getTask({ taskId: current.taskId }, cts.token)), undefined);
                }
            }
            else if (status === 'completed') {
                const handler = this._handler.read(reader);
                if (handler) {
                    this.promise.settleWith(handler.getTaskResult({ taskId: _task.taskId }, _token));
                    store.dispose();
                }
            }
            else if (status === 'working') {
                // no-op
            }
            else {
                softAssertNever(status);
            }
        }));
    }
    onDidUpdateState(task) {
        this._lastTaskState.set(task, undefined);
        if (task.statusMessage && this._onStatusMessage) {
            this._onStatusMessage(task.statusMessage);
        }
    }
    setHandler(handler) {
        this._handler.set(handler, undefined);
    }
}
/**
 * Maps VSCode LogLevel to MCP LoggingLevel
 */
function mapLogLevelToMcp(logLevel) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwU2VydmVyUmVxdWVzdEhhbmRsZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tY3AvY29tbW9uL21jcFNlcnZlclJlcXVlc3RIYW5kbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMzRCxPQUFPLEVBQUUsV0FBVyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxlQUFlLEVBQUUsaUJBQWlCLEVBQUUsYUFBYSxFQUFFLFVBQVUsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2pILE9BQU8sRUFBRSxpQkFBaUIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDL0QsT0FBTyxFQUFFLFlBQVksRUFBRSxlQUFlLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMzRixPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRyxPQUFPLEVBQUUsT0FBTyxFQUF1QixpQkFBaUIsRUFBRSxlQUFlLEVBQUUsV0FBVyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFdEksT0FBTyxFQUFFLE1BQU0sRUFBVyxHQUFHLEVBQUUsUUFBUSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDeEYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBR3hGLE9BQU8sRUFBeUMsUUFBUSxFQUFFLGdC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