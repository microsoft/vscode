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
import { ExtensionRecommendations } from './extensionRecommendations.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { localize } from '../../../../nls.js';
import { IExtensionManagementServerService } from '../../../services/extensionManagement/common/extensionManagement.js';
let WebRecommendations = class WebRecommendations extends ExtensionRecommendations {
    get recommendations() { return this._recommendations; }
    constructor(productService, extensionManagementServerService) {
        super();
        this.productService = productService;
        this.extensionManagementServerService = extensionManagementServerService;
        this._recommendations = [];
    }
    async doActivate() {
        const isOnlyWeb = this.extensionManagementServerService.webExtensionManagementServer && !this.extensionManagementServerService.localExtensionManagementServer && !this.extensionManagementServerService.remoteExtensionManagementServer;
        if (isOnlyWeb && Array.isArray(this.productService.webExtensionTips)) {
            this._recommendations = this.productService.webExtensionTips.map((extensionId) => ({
                extension: extensionId.toLowerCase(),
                reason: {
                    reasonId: 6 /* ExtensionRecommendationReason.Application */,
                    reasonText: localize('reason', "This extension is recommended for {0} for the Web", this.productService.nameLong)
                }
            }));
        }
    }
};
WebRecommendations = __decorate([
    __param(0, IProductService),
    __param(1, IExtensionManagementServerService)
], WebRecommendations);
export { WebRecommendations };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViUmVjb21tZW5kYXRpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZXh0ZW5zaW9ucy9icm93c2VyL3dlYlJlY29tbWVuZGF0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsd0JBQXdCLEVBQTJCLE1BQU0sK0JBQStCLENBQUM7QUFDbEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBRXhGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsaUNBQWlDLEVBQUUsTUFBTSxxRUFBcUUsQ0FBQztBQUVqSCxJQUFNLGtCQUFrQixHQUF4QixNQUFNLGtCQUFtQixTQUFRLHdCQUF3QjtJQUcvRCxJQUFJLGVBQWUsS0FBNkMsT0FBTyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO0lBRS9GLFlBQ2tCLGNBQWdELEVBQzlCLGdDQUFvRjtRQUV2SCxLQUFLLEVBQUUsQ0FBQztRQUgwQixtQkFBYyxHQUFkLGNBQWMsQ0FBaUI7UUFDYixxQ0FBZ0MsR0FBaEMsZ0NBQWdDLENBQW1DO1FBTGhILHFCQUFnQixHQUE4QixFQUFFLENBQUM7SUFRekQsQ0FBQztJQUVTLEtBQUssQ0FBQyxVQUFVO1FBQ3pCLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQyw0QkFBNEIsSUFBSSxDQUFDLElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQyw4QkFBOEIsSUFBSSxDQUFDLElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQywrQkFBK0IsQ0FBQztRQUN4TyxJQUFJLFNBQVMsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxDQUFDO1lBQ3RFLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLFdBQVcsRUFBMkIsRUFBRSxDQUFDLENBQUM7Z0JBQzNHLFNBQVMsRUFBRSxXQUFXLENBQUMsV0FBVyxFQUFFO2dCQUNwQyxNQUFNLEVBQUU7b0JBQ1AsUUFBUSxtREFBMkM7b0JBQ25ELFVBQVUsRUFBRSxRQUFRLENBQUMsUUFBUSxFQUFFLG1EQUFtRCxFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDO2lCQUNqSDthQUNELENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztJQUNGLENBQUM7Q0FDRCxDQUFBO0FBeEJZLGtCQUFrQjtJQU01QixXQUFBLGVBQWUsQ0FBQTtJQUNmLFdBQUEsaUNBQWlDLENBQUE7R0FQdkIsa0JBQWtCLENBd0I5QiJ9