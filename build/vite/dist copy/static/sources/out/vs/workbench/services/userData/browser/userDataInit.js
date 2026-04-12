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
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Extensions } from '../../../common/contributions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { isWeb } from '../../../../base/common/platform.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { mark } from '../../../../base/common/performance.js';
export const IUserDataInitializationService = createDecorator('IUserDataInitializationService');
export class UserDataInitializationService {
    constructor(initializers = []) {
        this.initializers = initializers;
    }
    async whenInitializationFinished() {
        if (await this.requiresInitialization()) {
            await Promise.all(this.initializers.map(initializer => initializer.whenInitializationFinished()));
        }
    }
    async requiresInitialization() {
        return (await Promise.all(this.initializers.map(initializer => initializer.requiresInitialization()))).some(result => result);
    }
    async initializeRequiredResources() {
        if (await this.requiresInitialization()) {
            await Promise.all(this.initializers.map(initializer => initializer.initializeRequiredResources()));
        }
    }
    async initializeOtherResources(instantiationService) {
        if (await this.requiresInitialization()) {
            await Promise.all(this.initializers.map(initializer => initializer.initializeOtherResources(instantiationService)));
        }
    }
    async initializeInstalledExtensions(instantiationService) {
        if (await this.requiresInitialization()) {
            await Promise.all(this.initializers.map(initializer => initializer.initializeInstalledExtensions(instantiationService)));
        }
    }
}
let InitializeOtherResourcesContribution = class InitializeOtherResourcesContribution {
    constructor(userDataInitializeService, instantiationService, extensionService) {
        extensionService.whenInstalledExtensionsRegistered().then(() => this.initializeOtherResource(userDataInitializeService, instantiationService));
    }
    async initializeOtherResource(userDataInitializeService, instantiationService) {
        if (await userDataInitializeService.requiresInitialization()) {
            mark('code/willInitOtherUserData');
            await userDataInitializeService.initializeOtherResources(instantiationService);
            mark('code/didInitOtherUserData');
        }
    }
};
InitializeOtherResourcesContribution = __decorate([
    __param(0, IUserDataInitializationService),
    __param(1, IInstantiationService),
    __param(2, IExtensionService)
], InitializeOtherResourcesContribution);
if (isWeb) {
    const workbenchRegistry = Registry.as(Extensions.Workbench);
    workbenchRegistry.registerWorkbenchContribution(InitializeOtherResourcesContribution, 3 /* LifecyclePhase.Restored */);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFJbml0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3VzZXJEYXRhL2Jyb3dzZXIvdXNlckRhdGFJbml0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNwSCxPQUFPLEVBQTJELFVBQVUsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3ZILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUU1RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDMUUsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBVTlELE1BQU0sQ0FBQyxNQUFNLDhCQUE4QixHQUFHLGVBQWUsQ0FBaUMsZ0NBQWdDLENBQUMsQ0FBQztBQUtoSSxNQUFNLE9BQU8sNkJBQTZCO0lBSXpDLFlBQTZCLGVBQXVDLEVBQUU7UUFBekMsaUJBQVksR0FBWixZQUFZLENBQTZCO0lBQ3RFLENBQUM7SUFFRCxLQUFLLENBQUMsMEJBQTBCO1FBQy9CLElBQUksTUFBTSxJQUFJLENBQUMsc0JBQXNCLEVBQUUsRUFBRSxDQUFDO1lBQ3pDLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQywwQkFBMEIsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNuRyxDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUssQ0FBQyxzQkFBc0I7UUFDM0IsT0FBTyxDQUFDLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQyxJ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