var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TimeoutTimer } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { runOnChange } from '../../../../../base/common/observable.js';
import { BaseStringEdit } from '../../../../../editor/common/core/edits/stringEdit.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ArcTracker } from '../../common/arcTracker.js';
let ArcTelemetryReporter = class ArcTelemetryReporter extends Disposable {
    constructor(_timesMs, _documentValueBeforeTrackedEdit, _document, 
    // _markedEdits -> document.value
    _gitRepo, _trackedEdit, _sendTelemetryEvent, _dispose, _telemetryService) {
        super();
        this._timesMs = _timesMs;
        this._documentValueBeforeTrackedEdit = _documentValueBeforeTrackedEdit;
        this._document = _document;
        this._gitRepo = _gitRepo;
        this._trackedEdit = _trackedEdit;
        this._sendTelemetryEvent = _sendTelemetryEvent;
        this._dispose = _dispose;
        this._telemetryService = _telemetryService;
        this._arcTracker = new ArcTracker(this._documentValueBeforeTrackedEdit, this._trackedEdit);
        this._store.add(runOnChange(this._document.value, (_val, _prevVal, changes) => {
            const edit = BaseStringEdit.composeOrUndefined(changes.map(c => c.edit));
            if (edit) {
                this._arcTracker.handleEdits(edit);
            }
        }));
        this._initialLineCounts = this._arcTracker.getLineCountInfo();
        this._initialBranchName = this._gitRepo.get()?.headBranchNameObs.get();
        for (let i = 0; i < this._timesMs.length; i++) {
            const timeMs = this._timesMs[i];
            if (timeMs <= 0) {
                this._report(timeMs);
            }
            else {
                this._reportAfter(timeMs, i === this._timesMs.length - 1 ? () => {
                    this._dispose();
                } : undefined);
            }
        }
    }
    _reportAfter(timeoutMs, cb) {
        const timer = new TimeoutTimer(() => {
            this._report(timeoutMs);
            timer.dispose();
            if (cb) {
                cb();
            }
        }, timeoutMs);
        this._store.add(timer);
    }
    _report(timeMs) {
        const currentBranch = this._gitRepo.get()?.headBranchNameObs.get();
        const didBranchChange = currentBranch !== this._initialBranchName;
        const currentLineCounts = this._arcTracker.getLineCountInfo();
        this._sendTelemetryEvent({
            telemetryService: this._telemetryService,
            timeDelayMs: timeMs,
            didBranchChange,
            arc: this._arcTracker.getAcceptedRestrainedCharactersCount(),
            originalCharCount: this._arcTracker.getOriginalCharacterCount(),
            currentLineCount: currentLineCounts.insertedLineCounts,
            currentDeletedLineCount: currentLineCounts.deletedLineCounts,
            originalLineCount: this._initialLineCounts.insertedLineCounts,
            originalDeletedLineCount: this._initialLineCounts.deletedLineCounts,
        });
    }
};
ArcTelemetryReporter = __decorate([
    __param(7, ITelemetryService)
], ArcTelemetryReporter);
export { ArcTelemetryReporter };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXJjVGVsZW1ldHJ5UmVwb3J0ZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9lZGl0VGVsZW1ldHJ5L2Jyb3dzZXIvdGVsZW1ldHJ5L2FyY1RlbGVtZXRyeVJlcG9ydGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckUsT0FBTyxFQUFzQyxXQUFXLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUMzRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFFdkYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDMUYsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBR2pELElBQU0sb0JBQW9CLEdBQTFCLE1BQU0sb0JBQXFCLFNBQVEsVUFBVTtJQU1uRCxZQUNrQixRQUFrQixFQUNsQiwrQkFBMkMsRUFDM0MsU0FBaUY7SUFDbEcsaUNBQWlDO0lBQ2hCLFFBQWlELEVBQ2pELFlBQTRCLEVBQzVCLG1CQUE0RCxFQUM1RCxRQUFvQixFQUNELGlCQUFvQztRQUV4RSxLQUFLLEVBQUUsQ0FBQztRQVZTLGFBQVEsR0FBUixRQUFRLENBQVU7UUFDbEIsb0NBQStCLEdBQS9CLCtCQUErQixDQUFZO1FBQzNDLGNBQVMsR0FBVCxTQUFTLENBQXdFO1FBRWpGLGFBQVEsR0FBUixRQUFRLENBQXlDO1FBQ2pELGlCQUFZLEdBQVosWUFBWSxDQUFnQjtRQUM1Qix3QkFBbUIsR0FBbkIsbUJBQW1CLENBQXlDO1FBQzVELGFBQVEsR0FBUixRQUFRLENBQVk7UUFDRCxzQkFBaUIsR0FBakIsaUJB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