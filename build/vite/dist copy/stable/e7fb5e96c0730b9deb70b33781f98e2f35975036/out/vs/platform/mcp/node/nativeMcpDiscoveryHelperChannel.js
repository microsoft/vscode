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
import { transformOutgoingURIs } from '../../../base/common/uriIpc.js';
import { INativeMcpDiscoveryHelperService } from '../common/nativeMcpDiscoveryHelper.js';
let NativeMcpDiscoveryHelperChannel = class NativeMcpDiscoveryHelperChannel {
    constructor(getUriTransformer, nativeMcpDiscoveryHelperService) {
        this.getUriTransformer = getUriTransformer;
        this.nativeMcpDiscoveryHelperService = nativeMcpDiscoveryHelperService;
    }
    listen(context, event) {
        throw new Error('Invalid listen');
    }
    async call(context, command, args) {
        const uriTransformer = this.getUriTransformer?.(context);
        switch (command) {
            case 'load': {
                const result = await this.nativeMcpDiscoveryHelperService.load();
                return (uriTransformer ? transformOutgoingURIs(result, uriTransformer) : result);
            }
        }
        throw new Error('Invalid call');
    }
};
NativeMcpDiscoveryHelperChannel = __decorate([
    __param(1, INativeMcpDiscoveryHelperService)
], NativeMcpDiscoveryHelperChannel);
export { NativeMcpDiscoveryHelperChannel };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmF0aXZlTWNwRGlzY292ZXJ5SGVscGVyQ2hhbm5lbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL21jcC9ub2RlL25hdGl2ZU1jcERpc2NvdmVyeUhlbHBlckNoYW5uZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFtQixxQkFBcUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBR3hGLE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRWxGLElBQU0sK0JBQStCLEdBQXJDLE1BQU0sK0JBQStCO0lBRTNDLFlBQ2tCLGlCQUFrRyxFQUN6RSwrQkFBaUU7UUFEMUYsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFpRjtRQUN6RSxvQ0FBK0IsR0FBL0IsK0JBQStCLENBQWtDO0lBQ3hHLENBQUM7SUFFTCxNQUFNLENBQUksT0FBcUMsRUFBRSxLQUFhO1FBQzdELE1BQU0sSUFBSSxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztJQUNuQyxDQUFDO0lBRUQsS0FBSyxDQUFDLElBQUksQ0FBSSxPQUFxQyxFQUFFLE9BQWUsRUFBRSxJQUFjO1FBQ25GLE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3pELFFBQVEsT0FBTyxFQUFFLENBQUM7WUFDakIsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUNiLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLCtCQUErQixDQUFDLElBQUksRUFBRSxDQUFDO2dCQUNqRSxPQUFPLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQyxNQUFNLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBTSxDQUFDO1lBQ3ZGLENBQUM7UUFDRixDQUFDO1FBQ0QsTUFBTSxJQUFJLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQztJQUNqQyxDQUFDO0NBQ0QsQ0FBQTtBQXJCWSwrQkFBK0I7SUFJekMsV0FBQSxnQ0FBZ0MsQ0FBQTtHQUp0QiwrQkFBK0IsQ0FxQjNDIn0=