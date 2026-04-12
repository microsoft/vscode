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
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { INativeWorkbenchEnvironmentService } from '../../environment/electron-browser/environmentService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { IUpdateService } from '../../../../platform/update/common/update.js';
import { ILifecycleService } from '../../lifecycle/common/lifecycle.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { AbstractTimerService, ITimerService } from '../browser/timerService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { process } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkbenchLayoutService } from '../../layout/browser/layoutService.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IPaneCompositePartService } from '../../panecomposite/browser/panecomposite.js';
let TimerService = class TimerService extends AbstractTimerService {
    constructor(_nativeHostService, _environmentService, lifecycleService, contextService, extensionService, updateService, paneCompositeService, editorService, accessibilityService, telemetryService, layoutService, _productService, _storageService) {
        super(lifecycleService, contextService, extensionService, updateService, paneCompositeService, editorService, accessibilityService, telemetryService, layoutService);
        this._nativeHostService = _nativeHostService;
        this._environmentService = _environmentService;
        this._productService = _productService;
        this._storageService = _storageService;
        this.setPerformanceMarks('main', _environmentService.window.perfMarks);
    }
    _isInitialStartup() {
        return Boolean(this._environmentService.window.isInitialStartup);
    }
    _didUseCachedData() {
        return didUseCachedData(this._productService, this._storageService, this._environmentService);
    }
    _getWindowCount() {
        return this._nativeHostService.getWindowCount();
    }
    async _extendStartupInfo(info) {
        try {
            const [osProperties, osStatistics, virtualMachineHint, isARM64Emulated] = await Promise.all([
                this._nativeHostService.getOSProperties(),
                this._nativeHostService.getOSStatistics(),
                this._nativeHostService.getOSVirtualMachineHint(),
                this._nativeHostService.isRunningUnderARM64Translation()
            ]);
            info.totalmem = osStatistics.totalmem;
            info.freemem = osStatistics.freemem;
            info.platform = osProperties.platform;
            info.release = osProperties.release;
            info.arch = osProperties.arch;
            info.loadavg = osStatistics.loadavg;
            info.isARM64Emulated = isARM64Emulated;
            const processMemoryInfo = await process.getProcessMemoryInfo();
            info.meminfo = {
                workingSetSize: processMemoryInfo.residentSet,
                privateBytes: processMemoryInfo.private,
                sharedBytes: processMemoryInfo.shared
            };
            info.isVMLikelyhood = Math.round((virtualMachineHint * 100));
            const rawCpus = osProperties.cpus;
            if (rawCpus && rawCpus.length > 0) {
                info.cpus = { count: rawCpus.length, speed: rawCpus[0].speed, model: rawCpus[0].model };
            }
        }
        catch (error) {
            // ignore, be on the safe side with these hardware method calls
        }
    }
    _shouldReportPerfMarks() {
        // always send when running with the prof-append-timers flag
        return super._shouldReportPerfMarks() || Boolean(this._environmentService.args['prof-append-timers']);
    }
};
TimerService = __decorate([
    __param(0, INativeHostService),
    __param(1, INativeWorkbenchEnvironmentService),
    __param(2, ILifecycleService),
    __param(3, IWorkspaceContextService),
    __param(4, IExtensionService),
    __param(5, IUpdateService),
    __param(6, IPaneCompositePartService),
    __param(7, IEditorService),
    __param(8, IAccessibilityService),
    __param(9, ITelemetryService),
    __param(10, IWorkbenchLayoutService),
    __param(11, IProductService),
    __param(12, IStorageService)
], TimerService);
export { TimerService };
registerSingleton(ITimerService, TimerService, 1 /* InstantiationType.Delayed */);
//#region cached data logic
const lastRunningCommitStorageKey = 'perf/lastRunningCommit';
let _didUseCachedData = undefined;
export function didUseCachedData(productService, storageService, environmentService) {
    // browser code loading: only a guess based on
    // this being the first start with the commit
    // or subsequent
    if (typeof _didUseCachedData !== 'boolean') {
        if (!environmentService.window.isCodeCaching || !productService.commit) {
            _didUseCachedData = false; // we only produce cached data whith commit and code cache path
        }
        else if (storageService.get(lastRunningCommitStorageKey, -1 /* StorageScope.APPLICATION */) === productService.commit) {
            _didUseCachedData = true; // subsequent start on same commit, assume cached data is there
        }
        else {
            storageService.store(lastRunningCommitStorageKey, productService.commit, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
            _didUseCachedData = false; // first time start on commit, assume cached data is not yet there
        }
    }
    return _didUseCachedData;
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGltZXJTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3RpbWVyL2VsZWN0cm9uLWJyb3dzZXIvdGltZXJTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxrQ0FBa0MsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdEUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFtQixvQkFBb0IsRUFBYSxhQUFhLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUM3RyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDckYsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN4RixPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBQzlHLE9B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