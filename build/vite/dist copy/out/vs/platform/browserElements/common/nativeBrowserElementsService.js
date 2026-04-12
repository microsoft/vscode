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
import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { IMainProcessService } from '../../ipc/common/mainProcessService.js';
// @ts-ignore: interface is implemented via proxy
let NativeBrowserElementsService = class NativeBrowserElementsService {
    constructor(windowId, mainProcessService) {
        this.windowId = windowId;
        return ProxyChannel.toService(mainProcessService.getChannel('browserElements'), {
            context: windowId,
            properties: (() => {
                const properties = new Map();
                properties.set('windowId', windowId);
                return properties;
            })()
        });
    }
};
NativeBrowserElementsService = __decorate([
    __param(1, IMainProcessService)
], NativeBrowserElementsService);
export { NativeBrowserElementsService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmF0aXZlQnJvd3NlckVsZW1lbnRzU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2Jyb3dzZXJFbGVtZW50cy9jb21tb24vbmF0aXZlQnJvd3NlckVsZW1lbnRzU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDckUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFHN0UsaURBQWlEO0FBQzFDLElBQU0sNEJBQTRCLEdBQWxDLE1BQU0sNEJBQTRCO0lBSXhDLFlBQ1UsUUFBZ0IsRUFDSixrQkFBdUM7UUFEbkQsYUFBUSxHQUFSLFFBQVEsQ0FBUTtRQUd6QixPQUFPLFlBQVksQ0FBQyxTQUFTLENBQWdDLGtCQUFrQixDQUFDLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFO1lBQzlHLE9BQU8sRUFBRSxRQUFRO1lBQ2pCLFVBQVUsRUFBRSxDQUFDLEdBQUcsRUFBRTtnQkFDakIsTUFBTSxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQW1CLENBQUM7Z0JBQzlDLFVBQVUsQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLFFBQVEsQ0FBQyxDQUFDO2dCQUVyQyxPQUFPLFVBQVUsQ0FBQztZQUNuQixDQUFDLENBQUMsRUFBRTtTQUNKLENBQUMsQ0FBQztJQUNKLENBQUM7Q0FDRCxDQUFBO0FBbEJZLDRCQUE0QjtJQU10QyxXQUFBLG1CQUFtQixDQUFBO0dBTlQsNEJBQTRCLENBa0J4QyJ9