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
import { equals } from '../../../../../base/common/arrays.js';
import { Throttler } from '../../../../../base/common/async.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { getMcpServerMapping } from '../mcpConfigFileUtils.js';
import { mcpConfigurationSection } from '../mcpConfiguration.js';
import { IMcpRegistry } from '../mcpRegistryTypes.js';
import { IMcpWorkbenchService, McpCollectionDefinition, McpServerDefinition, McpServerLaunch } from '../mcpTypes.js';
let InstalledMcpServersDiscovery = class InstalledMcpServersDiscovery extends Disposable {
    constructor(mcpWorkbenchService, mcpRegistry, textModelService, logService) {
        super();
        this.mcpWorkbenchService = mcpWorkbenchService;
        this.mcpRegistry = mcpRegistry;
        this.textModelService = textModelService;
        this.logService = logService;
        this.fromGallery = true;
        this.collections = this._register(new DisposableMap());
    }
    start() {
        const throttler = this._register(new Throttler());
        this._register(this.mcpWorkbenchService.onChange(() => throttler.queue(() => this.sync())));
        this.sync();
    }
    async getServerIdMapping(resource, pathToServers) {
        const store = new DisposableStore();
        try {
            const ref = await this.textModelService.createModelReference(resource);
            store.add(ref);
            const serverIdMapping = getMcpServerMapping({ model: ref.object.textEditorModel, pathToServers });
            return serverIdMapping;
        }
        catch {
            return new Map();
        }
        finally {
            store.dispose();
        }
    }
    async sync() {
        try {
            const collections = new Map();
            const mcpConfigPathInfos = new ResourceMap();
            for (const server of this.mcpWorkbenchService.getEnabledLocalMcpServers()) {
                let mcpConfigPathPromise = mcpConfigPathInfos.get(server.mcpResource);
                if (!mcpConfigPathPromise) {
                    mcpConfigPathPromise = (async (local) => {
                        const mcpConfigPath = this.mcpWorkbenchService.getMcpConfigPath(local);
                        const locations = mcpConfigPath?.uri ? await this.getServerIdMapping(mcpConfigPath?.uri, mcpConfigPath.section ? [...mcpConfigPath.section, 'servers'] : ['servers']) : new Map();
                        return mcpConfigPath ? { ...mcpConfigPath, locations } : undefined;
                    })(server);
                    mcpConfigPathInfos.set(server.mcpResource, mcpConfigPathPromise);
                }
                const config = server.config;
                const mcpConfigPath = await mcpConfigPathPromise;
                const collectionId = `mcp.config.${mcpConfigPath ? mcpConfigPath.id : 'unknown'}`;
                let definitions = collections.get(collectionId);
                if (!definitions) {
                    definitions = [mcpConfigPath, []];
                    collections.set(collectionId, definitions);
                }
                const launch = config.type === 'http' ? {
                    type: 2 /* McpServerTransportType.HTTP */,
                    uri: URI.parse(config.url),
                    headers: Object.entries(config.headers || {}),
                } : {
                    type: 1 /* McpServerTransportType.Stdio */,
                    command: config.command,
                    args: config.args || [],
                    env: config.env || {},
                    envFile: config.envFile,
                    cwd: config.cwd,
                    sandbox: server.rootSandbox
                };
                definitions[1].push({
                    id: `${collectionId}.${server.name}`,
                    label: server.name,
                    launch,
                    sandboxEnabled: config.type === 'http' ? undefined : config.sandboxEnabled,
                    cacheNonce: await McpServerLaunch.hash(launch),
                    roots: mcpConfigPath?.workspaceFolder ? [mcpConfigPath.workspaceFolder.uri] : undefined,
                    variableReplacement: {
                        folder: mcpConfigPath?.workspaceFolder,
                        section: mcpConfigurationSection,
                        target: mcpConfigPath?.target ?? 2 /* ConfigurationTarget.USER */,
                    },
                    devMode: config.dev,
                    presentation: {
                        order: mcpConfigPath?.order,
                        origin: mcpConfigPath?.locations.get(server.name)
                    }
                });
            }
            for (const [id] of this.collections) {
                if (!collections.has(id)) {
                    this.collections.deleteAndDispose(id);
                }
            }
            for (const [id, [mcpConfigPath, serverDefinitions]] of collections) {
                const newServerDefinitions = observableValue(this, serverDefinitions);
                const newCollection = {
                    id,
                    label: mcpConfigPath?.label ?? '',
                    presentation: {
                        order: serverDefinitions[0]?.presentation?.order,
                        origin: mcpConfigPath?.uri,
                    },
                    remoteAuthority: mcpConfigPath?.remoteAuthority ?? null,
                    serverDefinitions: newServerDefinitions,
                    trustBehavior: 0 /* McpServerTrust.Kind.Trusted */,
                    configTarget: mcpConfigPath?.target ?? 2 /* ConfigurationTarget.USER */,
                    scope: mcpConfigPath?.scope ?? 0 /* StorageScope.PROFILE */,
                };
                const existingCollection = this.collections.get(id);
                const collectionDefinitionsChanged = existingCollection ? !McpCollectionDefinition.equals(existingCollection.definition, newCollection) : true;
                if (!collectionDefinitionsChanged) {
                    const serverDefinitionsChanged = existingCollection ? !equals(existingCollection.definition.serverDefinitions.get(), newCollection.serverDefinitions.get(), McpServerDefinition.equals) : true;
                    if (serverDefinitionsChanged) {
                        existingCollection?.serverDefinitions.set(serverDefinitions, undefined);
                    }
                    continue;
                }
                this.collections.deleteAndDispose(id);
                const disposable = this.mcpRegistry.registerCollection(newCollection);
                this.collections.set(id, {
                    definition: newCollection,
                    serverDefinitions: newServerDefinitions,
                    dispose: () => disposable.dispose()
                });
            }
        }
        catch (error) {
            this.logService.error(error);
        }
    }
};
InstalledMcpServersDiscovery = __decorate([
    __param(0, IMcpWorkbenchService),
    __param(1, IMcpRegistry),
    __param(2, ITextModelService),
    __param(3, ILogService)
], InstalledMcpServersDiscovery);
export { InstalledMcpServersDiscovery };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5zdGFsbGVkTWNwU2VydmVyc0Rpc2NvdmVyeS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21jcC9jb21tb24vZGlzY292ZXJ5L2luc3RhbGxlZE1jcFNlcnZlcnNEaXNjb3ZlcnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxlQUFlLEVBQWUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNsSCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDaEUsT0FBTyxFQUF1QixlQUFlLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFeEQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFFN0YsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBR3hFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQy9ELE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ2pFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUN0RCxPQUFPLEVBQWtCLG9CQUFvQixFQUFFLHVCQUF1QixFQUFFLG1CQUFtQixFQUFFLGVBQWUsRUFBMEMsTUFBTSxnQkFBZ0IsQ0FBQztBQVF0SyxJQUFNLDRCQUE0QixHQUFsQyxNQUFNLDRCQUE2QixTQUFRLFVBQVU7SUFLM0QsWUFDdUIsbUJBQTBELEVBQ2xFLFdBQTBD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