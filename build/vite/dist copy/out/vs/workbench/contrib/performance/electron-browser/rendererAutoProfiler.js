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
import { timeout } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { joinPath } from '../../../../base/common/resources.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IProfileAnalysisWorkerService } from '../../../../platform/profiling/electron-browser/profileAnalysisWorkerService.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import { parseExtensionDevOptions } from '../../../services/extensions/common/extensionDevOptions.js';
import { ITimerService } from '../../../services/timer/browser/timerService.js';
let RendererProfiling = class RendererProfiling {
    constructor(_environmentService, _fileService, _logService, nativeHostService, timerService, configService, profileAnalysisService) {
        this._environmentService = _environmentService;
        this._fileService = _fileService;
        this._logService = _logService;
        const devOpts = parseExtensionDevOptions(_environmentService);
        if (devOpts.isExtensionDevTestFromCli) {
            // disabled when running extension tests
            return;
        }
        timerService.perfBaseline.then(perfBaseline => {
            (_environmentService.isBuilt ? _logService.info : _logService.trace).apply(_logService, [`[perf] Render performance baseline is ${perfBaseline}ms`]);
            if (perfBaseline < 0) {
                // too slow
                return;
            }
            // SLOW threshold
            const slowThreshold = perfBaseline * 10; // ~10 frames at 64fps on MY machine
            const obs = new PerformanceObserver(async (list) => {
                obs.takeRecords();
                const maxDuration = list.getEntries()
                    .map(e => e.duration)
                    .reduce((p, c) => Math.max(p, c), 0);
                if (maxDuration < slowThreshold) {
                    return;
                }
                if (!configService.getValue('application.experimental.rendererProfiling')) {
                    _logService.debug(`[perf] SLOW task detected (${maxDuration}ms) but renderer profiling is disabled via 'application.experimental.rendererProfiling'`);
                    return;
                }
                const sessionId = generateUuid();
                _logService.warn(`[perf] Renderer reported VERY LONG TASK (${maxDuration}ms), starting profiling session '${sessionId}'`);
                // pause observation, we'll take a detailed look
                obs.disconnect();
                // profile renderer for 5secs, analyse, and take action depending on the result
                for (let i = 0; i < 3; i++) {
                    try {
                        const profile = await nativeHostService.profileRenderer(sessionId, 5000);
                        const output = await profileAnalysisService.analyseBottomUp(profile, _url => '<<renderer>>', perfBaseline, true);
                        if (output === 2 /* ProfilingOutput.Interesting */) {
                            this._store(profile, sessionId);
                            break;
                        }
                        timeout(15000); // wait 15s
                    }
                    catch (err) {
                        _logService.error(err);
                        break;
                    }
                }
                // reconnect the observer
                obs.observe({ entryTypes: ['longtask'] });
            });
            obs.observe({ entryTypes: ['longtask'] });
            this._observer = obs;
        });
    }
    dispose() {
        this._observer?.disconnect();
    }
    async _store(profile, sessionId) {
        const path = joinPath(this._environmentService.tmpDir, `renderer-${Math.random().toString(16).slice(2, 8)}.cpuprofile.json`);
        await this._fileService.writeFile(path, VSBuffer.fromString(JSON.stringify(profile)));
        this._logService.info(`[perf] stored profile to DISK '${path}'`, sessionId);
    }
};
RendererProfiling = __decorate([
    __param(0, INativeWorkbenchEnvironmentService),
    __param(1, IFileService),
    __param(2, ILogService),
    __param(3, INativeHostService),
    __param(4, ITimerService),
    __param(5, IConfigurationService),
    __param(6, IProfileAnalysisWorkerService)
], RendererProfiling);
export { RendererProfiling };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVuZGVyZXJBdXRvUHJvZmlsZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9wZXJmb3JtYW5jZS9lbGVjdHJvbi1icm93c2VyL3JlbmRlcmVyQXV0b1Byb2ZpbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDMUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBRWxGLE9BQU8sRUFBRSw2QkFBNkIsRUFBbUIsTUFBTSxpRkFBaUYsQ0FBQztBQUNqSixPQUFPLEVBQUUsa0NBQWtDLEVBQUUsTUFBTSxzRUFBc0UsQ0FBQztBQUMxSCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUN0RyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0saURBQWlELENBQUM7QUFFekUsSUFBTSxpQkFBaUIsR0FBdkIsTUFBTSxpQkFBaUI7SUFJN0IsWUFDc0QsbUJBQXVELEVBQzdFLFlBQTBCLEVBQzNCLFdBQXdCLEVBQ2xDLGlCQUFxQyxFQUMxQyxZQUEyQixFQUNuQixhQUFvQyxFQUM1QixzQkFBcUQ7UUFOL0Isd0JB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