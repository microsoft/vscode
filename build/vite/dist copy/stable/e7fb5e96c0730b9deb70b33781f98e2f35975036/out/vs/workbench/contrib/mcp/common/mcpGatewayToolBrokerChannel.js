/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { McpServer } from './mcpServer.js';
import { startServerAndWaitForLiveTools } from './mcpTypesUtils.js';
export class McpGatewayToolBrokerChannel extends Disposable {
    constructor(_mcpService, _logService, _startupGracePeriodMs = 5000) {
        super();
        this._mcpService = _mcpService;
        this._logService = _logService;
        this._startupGracePeriodMs = _startupGracePeriodMs;
        this._onDidChangeTools = this._register(new Emitter());
        this._onDidChangeResources = this._register(new Emitter());
        this._onDidChangeServers = this._register(new Emitter());
        /**
         * Per-server promise that races server startup against the grace period timeout.
         * Once set for a server, subsequent list calls await the already-resolved promise
         * and return immediately instead of waiting again.
         *
         * The `resolved` flag tracks whether the promise has settled. If a server's
         * cacheState regresses to Unknown/Outdated after the promise resolved (e.g.
         * after a cache reset), `_waitForStartup` discards the stale entry and creates
         * a fresh race so the server gets another chance to start.
         */
        this._startupGrace = new Map();
        this._logService.debug('[McpGateway][ToolBroker] Initialized');
        let toolsInitialized = false;
        this._register(autorun(reader => {
            for (const server of this._mcpService.servers.read(reader)) {
                server.tools.read(reader);
            }
            if (toolsInitialized) {
                this._logService.debug('[McpGateway][ToolBroker] Tools changed, firing onDidChangeTools');
                this._onDidChangeTools.fire();
            }
            else {
                toolsInitialized = true;
            }
        }));
        let resourcesInitialized = false;
        this._register(autorun(reader => {
            for (const server of this._mcpService.servers.read(reader)) {
                server.capabilities.read(reader);
            }
            if (resourcesInitialized) {
                this._logService.debug('[McpGateway][ToolBroker] Resources changed, firing onDidChangeResources');
                this._onDidChangeResources.fire();
            }
            else {
                resourcesInitialized = true;
            }
        }));
        let serversInitialized = false;
        this._register(autorun(reader => {
            const servers = this._mcpService.servers.read(reader);
            if (serversInitialized) {
                this._logService.debug('[McpGateway][ToolBroker] Servers changed, firing onDidChangeServers');
                this._onDidChangeServers.fire(servers.map(s => ({ id: s.definition.id, label: s.definition.label })));
            }
            else {
                serversInitialized = true;
            }
        }));
    }
    _getServerById(serverId) {
        for (const server of this._mcpService.servers.get()) {
            if (server.definition.id === serverId) {
                return server;
            }
        }
        return undefined;
    }
    _waitForStartup(server) {
        const id = server.definition.id;
        const existing = this._startupGrace.get(id);
        // If the previous grace promise already resolved but the server is still
        // Unknown/Outdated, the entry is stale (e.g. caches were reset). Discard
        // it so we create a fresh race below.
        if (existing?.resolved) {
            const state = server.cacheState.get();
            if (state === 0 /* McpServerCacheState.Unknown */ || state === 2 /* McpServerCacheState.Outdated */) {
                this._startupGrace.delete(id);
            }
        }
        if (!this._startupGrace.has(id)) {
            const entry = {
                promise: Promise.race([
                    this._ensureServerReady(server),
                    new Promise(resolve => setTimeout(() => resolve(false), this._startupGracePeriodMs)),
                ]),
                resolved: false,
            };
            entry.promise.then(() => { entry.resolved = true; });
            this._startupGrace.set(id, entry);
        }
        return this._startupGrace.get(id).promise;
    }
    async _shouldUseCachedData(server) {
        const cacheState = server.cacheState.get();
        if (cacheState === 0 /* McpServerCacheState.Unknown */ || cacheState === 2 /* McpServerCacheState.Outdated */) {
            await this._waitForStartup(server);
            const newState = server.cacheState.get();
            return newState === 5 /* McpServerCacheState.Live */
                || newState === 1 /* McpServerCacheState.Cached */
                || newState === 4 /* McpServerCacheState.RefreshingFromCached */;
        }
        return cacheState === 5 /* McpServerCacheState.Live */
            || cacheState === 1 /* McpServerCacheState.Cached */
            || cacheState === 4 /* McpServerCacheState.RefreshingFromCached */;
    }
    listen(_ctx, event) {
        switch (event) {
            case 'onDidChangeTools':
                return this._onDidChangeTools.event;
            case 'onDidChangeResources':
                return this._onDidChangeResources.event;
            case 'onDidChangeServers':
                return this._onDidChangeServers.event;
        }
        throw new Error(`Invalid listen: ${event}`);
    }
    async call(_ctx, command, arg, cancellationToken) {
        this._logService.debug(`[McpGateway][ToolBroker] IPC call: ${command}`);
        switch (command) {
            case 'listServers': {
                const servers = this._listServers();
                return servers;
            }
            case 'listToolsForServer': {
                const { serverId } = arg;
                const tools = await this._listToolsForServer(serverId);
                return tools;
            }
            case 'callToolForServer': {
                const { serverId, name, args } = arg;
                const result = await this._callToolForServer(serverId, name, args || {}, cancellationToken);
                return result;
            }
            case 'listResourcesForServer': {
                const { serverId } = arg;
                const resources = await this._listResourcesForServer(serverId);
                return resources;
            }
            case 'readResourceForServer': {
                const { serverId, uri } = arg;
                const result = await this._readResourceForServer(serverId, uri, cancellationToken);
                return result;
            }
            case 'listResourceTemplatesForServer': {
                const { serverId } = arg;
                const templates = await this._listResourceTemplatesForServer(serverId);
                return templates;
            }
        }
        throw new Error(`Invalid call: ${command}`);
    }
    _listServers() {
        const servers = this._mcpService.servers.get();
        const result = [];
        for (const server of servers) {
            result.push({ id: server.definition.id, label: server.definition.label });
        }
        this._logService.debug(`[McpGateway][ToolBroker] listServers result: ${result.length} server(s): [${result.map(s => s.label).join(', ')}]`);
        return result;
    }
    async _listToolsForServer(serverId) {
        const server = this._getServerById(serverId);
        if (!server) {
            this._logService.warn(`[McpGateway][ToolBroker] listToolsForServer: unknown server '${serverId}'`);
            return [];
        }
        if (!await this._shouldUseCachedData(server)) {
            this._logService.debug(`[McpGateway][ToolBroker] Server '${serverId}' not ready, skipping tool listing`);
            return [];
        }
        const tools = server.tools.get()
            .filter(t => t.visibility & 1 /* McpToolVisibility.Model */)
            .map(t => t.definition);
        this._logService.debug(`[McpGateway][ToolBroker] listToolsForServer '${serverId}': ${tools.length} tool(s)`);
        return tools;
    }
    async _callToolForServer(serverId, name, args, token = CancellationToken.None) {
        this._logService.debug(`[McpGateway][ToolBroker] callToolForServer '${serverId}' tool '${name}' with args: ${JSON.stringify(args)}`);
        const server = this._getServerById(serverId);
        if (!server) {
            throw new Error(`Unknown server: ${serverId}`);
        }
        const tool = server.tools.get().find(t => t.definition.name === name && (t.visibility & 1 /* McpToolVisibility.Model */));
        if (!tool) {
            throw new Error(`Unknown tool '${name}' on server '${serverId}'`);
        }
        const result = await tool.call(args, undefined, token);
        this._logService.debug(`[McpGateway][ToolBroker] Tool '${name}' on '${serverId}' completed (isError=${result.isError ?? false}, content blocks=${result.content.length})`);
        return result;
    }
    async _listResourcesForServer(serverId) {
        const server = this._getServerById(serverId);
        if (!server) {
            this._logService.warn(`[McpGateway][ToolBroker] listResourcesForServer: unknown server '${serverId}'`);
            return [];
        }
        if (!await this._shouldUseCachedData(server)) {
            return [];
        }
        const capabilities = server.capabilities.get();
        if (!capabilities || !(capabilities & 16 /* McpCapability.Resources */)) {
            this._logService.debug(`[McpGateway][ToolBroker] Server '${serverId}' has no resource capability`);
            return [];
        }
        try {
            const resources = await McpServer.callOn(server, h => h.listResources());
            this._logService.debug(`[McpGateway][ToolBroker] Server '${serverId}' listed ${resources.length} resource(s)`);
            return resources;
        }
        catch (error) {
            this._logService.warn(`[McpGateway][ToolBroker] Server '${serverId}' failed to list resources`, error);
            return [];
        }
    }
    async _readResourceForServer(serverId, uri, token = CancellationToken.None) {
        const server = this._getServerById(serverId);
        if (!server) {
            throw new Error(`Unknown server: ${serverId}`);
        }
        this._logService.debug(`[McpGateway][ToolBroker] readResourceForServer '${uri}' from server '${serverId}'`);
        const result = await McpServer.callOn(server, h => h.readResource({ uri }, token), token);
        this._logService.debug(`[McpGateway][ToolBroker] readResourceForServer returned ${result.contents.length} content(s)`);
        return result;
    }
    async _listResourceTemplatesForServer(serverId) {
        const server = this._getServerById(serverId);
        if (!server) {
            this._logService.warn(`[McpGateway][ToolBroker] listResourceTemplatesForServer: unknown server '${serverId}'`);
            return [];
        }
        if (!await this._shouldUseCachedData(server)) {
            return [];
        }
        const capabilities = server.capabilities.get();
        if (!capabilities || !(capabilities & 16 /* McpCapability.Resources */)) {
            return [];
        }
        try {
            const resourceTemplates = await McpServer.callOn(server, h => h.listResourceTemplates());
            this._logService.debug(`[McpGateway][ToolBroker] Server '${serverId}' listed ${resourceTemplates.length} resource template(s)`);
            return resourceTemplates;
        }
        catch (error) {
            this._logService.warn(`[McpGateway][ToolBroker] Server '${serverId}' failed to list resource templates`, error);
            return [];
        }
    }
    async _ensureServerReady(server) {
        const cacheState = server.cacheState.get();
        if (cacheState !== 0 /* McpServerCacheState.Unknown */ && cacheState !== 2 /* McpServerCacheState.Outdated */) {
            return true;
        }
        this._logService.debug(`[McpGateway][ToolBroker] Server '${server.definition.id}' not ready (cacheState=${cacheState}), starting...`);
        try {
            const ready = await startServerAndWaitForLiveTools(server, {
                promptType: 'all-untrusted',
                errorOnUserInteraction: true,
            });
            this._logService.debug(`[McpGateway][ToolBroker] Server '${server.definition.id}' ready=${ready}`);
            return ready;
        }
        catch (error) {
            this._logService.warn(`[McpGateway][ToolBroker] Server '${server.definition.id}' failed to start`, error);
            return false;
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwR2F0ZXdheVRvb2xCcm9rZXJDaGFubmVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWNwL2NvbW1vbi9tY3BHYXRld2F5VG9vbEJyb2tlckNoYW5uZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDNUUsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFLaEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBRTNDLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBaUJwRSxNQUFNLE9BQU8sMkJBQTRCLFNBQVEsVUFBVTtJQWlCMUQsWUFDa0IsV0FBd0IsRUFDeEIsV0FBd0IsRUFDeEIsd0JBQXdCLElBQUk7UUFFN0MsS0FBSyxFQUFFLENBQUM7UUFKUyxnQkFBVyxHQUFYLFdBQVcsQ0FBYTtRQUN4QixnQkFBVyxHQUFYLFdBQVcsQ0FBYTtRQUN4QiwwQkFBcUIsR0FBckIscUJBQXFCLENBQU87UUFuQjdCLHNCQUFpQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVEsQ0FBQyxDQUFDO1FBQ3hELDBCQUFxQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVEsQ0FBQyxDQUFDO1FBQzVELHdCQUFtQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQTBDLENBQUMsQ0FBQztRQUU3Rzs7Ozs7Ozs7O1dBU0c7UUFDYyxrQkFBYSxHQUFHLElB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