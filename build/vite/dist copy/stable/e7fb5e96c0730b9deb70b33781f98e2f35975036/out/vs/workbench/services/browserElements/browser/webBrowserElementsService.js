/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IBrowserElementsService } from './browserElementsService.js';
class WebBrowserElementsService {
    constructor() { }
    async getElementData(rect, token, locator) {
        throw new Error('Not implemented');
    }
    async getFocusedElementData(rect, token, locator) {
        throw new Error('Not implemented');
    }
    async startDebugSession(token, locator) {
        throw new Error('Not implemented');
    }
    async startConsoleSession(token, locator) {
        throw new Error('Not implemented');
    }
    async getConsoleLogs(locator) {
        throw new Error('Not implemented');
    }
}
registerSingleton(IBrowserElementsService, WebBrowserElementsService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViQnJvd3NlckVsZW1lbnRzU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9icm93c2VyRWxlbWVudHMvYnJvd3Nlci93ZWJCcm93c2VyRWxlbWVudHNTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBS2hHLE9BQU8sRUFBRSxpQkFBaUIsRUFBcUIsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUV0RSxNQUFNLHlCQUF5QjtJQUc5QixnQkFBZ0IsQ0FBQztJQUVqQixLQUFLLENBQUMsY0FBYyxDQUFDLElBQWdCLEVBQUUsS0FBd0IsRUFBRSxPQUEwQztRQUMxRyxNQUFNLElBQUksS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUM7SUFDcEMsQ0FBQztJQUVELEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxJQUFnQixFQUFFLEtBQXdCLEVBQUUsT0FBMEM7UUFDakgsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0lBQ3BDLENBQUM7SUFFRCxLQUFLLENBQUMsaUJBQWlCLENBQUMsS0FBd0IsRUFBRSxPQUE4QjtRQUMvRSxNQUFNLElBQUksS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUM7SUFDcEMsQ0FBQztJQUVELEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxLQUF3QixFQUFFLE9BQThCO1FBQ2pGLE1BQU0sSUFBSSxLQUFLLENBQUMsaUJBQWlCLENBQUMsQ0FBQztJQUNwQyxDQUFDO0lBRUQsS0FBSyxDQUFDLGNBQWMsQ0FBQyxPQUE4QjtRQUNsRCxNQUFNLElBQUksS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUM7SUFDcEMsQ0FBQztDQUNEO0FBRUQsaUJBQWlCLENBQUMsdUJBQXVCLEVBQUUseUJBQXlCLG9DQUE0QixDQUFDIn0=