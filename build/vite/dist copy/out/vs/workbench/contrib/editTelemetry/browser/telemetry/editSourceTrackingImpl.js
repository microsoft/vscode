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
import { reverseOrder, compareBy, numberComparator, sumBy } from '../../../../../base/common/arrays.js';
import { IntervalTimer } from '../../../../../base/common/async.js';
import { toDisposable, Disposable } from '../../../../../base/common/lifecycle.js';
import { mapObservableArrayCached, derived, observableSignal, runOnChange, autorun } from '../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IUserAttentionService } from '../../../../services/userAttention/common/userAttentionService.js';
import { CreateSuggestionIdForChatOrInlineChatCaller, EditTelemetryReportEditArcForChatOrInlineChatSender, EditTelemetryReportInlineEditArcSender } from './arcTelemetrySender.js';
import { createDocWithJustReason } from '../helpers/documentWithAnnotatedEdits.js';
import { DocumentEditSourceTracker } from './editTracker.js';
import { sumByCategory } from '../helpers/utils.js';
import { ScmAdapter } from './scmAdapter.js';
import { IRandomService } from '../randomService.js';
let EditSourceTrackingImpl = class EditSourceTrackingImpl extends Disposable {
    constructor(_statsEnabled, _annotatedDocuments, _instantiationService) {
        super();
        this._statsEnabled = _statsEnabled;
        this._annotatedDocuments = _annotatedDocuments;
        this._instantiationService = _instantiationService;
        const scmBridge = this._instantiationService.createInstance(ScmAdapter);
        this._states = mapObservableArrayCached(this, this._annotatedDocuments.documents, (doc, store) => {
            return [doc.document, store.add(this._instantiationService.createInstance(TrackedDocumentInfo, doc, scmBridge, this._statsEnabled))];
        });
        this.docsState = this._states.map((entries) => new Map(entries));
        this.docsState.recomputeInitiallyAndOnChange(this._store);
    }
};
EditSourceTrackingImpl = __decorate([
    __param(2, IInstantiationService)
], EditSourceTrackingImpl);
export { EditSourceTrackingImpl };
let TrackedDocumentInfo = class TrackedDocumentInfo extends Disposable {
    constructor(_doc, _scm, _statsEnabled, _instantiationService, _telemetryService, _randomService, _userAttentionService) {
        super();
        this._doc = _doc;
        this._scm = _scm;
        this._statsEnabled = _statsEnabled;
        this._instantiationService = _instantiationService;
        this._telemetryService = _telemetryService;
        this._randomService = _randomService;
        this._userAttentionService = _userAttentionService;
        this._repo = derived(this, reader => this._scm.getRepo(_doc.document.uri, reader));
        const docWithJustReason = createDocWithJustReason(_doc.documentWithAnnotations, this._store);
        const longtermResetSignal = observableSignal('resetSignal');
        let longtermReason = 'closed';
        this.longtermTracker = derived((reader) => {
            if (!this._statsEnabled.read(reader)) {
                return undefined;
            }
            longtermResetSignal.read(reader);
            const t = reader.store.add(new DocumentEditSourceTracker(docWithJustReason, undefined));
            const startFocusTime = this._userAttentionService.totalFocusTimeMs;
            const startTime = Date.now();
            reader.store.add(toDisposable(() => {
                // send long term document telemetry
                if (!t.isEmpty()) {
                    this.sendTelemetry('longterm', longtermReason, t, this._userAttentionService.totalFocusTimeMs - startFocusTime, Date.now() - startTime);
                }
                t.dispose();
            }));
            return t;
        }).recomputeInitiallyAndOnChange(this._store);
        this._store.add(new IntervalTimer()).cancelAndSet(() => {
            // Reset after 10 hours
            longtermReason = '10hours';
            longtermResetSignal.trigger(undefined);
            longtermReason = 'closed';
        }, 10 * 60 * 60 * 1000);
        // Reset on branch change or commit
        this._store.add(autorun(reader => {
            const repo = this._repo.read(reader);
            if (repo) {
                reader.store.add(runOnChange(repo.headCommitHashObs, () => {
                    longtermReason = 'hashChange';
                    longtermResetSignal.trigger(undefined);
                    longtermReason = 'closed';
                }));
                reader.store.add(runOnChange(repo.headBranchNameObs, () => {
                    longtermReason = 'branchChange';
                    longtermResetSignal.trigger(undefined);
                    longtermReason = 'closed';
                }));
            }
        }));
        this._store.add(this._instantiationService.createInstance(EditTelemetryReportInlineEditArcSender, _doc.documentWithAnnotations, this._repo));
        this._store.add(this._instantiationService.createInstance(EditTelemetryReportEditArcForChatOrInlineChatSender, _doc.documentWithAnnotations, this._repo));
        this._store.add(this._instantiationService.createInstance(CreateSuggestionIdForChatOrInlineChatCaller, _doc.documentWithAnnotations));
        // Focus time based 10-minute window tracker
        const resetSignal = observableSignal('resetSignal');
        this.windowedTracker = derived((reader) => {
            if (!this._statsEnabled.read(reader)) {
                return undefined;
            }
            if (!this._doc.isVisible.read(reader)) {
                return undefined;
            }
            resetSignal.read(reader);
            // Reset after 10 minutes of accumulated focus time
            reader.store.add(this._userAttentionService.fireAfterGivenFocusTimePassed(10 * 60 * 1000, () => {
                resetSignal.trigger(undefined);
            }));
            const t = reader.store.add(new DocumentEditSourceTracker(docWithJustReason, undefined));
            const startFocusTime = this._userAttentionService.totalFocusTimeMs;
            const startTime = Date.now();
            reader.store.add(toDisposable(async () => {
                // send windowed document telemetry
                this.sendTelemetry('10minFocusWindow', 'time', t, this._userAttentionService.totalFocusTimeMs - startFocusTime, Date.now() - startTime);
                t.dispose();
            }));
            return t;
        }).recomputeInitiallyAndOnChange(this._store);
        // Focus time based 20-minute window tracker
        const focusResetSignal = observableSignal('focusResetSignal');
        this.windowedFocusTracker = derived((reader) => {
            if (!this._statsEnabled.read(reader)) {
                return undefined;
            }
            if (!this._doc.isVisible.read(reader)) {
                return undefined;
            }
            focusResetSignal.read(reader);
            // Reset after 20 minutes of accumulated focus time
            reader.store.add(this._userAttentionService.fireAfterGivenFocusTimePassed(20 * 60 * 1000, () => {
                focusResetSignal.trigger(undefined);
            }));
            const t = reader.store.add(new DocumentEditSourceTracker(docWithJustReason, undefined));
            const startFocusTime = this._userAttentionService.totalFocusTimeMs;
            const startTime = Date.now();
            reader.store.add(toDisposable(async () => {
                // send focus-windowed document telemetry
                this.sendTelemetry('20minFocusWindow', 'time', t, this._userAttentionService.totalFocusTimeMs - startFocusTime, Date.now() - startTime);
                t.dispose();
            }));
            return t;
        }).recomputeInitiallyAndOnChange(this._store);
    }
    async sendTelemetry(mode, trigger, t, focusTime, actualTime) {
        const ranges = t.getTrackedRanges();
        const keys = t.getAllKeys();
        if (keys.length === 0) {
            return;
        }
        const data = this.getTelemetryData(ranges);
        const statsUuid = this._randomService.generateUuid();
        const sums = sumByCategory(ranges, r => r.range.length, r => r.sourceKey);
        const entries = Object.entries(sums).filter(([key, value]) => value !== undefined);
        entries.sort(reverseOrder(compareBy(([key, value]) => value, numberComparator)));
        entries.length = mode === 'longterm' ? 30 : 10;
        for (const key of keys) {
            if (!sums[key]) {
                sums[key] = 0;
            }
        }
        for (const [key, value] of Object.entries(sums)) {
            if (value === undefined) {
                continue;
            }
            const repr = t.getRepresentative(key);
            const deltaModifiedCount = t.getTotalInsertedCharactersCount(key);
            this._telemetryService.publicLog2('editTelemetry.editSources.details', {
                mode,
                sourceKey: key,
                sourceKeyCleaned: repr.toKey(1, { $extensionId: false, $extensionVersion: false, $modelId: false }),
                extensionId: repr.props.$extensionId,
                extensionVersion: repr.props.$extensionVersion,
                modelId: repr.props.$modelId,
                trigger,
                languageId: this._doc.document.languageId.get(),
                statsUuid: statsUuid,
                conversationId: repr.props.$$sessionId,
                requestId: repr.props.$$requestId,
                modifiedCount: value,
                deltaModifiedCount: deltaModifiedCount,
                totalModifiedCount: data.totalModifiedCharactersInFinalState,
            });
        }
        const isTrackedByGit = await data.isTrackedByGit;
        this._telemetryService.publicLog2('editTelemetry.editSources.stats', {
            mode,
            languageId: this._doc.document.languageId.get(),
            statsUuid: statsUuid,
            nesModifiedCount: data.nesModifiedCount,
            inlineCompletionsCopilotModifiedCount: data.inlineCompletionsCopilotModifiedCount,
            inlineCompletionsNESModifiedCount: data.inlineCompletionsNESModifiedCount,
            otherAIModifiedCount: data.otherAIModifiedCount,
            unknownModifiedCount: data.unknownModifiedCount,
            userModifiedCount: data.userModifiedCount,
            ideModifiedCount: data.ideModifiedCount,
            totalModifiedCharacters: data.totalModifiedCharactersInFinalState,
            externalModifiedCount: data.externalModifiedCount,
            isTrackedByGit: isTrackedByGit ? 1 : 0,
            focusTime,
            actualTime,
            trigger,
        });
    }
    getTelemetryData(ranges) {
        const getEditCategory = (source) => {
            if (source.category === 'ai' && source.kind === 'nes') {
                return 'nes';
            }
            if (source.category === 'ai' && source.kind === 'completion' && source.extensionId === 'github.copilot') {
                return 'inlineCompletionsCopilot';
            }
            if (source.category === 'ai' && source.kind === 'completion' && source.extensionId === 'github.copilot-chat' && source.providerId === 'completions') {
                return 'inlineCompletionsCopilot';
            }
            if (source.category === 'ai' && source.kind === 'completion' && source.extensionId === 'github.copilot-chat' && source.providerId === 'nes') {
                return 'inlineCompletionsNES';
            }
            if (source.category === 'ai' && source.kind === 'completion') {
                return 'inlineCompletionsOther';
            }
            if (source.category === 'ai') {
                return 'otherAI';
            }
            if (source.category === 'user') {
                return 'user';
            }
            if (source.category === 'ide') {
                return 'ide';
            }
            if (source.category === 'external') {
                return 'external';
            }
            if (source.category === 'unknown') {
                return 'unknown';
            }
            return 'unknown';
        };
        const sums = sumByCategory(ranges, r => r.range.length, r => getEditCategory(r.source));
        const totalModifiedCharactersInFinalState = sumBy(ranges, r => r.range.length);
        return {
            nesModifiedCount: sums.nes ?? 0,
            inlineCompletionsCopilotModifiedCount: sums.inlineCompletionsCopilot ?? 0,
            inlineCompletionsNESModifiedCount: sums.inlineCompletionsNES ?? 0,
            otherAIModifiedCount: sums.otherAI ?? 0,
            userModifiedCount: sums.user ?? 0,
            ideModifiedCount: sums.ide ?? 0,
            unknownModifiedCount: sums.unknown ?? 0,
            externalModifiedCount: sums.external ?? 0,
            totalModifiedCharactersInFinalState,
            languageId: this._doc.document.languageId.get(),
            isTrackedByGit: this._repo.get()?.isIgnored(this._doc.document.uri),
        };
    }
};
TrackedDocumentInfo = __decorate([
    __param(3, IInstantiationService),
    __param(4, ITelemetryService),
    __param(5, IRandomService),
    __param(6, IUserAttentionService)
], TrackedDocumentInfo);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdFNvdXJjZVRyYWNraW5nSW1wbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2VkaXRUZWxlbWV0cnkvYnJvd3Nlci90ZWxlbWV0cnkvZWRpdFNvdXJjZVRyYWNraW5nSW1wbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsWUFBWSxFQUFFLFNBQVMsRUFBRSxnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN4RyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDcEUsT0FBTyxFQUFFLFlBQVksRUFBRSxVQUFVLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNuRixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsT0FBTyxFQUFlLGdCQUFnQixFQUFFLFdBQVcsRUFBRSxPQUFPLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNsSixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUMxRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUUxRyxPQUFPLEVBQUUsMkNBQTJDLEVBQUUsbURBQW1ELEVBQUUsc0NBQXNDLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUNuTCxPQUFPLEVBQUUsdUJBQXVCLEVBQWMsTUFBTSwwQ0FBMEMsQ0FBQztBQUMvRixPQUFPLEVBQUUseUJBQXlCLEVBQWUsTUFBTSxrQkFBa0IsQ0FBQztBQUMxRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDcEQsT0FBTyxFQUFFLFVBQVUsRUFBa0IsTUFBTSxpQkFBaUIsQ0FBQztBQUM3RCxPQUFPLEVBQUUsY0FB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