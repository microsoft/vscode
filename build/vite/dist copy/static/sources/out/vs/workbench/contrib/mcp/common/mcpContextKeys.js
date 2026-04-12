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
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IMcpService } from './mcpTypes.js';
export var McpContextKeys;
(function (McpContextKeys) {
    McpContextKeys.serverCount = new RawContextKey('mcp.serverCount', undefined, { type: 'number', description: localize('mcp.serverCount.description', "Context key that has the number of registered MCP servers") });
    McpContextKeys.hasUnknownTools = new RawContextKey('mcp.hasUnknownTools', undefined, { type: 'boolean', description: localize('mcp.hasUnknownTools.description', "Indicates whether there are MCP servers with unknown tools.") });
    /**
     * A context key that indicates whether there are any servers with errors.
     *
     * @type {boolean}
     * @default undefined
     * @description This key is used to track the presence of servers with errors in the MCP context.
     */
    McpContextKeys.hasServersWithErrors = new RawContextKey('mcp.hasServersWithErrors', undefined, { type: 'boolean', description: localize('mcp.hasServersWithErrors.description', "Indicates whether there are any MCP servers with errors.") });
    McpContextKeys.toolsCount = new RawContextKey('mcp.toolsCount', undefined, { type: 'number', description: localize('mcp.toolsCount.description', "Context key that has the number of registered MCP tools") });
})(McpContextKeys || (McpContextKeys = {}));
let McpContextKeysController = class McpContextKeysController extends Disposable {
    static { this.ID = 'workbench.contrib.mcp.contextKey'; }
    constructor(mcpService, contextKeyService) {
        super();
        const ctxServerCount = McpContextKeys.serverCount.bindTo(contextKeyService);
        const ctxToolsCount = McpContextKeys.toolsCount.bindTo(contextKeyService);
        const ctxHasUnknownTools = McpContextKeys.hasUnknownTools.bindTo(contextKeyService);
        this._store.add(bindContextKey(McpContextKeys.hasServersWithErrors, contextKeyService, r => mcpService.servers.read(r).some(c => c.connectionState.read(r).state === 3 /* McpConnectionState.Kind.Error */)));
        this._store.add(autorun(r => {
            const servers = mcpService.servers.read(r);
            const serverTools = servers.map(s => s.tools.read(r));
            ctxServerCount.set(servers.length);
            ctxToolsCount.set(serverTools.reduce((count, tools) => count + tools.length, 0));
            ctxHasUnknownTools.set(mcpService.lazyCollectionState.read(r).state !== 2 /* LazyCollectionState.AllKnown */ || servers.some(s => {
                const toolState = s.cacheState.read(r);
                return toolState === 0 /* McpServerCacheState.Unknown */ || toolState === 2 /* McpServerCacheState.Outdated */ || toolState === 3 /* McpServerCacheState.RefreshingFromUnknown */;
            }));
        }));
    }
};
McpContextKeysController = __decorate([
    __param(0, IMcpService),
    __param(1, IContextKeyService)
], McpContextKeysController);
export { McpContextKeysController };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwQ29udGV4dEtleXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tY3AvY29tbW9uL21jcENvbnRleHRLZXlzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN6RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sbUVBQW1FLENBQUM7QUFFbkcsT0FBTyxFQUFFLFdBQVcsRUFBZ0UsTUFBTSxlQUFlLENBQUM7QUFHMUcsTUFBTSxLQUFXLGNBQWMsQ0FhOUI7QUFiRCxXQUFpQixjQUFjO0lBRWpCLDBCQUFXLEdBQUcsSUFBSSxhQUFhLENBQVMsaUJBQWlCLEVBQUUsU0FBUyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUUsUUFBUSxDQUFDLDZCQUE2QixFQUFFLDJEQUEyRCxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQzdNLDhCQUFlLEdBQUcsSUFBSSxhQUFhLENBQVUscUJBQXFCLEVBQUUsU0FBUyxFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxXQUFXLEVBQUUsUUFBUSxDQUFDLGlDQUFpQyxFQUFFLDZEQUE2RCxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQzFPOzs7Ozs7T0FNRztJQUNVLG1DQUFvQixHQUFHLElBQUksYUFBYSxDQUFVLDBCQUEwQixFQUFFLFNBQVMsRUFBRSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsV0FBVyxFQUFFLFFBQVEsQ0FBQyxzQ0FBc0MsRUFBRSwwREFBMEQsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUN6Tyx5QkFBVSxHQUFHLElBQUksYUFBYSxDQUFTLGdCQUFnQixFQUFFLFNBQVMsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFFLFFBQVEsQ0FBQyw0QkFBNEIsRUFBRSx5REFBeUQsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUN0TixDQUFDLEVBYmdCLGNBQWMsS0FBZCxjQUFjLFFBYTlCO0FBR00sSUFBTSx3QkFBd0IsR0FBOUIsTUFBTSx3QkFBeUIsU0FBUSxVQUFVO2FBRXZDLE9BQUUsR0FBRyxrQ0FBa0MsQUFBckMsQ0FBc0M7SUFFeEQsWUFDYyxVQUF1QixFQUNoQixpQkFBcUM7UUFFekQsS0FBSyxFQUFFLENBQUM7UUFFUixNQUFNLGNBQWMsR0FBRyxjQUFjLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQzVFLE1BQU0sYUFBYSxHQUFHLGNBQWMsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDMUUsTUFBTSxrQkFBa0IsR0FBRyxjQUFjLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBRXBGLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxjQUFjLENBQUMsb0JBQW9CLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLDBDQUFrQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRXRNLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUMzQixNQUFNLE9BQU8sR0FBRyxVQUFVLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMzQyxNQUFNLFdBQVcsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN0RCxjQUFjLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNuQyxhQUFhLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2pGLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUsseUNBQWlDLElBQUksT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRTtnQkFDeEgsTUFBTSxTQUFTLEdBQUcsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3ZDLE9BQU8sU0FBUyx3Q0FBZ0MsSUFBSSxTQUFTLHlDQUFpQyxJQUFJLFNBQVMsc0RBQThDLENBQUM7WUFDM0osQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDOztBQTFCVyx3QkFBd0I7SUFLbEMsV0FBQSxXQUFXLENBQUE7SUFDWCxXQUFBLGtCQUFrQixDQUFBO0dBTlIsd0JBQXdCLENBMkJwQyJ9