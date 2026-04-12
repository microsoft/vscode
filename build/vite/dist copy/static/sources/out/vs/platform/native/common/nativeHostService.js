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
// @ts-expect-error: interface is implemented via proxy
let NativeHostService = class NativeHostService {
    constructor(windowId, mainProcessService) {
        this.windowId = windowId;
        return ProxyChannel.toService(mainProcessService.getChannel('nativeHost'), {
            context: windowId,
            properties: (() => {
                const properties = new Map();
                properties.set('windowId', windowId);
                return properties;
            })()
        });
    }
};
NativeHostService = __decorate([
    __param(1, IMainProcessService)
], NativeHostService);
export { NativeHostService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmF0aXZlSG9zdFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9uYXRpdmUvY29tbW9uL25hdGl2ZUhvc3RTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUc3RSx1REFBdUQ7QUFDaEQsSUFBTSxpQkFBaUIsR0FBdkIsTUFBTSxpQkFBaUI7SUFJN0IsWUFDVSxRQUFnQixFQUNKLGtCQUF1QztRQURuRCxhQUFRLEdBQVIsUUFBUSxDQUFRO1FBR3pCLE9BQU8sWUFBWSxDQUFDLFNBQVMsQ0FBcUIsa0JBQWtCLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQyxFQUFFO1lBQzlGLE9BQU8sRUFBRSxRQUFRO1lBQ2pCLFVBQVUsRUFBRSxDQUFDLEdBQUcsRUFBRTtnQkFDakIsTUFBTSxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQW1CLENBQUM7Z0JBQzlDLFVBQVUsQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLFFBQVEsQ0FBQyxDQUFDO2dCQUVyQyxPQUFPLFVBQVUsQ0FBQztZQUNuQixDQUFDLENBQUMsRUFBRTtTQUNKLENBQUMsQ0FBQztJQUNKLENBQUM7Q0FDRCxDQUFBO0FBbEJZLGlCQUFpQjtJQU0zQixXQUFBLG1CQUFtQixDQUFBO0dBTlQsaUJBQWlCLENBa0I3QiJ9