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
var ChatEditingTextModelChangeService_1;
import { addDisposableListener, getWindow } from '../../../../../base/browser/dom.js';
import { assert } from '../../../../../base/common/assert.js';
import { DeferredPromise, RunOnceScheduler, timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { themeColorFromId } from '../../../../../base/common/themables.js';
import { assertType } from '../../../../../base/common/types.js';
import { EditOperation } from '../../../../../editor/common/core/editOperation.js';
import { StringEdit } from '../../../../../editor/common/core/edits/stringEdit.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { LineRange } from '../../../../../editor/common/core/ranges/lineRange.js';
import { nullDocumentDiff } from '../../../../../editor/common/diff/documentDiffProvider.js';
import { TextEdit, VersionedExtensionId } from '../../../../../editor/common/languages.js';
import { OverviewRulerLane } from '../../../../../editor/common/model.js';
import { ModelDecorationOptions } from '../../../../../editor/common/model/textModel.js';
import { offsetEditFromContentChanges, offsetEditFromLineRangeMapping, offsetEditToEditOperations } from '../../../../../editor/common/model/textModelStringEdit.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { EditSources } from '../../../../../editor/common/textModelEditSource.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { editorSelectionBackground } from '../../../../../platform/theme/common/colorRegistry.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { pendingRewriteMinimap } from './chatEditingModifiedFileEntry.js';
import { chatSessionResourceToId } from '../../common/model/chatUri.js';
let ChatEditingTextModelChangeService = class ChatEditingTextModelChangeService extends Disposable {
    static { ChatEditingTextModelChangeService_1 = this; }
    static { this._lastEditDecorationOptions = ModelDecorationOptions.register({
        isWholeLine: true,
        description: 'chat-last-edit',
        className: 'chat-editing-last-edit-line',
        marginClassName: 'chat-editing-last-edit',
        overviewRuler: {
            position: OverviewRulerLane.Full,
            color: themeColorFromId(editorSelectionBackground)
        },
    }); }
    static { this._pendingEditDecorationOptions = ModelDecorationOptions.register({
        isWholeLine: true,
        description: 'chat-pending-edit',
        className: 'chat-editing-pending-edit',
        minimap: {
            position: 1 /* MinimapPosition.Inline */,
            color: themeColorFromId(pendingRewriteMinimap)
        }
    }); }
    static { this._atomicEditDecorationOptions = ModelDecorationOptions.register({
        isWholeLine: true,
        description: 'chat-atomic-edit',
        className: 'chat-editing-atomic-edit',
        minimap: {
            position: 1 /* MinimapPosition.Inline */,
            color: themeColorFromId(pendingRewriteMinimap)
        }
    }); }
    get isEditFromUs() {
        return this._isEditFromUs;
    }
    get allEditsAreFromUs() {
        return this._allEditsAreFromUs;
    }
    get diffInfo() {
        return this._diffInfo.map(value => {
            return {
                ...value,
                originalModel: this.originalModel,
                modifiedModel: this.modifiedModel,
                keep: changes => this._keepHunk(changes),
                undo: changes => this._undoHunk(changes)
            };
        });
    }
    notifyHunkAction(state, affectedLines) {
        if (affectedLines.lineCount > 0) {
            this._didAcceptOrRejectLines.fire({ state, ...affectedLines });
        }
    }
    constructor(originalModel, modifiedModel, state, isExternalEditInProgress, _editorWorkerService, _accessibilitySignalService) {
        super();
        this.originalModel = originalModel;
        this.modifiedModel = modifiedModel;
        this.state = state;
        this._editorWorkerService = _editorWorkerService;
        this._accessibilitySignalService = _accessibilitySignalService;
        this._isEditFromUs = false;
        this._allEditsAreFromUs = true;
        this._diffOperationIds = 0;
        this._diffInfo = observableValue(this, nullDocumentDiff);
        this._editDecorationClear = this._register(new RunOnceScheduler(() => { this._editDecorations = this.modifiedModel.deltaDecorations(this._editDecorations, []); }, 500));
        this._editDecorations = [];
        this._didAcceptOrRejectAllHunks = this._register(new Emitter());
        this.onDidAcceptOrRejectAllHunks = this._didAcceptOrRejectAllHunks.event;
        this._didAcceptOrRejectLines = this._register(new Emitter());
        this.onDidAcceptOrRejectLines = this._didAcceptOrRejectLines.event;
        this._didUserEditModelFired = false;
        this._didUserEditModel = this._register(new Emitter());
        this.onDidUserEditModel = this._didUserEditModel.event;
        this._originalToModifiedEdit = StringEdit.empty;
        this.lineChangeCount = 0;
        this.linesAdded = 0;
        this.linesRemoved = 0;
        this._isExternalEditInProgress = isExternalEditInProgress;
        this._register(this.modifiedModel.onDidChangeContent(e => {
            this._mirrorEdits(e);
        }));
        this._register(toDisposable(() => {
            this.clearCurrentEditLineDecoration();
        }));
        this._register(autorun(r => this.updateLineChangeCount(this._diffInfo.read(r))));
        if (!originalModel.equalsTextBuffer(modifiedModel.getTextBuffer())) {
            this._updateDiffInfoSeq();
        }
    }
    updateLineChangeCount(diff) {
        this.lineChangeCount = 0;
        this.linesAdded = 0;
        this.linesRemoved = 0;
        for (const change of diff.changes) {
            const modifiedRange = change.modified.endLineNumberExclusive - change.modified.startLineNumber;
            this.linesAdded += Math.max(0, modifiedRange);
            const originalRange = change.original.endLineNumberExclusive - change.original.startLineNumber;
            this.linesRemoved += Math.max(0, originalRange);
            this.lineChangeCount += Math.max(modifiedRange, originalRange);
        }
    }
    clearCurrentEditLineDecoration() {
        if (!this.modifiedModel.isDisposed()) {
            this._editDecorations = this.modifiedModel.deltaDecorations(this._editDecorations, []);
        }
    }
    async areOriginalAndModifiedIdentical() {
        const diff = await this._diffOperation;
        return diff ? diff.identical : false;
    }
    async acceptAgentEdits(resource, textEdits, isLastEdits, responseModel) {
        assertType(textEdits.every(TextEdit.isTextEdit), 'INVALID args, can only handle text edits');
        assert(isEqual(resource, this.modifiedModel.uri), ' INVALID args, can only edit THIS document');
        const isAtomicEdits = textEdits.length > 0 && isLastEdits;
        let maxLineNumber = 0;
        let rewriteRatio = 0;
        const source = this._createEditSource(responseModel);
        if (isAtomicEdits) {
            // EDIT and DONE
            const minimalEdits = await this._editorWorkerService.computeMoreMinimalEdits(this.modifiedModel.uri, textEdits) ?? textEdits;
            const ops = minimalEdits.map(TextEdit.asEditOperation);
            const undoEdits = this._applyEdits(ops, source);
            if (undoEdits.length > 0) {
                let range;
                for (let i = 0; i < undoEdits.length; i++) {
                    const op = undoEdits[i];
                    if (!range) {
                        range = Range.lift(op.range);
                    }
                    else {
                        range = Range.plusRange(range, op.range);
                    }
                }
                if (range) {
                    const defer = new DeferredPromise();
                    const listener = addDisposableListener(getWindow(undefined), 'animationend', e => {
                        if (e.animationName === 'kf-chat-editing-atomic-edit') { // CHECK with chat.css
                            defer.complete();
                            listener.dispose();
                        }
                    });
                    this._editDecorations = this.modifiedModel.deltaDecorations(this._editDecorations, [{
                            options: ChatEditingTextModelChangeService_1._atomicEditDecorationOptions,
                            range
                        }]);
                    await Promise.any([defer.p, timeout(500)]); // wait for animation to finish but also time-cap it
                    listener.dispose();
                }
            }
        }
        else {
            // EDIT a bit, then DONE
            const ops = textEdits.map(TextEdit.asEditOperation);
            const undoEdits = this._applyEdits(ops, source);
            maxLineNumber = undoEdits.reduce((max, op) => Math.max(max, op.range.startLineNumber), 0);
            rewriteRatio = Math.min(1, maxLineNumber / this.modifiedModel.getLineCount());
            const newDecorations = [
                // decorate pending edit (region)
                {
                    options: ChatEditingTextModelChangeService_1._pendingEditDecorationOptions,
                    range: new Range(maxLineNumber + 1, 1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
                }
            ];
            if (maxLineNumber > 0) {
                // decorate last edit
                newDecorations.push({
                    options: ChatEditingTextModelChangeService_1._lastEditDecorationOptions,
                    range: new Range(maxLineNumber, 1, maxLineNumber, Number.MAX_SAFE_INTEGER)
                });
            }
            this._editDecorations = this.modifiedModel.deltaDecorations(this._editDecorations, newDecorations);
        }
        if (isLastEdits) {
            this._updateDiffInfoSeq();
            this._editDecorationClear.schedule();
        }
        return { rewriteRatio, maxLineNumber };
    }
    _createEditSource(responseModel) {
        if (!responseModel) {
            return EditSources.unknown({ name: 'editSessionUndoRedo' });
        }
        const sessionId = chatSessionResourceToId(responseModel.session.sessionResource);
        const request = responseModel.session.getRequests().at(-1);
        const languageId = this.modifiedModel.getLanguageId();
        const agent = responseModel.agent;
        const extensionId = VersionedExtensionId.tryCreate(agent?.extensionId.value, agent?.extensionVersion);
        if (responseModel.request?.locationData?.type === ChatAgentLocation.EditorInline) {
            return EditSources.inlineChatApplyEdit({
                modelId: request?.modelId,
                requestId: request?.id,
                sessionId,
                languageId,
                extensionId,
            });
        }
        return EditSources.chatApplyEdits({
            modelId: request?.modelId,
            requestId: request?.id,
            sessionId,
            languageId,
            mode: request?.modeInfo?.modeId,
            extensionId,
            codeBlockSuggestionId: request?.modeInfo?.applyCodeBlockSuggestionId,
        });
    }
    _applyEdits(edits, source) {
        if (edits.length === 0) {
            return [];
        }
        try {
            this._isEditFromUs = true;
            // make the actual edit
            let result = [];
            this.modifiedModel.pushEditOperations(null, edits, (undoEdits) => {
                result = undoEdits;
                return null;
            }, undefined, source);
            return result;
        }
        finally {
            this._isEditFromUs = false;
        }
    }
    /**
     * Keeps the current modified document as the final contents.
     */
    keep() {
        this.notifyHunkAction('accepted', { linesAdded: this.linesAdded, linesRemoved: this.linesRemoved, lineCount: this.lineChangeCount, hasRemainingEdits: false });
        this.originalModel.setValue(this.modifiedModel.createSnapshot());
        this._reset();
    }
    /**
     * Undoes the current modified document as the final contents.
     */
    undo() {
        this.notifyHunkAction('rejected', { linesAdded: this.linesAdded, linesRemoved: this.linesRemoved, lineCount: this.lineChangeCount, hasRemainingEdits: false });
        this.modifiedModel.pushStackElement();
        this._applyEdits([(EditOperation.replace(this.modifiedModel.getFullModelRange(), this.originalModel.getValue()))], EditSources.chatUndoEdits());
        this.modifiedModel.pushStackElement();
        this._reset();
    }
    _reset() {
        this._originalToModifiedEdit = StringEdit.empty;
        this._diffInfo.set(nullDocumentDiff, undefined);
        this._didUserEditModelFired = false;
    }
    async resetDocumentValues(newOriginal, newModified) {
        let didChange = false;
        if (newOriginal !== undefined) {
            this.originalModel.setValue(newOriginal);
            didChange = true;
        }
        if (newModified !== undefined && this.modifiedModel.getValue() !== newModified) {
            // NOTE that this isn't done via `setValue` so that the undo stack is preserved
            this.modifiedModel.pushStackElement();
            this._applyEdits([(EditOperation.replace(this.modifiedModel.getFullModelRange(), newModified))], EditSources.chatReset());
            this.modifiedModel.pushStackElement();
            didChange = true;
        }
        if (didChange) {
            await this._updateDiffInfoSeq();
        }
    }
    _mirrorEdits(event) {
        const edit = offsetEditFromContentChanges(event.changes);
        const isExternalEdit = this._isExternalEditInProgress?.();
        if (this._isEditFromUs || isExternalEdit) {
            const e_sum = this._originalToModifiedEdit;
            const e_ai = edit;
            this._originalToModifiedEdit = e_sum.compose(e_ai);
            if (isExternalEdit) {
                this._updateDiffInfoSeq();
            }
        }
        else {
            //           e_ai
            //   d0 ---------------> s0
            //   |                   |
            //   |                   |
            //   | e_user_r          | e_user
            //   |                   |
            //   |                   |
            //   v       e_ai_r      v
            ///  d1 ---------------> s1
            //
            // d0 - document snapshot
            // s0 - document
            // e_ai - ai edits
            // e_user - user edits
            //
            const e_ai = this._originalToModifiedEdit;
            const e_user = edit;
            const e_user_r = e_user.tryRebase(e_ai.inverse(this.originalModel.getValue()));
            if (e_user_r === undefined) {
                // user edits overlaps/conflicts with AI edits
                this._originalToModifiedEdit = e_ai.compose(e_user);
            }
            else {
                const edits = offsetEditToEditOperations(e_user_r, this.originalModel);
                this.originalModel.applyEdits(edits);
                this._originalToModifiedEdit = e_ai.rebaseSkipConflicting(e_user_r);
            }
            this._allEditsAreFromUs = false;
            this._updateDiffInfoSeq();
            if (!this._didUserEditModelFired) {
                this._didUserEditModelFired = true;
                this._didUserEditModel.fire();
            }
        }
    }
    async _keepHunk(change) {
        if (!this._diffInfo.get().changes.includes(change)) {
            // diffInfo should have model version ids and check them (instead of the caller doing that)
            return false;
        }
        const edits = [];
        for (const edit of change.innerChanges ?? []) {
            const newText = this.modifiedModel.getValueInRange(edit.modifiedRange);
            edits.push(EditOperation.replace(edit.originalRange, newText));
        }
        this.originalModel.pushEditOperations(null, edits, _ => null);
        await this._updateDiffInfoSeq('accepted');
        if (this._diffInfo.get().identical) {
            this._didAcceptOrRejectAllHunks.fire(1 /* ModifiedFileEntryState.Accepted */);
        }
        this._accessibilitySignalService.playSignal(AccessibilitySignal.editsKept, { allowManyInParallel: true });
        return true;
    }
    async _undoHunk(change) {
        if (!this._diffInfo.get().changes.includes(change)) {
            return false;
        }
        const edits = [];
        for (const edit of change.innerChanges ?? []) {
            const newText = this.originalModel.getValueInRange(edit.originalRange);
            edits.push(EditOperation.replace(edit.modifiedRange, newText));
        }
        this.modifiedModel.pushEditOperations(null, edits, _ => null);
        await this._updateDiffInfoSeq('rejected');
        if (this._diffInfo.get().identical) {
            this._didAcceptOrRejectAllHunks.fire(2 /* ModifiedFileEntryState.Rejected */);
        }
        this._accessibilitySignalService.playSignal(AccessibilitySignal.editsUndone, { allowManyInParallel: true });
        return true;
    }
    async getDiffInfo() {
        if (!this._diffOperation) {
            this._updateDiffInfoSeq();
        }
        await this._diffOperation;
        return this._diffInfo.get();
    }
    async _updateDiffInfoSeq(notifyAction = undefined) {
        const myDiffOperationId = ++this._diffOperationIds;
        await Promise.resolve(this._diffOperation);
        const previousCount = this.lineChangeCount;
        const previousAdded = this.linesAdded;
        const previousRemoved = this.linesRemoved;
        if (this._diffOperationIds === myDiffOperationId) {
            const thisDiffOperation = this._updateDiffInfo();
            this._diffOperation = thisDiffOperation;
            await thisDiffOperation;
            if (notifyAction) {
                const affectedLines = {
                    linesAdded: previousAdded - this.linesAdded,
                    linesRemoved: previousRemoved - this.linesRemoved,
                    lineCount: previousCount - this.lineChangeCount,
                    hasRemainingEdits: this.lineChangeCount > 0
                };
                this.notifyHunkAction(notifyAction, affectedLines);
            }
        }
    }
    hasHunkAt(range) {
        // return true if the range overlaps a diff range
        return this._diffInfo.get().changes.some(c => c.modified.intersectsStrict(LineRange.fromRangeInclusive(range)));
    }
    async _updateDiffInfo() {
        if (this.originalModel.isDisposed() || this.modifiedModel.isDisposed() || this._store.isDisposed) {
            return undefined;
        }
        if (this.state.get() !== 0 /* ModifiedFileEntryState.Modified */) {
            this._diffInfo.set(nullDocumentDiff, undefined);
            this._originalToModifiedEdit = StringEdit.empty;
            return nullDocumentDiff;
        }
        const docVersionNow = this.modifiedModel.getVersionId();
        const snapshotVersionNow = this.originalModel.getVersionId();
        const diff = await this._editorWorkerService.computeDiff(this.originalModel.uri, this.modifiedModel.uri, {
            ignoreTrimWhitespace: false, // NEVER ignore whitespace so that undo/accept edits are correct and so that all changes (1 of 2) are spelled out
            computeMoves: false,
            maxComputationTimeMs: 3000
        }, 'advanced');
        if (this.originalModel.isDisposed() || this.modifiedModel.isDisposed() || this._store.isDisposed) {
            return undefined;
        }
        // only update the diff if the documents didn't change in the meantime
        if (this.modifiedModel.getVersionId() === docVersionNow && this.originalModel.getVersionId() === snapshotVersionNow) {
            const diff2 = diff ?? nullDocumentDiff;
            this._diffInfo.set(diff2, undefined);
            this._originalToModifiedEdit = offsetEditFromLineRangeMapping(this.originalModel, this.modifiedModel, diff2.changes);
            return diff2;
        }
        return undefined;
    }
};
ChatEditingTextModelChangeService = ChatEditingTextModelChangeService_1 = __decorate([
    __param(4, IEditorWorkerService),
    __param(5, IAccessibilitySignalService)
], ChatEditingTextModelChangeService);
export { ChatEditingTextModelChangeService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVkaXRpbmdUZXh0TW9kZWxDaGFuZ2VTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRFZGl0aW5nL2NoYXRFZGl0aW5nVGV4dE1vZGVsQ2hhbmdlU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLFNBQVMsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM5RCxPQUFPLEVBQUUsZUFBZSxFQUFFLGdCQUFnQixFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxPQUFPLEVBQWUsZUFBZSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDakcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUVqRSxPQUFPLEVBQUUsYUFBYSxFQUF3QixNQUFNLG9EQUFvRCxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNuRixPQUFPLEVBQVUsS0FBSyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDM0UsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ2xGLE9BQU8sRUFBaUIsZ0JBQWdCLEVB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