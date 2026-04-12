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
import { net } from 'electron';
import { RequestService as NodeRequestService } from '../node/requestService.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { ILogService } from '../../log/common/log.js';
function getRawRequest(options) {
    // eslint-disable-next-line local/code-no-any-casts
    return net.request;
}
let RequestService = class RequestService extends NodeRequestService {
    constructor(configurationService, environmentService, logService) {
        super('local', configurationService, environmentService, logService);
    }
    request(options, token) {
        return super.request({ ...(options || {}), getRawRequest, isChromiumNetwork: true }, token);
    }
};
RequestService = __decorate([
    __param(0, IConfigurationService),
    __param(1, INativeEnvironmentService),
    __param(2, ILogService)
], RequestService);
export { RequestService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVxdWVzdFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9yZXF1ZXN0L2VsZWN0cm9uLXV0aWxpdHkvcmVxdWVzdFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUcvQixPQUFPLEVBQXVCLGNBQWMsSUFBSSxrQkFBa0IsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ3RHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUV0RCxTQUFTLGFBQWEsQ0FBQyxPQUF3QjtJQUM5QyxtREFBbUQ7SUFDbkQsT0FBTyxHQUFHLENBQUMsT0FBcUMsQ0FBQztBQUNsRCxDQUFDO0FBRU0sSUFBTSxjQUFjLEdBQXBCLE1BQU0sY0FBZSxTQUFRLGtCQUFrQjtJQUVyRCxZQUN3QixvQkFBMkMsRUFDdkMsa0JBQTZDLEVBQzNELFVBQXVCO1FBRXBDLEtBQUssQ0FBQyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxDQUFDLENBQUM7SUFDdEUsQ0FBQztJQUVRLE9BQU8sQ0FBQyxPQUF3QixFQUFFLEtBQXdCO1FBQ2xFLE9BQU8sS0FBSyxDQUFDLE9BQU8sQ0FBQyxFQUFFLEdBQUcsQ0FBQyxPQUFPLElBQUksRUFBRSxDQUFDLEVBQUUsYUFBYSxFQUFFLGlCQUFpQixFQUFFLElBQUksRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzdGLENBQUM7Q0FDRCxDQUFBO0FBYlksY0FBYztJQUd4QixXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEseUJBQXlCLENBQUE7SUFDekIsV0FBQSxXQUFXLENBQUE7R0FMRCxjQUFjLENBYTFCIn0=