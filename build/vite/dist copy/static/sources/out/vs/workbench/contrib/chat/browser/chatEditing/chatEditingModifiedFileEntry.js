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
var AbstractChatEditingModifiedFileEntry_1;
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { clamp } from '../../../../../base/common/numbers.js';
import { autorun, derived, observableValue, observableValueOpts, transaction } from '../../../../../base/common/observable.js';
import { EditDeltaInfo } from '../../../../../editor/common/textModelEditSource.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { editorBackground, registerColor, transparent } from '../../../../../platform/theme/common/colorRegistry.js';
import { IUndoRedoService } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { IFilesConfigurationService } from '../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IAiEditTelemetryService } from '../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js';
import { IChatService } from '../../common/chatService/chatService.js';
class AutoAcceptControl {
    constructor(total, remaining, cancel) {
        this.total = total;
        this.remaining = remaining;
        this.cancel = cancel;
    }
}
export const pendingRewriteMinimap = registerColor('minimap.chatEditHighlight', transparent(editorBackground, 0.6), localize('editorSelectionBackground', "Color of pending edit regions in the minimap"));
let AbstractChatEditingModifiedFileEntry = class AbstractChatEditingModifiedFileEntry extends Disposable {
    static { AbstractChatEditingModifiedFileEntry_1 = this; }
    static { this.scheme = 'modified-file-entry'; }
    static { this.lastEntryId = 0; }
    get telemetryInfo() {
        return this._telemetryInfo;
    }
    get lastModifyingRequestId() {
        return this._telemetryInfo.requestId;
    }
    constructor(modifiedURI, _telemetryInfo, kind, configService, _fileConfigService, _chatService, _fileService, _undoRedoService, _instantiationService, _aiEditTelemetryService) {
        super();
        this.modifiedURI = modifiedURI;
        this._telemetryInfo = _telemetryInfo;
        this._fileConfigService = _fileConfigService;
        this._chatService = _chatService;
        this._fileService = _fileService;
        this._undoRedoService = _undoRedoService;
        this._instantiationService = _instantiationService;
        this._aiEditTelemetryService = _aiEditTelemetryService;
        this.entryId = `${AbstractChatEditingModifiedFileEntry_1.scheme}::${++AbstractChatEditingModifiedFileEntry_1.lastEntryId}`;
        this._onDidDelete = this._register(new Emitter());
        this.onDidDelete = this._onDidDelete.event;
        this._stateObs = observableValue(this, 0 /* ModifiedFileEntryState.Modified */);
        this.state = this._stateObs;
        this._waitsForLastEdits = observableValue(this, false);
        this.waitsForLastEdits = this._waitsForLastEdits;
        this._isCurrentlyBeingModifiedByObs = observableValue(this, undefined);
        this.isCurrentlyBeingModifiedBy = this._isCurrentlyBeingModifiedByObs;
        /**
         * Flag to track if we're currently in an external edit operation.
         * When true, file system changes should be treated as agent edits, not user edits.
         */
        this._isExternalEditInProgress = false;
        this._lastModifyingResponseObs = observableValueOpts({ equalsFn: (a, b) => a?.requestId === b?.requestId }, undefined);
        this.lastModifyingResponse = this._lastModifyingResponseObs;
        this._lastModifyingResponseInProgressObs = this._lastModifyingResponseObs.map((value, r) => {
            return value?.isInProgress.read(r) ?? false;
        });
        this._rewriteRatioObs = observableValue(this, 0);
        this.rewriteRatio = this._rewriteRatioObs;
        this._reviewModeTempObs = observableValue(this, undefined);
        this._autoAcceptCtrl = observableValue(this, undefined);
        this.autoAcceptController = this._autoAcceptCtrl;
        this._refCounter = 1;
        this._userEditScheduler = this._register(new RunOnceScheduler(() => this._notifySessionAction('userModified'), 1000));
        this._editorIntegrations = this._register(new DisposableMap());
        if (kind === 0 /* ChatEditKind.Created */) {
            this.createdInRequestId = this._telemetryInfo.requestId;
        }
        if (this.modifiedURI.scheme !== Schemas.untitled && this.modifiedURI.scheme !== Schemas.vscodeNotebookCell) {
            this._register(this._fileService.watch(this.modifiedURI));
            this._register(this._fileService.onDidFilesChange(e => {
                if (e.affects(this.modifiedURI) && kind === 0 /* ChatEditKind.Created */ && e.gotDeleted()) {
                    this._onDidDelete.fire();
                }
            }));
        }
        // review mode depends on setting and temporary override
        const autoAcceptRaw = observableConfigValue('chat.editing.autoAcceptDelay', 0, configService);
        this._autoAcceptTimeout = derived(r => {
            const value = autoAcceptRaw.read(r);
            return clamp(value, 0, 100);
        });
        this.reviewMode = derived(r => {
            const configuredValue = this._autoAcceptTimeout.read(r);
            const tempValue = this._reviewModeTempObs.read(r);
            return tempValue ?? configuredValue === 0;
        });
        this._store.add(toDisposable(() => this._lastModifyingResponseObs.set(undefined, undefined)));
        const autoSaveOff = this._store.add(new MutableDisposable());
        this._store.add(autorun(r => {
            if (this._waitsForLastEdits.read(r)) {
                autoSaveOff.value = _fileConfigService.disableAutoSave(this.modifiedURI);
            }
            else {
                autoSaveOff.clear();
            }
        }));
        this._store.add(autorun(r => {
            const inProgress = this._lastModifyingResponseInProgressObs.read(r);
            if (inProgress === false && !this.reviewMode.read(r)) {
                // AUTO accept mode (when request is done)
                const acceptTimeout = this._autoAcceptTimeout.read(undefined) * 1000;
                const future = Date.now() + acceptTimeout;
                const update = () => {
                    const reviewMode = this.reviewMode.read(undefined);
                    if (reviewMode) {
                        // switched back to review mode
                        this._autoAcceptCtrl.set(undefined, undefined);
                        return;
                    }
                    const remain = Math.round(future - Date.now());
                    if (remain <= 0) {
                        this.accept();
                    }
                    else {
                        const handle = setTimeout(update, 100);
                        this._autoAcceptCtrl.set(new AutoAcceptControl(acceptTimeout, remain, () => {
                            clearTimeout(handle);
                            this._autoAcceptCtrl.set(undefined, undefined);
                        }), undefined);
                    }
                };
                update();
            }
        }));
    }
    dispose() {
        if (--this._refCounter === 0) {
            super.dispose();
        }
    }
    acquire() {
        this._refCounter++;
        return this;
    }
    enableReviewModeUntilSettled() {
        if (this.state.get() !== 0 /* ModifiedFileEntryState.Modified */) {
            // nothing to do
            return;
        }
        this._reviewModeTempObs.set(true, undefined);
        const cleanup = autorun(r => {
            // reset config when settled
            const resetConfig = this.state.read(r) !== 0 /* ModifiedFileEntryState.Modified */;
            if (resetConfig) {
                this._store.delete(cleanup);
                this._reviewModeTempObs.set(undefined, undefined);
            }
        });
        this._store.add(cleanup);
    }
    updateTelemetryInfo(telemetryInfo) {
        this._telemetryInfo = telemetryInfo;
    }
    async accept() {
        const callback = await this.acceptDeferred();
        if (callback) {
            transaction(callback);
        }
    }
    /** Accepts and returns a function used to transition the state. This MUST be called by the consumer. */
    async acceptDeferred() {
        if (this._stateObs.get() !== 0 /* ModifiedFileEntryState.Modified */) {
            // already accepted or rejected
            return;
        }
        await this._doAccept();
        return (tx) => {
            this._stateObs.set(1 /* ModifiedFileEntryState.Accepted */, tx);
            this._autoAcceptCtrl.set(undefined, tx);
            this._notifySessionAction('accepted');
        };
    }
    async reject() {
        const callback = await this.rejectDeferred();
        if (callback) {
            transaction(callback);
        }
    }
    /** Rejects and returns a function used to transition the state. This MUST be called by the consumer. */
    async rejectDeferred() {
        if (this._stateObs.get() !== 0 /* ModifiedFileEntryState.Modified */) {
            // already accepted or rejected
            return undefined;
        }
        this._notifySessionAction('rejected');
        await this._doReject();
        return (tx) => {
            this._stateObs.set(2 /* ModifiedFileEntryState.Rejected */, tx);
            this._autoAcceptCtrl.set(undefined, tx);
        };
    }
    _notifySessionAction(outcome) {
        this._notifyAction({ kind: 'chatEditingSessionAction', uri: this.modifiedURI, hasRemainingEdits: false, outcome });
    }
    _notifyAction(action) {
        if (action.kind === 'chatEditingHunkAction') {
            this._aiEditTelemetryService.handleCodeAccepted({
                suggestionId: undefined, // TODO@hediet try to figure this out
                acceptanceMethod: 'accept',
                presentation: 'highlightedEdit',
                modelId: this._telemetryInfo.modelId,
                modeId: this._telemetryInfo.modeId,
                applyCodeBlockSuggestionId: this._telemetryInfo.applyCodeBlockSuggestionId,
                editDeltaInfo: new EditDeltaInfo(action.linesAdded, action.linesRemoved, -1, -1),
                feature: this._telemetryInfo.feature,
                languageId: action.languageId,
                source: undefined,
            });
        }
        this._chatService.notifyUserAction({
            action,
            agentId: this._telemetryInfo.agentId,
            modelId: this._telemetryInfo.modelId,
            modeId: this._telemetryInfo.modeId,
            command: this._telemetryInfo.command,
            sessionResource: this._telemetryInfo.sessionResource,
            requestId: this._telemetryInfo.requestId,
            result: this._telemetryInfo.result
        });
    }
    getEditorIntegration(pane) {
        let value = this._editorIntegrations.get(pane);
        if (!value) {
            value = this._createEditorIntegration(pane);
            this._editorIntegrations.set(pane, value);
        }
        return value;
    }
    acceptStreamingEditsStart(responseModel, undoStopId, tx) {
        this._resetEditsState(tx);
        this._isCurrentlyBeingModifiedByObs.set({ responseModel, undoStopId }, tx);
        this._lastModifyingResponseObs.set(responseModel, tx);
        this._autoAcceptCtrl.get()?.cancel();
        const undoRedoElement = this._createUndoRedoElement(responseModel);
        if (undoRedoElement) {
            this._undoRedoService.pushElement(undoRedoElement);
        }
    }
    async acceptStreamingEditsEnd() {
        this._resetEditsState(undefined);
        if (await this._areOriginalAndModifiedIdentical()) {
            // ACCEPT if identical
            await this.accept();
        }
    }
    _resetEditsState(tx) {
        this._isCurrentlyBeingModifiedByObs.set(undefined, tx);
        this._rewriteRatioObs.set(0, tx);
        this._waitsForLastEdits.set(false, tx);
    }
    /**
     * Marks the start of an external edit operation.
     * File system changes will be treated as agent edits until stopExternalEdit is called.
     */
    startExternalEdit() {
        this._isExternalEditInProgress = true;
    }
    /**
     * Marks the end of an external edit operation.
     */
    stopExternalEdit() {
        this._isExternalEditInProgress = false;
    }
};
AbstractChatEditingModifiedFileEntry = AbstractChatEditingModifiedFileEntry_1 = __decorate([
    __param(3, IConfigurationService),
    __param(4, IFilesConfigurationService),
    __param(5, IChatService),
    __param(6, IFileService),
    __param(7, IUndoRedoService),
    __param(8, IInstantiationService),
    __param(9, IAiEditTelemetryService)
], AbstractChatEditingModifiedFileEntry);
export { AbstractChatEditingModifiedFileEntry };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVkaXRpbmdNb2RpZmllZEZpbGVFbnRyeS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0RWRpdGluZy9jaGF0RWRpdGluZ01vZGlmaWVkRmlsZUVudHJ5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckgsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBNkIsZUFBZSxFQUFFLG1CQUFtQixFQUFFLFdBQVcsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRzFKLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNwRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHNFQUFzRSxDQUFDO0FBQzdHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxhQUFhLEVBQUUsV0FBVyxFQUFFLE1BQU0s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