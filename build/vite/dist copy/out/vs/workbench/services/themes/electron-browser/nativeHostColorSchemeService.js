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
var NativeHostColorSchemeService_1;
import { Emitter } from '../../../../base/common/event.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IHostColorSchemeService } from '../common/hostColorSchemeService.js';
import { INativeWorkbenchEnvironmentService } from '../../environment/electron-browser/environmentService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { isBoolean, isObject } from '../../../../base/common/types.js';
import { ILifecycleService } from '../../lifecycle/common/lifecycle.js';
let NativeHostColorSchemeService = class NativeHostColorSchemeService extends Disposable {
    static { NativeHostColorSchemeService_1 = this; }
    // we remember the last color scheme value to restore for reloaded window
    static { this.STORAGE_KEY = 'HostColorSchemeData'; }
    constructor(nativeHostService, environmentService, storageService, lifecycleService) {
        super();
        this.nativeHostService = nativeHostService;
        this.storageService = storageService;
        this._onDidChangeColorScheme = this._register(new Emitter());
        this.onDidChangeColorScheme = this._onDidChangeColorScheme.event;
        // register listener with the OS
        this._register(this.nativeHostService.onDidChangeColorScheme(scheme => this.update(scheme)));
        let initial = environmentService.window.colorScheme;
        if (lifecycleService.startupKind === 3 /* StartupKind.ReloadedWindow */) {
            initial = this.getStoredValue(initial);
        }
        this.dark = initial.dark;
        this.highContrast = initial.highContrast;
        // fetch the actual value from the OS
        this.nativeHostService.getOSColorScheme().then(scheme => this.update(scheme));
    }
    getStoredValue(dftl) {
        const stored = this.storageService.get(NativeHostColorSchemeService_1.STORAGE_KEY, -1 /* StorageScope.APPLICATION */);
        if (stored) {
            try {
                const scheme = JSON.parse(stored);
                if (isObject(scheme) && isBoolean(scheme.highContrast) && isBoolean(scheme.dark)) {
                    return scheme;
                }
            }
            catch (e) {
                // ignore
            }
        }
        return dftl;
    }
    update({ highContrast, dark }) {
        if (dark !== this.dark || highContrast !== this.highContrast) {
            this.dark = dark;
            this.highContrast = highContrast;
            this.storageService.store(NativeHostColorSchemeService_1.STORAGE_KEY, JSON.stringify({ highContrast, dark }), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
            this._onDidChangeColorScheme.fire();
        }
    }
};
NativeHostColorSchemeService = NativeHostColorSchemeService_1 = __decorate([
    __param(0, INativeHostService),
    __param(1, INativeWorkbenchEnvironmentService),
    __param(2, IStorageService),
    __param(3, ILifecycleService)
], NativeHostColorSchemeService);
export { NativeHostColorSchemeService };
registerSingleton(IHostColorSchemeService, NativeHostColorSchemeService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmF0aXZlSG9zdENvbG9yU2NoZW1lU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90aGVtZXMvZWxlY3Ryb24tYnJvd3Nlci9uYXRpdmVIb3N0Q29sb3JTY2hlbWVTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDbEYsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsa0NBQWtDLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM5RyxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFdkUsT0FBTyxFQUFFLGlCQUFpQixFQUFlLE1BQU0scUNBQXFDLENBQUM7QUFFOUUsSUFBTSw0QkFBNEIsR0FBbEMsTUFBTSw0QkFBNkIsU0FBUSxVQUFVOztJQUUzRCx5RUFBeUU7YUFDekQsZ0JBQVcsR0FBRyxxQkFBcUIsQUFBeEIsQ0FBeUI7SUFVcEQsWUFDcUIsaUJBQXNELEVBQ3RDLGtCQUFzRCxFQUN6RSxjQUF1QyxFQUNyQyxnQkFBbUM7UUFFdEQsS0FBSyxFQUFFLENBQUM7UUFMNkIsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFvQjtRQUVqRCxtQkFBYyxHQUFkLGNBQWMsQ0FBaUI7UUFUeEMsNEJB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