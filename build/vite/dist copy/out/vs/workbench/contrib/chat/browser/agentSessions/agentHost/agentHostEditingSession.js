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
import { Sequencer } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { constObservable, derived, derivedOpts, ObservablePromise, observableValue, transaction } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { isDefined } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IEditorWorkerService } from '../../../../../../editor/common/services/editorWorker.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../../../nls.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { EditorActivation } from '../../../../../../platform/editor/common/editor.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { MultiDiffEditorInput } from '../../../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { emptySessionEntryDiff, getMultiDiffSourceUri } from '../../../common/editing/chatEditingService.js';
import { fileEditsToExternalEdits } from './stateToProgressAdapter.js';
// ---- Modified file entry ----------------------------------------------------
class AgentHostModifiedFileEntry {
    constructor(resource, beforeContentUri, lastModifyingRequestId, added, removed) {
        this.state = constObservable(1 /* ModifiedFileEntryState.Accepted */);
        this.isCurrentlyBeingModifiedBy = constObservable(undefined);
        this.lastModifyingResponse = constObservable(undefined);
        this.rewriteRatio = constObservable(1);
        this.waitsForLastEdits = constObservable(false);
        this.reviewMode = constObservable(false);
        this.autoAcceptController = constObservable(undefined);
        this.changesCount = constObservable(0);
        this.entryId = `agenthost-${resource.toString()}`;
        this.modifiedURI = resource;
        this.originalURI = beforeContentUri;
        this.lastModifyingRequestId = lastModifyingRequestId;
        if (added > 0 || removed > 0) {
            this.linesAdded = constObservable(added);
            this.linesRemoved = constObservable(removed);
        }
    }
    async accept() { }
    async reject() { }
    enableReviewModeUntilSettled() { }
    getEditorIntegration(_editor) {
        return {
            currentIndex: observableValue('currentIndex', 0),
            reveal() { },
            next() { return false; },
            previous() { return false; },
            enableAccessibleDiffView() { },
            async acceptNearestChange(_change) { },
            async rejectNearestChange(_change) { },
            async toggleDiff(_change, _show) { },
            dispose() { },
        };
    }
}
// ---- Editing session --------------------------------------------------------
let AgentHostEditingSession = class AgentHostEditingSession extends Disposable {
    constructor(chatSessionResource, _connectionAuthority, _editorService, _instantiationService, _logService, _fileService, _textModelService, _editorWorkerService) {
        super();
        this.chatSessionResource = chatSessionResource;
        this._connectionAuthority = _connectionAuthority;
        this._editorService = _editorService;
        this._instantiationService = _instantiationService;
        this._logService = _logService;
        this._fileService = _fileService;
        this._textModelService = _textModelService;
        this._editorWorkerService = _editorWorkerService;
        this.supportsKeepUndo = true;
        this.isGlobalEditingSession = false;
        this._state = observableValue(this, 2 /* ChatEditingSessionState.Idle */);
        this.state = this._state;
        this._entriesObs = observableValue(this, []);
        this.entries = this._entriesObs;
        this.requestDisablement = derivedOpts({ equalsFn: (a, b) => a.length === b.length && a.every((v, i) => v.requestId === b[i].requestId && v.afterUndoStop === b[i].afterUndoStop) }, reader => {
            const currentIdx = this._currentCheckpointIndex.read(reader);
            if (currentIdx >= this._checkpoints.length - 1) {
                return [];
            }
            // Collect unique request IDs from checkpoints after the current
            // index. Keep the first entry per request — if that's the sentinel
            // (undoStopId === undefined) the entire request is disabled.
            const disabled = new Map();
            for (let i = currentIdx + 1; i < this._checkpoints.length; i++) {
                const cp = this._checkpoints[i];
                if (!disabled.has(cp.requestId)) {
                    disabled.set(cp.requestId, cp.undoStopId);
                }
            }
            return [...disabled].map(([requestId, afterUndoStop]) => ({ requestId, afterUndoStop }));
        });
        this._onDidDispose = this._register(new Emitter());
        this.onDidDispose = this._onDidDispose.event;
        this._checkpoints = [];
        this._currentCheckpointIndex = observableValue(this, -1);
        this._diffCache = new Map();
        this._undoRedoSequencer = new Sequencer();
        this._hasExplanations = false;
        this.canUndo = derived(this, r => this._currentCheckpointIndex.read(r) >= 0);
        this.canRedo = derived(this, r => this._currentCheckpointIndex.read(r) < this._checkpoints.length - 1);
    }
    // ---- Hydration from protocol state --------------------------------------
    /**
     * Ensures a sentinel checkpoint exists for the given request. Called at the
     * start of every turn so that `requestDisablement` and `restoreSnapshot`
     * can reference requests that may not produce any file edits.
     *
     * Also splices away stale checkpoints after the current index (undo branch
     * semantics) when a new request arrives after a checkpoint restore.
     */
    ensureRequestCheckpoint(requestId) {
        // Splice stale checkpoints if the user restored a checkpoint
        const currentIdx = this._currentCheckpointIndex.get();
        if (currentIdx < this._checkpoints.length - 1) {
            this._checkpoints.splice(currentIdx + 1);
        }
        // Insert sentinel for this request if it doesn't exist yet
        if (!this._checkpoints.some(cp => cp.requestId === requestId)) {
            this._checkpoints.push({ requestId, undoStopId: undefined, edits: [] });
        }
    }
    addToolCallEdits(requestId, tc) {
        if (tc.status !== "completed" /* ToolCallStatus.Completed */) {
            return [];
        }
        // Deduplicate: ignore if this tool call was already added
        if (this._checkpoints.some(cp => cp.undoStopId === tc.toolCallId)) {
            return [];
        }
        // Ensure the sentinel and undo-branch splice are handled
        this.ensureRequestCheckpoint(requestId);
        const fileEdits = fileEditsToExternalEdits(tc);
        if (fileEdits.length === 0) {
            return [];
        }
        const authority = this._connectionAuthority;
        const edits = fileEdits.map((edit) => ({
            kind: edit.kind,
            resource: toAgentHostUri(edit.resource, authority),
            originalResource: edit.originalResource ? toAgentHostUri(edit.originalResource, authority) : undefined,
            beforeContentUri: edit.beforeContentUri ? toAgentHostUri(edit.beforeContentUri, authority) : undefined,
            afterContentUri: edit.afterContentUri ? toAgentHostUri(edit.afterContentUri, authority) : undefined,
            undoStopId: edit.undoStopId,
            diff: edit.diff,
        }));
        const checkpoint = {
            requestId,
            undoStopId: tc.toolCallId,
            edits,
        };
        this._checkpoints.push(checkpoint);
        transaction(tx => {
            this._currentCheckpointIndex.set(this._checkpoints.length - 1, tx);
            if (this._state.get() === 0 /* ChatEditingSessionState.Initial */) {
                this._state.set(2 /* ChatEditingSessionState.Idle */, tx);
            }
        });
        this._rebuildEntries();
        // Build progress parts for the file edit pills in the chat response
        const progressParts = [];
        for (const edit of edits) {
            // Emit workspace file edit progress for creates, deletes, and renames
            if (edit.kind === "create" /* FileEditKind.Create */ || edit.kind === "delete" /* FileEditKind.Delete */ || edit.kind === "rename" /* FileEditKind.Rename */) {
                progressParts.push({
                    kind: 'workspaceEdit',
                    edits: [{
                            oldResource: edit.originalResource ?? (edit.kind === "delete" /* FileEditKind.Delete */ ? edit.resource : undefined),
                            newResource: edit.kind === "delete" /* FileEditKind.Delete */ ? undefined : edit.resource,
                        }],
                });
            }
            // Emit code-block UI for content edits (and renames/creates with content)
            if (edit.afterContentUri) {
                progressParts.push({ kind: 'markdownContent', content: new MarkdownString('\n````\n') });
                progressParts.push({ kind: 'codeblockUri', uri: edit.resource, isEdit: true, undoStopId: tc.toolCallId });
                progressParts.push({ kind: 'textEdit', uri: edit.resource, edits: [], done: false, isExternalEdit: true });
                progressParts.push({ kind: 'textEdit', uri: edit.resource, edits: [], done: true, isExternalEdit: true });
                progressParts.push({ kind: 'markdownContent', content: new MarkdownString('\n````\n') });
            }
        }
        return progressParts;
    }
    // ---- Show diff editor ---------------------------------------------------
    async show(previousChanges) {
        if (this._editorPane?.isVisible()) {
            return;
        }
        if (this._editorPane?.input) {
            await this._editorService.openEditor(this._editorPane.input, { pinned: true, activation: EditorActivation.ACTIVATE });
            return;
        }
        const input = MultiDiffEditorInput.fromResourceMultiDiffEditorInput({
            multiDiffSource: getMultiDiffSourceUri(this, previousChanges),
            label: localize('multiDiffEditorInput.name', "Suggested Edits")
        }, this._instantiationService);
        this._editorPane = await this._editorService.openEditor(input, { pinned: true, activation: EditorActivation.ACTIVATE });
    }
    // ---- Entry lookups ------------------------------------------------------
    getEntry(uri) {
        return this._entriesObs.get().find(e => isEqual(e.modifiedURI, uri));
    }
    readEntry(uri, reader) {
        return this._entriesObs.read(reader).find(e => isEqual(e.modifiedURI, uri));
    }
    // ---- Accept / Reject (no-op) --------------------------------------------
    async accept(..._uris) { }
    async reject(..._uris) { }
    // ---- Snapshots ----------------------------------------------------------
    _findCheckpointIndex(requestId, stopId) {
        if (stopId !== undefined) {
            return this._checkpoints.findIndex(cp => cp.requestId === requestId && cp.undoStopId === stopId);
        }
        // No specific stop: find the sentinel checkpoint (undoStopId === undefined)
        // for this request, which marks the request boundary.
        return this._checkpoints.findIndex(cp => cp.requestId === requestId && cp.undoStopId === undefined);
    }
    _findCheckpoint(requestId, stopId) {
        if (stopId !== undefined) {
            const idx = this._findCheckpointIndex(requestId, stopId);
            return idx >= 0 ? this._checkpoints[idx] : undefined;
        }
        // No specific stop: find the last non-sentinel checkpoint for this
        // request (the one with actual edits).
        for (let i = this._checkpoints.length - 1; i >= 0; i--) {
            const cp = this._checkpoints[i];
            if (cp.requestId === requestId && cp.undoStopId !== undefined) {
                return cp;
            }
        }
        return undefined;
    }
    async restoreSnapshot(requestId, stopId) {
        const cpIdx = this._findCheckpointIndex(requestId, stopId);
        if (cpIdx < 0) {
            this._logService.warn(`[AgentHostEditingSession] No checkpoint found for requestId=${requestId}${stopId ? `, stopId=${stopId}` : ''}`);
            return;
        }
        // When stopId is undefined we found the sentinel (request boundary).
        // Navigate to one before it so the request's edits are fully undone.
        const targetIdx = stopId === undefined ? cpIdx - 1 : cpIdx;
        // Navigate to the target checkpoint
        const currentIdx = this._currentCheckpointIndex.get();
        if (targetIdx < currentIdx) {
            // Undo forward checkpoints
            for (let i = currentIdx; i > targetIdx; i--) {
                await this._writeCheckpointContent(this._checkpoints[i], 'before');
            }
        }
        else if (targetIdx > currentIdx) {
            // Redo to reach the target
            for (let i = currentIdx + 1; i <= targetIdx; i++) {
                await this._writeCheckpointContent(this._checkpoints[i], 'after');
            }
        }
        transaction(tx => {
            this._currentCheckpointIndex.set(targetIdx, tx);
        });
        this._rebuildEntries();
    }
    getSnapshotUri(requestId, uri, stopId) {
        const cp = this._findCheckpoint(requestId, stopId);
        if (!cp) {
            return undefined;
        }
        const uriStr = uri.toString();
        const edit = cp.edits.find(e => e.resource.toString() === uriStr);
        if (!edit) {
            return undefined;
        }
        return URI.from({
            scheme: Schemas.chatEditingSnapshotScheme,
            path: uri.path,
            query: JSON.stringify({ session: this.chatSessionResource.toString(), requestId, undoStop: stopId ?? '' }),
        });
    }
    async getSnapshotContents(requestId, uri, stopId) {
        const cp = this._findCheckpoint(requestId, stopId);
        if (!cp) {
            return undefined;
        }
        const uriStr = uri.toString();
        const edit = cp.edits.find(e => e.resource.toString() === uriStr);
        if (!edit) {
            return undefined;
        }
        try {
            if (!edit.afterContentUri) {
                return VSBuffer.fromByteArray([]);
            }
            const content = await this._fileService.readFile(edit.afterContentUri);
            return content.value;
        }
        catch (err) {
            this._logService.warn(`[AgentHostEditingSession] Failed to fetch snapshot content`, err);
            return undefined;
        }
    }
    async getSnapshotModel(_requestId, _undoStop, _snapshotUri) {
        return null;
    }
    // ---- Diffs --------------------------------------------------------------
    getEntryDiffBetweenStops(uri, requestId, stopId) {
        // Find the checkpoint for this stop
        const startIdx = requestId !== undefined
            ? this._checkpoints.findIndex(cp => cp.requestId === requestId && (stopId === undefined || cp.undoStopId === stopId))
            : -1;
        if (startIdx < 0 && requestId !== undefined) {
            return undefined;
        }
        // fromIdx is the boundary *before* the range, toIdx is the last
        // checkpoint in the range. For a single stop, the stop checkpoint
        // should be the range, so fromIdx is one before it.
        const fromIdx = requestId !== undefined ? startIdx - 1 : -1;
        const toIdx = requestId !== undefined ? startIdx : (this._checkpoints.length > 0 ? 0 : -1);
        if (toIdx < 0) {
            return undefined;
        }
        return this._getFileDiffObservable(uri, fromIdx, toIdx);
    }
    getEntryDiffBetweenRequests(uri, startRequestId, stopRequestId) {
        const startIndices = this._checkpoints
            .map((cp, i) => cp.requestId === startRequestId ? i : -1)
            .filter(i => i >= 0);
        const stopIndices = this._checkpoints
            .map((cp, i) => cp.requestId === stopRequestId ? i : -1)
            .filter(i => i >= 0);
        if (startIndices.length === 0 || stopIndices.length === 0) {
            return constObservable(undefined);
        }
        const fromIdx = startIndices[0];
        const toIdx = stopIndices[stopIndices.length - 1];
        return this._getFileDiffObservable(uri, fromIdx - 1, toIdx);
    }
    /**
     * Returns an observable diff for a single file between two checkpoint
     * boundary positions. `fromIdx` is the checkpoint *before* the range
     * (use -1 for "from baseline"), `toIdx` is the last checkpoint in the range.
     */
    _getFileDiffObservable(uri, fromIdx, toIdx) {
        const uriStr = uri.toString();
        // Determine the "before" content URI: the state of the file at the
        // fromIdx boundary. If fromIdx >= 0, this is the afterContentUri of
        // the last edit at or before that checkpoint. If fromIdx is -1
        // (baseline), it's the first edit's beforeContentUri.
        let beforeContentUri;
        if (fromIdx >= 0) {
            for (let i = fromIdx; i >= 0; i--) {
                for (const edit of this._checkpoints[i].edits) {
                    if (edit.resource.toString() === uriStr) {
                        beforeContentUri = edit.afterContentUri;
                        break;
                    }
                }
                if (beforeContentUri) {
                    break;
                }
            }
        }
        // Determine the "after" content URI: the state after the last edit
        // in the range. Also pick up the first beforeContentUri if we didn't
        // find one above (file wasn't edited before fromIdx).
        let afterContentUri;
        for (let i = Math.max(0, fromIdx); i <= toIdx && i < this._checkpoints.length; i++) {
            for (const edit of this._checkpoints[i].edits) {
                if (edit.resource.toString() === uriStr) {
                    if (!beforeContentUri) {
                        beforeContentUri = edit.beforeContentUri;
                    }
                    if (i > fromIdx) {
                        afterContentUri = edit.afterContentUri;
                    }
                }
            }
        }
        if (!beforeContentUri || !afterContentUri) {
            return constObservable(undefined);
        }
        return this._computeFileDiffObservable(beforeContentUri, afterContentUri, uri);
    }
    /**
     * Returns a cached observable that computes the diff between two content URIs.
     * The result is cached by the URI pair since content is immutable.
     */
    _computeFileDiffObservable(beforeUri, afterUri, fileUri) {
        const cacheKey = `${beforeUri.toString()}\0${afterUri.toString()}`;
        const cached = this._diffCache.get(cacheKey);
        if (cached) {
            return constObservable(cached);
        }
        const promise = new ObservablePromise(this._computeFileDiff(beforeUri, afterUri, fileUri));
        return derivedOpts({ owner: this }, reader => {
            const result = promise.promiseResult.read(reader);
            if (!result) {
                return { ...emptySessionEntryDiff(beforeUri, afterUri), isBusy: true };
            }
            if (result.data) {
                this._diffCache.set(cacheKey, result.data);
                return result.data;
            }
            return emptySessionEntryDiff(beforeUri, afterUri);
        });
    }
    /**
     * Fetches before/after content, creates temporary text models, computes
     * the diff via {@link IEditorWorkerService}, and returns the result.
     */
    async _computeFileDiff(beforeUri, afterUri, fileUri) {
        const refs = new DisposableStore();
        try {
            const beforeRef = await this._textModelService.createModelReference(beforeUri);
            refs.add(beforeRef);
            const afterRef = await this._textModelService.createModelReference(afterUri);
            refs.add(afterRef);
            const diff = await this._editorWorkerService.computeDiff(beforeRef.object.textEditorModel.uri, afterRef.object.textEditorModel.uri, { ignoreTrimWhitespace: false, computeMoves: false, maxComputationTimeMs: 3000 }, 'advanced');
            const entryDiff = {
                originalURI: beforeUri,
                modifiedURI: fileUri,
                identical: !!diff?.identical,
                isFinal: true,
                quitEarly: !diff || diff.quitEarly,
                added: 0,
                removed: 0,
                isBusy: false,
            };
            if (diff) {
                for (const change of diff.changes) {
                    entryDiff.removed += change.original.endLineNumberExclusive - change.original.startLineNumber;
                    entryDiff.added += change.modified.endLineNumberExclusive - change.modified.startLineNumber;
                }
            }
            return entryDiff;
        }
        catch (err) {
            this._logService.warn('[AgentHostEditingSession] diff computation failed', err);
            return { ...emptySessionEntryDiff(beforeUri, afterUri), isFinal: true };
        }
        finally {
            refs.dispose();
        }
    }
    getDiffsForFilesInSession() {
        return derived(this, r => {
            const currentIdx = this._currentCheckpointIndex.read(r);
            return this._readDiffsFromCheckpoints(-1, currentIdx);
        }).map((diffs, r) => diffs.read(r));
    }
    getDiffsForFilesInRequest(requestId) {
        return derived(this, r => {
            const currentIdx = this._currentCheckpointIndex.read(r);
            const filteredCheckpoints = [];
            for (let i = 0; i <= currentIdx && i < this._checkpoints.length; i++) {
                if (this._checkpoints[i].requestId === requestId) {
                    filteredCheckpoints.push(i);
                }
            }
            if (filteredCheckpoints.length === 0) {
                return undefined;
            }
            return this._readDiffsFromCheckpoints(filteredCheckpoints[0] - 1, filteredCheckpoints[filteredCheckpoints.length - 1]);
        }).map((diffs, r) => diffs?.read(r) || []);
    }
    hasEditsInRequest(requestId, _reader) {
        return this._checkpoints.some(cp => cp.requestId === requestId);
    }
    getDiffForSession() {
        const sessionDiffs = this.getDiffsForFilesInSession();
        return derived(this, r => {
            const diffs = sessionDiffs.read(r);
            let added = 0;
            let removed = 0;
            for (const diff of diffs) {
                added += diff.added;
                removed += diff.removed;
            }
            return { added, removed };
        });
    }
    // ---- Undo / Redo --------------------------------------------------------
    async undoInteraction() {
        return this._undoRedoSequencer.queue(() => this._undoInteractionImpl());
    }
    async redoInteraction() {
        return this._undoRedoSequencer.queue(() => this._redoInteractionImpl());
    }
    async _undoInteractionImpl() {
        const idx = this._currentCheckpointIndex.get();
        if (idx < 0) {
            return;
        }
        await this._writeCheckpointContent(this._checkpoints[idx], 'before');
        // Skip past any sentinel checkpoints (they have no edits)
        let newIdx = idx - 1;
        while (newIdx >= 0 && this._checkpoints[newIdx].undoStopId === undefined) {
            newIdx--;
        }
        transaction(tx => {
            this._currentCheckpointIndex.set(newIdx, tx);
        });
        this._rebuildEntries();
    }
    async _redoInteractionImpl() {
        const idx = this._currentCheckpointIndex.get();
        if (idx >= this._checkpoints.length - 1) {
            return;
        }
        // Skip past sentinel checkpoints to the next tool-call checkpoint
        let nextIdx = idx + 1;
        while (nextIdx < this._checkpoints.length && this._checkpoints[nextIdx].undoStopId === undefined) {
            nextIdx++;
        }
        if (nextIdx >= this._checkpoints.length) {
            return;
        }
        await this._writeCheckpointContent(this._checkpoints[nextIdx], 'after');
        transaction(tx => {
            this._currentCheckpointIndex.set(nextIdx, tx);
        });
        this._rebuildEntries();
    }
    // ---- Explanations (stubs) -----------------------------------------------
    async triggerExplanationGeneration() {
        this._hasExplanations = true;
    }
    clearExplanations() {
        this._hasExplanations = false;
    }
    hasExplanations() {
        return this._hasExplanations;
    }
    // ---- Unsupported operations (agent host owns edits server-side) ----------
    startStreamingEdits(_resource, _responseModel, _inUndoStop) {
        throw new Error('Not supported for agent host sessions');
    }
    applyWorkspaceEdit(_edit, _responseModel, _undoStopId) {
        throw new Error('Not supported for agent host sessions');
    }
    async startExternalEdits(_responseModel, _operationId, _resources, _undoStopId, _contentFor) {
        throw new Error('Not supported for agent host sessions');
    }
    async stopExternalEdits(_responseModel, _operationId, _contentFor) {
        throw new Error('Not supported for agent host sessions');
    }
    // ---- Stop / Dispose -----------------------------------------------------
    async stop(_clearState) {
        this.dispose();
    }
    dispose() {
        this._state.set(3 /* ChatEditingSessionState.Disposed */, undefined);
        this._onDidDispose.fire();
        this._diffCache.clear();
        super.dispose();
    }
    // ---- Private helpers ----------------------------------------------------
    _rebuildEntries() {
        const currentIdx = this._currentCheckpointIndex.get();
        const resourceMap = new Map();
        for (let i = 0; i <= currentIdx && i < this._checkpoints.length; i++) {
            const cp = this._checkpoints[i];
            for (const edit of cp.edits) {
                const key = edit.resource.toString();
                const existing = resourceMap.get(key);
                if (existing) {
                    // Update after-content to the latest, accumulate diff counts
                    if (edit.afterContentUri) {
                        existing.afterContentUri = edit.afterContentUri;
                    }
                    existing.requestId = cp.requestId;
                    existing.added += edit.diff?.added ?? 0;
                    existing.removed += edit.diff?.removed ?? 0;
                }
                else {
                    resourceMap.set(key, {
                        resource: edit.resource,
                        beforeContentUri: edit.beforeContentUri,
                        afterContentUri: edit.afterContentUri,
                        requestId: cp.requestId,
                        added: edit.diff?.added ?? 0,
                        removed: edit.diff?.removed ?? 0,
                    });
                }
            }
        }
        const entries = [...resourceMap.values()]
            .filter(v => v.beforeContentUri && v.afterContentUri)
            .map(v => new AgentHostModifiedFileEntry(v.resource, v.beforeContentUri, v.requestId, v.added, v.removed));
        this._entriesObs.set(entries, undefined);
    }
    async _writeCheckpointContent(checkpoint, direction) {
        const ops = checkpoint.edits.map(async (edit) => {
            try {
                if (direction === 'before') {
                    // Undoing this edit
                    switch (edit.kind) {
                        case "create" /* FileEditKind.Create */:
                            // Undo create → delete the file
                            await this._fileService.del(edit.resource);
                            break;
                        case "delete" /* FileEditKind.Delete */:
                            // Undo delete → recreate from before-snapshot
                            if (edit.beforeContentUri) {
                                const content = await this._fileService.readFile(edit.beforeContentUri);
                                await this._fileService.writeFile(edit.resource, content.value);
                            }
                            break;
                        case "rename" /* FileEditKind.Rename */:
                            // Undo rename → move back to original
                            if (edit.originalResource) {
                                await this._fileService.move(edit.resource, edit.originalResource, true);
                            }
                            // Also restore before-content if we have it
                            if (edit.beforeContentUri && edit.originalResource) {
                                const content = await this._fileService.readFile(edit.beforeContentUri);
                                await this._fileService.writeFile(edit.originalResource, content.value);
                            }
                            break;
                        case "edit" /* FileEditKind.Edit */:
                            // Undo edit → write before-snapshot content
                            if (edit.beforeContentUri) {
                                const content = await this._fileService.readFile(edit.beforeContentUri);
                                await this._fileService.writeFile(edit.resource, content.value);
                            }
                            break;
                    }
                }
                else {
                    // Redoing this edit
                    switch (edit.kind) {
                        case "create" /* FileEditKind.Create */:
                            // Redo create → recreate from after-snapshot
                            if (edit.afterContentUri) {
                                const content = await this._fileService.readFile(edit.afterContentUri);
                                await this._fileService.writeFile(edit.resource, content.value);
                            }
                            break;
                        case "delete" /* FileEditKind.Delete */:
                            // Redo delete → delete the file again
                            await this._fileService.del(edit.resource);
                            break;
                        case "rename" /* FileEditKind.Rename */:
                            // Redo rename → move from original to new
                            if (edit.originalResource) {
                                await this._fileService.move(edit.originalResource, edit.resource, true);
                            }
                            // Also apply after-content if we have it
                            if (edit.afterContentUri) {
                                const content = await this._fileService.readFile(edit.afterContentUri);
                                await this._fileService.writeFile(edit.resource, content.value);
                            }
                            break;
                        case "edit" /* FileEditKind.Edit */:
                            // Redo edit → write after-snapshot content
                            if (edit.afterContentUri) {
                                const content = await this._fileService.readFile(edit.afterContentUri);
                                await this._fileService.writeFile(edit.resource, content.value);
                            }
                            break;
                    }
                }
            }
            catch (err) {
                this._logService.warn(`[AgentHostEditingSession] Failed to ${direction === 'before' ? 'undo' : 'redo'} ${edit.kind} for ${edit.resource.toString()}`, err);
            }
        });
        await Promise.all(ops);
    }
    /**
     * Collects unique file URIs from checkpoints in the given range and
     * computes diffs for each via {@link _getFileDiffObservable}.
     */
    _readDiffsFromCheckpoints(fromIdx, toIdx) {
        // Collect unique resource URIs from checkpoints in the range
        const seen = new Set();
        const uris = [];
        for (let i = Math.max(0, fromIdx + 1); i <= toIdx && i < this._checkpoints.length; i++) {
            for (const edit of this._checkpoints[i].edits) {
                const key = edit.resource.toString();
                if (!seen.has(key)) {
                    seen.add(key);
                    uris.push(edit.resource);
                }
            }
        }
        const observables = uris.map(uri => this._getFileDiffObservable(uri, fromIdx, toIdx));
        return derived(reader => observables.flatMap(o => o.read(reader)).filter(isDefined));
    }
};
AgentHostEditingSession = __decorate([
    __param(2, IEditorService),
    __param(3, IInstantiationService),
    __param(4, ILogService),
    __param(5, IFileService),
    __param(6, ITextModelService),
    __param(7, IEditorWorkerService)
], AgentHostEditingSession);
export { AgentHostEditingSession };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRIb3N0RWRpdGluZ1Nlc3Npb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0RWRpdGluZ1Nlc3Npb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sd0NBQXdDLENBQUM7QUFDeEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDekYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLFdBQVcsRUFBd0IsaUJBQWlCLEVBQUUsZUFBZSxFQUFFLFdBQVcsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzNLLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDbkUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRzNELE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsY0FBYyxFQUFF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