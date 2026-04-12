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
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IUpdateService } from '../../../../platform/update/common/update.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ITimerService } from '../../../services/timer/browser/timerService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
import { StartupTimings } from '../browser/startupTimings.js';
import { coalesce } from '../../../../base/common/arrays.js';
let NativeStartupTimings = class NativeStartupTimings extends StartupTimings {
    constructor(_fileService, _timerService, _nativeHostService, editorService, paneCompositeService, _telemetryService, lifecycleService, updateService, _environmentService, _productService, workspaceTrustService) {
        super(editorService, paneCompositeService, lifecycleService, updateService, workspaceTrustService);
        this._fileService = _fileService;
        this._timerService = _timerService;
        this._nativeHostService = _nativeHostService;
        this._telemetryService = _telemetryService;
        this._environmentService = _environmentService;
        this._productService = _productService;
        this._report().catch(onUnexpectedError);
    }
    async _report() {
        const standardStartupError = await this._isStandardStartup();
        this._appendStartupTimes(standardStartupError).catch(onUnexpectedError);
    }
    async _appendStartupTimes(standardStartupError) {
        const appendTo = this._environmentService.args['prof-append-timers'];
        const durationMarkers = this._environmentService.args['prof-duration-markers'];
        const durationMarkersFile = this._environmentService.args['prof-duration-markers-file'];
        if (!appendTo && !durationMarkers) {
            // nothing to do
            return;
        }
        try {
            await Promise.all([
                this._timerService.whenReady(),
                timeout(15000), // wait: cached data creation, telemetry sending
            ]);
            const perfBaseline = await this._timerService.perfBaseline;
            const heapStatistics = await this._resolveStartupHeapStatistics();
            if (heapStatistics) {
                this._telemetryLogHeapStatistics(heapStatistics);
            }
            if (appendTo) {
                const content = coalesce([
                    this._timerService.startupMetrics.ellapsed,
                    this._productService.nameShort,
                    (this._productService.commit || '').slice(0, 10) || '0000000000',
                    this._telemetryService.sessionId,
                    standardStartupError === undefined ? 'standard_start' : `NO_standard_start : ${standardStartupError}`,
                    `${String(perfBaseline).padStart(4, '0')}ms`,
                    heapStatistics ? this._printStartupHeapStatistics(heapStatistics) : undefined
                ]).join('\t') + '\n';
                await this._appendContent(URI.file(appendTo), content);
            }
            if (durationMarkers?.length) {
                const durations = [];
                for (const durationMarker of durationMarkers) {
                    let duration = 0;
                    if (durationMarker === 'ellapsed') {
                        duration = this._timerService.startupMetrics.ellapsed;
                    }
                    else if (durationMarker.indexOf('-') !== -1) {
                        const markers = durationMarker.split('-');
                        if (markers.length === 2) {
                            duration = this._timerService.getDuration(markers[0], markers[1]);
                        }
                    }
                    if (duration) {
                        durations.push(durationMarker);
                        durations.push(`${duration}`);
                    }
                }
                const durationsContent = `${durations.join('\t')}\n`;
                if (durationMarkersFile) {
                    await this._appendContent(URI.file(durationMarkersFile), durationsContent);
                }
                else {
                    console.log(durationsContent);
                }
            }
        }
        catch (err) {
            console.error(err);
        }
        finally {
            this._nativeHostService.exit(0);
        }
    }
    async _isStandardStartup() {
        const windowCount = await this._nativeHostService.getWindowCount();
        if (windowCount !== 1) {
            return `Expected window count : 1, Actual : ${windowCount}`;
        }
        return super._isStandardStartup();
    }
    async _appendContent(file, content) {
        const chunks = [];
        if (await this._fileService.exists(file)) {
            chunks.push((await this._fileService.readFile(file)).value);
        }
        chunks.push(VSBuffer.fromString(content));
        await this._fileService.writeFile(file, VSBuffer.concat(chunks));
    }
    async _resolveStartupHeapStatistics() {
        if (!this._environmentService.args['enable-tracing'] ||
            !this._environmentService.args['trace-startup-file'] ||
            this._environmentService.args['trace-startup-format'] !== 'json' ||
            !this._environmentService.args['trace-startup-duration']) {
            return undefined; // unexpected arguments for startup heap statistics
        }
        const windowProcessId = await this._nativeHostService.getProcessId();
        const used = performance.memory?.usedJSHeapSize ?? 0; // https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory
        let minorGCs = 0;
        let majorGCs = 0;
        let garbage = 0;
        let duration = 0;
        try {
            const traceContents = JSON.parse((await this._fileService.readFile(URI.file(this._environmentService.args['trace-startup-file']))).value.toString());
            for (const event of traceContents.traceEvents) {
                if (event.pid !== windowProcessId) {
                    continue;
                }
                switch (event.name) {
                    // Major/Minor GC Events
                    case 'MinorGC':
                        minorGCs++;
                        break;
                    case 'MajorGC':
                        majorGCs++;
                        break;
                    // GC Events that block the main thread
                    // Refs: https://v8.dev/blog/trash-talk
                    case 'V8.GCFinalizeMC':
                    case 'V8.GCScavenger':
                        duration += event.dur;
                        break;
                }
                if (event.name === 'MajorGC' || event.name === 'MinorGC') {
                    if (typeof event.args?.usedHeapSizeAfter === 'number' && typeof event.args.usedHeapSizeBefore === 'number') {
                        garbage += (event.args.usedHeapSizeBefore - event.args.usedHeapSizeAfter);
                    }
                }
            }
            return { minorGCs, majorGCs, used, garbage, duration: Math.round(duration / 1000) };
        }
        catch (error) {
            console.error(error);
        }
        return undefined;
    }
    _telemetryLogHeapStatistics({ used, garbage, majorGCs, minorGCs, duration }) {
        this._telemetryService.publicLog2('startupHeapStatistics', {
            heapUsed: used,
            heapGarbage: garbage,
            majorGCs,
            minorGCs,
            gcsDuration: duration
        });
    }
    _printStartupHeapStatistics({ used, garbage, majorGCs, minorGCs, duration }) {
        const MB = 1024 * 1024;
        return `Heap: ${Math.round(used / MB)}MB (used) ${Math.round(garbage / MB)}MB (garbage) ${majorGCs} (MajorGC) ${minorGCs} (MinorGC) ${duration}ms (GC duration)`;
    }
};
NativeStartupTimings = __decorate([
    __param(0, IFileService),
    __param(1, ITimerService),
    __param(2, INativeHostService),
    __param(3, IEditorService),
    __param(4, IPaneCompositePartService),
    __param(5, ITelemetryService),
    __param(6, ILifecycleService),
    __param(7, IUpdateService),
    __param(8, INativeWorkbenchEnvironmentService),
    __param(9, IProductService),
    __param(10, IWorkspaceTrustManagementService)
], NativeStartupTimings);
export { NativeStartupTimings };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhcnR1cFRpbWluZ3MuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9wZXJmb3JtYW5jZS9lbGVjdHJvbi1icm93c2VyL3N0YXJ0dXBUaW1pbmdzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsa0NBQWtDLEVBQUUsTUFBTSxzRUFBc0UsQ0FBQztBQUMxSCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNwRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDeEYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDdkYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNsRixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDaEYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDM0csT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDckcsT0FBTyxFQUFFLGNB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