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
import { localize } from '../../../../nls.js';
import { INotificationService, NeverShowAgainScope, Severity } from '../../../../platform/notification/common/notification.js';
import { IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { IChatService } from '../common/chatService/chatService.js';
import { IPluginMarketplaceService } from '../common/plugins/pluginMarketplaceService.js';
let AgentPluginRecommendations = class AgentPluginRecommendations extends Disposable {
    static { this.ID = 'workbench.contrib.agentPluginRecommendations'; }
    constructor(_chatService, _pluginMarketplaceService, _notificationService, _extensionsWorkbenchService) {
        super();
        this._chatService = _chatService;
        this._pluginMarketplaceService = _pluginMarketplaceService;
        this._notificationService = _notificationService;
        this._extensionsWorkbenchService = _extensionsWorkbenchService;
        this._hasNotified = false;
        this._register(this._chatService.onDidSubmitRequest(() => {
            if (!this._hasNotified) {
                this._hasNotified = true;
                this._checkForRecommendedPlugins();
            }
        }));
    }
    _checkForRecommendedPlugins() {
        const recommended = this._pluginMarketplaceService.recommendedPlugins.get();
        if (recommended.size === 0) {
            return;
        }
        // Build a set of installed plugin keys ("name@marketplace") from
        // storage without triggering any network fetch.
        const installedKeys = new Set();
        for (const entry of this._pluginMarketplaceService.installedPlugins.get()) {
            const key = `${entry.plugin.name}@${entry.plugin.marketplace}`;
            installedKeys.add(key);
        }
        let uninstalledCount = 0;
        for (const key of recommended) {
            if (!installedKeys.has(key)) {
                uninstalledCount++;
            }
        }
        if (uninstalledCount === 0) {
            return;
        }
        this._notificationService.prompt(Severity.Info, uninstalledCount === 1
            ? localize('agentPluginRecommendation.one', "This workspace recommends 1 agent plugin.")
            : localize('agentPluginRecommendation.many', "This workspace recommends {0} agent plugins.", uninstalledCount), [{
                label: localize('showPlugins', "Show Plugins"),
                run: () => {
                    this._extensionsWorkbenchService.openSearch('@agentPlugins @recommended');
                }
            }], {
            neverShowAgain: {
                id: 'agentPluginRecommendations.dismissed',
                scope: NeverShowAgainScope.WORKSPACE,
                isSecondary: true,
            }
        });
    }
};
AgentPluginRecommendations = __decorate([
    __param(0, IChatService),
    __param(1, IPluginMarketplaceService),
    __param(2, INotificationService),
    __param(3, IExtensionsWorkbenchService)
], AgentPluginRecommendations);
export { AgentPluginRecommendations };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xhdWRlUGx1Z2luUmVjb21tZW5kYXRpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NsYXVkZVBsdWdpblJlY29tbWVuZGF0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxtQkFBbUIsRUFBRSxRQUFRLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUUvSCxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNwRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDcEUsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFFbkYsSUFBTSwwQkFBMEIsR0FBaEMsTUFBTSwwQkFBMkIsU0FBUSxVQUFVO2FBQ3pDLE9BQUUsR0FBRyw4Q0FBOEMsQUFBakQsQ0FBa0Q7SUFJcEUsWUFDZSxZQUEyQyxFQUM5Qix5QkFBcUUsRUFDMUUsb0JBQTJELEVBQ3BELDJCQUF5RTtRQUV0RyxLQUFLLEVBQUUsQ0FBQztRQUx1QixpQkFBWSxHQUFaLFlBQVksQ0FBYztRQUNiLDhCQUF5QixHQUF6Qix5QkFBeUIsQ0FBMkI7UUFDekQseUJBQW9CLEdBQXBCLG9CQUFvQixDQUFzQjtRQUNuQyxnQ0FBMkIsR0FBM0IsMkJBQTJCLENBQTZCO1FBTi9GLGlCQUFZLEdBQUcsS0FBSyxDQUFDO1FBVTVCLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUU7WUFDeEQsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztnQkFDeEIsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUM7Z0JBQ3pCLElBQUksQ0FBQywyQkFBMkIsRUFBRSxDQUFDO1lBQ3BDLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVPLDJCQUEyQjtRQUNsQyxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMseUJBQXlCLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDNUUsSUFBSSxXQUFXLENBQUMsSUFBSSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzVCLE9BQU87UUFDUixDQUFDO1FBRUQsaUVBQWlFO1FBQ2pFLGdEQUFnRDtRQUNoRCxNQUFNLGFBQWEsR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO1FBQ3hDLEtBQUssTUFBTSxLQUFLLElBQUksSUFBSSxDQUFDLHlCQUF5QixDQUFDLGdCQUFnQixDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUM7WUFDM0UsTUFBTSxHQUFHLEdBQUcsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksSUFBSSxLQUFLLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQy9ELGFBQWEsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDeEIsQ0FBQztRQUVELElBQUksZ0JBQWdCLEdBQUcsQ0FBQyxDQUFDO1FBQ3pCLEtBQUssTUFBTSxHQUFHLElBQUksV0FBVyxFQUFFLENBQUM7WUFDL0IsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDN0IsZ0JBQWdCLEVBQUUsQ0FBQztZQUNwQixDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksZ0JBQWdCLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDNUIsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUMsb0JBQW9CLENBQUMsTUFBTSxDQUMvQixRQUFRLENBQUMsSUFBSSxFQUNiLGdCQUFnQixLQUFLLENBQUM7WUFDckIsQ0FBQyxDQUFDLFFBQVEsQ0FBQywrQkFBK0IsRUFBRSwyQ0FBMkMsQ0FBQztZQUN4RixDQUFDLENBQUMsUUFBUSxDQUFDLGdDQUFnQyxFQUFFLDhDQUE4QyxFQUFFLGdCQUFnQixDQUFDLEVBQy9HLENBQUM7Z0JBQ0EsS0FBSyxFQUFFLFFBQVEsQ0FBQyxhQUFhLEVBQUUsY0FBYyxDQUFDO2dCQUM5QyxHQUFHLEVBQUUsR0FBRyxFQUFFO29CQUNULElBQUksQ0FBQywyQkFBMkIsQ0FBQyxVQUFVLENBQUMsNEJBQTRCLENBQUMsQ0FBQztnQkFDM0UsQ0FBQzthQUNELENBQUMsRUFDRjtZQUNDLGNBQWMsRUFBRTtnQkFDZixFQUFFLEVBQUUsc0NBQXNDO2dCQUMxQyxLQUFLLEVBQUUsbUJBQW1CLENBQUMsU0FBUztnQkFDcEMsV0FBVyxFQUFFLElBQUk7YUFDakI7U0FDRCxDQUNELENBQUM7SUFDSCxDQUFDOztBQWpFVywwQkFBMEI7SUFNcEMsV0FBQSxZQUFZLENBQUE7SUFDWixXQUFBLHlCQUF5QixDQUFBO0lBQ3pCLFdBQUEsb0JBQW9CLENBQUE7SUFDcEIsV0FBQSwyQkFBMkIsQ0FBQTtHQVRqQiwwQkFBMEIsQ0FrRXRDIn0=