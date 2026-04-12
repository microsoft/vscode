/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableValue, transaction } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { mcpAutoStartConfig } from '../../../../platform/mcp/common/mcpManagement.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { EnablementModel, isContributionEnabled } from '../../chat/common/enablement.js';
import { IMcpRegistry } from './mcpRegistryTypes.js';
import { McpServer, McpServerMetadataCache } from './mcpServer.js';
import { IAutostartResult, McpServerDefinition, McpStartServerInteraction, UserInteractionRequiredError } from './mcpTypes.js';
import { startServerAndWaitForLiveTools } from './mcpTypesUtils.js';
let McpService = class McpService extends Disposable {
    get lazyCollectionState() { return this._mcpRegistry.lazyCollectionState; }
    constructor(_instantiationService, _mcpRegistry, _logService, configurationService, storageService) {
        super();
        this._instantiationService = _instantiationService;
        this._mcpRegistry = _mcpRegistry;
        this._logService = _logService;
        this.configurationService = configurationService;
        this._currentAutoStarts = new Set();
        this._servers = observableValue(this, []);
        this.servers = this._servers.map(servers => servers.map(s => s.object));
        this.enablementModel = this._register(new EnablementModel('mcp.enablement', storageService));
        this.userCache = this._register(_instantiationService.createInstance(McpServerMetadataCache, 0 /* StorageScope.PROFILE */));
        this.workspaceCache = this._register(_instantiationService.createInstance(McpServerMetadataCache, 1 /* StorageScope.WORKSPACE */));
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
    cancelAutostart() {
        for (const cts of this._currentAutoStarts) {
            cts.cancel();
        }
    }
    autostart(_token) {
        const autoStartConfig = this.configurationService.getValue(mcpAutoStartConfig);
        if (autoStartConfig === "never" /* McpAutoStartValue.Never */) {
            return observableValue(this, IAutostartResult.Empty);
        }
        const state = observableValue(this, { working: true, starting: [], serversRequiringInteraction: [] });
        const store = new DisposableStore();
        const cts = store.add(new CancellationTokenSource(_token));
        this._currentAutoStarts.add(cts);
        store.add(toDisposable(() => {
            this._currentAutoStarts.delete(cts);
        }));
        store.add(cts.token.onCancellationRequested(() => {
            state.set(IAutostartResult.Empty, undefined);
        }));
        this._autostart(autoStartConfig, state, cts.token)
            .catch(err => {
            this._logService.error('Error during MCP autostart:', err);
            state.set(IAutostartResult.Empty, undefined);
        })
            .finally(() => store.dispose());
        return state;
    }
    async _autostart(autoStartConfig, state, token) {
        await this._activateCollections();
        if (token.isCancellationRequested) {
            return;
        }
        // don't try re-running errored servers or disabled servers
        const candidates = this.servers.get().filter(s => s.connectionState.get().state !== 3 /* McpConnectionState.Kind.Error */
            && isContributionEnabled(s.enablement.get()));
        let todo = new Set();
        if (autoStartConfig === "onlyNew" /* McpAutoStartValue.OnlyNew */) {
            todo = new Set(candidates.filter(s => s.cacheState.get() === 0 /* McpServerCacheState.Unknown */));
        }
        else if (autoStartConfig === "newAndOutdated" /* McpAutoStartValue.NewAndOutdated */) {
            todo = new Set(candidates.filter(s => {
                const c = s.cacheState.get();
                return c === 0 /* McpServerCacheState.Unknown */ || c === 2 /* McpServerCacheState.Outdated */;
            }));
        }
        if (!todo.size) {
            state.set(IAutostartResult.Empty, undefined);
            return;
        }
        const interaction = new McpStartServerInteraction();
        const requiringInteraction = [];
        const update = () => state.set({
            working: todo.size > 0,
            starting: [...todo].map(t => t.definition),
            serversRequiringInteraction: requiringInteraction,
        }, undefined);
        update();
        await Promise.all([...todo].map(async (server, i) => {
            try {
                await startServerAndWaitForLiveTools(server, { interaction, errorOnUserInteraction: true }, token);
            }
            catch (error) {
                if (error instanceof UserInteractionRequiredError) {
                    requiringInteraction.push({ id: server.definition.id, label: server.definition.label, errorMessage: error.message });
                }
            }
            finally {
                todo.delete(server);
                if (!token.isCancellationRequested) {
                    update();
                }
            }
        }));
    }
    resetCaches() {
        this.userCache.reset();
        this.workspaceCache.reset();
    }
    resetTrust() {
        this.resetCaches(); // same difference now
    }
    async activateCollections() {
        await this._activateCollections();
    }
    async _activateCollections() {
        const collections = await this._mcpRegistry.discoverCollections();
        this.updateCollectedServers();
        return new Set(collections.map(c => c.id));
    }
    updateCollectedServers() {
        const prefixGenerator = new McpPrefixGenerator();
        const definitions = this._mcpRegistry.collections.get().flatMap(collectionDefinition => collectionDefinition.serverDefinitions.get().map(serverDefinition => {
            const toolPrefix = prefixGenerator.generate(serverDefinition.label);
            return { serverDefinition, collectionDefinition, toolPrefix };
        }));
        const nextDefinitions = new Set(definitions);
        const currentServers = this._servers.get();
        const nextServers = [];
        const pushMatch = (match, rec) => {
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
            }
            else {
                server.object.dispose();
            }
        }
        // Create any new servers that are needed.
        for (const def of nextDefinitions) {
            const object = this._instantiationService.createInstance(McpServer, def.collectionDefinition, def.serverDefinition, def.serverDefinition.roots, !!def.collectionDefinition.lazy, def.collectionDefinition.scope === 1 /* StorageScope.WORKSPACE */ ? this.workspaceCache : this.userCache, def.toolPrefix, this.enablementModel);
            nextServers.push({ object, toolPrefix: def.toolPrefix });
        }
        transaction(tx => {
            this._servers.set(nextServers, tx);
        });
    }
    dispose() {
        this._servers.get().forEach(s => s.object.dispose());
        super.dispose();
    }
};
McpService = __decorate([
    __param(0, IInstantiationService),
    __param(1, IMcpRegistry),
    __param(2, ILogService),
    __param(3, IConfigurationService),
    __param(4, IStorageService)
], McpService);
export { McpService };
function defsEqual(server, def) {
    return server.collection.id === def.collectionDefinition.id && server.definition.id === def.serverDefinition.id;
}
// Helper class for generating unique MCP tool prefixes
class McpPrefixGenerator {
    constructor() {
        this.seenPrefixes = new Set();
    }
    generate(label) {
        const baseToolPrefix = "mcp_" /* McpToolName.Prefix */ + label.toLowerCase().replace(/[^a-z0-9_.-]+/g, '_').slice(0, 18 /* McpToolName.MaxPrefixLen */ - "mcp_" /* McpToolName.Prefix */.length - 1);
        let toolPrefix = baseToolPrefix + '_';
        for (let i = 2; this.seenPrefixes.has(toolPrefix); i++) {
            toolPrefix = baseToolPrefix + i + '_';
        }
        this.seenPrefixes.add(toolPrefix);
        return toolPrefix;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21jcC9jb21tb24vbWNwU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNwRSxPQUFPLEVBQXFCLHVCQUF1QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckcsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakcsT0FBTyxFQUFFLE9BQU8sRUFBb0MsZUFBZSxFQUFFLFdBQVcsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hJLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsa0JBQWtCLEVBQXFCLE1BQU0sa0RBQWtELENBQUM7QUFDekcsT0FBTyxFQUFFLGVBQWUsRUFBZ0IsTUFBTSxnREFBZ0QsQ0FBQztBQUMvRixPQUFPLEVBQUUsZUFBZSxFQUFFLHFCQUFxQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDekYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ3JELE9BQU8sRUFBRSxTQUFTLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUNuRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQXFILG1CQUFtQixFQUFFLHlCQUF5QixFQUFlLDRCQUE0QixFQUFFLE1BQU0sZUFBZSxDQUFDO0FBQy9QLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxN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