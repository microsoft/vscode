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
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../services/environment/browser/environmentService.js';
let ExternalUriResolverContribution = class ExternalUriResolverContribution extends Disposable {
    static { this.ID = 'workbench.contrib.externalUriResolver'; }
    constructor(_openerService, _workbenchEnvironmentService) {
        super();
        if (_workbenchEnvironmentService.options?.resolveExternalUri) {
            this._register(_openerService.registerExternalUriResolver({
                resolveExternalUri: async (resource) => {
                    return {
                        resolved: await _workbenchEnvironmentService.options.resolveExternalUri(resource),
                        dispose: () => {
                            // TODO@mjbvz - do we need to do anything here?
                        }
                    };
                }
            }));
        }
    }
};
ExternalUriResolverContribution = __decorate([
    __param(0, IOpenerService),
    __param(1, IBrowserWorkbenchEnvironmentService)
], ExternalUriResolverContribution);
export { ExternalUriResolverContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZXJuYWxVcmlSZXNvbHZlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3VybC9icm93c2VyL2V4dGVybmFsVXJpUmVzb2x2ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUU5RSxPQUFPLEVBQUUsbUNBQW1DLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUUzRyxJQUFNLCtCQUErQixHQUFyQyxNQUFNLCtCQUFnQyxTQUFRLFVBQVU7YUFFOUMsT0FBRSxHQUFHLHVDQUF1QyxBQUExQyxDQUEyQztJQUU3RCxZQUNpQixjQUE4QixFQUNULDRCQUFpRTtRQUV0RyxLQUFLLEVBQUUsQ0FBQztRQUVSLElBQUksNEJBQTRCLENBQUMsT0FBTyxFQUFFLGtCQUFrQixFQUFFLENBQUM7WUFDOUQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxjQUFjLENBQUMsMkJBQTJCLENBQUM7Z0JBQ3pELGtCQUFrQixFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsRUFBRTtvQkFDdEMsT0FBTzt3QkFDTixRQUFRLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQyxPQUFRLENBQUMsa0JBQW1CLENBQUMsUUFBUSxDQUFDO3dCQUNuRixPQUFPLEVBQUUsR0FBRyxFQUFFOzRCQUNiLCtDQUErQzt3QkFDaEQsQ0FBQztxQkFDRCxDQUFDO2dCQUNILENBQUM7YUFDRCxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUM7SUFDRixDQUFDOztBQXRCVywrQkFBK0I7SUFLekMsV0FBQSxjQUFjLENBQUE7SUFDZCxXQUFBLG1DQUFtQyxDQUFBO0dBTnpCLCtCQUErQixDQXVCM0MifQ==