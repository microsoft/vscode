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
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ISharedProcessService } from '../../../../platform/ipc/electron-browser/services.js';
import { IExtensionTipsService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionTipsService } from '../../../../platform/extensionManagement/common/extensionTipsService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { Schemas } from '../../../../base/common/network.js';
let NativeExtensionTipsService = class NativeExtensionTipsService extends ExtensionTipsService {
    constructor(fileService, productService, sharedProcessService) {
        super(fileService, productService);
        this.channel = sharedProcessService.getChannel('extensionTipsService');
    }
    getConfigBasedTips(folder) {
        if (folder.scheme === Schemas.file) {
            return this.channel.call('getConfigBasedTips', [folder]);
        }
        return super.getConfigBasedTips(folder);
    }
    getImportantExecutableBasedTips() {
        return this.channel.call('getImportantExecutableBasedTips');
    }
    getOtherExecutableBasedTips() {
        return this.channel.call('getOtherExecutableBasedTips');
    }
};
NativeExtensionTipsService = __decorate([
    __param(0, IFileService),
    __param(1, IProductService),
    __param(2, ISharedProcessService)
], NativeExtensionTipsService);
registerSingleton(IExtensionTipsService, NativeExtensionTipsService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uVGlwc1NlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9lbGVjdHJvbi1icm93c2VyL2V4dGVuc2lvblRpcHNTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUU5RixPQUFPLEVBQUUscUJBQXFCLEVBQTBELE1BQU0sd0VBQXdFLENBQUM7QUFFdkssT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0seUVBQXlFLENBQUM7QUFDL0csT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN4RixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFN0QsSUFBTSwwQkFBMEIsR0FBaEMsTUFBTSwwQkFBMkIsU0FBUSxvQkFBb0I7SUFJNUQsWUFDZSxXQUF5QixFQUN0QixjQUErQixFQUN6QixvQkFBMkM7UUFFbEUsS0FBSyxDQUFDLFdBQVcsRUFBRSxjQUFjLENBQUMsQ0FBQztRQUNuQyxJQUFJLENBQUMsT0FBTyxHQUFHLG9CQUFvQixDQUFDLFVBQVUsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO0lBQ3hFLENBQUM7SUFFUSxrQkFBa0IsQ0FBQyxNQUFXO1FBQ3RDLElBQUksTUFBTSxDQUFDLE1BQU0sS0FBSyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDcEMsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBNkIsb0JBQW9CLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1FBQ3RGLENBQUM7UUFDRCxPQUFPLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUN6QyxDQUFDO0lBRVEsK0JBQStCO1FBQ3ZDLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQWlDLGlDQUFpQyxDQUFDLENBQUM7SUFDN0YsQ0FBQztJQUVRLDJCQUEyQjtRQUNuQyxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFpQyw2QkFBNkIsQ0FBQyxDQUFDO0lBQ3pGLENBQUM7Q0FFRCxDQUFBO0FBNUJLLDBCQUEwQjtJQUs3QixXQUFBLFlBQVksQ0FBQTtJQUNaLFdBQUEsZUFBZSxDQUFBO0lBQ2YsV0FBQSxxQkFBcUIsQ0FBQTtHQVBsQiwwQkFBMEIsQ0E0Qi9CO0FBRUQsaUJBQWlCLENBQUMscUJBQXFCLEVBQUUsMEJBQTBCLG9DQUE0QixDQUFDIn0=