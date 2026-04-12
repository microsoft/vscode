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
import { WindowIdleValue } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { TRUSTED_DOMAINS_STORAGE_KEY, readStaticTrustedDomains } from './trustedDomains.js';
import { isURLDomainTrusted } from '../../../../platform/url/common/trustedDomains.js';
import { Emitter } from '../../../../base/common/event.js';
import { ITrustedDomainService } from '../common/trustedDomainService.js';
export { ITrustedDomainService };
let TrustedDomainService = class TrustedDomainService extends Disposable {
    constructor(_instantiationService, _storageService) {
        super();
        this._instantiationService = _instantiationService;
        this._storageService = _storageService;
        this._onDidChangeTrustedDomains = this._register(new Emitter());
        this.onDidChangeTrustedDomains = this._onDidChangeTrustedDomains.event;
        const initStaticDomainsResult = () => {
            return new WindowIdleValue(mainWindow, () => {
                const { defaultTrustedDomains, trustedDomains, } = this._instantiationService.invokeFunction(readStaticTrustedDomains);
                return [
                    ...defaultTrustedDomains,
                    ...trustedDomains
                ];
            });
        };
        this._staticTrustedDomainsResult = initStaticDomainsResult();
        this._register(this._storageService.onDidChangeValue(-1 /* StorageScope.APPLICATION */, TRUSTED_DOMAINS_STORAGE_KEY, this._store)(() => {
            this._staticTrustedDomainsResult?.dispose();
            this._staticTrustedDomainsResult = initStaticDomainsResult();
            this._onDidChangeTrustedDomains.fire();
        }));
    }
    get trustedDomains() {
        return this._staticTrustedDomainsResult.value;
    }
    isValid(resource) {
        const { defaultTrustedDomains, trustedDomains, } = this._instantiationService.invokeFunction(readStaticTrustedDomains);
        const allTrustedDomains = [...defaultTrustedDomains, ...trustedDomains];
        return isURLDomainTrusted(resource, allTrustedDomains);
    }
};
TrustedDomainService = __decorate([
    __param(0, IInstantiationService),
    __param(1, IStorageService)
], TrustedDomainService);
export { TrustedDomainService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJ1c3RlZERvbWFpblNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi91cmwvYnJvd3Nlci90cnVzdGVkRG9tYWluU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVsRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsZUFBZSxFQUFnQixNQUFNLGdEQUFnRCxDQUFDO0FBQy9GLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQzVGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUUxRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsQ0FBQztBQUUxQixJQUFNLG9CQUFvQixHQUExQixNQUFNLG9CQUFxQixTQUFRLFVBQVU7SUFRbkQsWUFDd0IscUJBQTZELEVBQ25FLGVBQWlEO1FBRWxFLEtBQUssRUFBRSxDQUFDO1FBSGdDLDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBdUI7UUFDbEQsb0JBQWUsR0FBZixlQUFlLENBQWlCO1FBTDNELCtCQUEwQixHQUFrQixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztRQUMvRSw4QkFBeUIsR0FBZ0IsSUFBSSxDQUFDLDBCQUEwQixDQUFDLEtBQUssQ0FBQztRQVF2RixNQUFNLHVCQUF1QixHQUFHLEdBQUcsRUFBRTtZQUNwQyxPQUFPLElBQUksZUFBZSxDQUFDLFVBQVUsRUFBRSxHQUFHLEVBQUU7Z0JBQzNDLE1BQU0sRUFBRSxxQkFBcUIsRUFBRSxjQUFjLEdBQUcsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsY0FBYyxDQUFDLHdCQUF3QixDQUFDLENBQUM7Z0JBQ3ZILE9BQU87b0JBQ04sR0FBRyxxQkFBcUI7b0JBQ3hCLEdBQUcsY0FBYztpQkFDakIsQ0FBQztZQUNILENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDO1FBQ0YsSUFBSSxDQUFDLDJCQUEyQixHQUFHLHVCQUF1QixFQUFFLENBQUM7UUFDN0QsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLGdCQUFnQixvQ0FBMkIsMkJBQTJCLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsRUFBRTtZQUM3SCxJQUFJLENBQUMsMkJBQTJCLEVBQUUsT0FBTyxFQUFFLENBQUM7WUFDNUMsSUFBSSxDQUFDLDJCQUEyQixHQUFHLHVCQUF1QixFQUFFLENBQUM7WUFDN0QsSUFBSSxDQUFDLDBCQUEwQixDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3hDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsSUFBSSxjQUFjO1FBQ2pCLE9BQU8sSUFBSSxDQUFDLDJCQUEyQixDQUFDLEtBQUssQ0FBQztJQUMvQyxDQUFDO0lBRUQsT0FBTyxDQUFDLFFBQWE7UUFDcEIsTUFBTSxFQUFFLHFCQUFxQixFQUFFLGNBQWMsR0FBRyxHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxjQUFjLENBQUMsd0JBQXdCLENBQUMsQ0FBQztRQUN2SCxNQUFNLGlCQUFpQixHQUFHLENBQUMsR0FBRyxxQkFBcUIsRUFBRSxHQUFHLGNBQWMsQ0FBQyxDQUFDO1FBRXhFLE9BQU8sa0JBQWtCLENBQUMsUUFBUSxFQUFFLGlCQUFpQixDQUFDLENBQUM7SUFDeEQsQ0FBQztDQUNELENBQUE7QUF6Q1ksb0JBQW9CO0lBUzlCLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxlQUFlLENBQUE7R0FWTCxvQkFBb0IsQ0F5Q2hDIn0=