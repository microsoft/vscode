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
import { hash } from '../../../../../base/common/hash.js';
import { Disposable, DisposableResourceMap } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun } from '../../../../../base/common/observable.js';
import { isDefined } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { IAgentPluginService } from '../../../chat/common/plugins/agentPluginService.js';
import { isContributionEnabled } from '../../../chat/common/enablement.js';
import { IMcpRegistry } from '../mcpRegistryTypes.js';
let PluginMcpDiscovery = class PluginMcpDiscovery extends Disposable {
    constructor(_agentPluginService, _mcpRegistry) {
        super();
        this._agentPluginService = _agentPluginService;
        this._mcpRegistry = _mcpRegistry;
        this.fromGallery = false;
        this._collections = this._register(new DisposableResourceMap());
    }
    start() {
        this._register(autorun(reader => {
            const plugins = this._agentPluginService.plugins.read(reader);
            const seen = new ResourceSet();
            for (const plugin of plugins) {
                if (!isContributionEnabled(plugin.enablement.read(reader))) {
                    continue;
                }
                const servers = plugin.mcpServerDefinitions.read(reader);
                if (servers.length === 0) {
                    continue;
                }
                seen.add(plugin.uri);
                let collectionState = this._collections.get(plugin.uri);
                if (!collectionState) {
                    // note: all plugin servers are currently defined in the same file
                    collectionState = this.createCollectionState(plugin, servers[0].uri);
                    this._collections.set(plugin.uri, collectionState);
                }
            }
            for (const [pluginUri] of this._collections) {
                if (!seen.has(pluginUri)) {
                    this._collections.deleteAndDispose(pluginUri);
                }
            }
        }));
    }
    createCollectionState(plugin, manifestURI) {
        const collectionId = `plugin.${plugin.uri}`;
        return this._mcpRegistry.registerCollection({
            id: collectionId,
            label: `${plugin.label} (Agent Plugin)`,
            remoteAuthority: plugin.uri.scheme === Schemas.vscodeRemote ? plugin.uri.authority : null,
            configTarget: 2 /* ConfigurationTarget.USER */,
            scope: 0 /* StorageScope.PROFILE */,
            trustBehavior: 0 /* McpServerTrust.Kind.Trusted */,
            serverDefinitions: plugin.mcpServerDefinitions.map(defs => defs.map(d => this._toServerDefinition(collectionId, d)).filter(isDefined)),
            presentation: {
                origin: manifestURI,
                order: 350 /* McpCollectionSortOrder.Plugin */,
            },
        });
    }
    _toServerDefinition(collectionId, { name, configuration }) {
        const launch = this._toLaunch(configuration);
        if (!launch) {
            return undefined;
        }
        return {
            id: `${collectionId}.${name}`,
            label: name,
            launch,
            variableReplacement: { target: 2 /* ConfigurationTarget.USER */ },
            cacheNonce: String(hash(launch)),
        };
    }
    _toLaunch(config) {
        if (config.type === "stdio" /* McpServerType.LOCAL */) {
            return {
                type: 1 /* McpServerTransportType.Stdio */,
                command: config.command,
                args: config.args ? [...config.args] : [],
                env: config.env ? { ...config.env } : {},
                envFile: config.envFile,
                cwd: config.cwd,
                sandbox: undefined,
            };
        }
        try {
            return {
                type: 2 /* McpServerTransportType.HTTP */,
                uri: URI.parse(config.url),
                headers: Object.entries(config.headers ?? {}),
            };
        }
        catch {
            return undefined;
        }
    }
};
PluginMcpDiscovery = __decorate([
    __param(0, IAgentPluginService),
    __param(1, IMcpRegistry)
], PluginMcpDiscovery);
export { PluginMcpDiscovery };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGx1Z2luTWNwRGlzY292ZXJ5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWNwL2NvbW1vbi9kaXNjb3ZlcnkvcGx1Z2luTWNwRGlzY292ZXJ5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsVUFBVSxFQUFFLHFCQUFxQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDNUYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUl4RCxPQUFPLEVBR04sbUJBQW1CLEVBQ25CLE1BQU0sb0RBQW9ELENBQUM7QUFDNUQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDM0UsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBSS9DLElBQU0sa0JBQWtCLEdBQXhCLE1BQU0sa0JBQW1CLFNBQVEsVUFBVTtJQUtqRCxZQUNzQixtQkFBeUQsRUFDaEUsWUFBMkM7UUFFekQsS0FBSyxFQUFFLENBQUM7UUFIOEIsd0JBQW1CLEdBQW5CLG1CQUFtQixDQUFxQjtRQUMvQyxpQkFBWSxHQUFaLFlBQVksQ0FBYztRQU5qRCxnQkFBVyxHQUFHLEtBQUssQ0FBQztRQUVaLGlCQUFZLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLHFCQUFx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