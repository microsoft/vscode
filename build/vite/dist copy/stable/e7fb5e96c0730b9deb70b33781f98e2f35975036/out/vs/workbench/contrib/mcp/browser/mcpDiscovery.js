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
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { mcpAccessConfig } from '../../../../platform/mcp/common/mcpManagement.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { mcpDiscoveryRegistry } from '../common/discovery/mcpDiscovery.js';
let McpDiscovery = class McpDiscovery extends Disposable {
    static { this.ID = 'workbench.contrib.mcp.discovery'; }
    constructor(instantiationService, configurationService) {
        super();
        const mcpAccessValue = observableConfigValue(mcpAccessConfig, "all" /* McpAccessValue.All */, configurationService);
        const store = this._register(new DisposableStore());
        this._register(autorun(reader => {
            store.clear();
            const value = mcpAccessValue.read(reader);
            if (value === "none" /* McpAccessValue.None */) {
                return;
            }
            for (const descriptor of mcpDiscoveryRegistry.getAll()) {
                const mcpDiscovery = instantiationService.createInstance(descriptor);
                if (value === "registry" /* McpAccessValue.Registry */ && !mcpDiscovery.fromGallery) {
                    mcpDiscovery.dispose();
                    continue;
                }
                store.add(mcpDiscovery);
                mcpDiscovery.start();
            }
        }));
    }
};
McpDiscovery = __decorate([
    __param(0, IInstantiationService),
    __param(1, IConfigurationService)
], McpDiscovery);
export { McpDiscovery };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwRGlzY292ZXJ5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWNwL2Jyb3dzZXIvbWNwRGlzY292ZXJ5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbkYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxlQUFlLEVBQWtCLE1BQU0sa0RBQWtELENBQUM7QUFDbkcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sbUVBQW1FLENBQUM7QUFFMUcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFcEUsSUFBTSxZQUFZLEdBQWxCLE1BQU0sWUFBYSxTQUFRLFVBQVU7YUFDcEIsT0FBRSxHQUFHLGlDQUFpQyxBQUFwQyxDQUFxQztJQUU5RCxZQUN3QixvQkFBMkMsRUFDM0Msb0JBQTJDO1FBRWxFLEtBQUssRUFBRSxDQUFDO1FBRVIsTUFBTSxjQUFjLEdBQUcscUJBQXFCLENBQUMsZUFBZSxrQ0FBc0Isb0JBQW9CLENBQUMsQ0FBQztRQUN4RyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksZUFBZSxFQUFFLENBQUMsQ0FBQztRQUVwRCxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUMvQixLQUFLLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDZCxNQUFNLEtBQUssR0FBRyxjQUFjLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzFDLElBQUksS0FBSyxxQ0FBd0IsRUFBRSxDQUFDO2dCQUNuQyxPQUFPO1lBQ1IsQ0FBQztZQUNELEtBQUssTUFBTSxVQUFVLElBQUksb0JBQW9CLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQztnQkFDeEQsTUFBTSxZQUFZLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUFDO2dCQUNyRSxJQUFJLEtBQUssNkNBQTRCLElBQUksQ0FBQyxZQUFZLENBQUMsV0FBVyxFQUFFLENBQUM7b0JBQ3BFLFlBQVksQ0FBQyxPQUFPLEVBQUUsQ0FBQztvQkFDdkIsU0FBUztnQkFDVixDQUFDO2dCQUNELEtBQUssQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7Z0JBQ3hCLFlBQVksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUN0QixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7O0FBNUJXLFlBQVk7SUFJdEIsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLHFCQUFxQixDQUFBO0dBTFgsWUFBWSxDQTZCeEIifQ==