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
var CodeReviewService_1;
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, observableValue, transaction } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { Range } from '../../../../editor/common/core/range.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { hash } from '../../../../base/common/hash.js';
import { hasKey } from '../../../../base/common/types.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
export function getCodeReviewFilesFromSessionChanges(changes) {
    return changes.map(change => {
        if (isIChatSessionFileChange2(change)) {
            return {
                currentUri: change.modifiedUri ?? change.uri,
                baseUri: change.originalUri,
            };
        }
        return {
            currentUri: change.modifiedUri,
            baseUri: change.originalUri,
        };
    });
}
export function getCodeReviewVersion(files) {
    const stableFileList = files
        .map(file => `${file.currentUri.toString()}|${file.baseUri?.toString() ?? ''}`)
        .sort();
    return `v1:${stableFileList.length}:${hash(stableFileList)}`;
}
export const MAX_CODE_REVIEWS_PER_SESSION_VERSION = 5;
export var CodeReviewStateKind;
(function (CodeReviewStateKind) {
    CodeReviewStateKind["Idle"] = "idle";
    CodeReviewStateKind["Loading"] = "loading";
    CodeReviewStateKind["Result"] = "result";
    CodeReviewStateKind["Error"] = "error";
})(CodeReviewStateKind || (CodeReviewStateKind = {}));
// --- PR Review Types ---------------------------------------------------------
export var PRReviewStateKind;
(function (PRReviewStateKind) {
    PRReviewStateKind["None"] = "none";
    PRReviewStateKind["Loading"] = "loading";
    PRReviewStateKind["Loaded"] = "loaded";
    PRReviewStateKind["Error"] = "error";
})(PRReviewStateKind || (PRReviewStateKind = {}));
// --- Service Interface -------------------------------------------------------
export const ICodeReviewService = createDecorator('codeReviewService');
function isRawCodeReviewRangeWithPositions(range) {
    return typeof range === 'object' && range !== null && hasKey(range, { start: true, end: true });
}
function isRawCodeReviewRangeTuple(range) {
    return Array.isArray(range) && range.length >= 2;
}
function normalizeCodeReviewUri(uri) {
    return typeof uri === 'string' ? URI.parse(uri) : URI.revive(uri);
}
function normalizeCodeReviewRange(range) {
    if (Range.isIRange(range)) {
        return Range.lift(range);
    }
    if (isRawCodeReviewRangeTuple(range)) {
        const [start, end] = range;
        return new Range((start.line ?? 0) + 1, (start.character ?? 0) + 1, (end.line ?? start.line ?? 0) + 1, (end.character ?? start.character ?? 0) + 1);
    }
    if (isRawCodeReviewRangeWithPositions(range) && range.start && range.end) {
        return new Range((range.start.line ?? 0) + 1, (range.start.character ?? 0) + 1, (range.end.line ?? range.start.line ?? 0) + 1, (range.end.character ?? range.start.character ?? 0) + 1);
    }
    const lineRange = range;
    return new Range((lineRange.startLine ?? 0) + 1, (lineRange.startColumn ?? 0) + 1, (lineRange.endLine ?? lineRange.startLine ?? 0) + 1, (lineRange.endColumn ?? lineRange.startColumn ?? 0) + 1);
}
function normalizeCodeReviewSuggestion(suggestion) {
    if (!suggestion) {
        return undefined;
    }
    return {
        edits: suggestion.edits.map(edit => ({
            range: normalizeCodeReviewRange(edit.range),
            newText: edit.newText,
            oldText: edit.oldText,
        })),
    };
}
let CodeReviewService = class CodeReviewService extends Disposable {
    static { CodeReviewService_1 = this; }
    static { this._STORAGE_KEY = 'codeReview.reviews'; }
    constructor(_commandService, _logService, _storageService, _gitHubService, _sessionsManagementService) {
        super();
        this._commandService = _commandService;
        this._logService = _logService;
        this._storageService = _storageService;
        this._gitHubService = _gitHubService;
        this._sessionsManagementService = _sessionsManagementService;
        this._reviewsBySession = new Map();
        this._prReviewBySession = new Map();
        /** PR review comment IDs that have been converted to agent feedback (per session). */
        this._convertedPRCommentsBySession = new Map();
        this._loadFromStorage();
        this._registerSessionListeners();
        this._register(autorun(reader => {
            const activeSession = this._sessionsManagementService.activeSession.read(reader);
            if (activeSession) {
                this._ensurePRReviewInitialized(activeSession.resource);
            }
        }));
        this._register(this._sessionsManagementService.onDidChangeSessions(e => {
            const archived = e.changed.filter(s => s.isArchived.get());
            const nonArchived = e.changed.filter(s => !s.isArchived.get());
            // Initialize PR review for new/changed sessions
            for (const session of [...e.added, ...nonArchived]) {
                this._ensurePRReviewInitialized(session.resource);
            }
            // Dispose PR review for removed and archived sessions
            for (const session of [...e.removed, ...archived]) {
                this._disposePRReview(session.resource);
            }
        }));
    }
    getReviewState(sessionResource) {
        return this._getOrCreateData(sessionResource).state;
    }
    hasReview(sessionResource, version) {
        const data = this._reviewsBySession.get(sessionResource.toString());
        if (!data) {
            return false;
        }
        const state = data.state.get();
        return state.kind === "result" /* CodeReviewStateKind.Result */ && state.version === version;
    }
    requestReview(sessionResource, version, files) {
        const data = this._getOrCreateData(sessionResource);
        const currentState = data.state.get();
        const currentReviewCount = currentState.kind !== "idle" /* CodeReviewStateKind.Idle */ && currentState.version === version ? currentState.reviewCount : 0;
        // Don't re-request if already loading or unresolved comments remain for this version.
        if (currentState.kind === "loading" /* CodeReviewStateKind.Loading */ && currentState.version === version) {
            return;
        }
        if (currentReviewCount >= MAX_CODE_REVIEWS_PER_SESSION_VERSION) {
            return;
        }
        if (currentState.kind === "result" /* CodeReviewStateKind.Result */ && currentState.version === version && currentState.comments.length > 0) {
            return;
        }
        data.state.set({ kind: "loading" /* CodeReviewStateKind.Loading */, version, reviewCount: currentReviewCount + 1 }, undefined);
        this._executeReview(sessionResource, version, files, data);
    }
    removeComment(sessionResource, commentId) {
        const data = this._reviewsBySession.get(sessionResource.toString());
        if (!data) {
            return;
        }
        const state = data.state.get();
        if (state.kind !== "result" /* CodeReviewStateKind.Result */) {
            return;
        }
        const filtered = state.comments.filter(c => c.id !== commentId);
        data.state.set({ kind: "result" /* CodeReviewStateKind.Result */, version: state.version, reviewCount: state.reviewCount, comments: filtered, didProduceComments: state.didProduceComments }, undefined);
        this._saveToStorage();
    }
    updateComment(sessionResource, commentId, newBody) {
        const data = this._reviewsBySession.get(sessionResource.toString());
        if (!data) {
            return;
        }
        const state = data.state.get();
        if (state.kind !== "result" /* CodeReviewStateKind.Result */) {
            return;
        }
        const updated = state.comments.map(c => c.id === commentId ? { ...c, body: newBody } : c);
        data.state.set({ kind: "result" /* CodeReviewStateKind.Result */, version: state.version, reviewCount: state.reviewCount, comments: updated, didProduceComments: state.didProduceComments }, undefined);
        this._saveToStorage();
    }
    dismissReview(sessionResource) {
        const data = this._reviewsBySession.get(sessionResource.toString());
        if (data) {
            data.state.set({ kind: "idle" /* CodeReviewStateKind.Idle */ }, undefined);
            this._saveToStorage();
        }
    }
    _getOrCreateData(sessionResource) {
        const key = sessionResource.toString();
        let data = this._reviewsBySession.get(key);
        if (!data) {
            data = {
                state: observableValue(`codeReview.state.${key}`, { kind: "idle" /* CodeReviewStateKind.Idle */ }),
            };
            this._reviewsBySession.set(key, data);
        }
        return data;
    }
    async _executeReview(sessionResource, version, files, data) {
        try {
            const result = await this._commandService.executeCommand('chat.internal.codeReview.run', {
                files: files.map(f => ({
                    currentUri: f.currentUri,
                    baseUri: f.baseUri,
                })),
            });
            // Check if version is still current (hasn't been dismissed or replaced)
            const currentState = data.state.get();
            if (currentState.kind !== "loading" /* CodeReviewStateKind.Loading */ || currentState.version !== version) {
                return;
            }
            if (!result || result.type === 'cancelled') {
                data.state.set({ kind: "idle" /* CodeReviewStateKind.Idle */ }, undefined);
                return;
            }
            if (result.type === 'error') {
                data.state.set({ kind: "error" /* CodeReviewStateKind.Error */, version, reviewCount: currentState.reviewCount, reason: result.reason ?? 'Unknown error' }, undefined);
                return;
            }
            if (result.type === 'success') {
                const comments = (result.comments ?? []).map((raw) => ({
                    id: generateUuid(),
                    uri: normalizeCodeReviewUri(raw.uri),
                    range: normalizeCodeReviewRange(raw.range),
                    body: raw.body ?? '',
                    kind: raw.kind ?? '',
                    severity: raw.severity ?? '',
                    suggestion: normalizeCodeReviewSuggestion(raw.suggestion),
                }));
                transaction(tx => {
                    data.state.set({ kind: "result" /* CodeReviewStateKind.Result */, version, reviewCount: currentState.reviewCount, comments, didProduceComments: comments.length > 0 }, tx);
                });
                this._saveToStorage();
            }
        }
        catch (err) {
            const currentState = data.state.get();
            if (currentState.kind === "loading" /* CodeReviewStateKind.Loading */ && currentState.version === version) {
                data.state.set({ kind: "error" /* CodeReviewStateKind.Error */, version, reviewCount: currentState.reviewCount, reason: String(err) }, undefined);
            }
        }
    }
    _loadFromStorage() {
        const raw = this._storageService.get(CodeReviewService_1._STORAGE_KEY, 1 /* StorageScope.WORKSPACE */);
        if (!raw) {
            return;
        }
        try {
            const stored = JSON.parse(raw);
            for (const [key, review] of Object.entries(stored)) {
                const comments = review.comments.map(c => ({
                    id: c.id,
                    uri: URI.revive(c.uri),
                    range: c.range,
                    body: c.body,
                    kind: c.kind,
                    severity: c.severity,
                    suggestion: c.suggestion,
                }));
                const data = this._getOrCreateData(URI.parse(key));
                data.state.set({ kind: "result" /* CodeReviewStateKind.Result */, version: review.version, reviewCount: review.reviewCount ?? 1, comments, didProduceComments: review.didProduceComments ?? comments.length > 0 }, undefined);
            }
        }
        catch {
            // Corrupted storage data - ignore
        }
    }
    _saveToStorage() {
        const stored = {};
        for (const [key, data] of this._reviewsBySession) {
            const state = data.state.get();
            if (state.kind === "result" /* CodeReviewStateKind.Result */) {
                stored[key] = {
                    version: state.version,
                    reviewCount: state.reviewCount,
                    didProduceComments: state.didProduceComments,
                    comments: state.comments.map(c => ({
                        id: c.id,
                        uri: c.uri.toJSON(),
                        range: c.range,
                        body: c.body,
                        kind: c.kind,
                        severity: c.severity,
                        suggestion: c.suggestion,
                    })),
                };
            }
        }
        if (Object.keys(stored).length === 0) {
            this._storageService.remove(CodeReviewService_1._STORAGE_KEY, 1 /* StorageScope.WORKSPACE */);
        }
        else {
            this._storageService.store(CodeReviewService_1._STORAGE_KEY, JSON.stringify(stored), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        }
    }
    _registerSessionListeners() {
        // Clean up when sessions change (archived/removed sessions, stale review versions)
        this._register(this._sessionsManagementService.onDidChangeSessions(e => {
            // Clean up reviews for removed/archived sessions
            for (const session of [...e.removed, ...e.changed.filter(s => s.isArchived.get())]) {
                const key = session.resource.toString();
                const data = this._reviewsBySession.get(key);
                if (data) {
                    data.state.set({ kind: "idle" /* CodeReviewStateKind.Idle */ }, undefined);
                    this._saveToStorage();
                }
            }
            // Check for stale review versions when sessions change
            let changed = false;
            for (const [key, data] of this._reviewsBySession) {
                const state = data.state.get();
                if (state.kind !== "result" /* CodeReviewStateKind.Result */) {
                    continue;
                }
                const session = this._sessionsManagementService.getSession(URI.parse(key));
                if (!session) {
                    // Session no longer exists - clean up
                    data.state.set({ kind: "idle" /* CodeReviewStateKind.Idle */ }, undefined);
                    changed = true;
                    continue;
                }
                const changes = session.changes.get();
                if (changes.length === 0) {
                    // Session has no file-level changes - clean up
                    data.state.set({ kind: "idle" /* CodeReviewStateKind.Idle */ }, undefined);
                    changed = true;
                    continue;
                }
                const files = getCodeReviewFilesFromSessionChanges(changes);
                const currentVersion = getCodeReviewVersion(files);
                if (state.version !== currentVersion) {
                    // Version mismatch - review is stale
                    data.state.set({ kind: "idle" /* CodeReviewStateKind.Idle */ }, undefined);
                    changed = true;
                }
            }
            if (changed) {
                this._saveToStorage();
            }
        }));
    }
    getPRReviewState(sessionResource) {
        return this._getOrCreatePRReviewData(sessionResource).state;
    }
    async resolvePRReviewThread(sessionResource, threadId) {
        const session = this._sessionsManagementService.getSession(sessionResource);
        const gitHubInfo = session?.gitHubInfo.get();
        if (gitHubInfo?.pullRequest) {
            const prModel = this._gitHubService.getPullRequest(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number);
            try {
                await prModel.resolveThread(threadId);
            }
            catch (err) {
                this._logService.warn('[CodeReviewService] Failed to resolve PR thread on GitHub:', err);
            }
        }
        // Remove from local state regardless of GitHub success
        const data = this._prReviewBySession.get(sessionResource.toString());
        if (data) {
            const currentState = data.state.get();
            if (currentState.kind === "loaded" /* PRReviewStateKind.Loaded */) {
                const filtered = currentState.comments.filter(c => c.id !== threadId);
                data.state.set({ kind: "loaded" /* PRReviewStateKind.Loaded */, comments: filtered }, undefined);
            }
        }
    }
    markPRReviewCommentConverted(sessionResource, commentId) {
        const key = sessionResource.toString();
        let converted = this._convertedPRCommentsBySession.get(key);
        if (!converted) {
            converted = new Set();
            this._convertedPRCommentsBySession.set(key, converted);
        }
        converted.add(commentId);
        // Immediately filter the comment from the observable PR review state
        const data = this._prReviewBySession.get(key);
        if (data) {
            const currentState = data.state.get();
            if (currentState.kind === "loaded" /* PRReviewStateKind.Loaded */) {
                const filtered = currentState.comments.filter(c => c.id !== commentId);
                data.state.set({ kind: "loaded" /* PRReviewStateKind.Loaded */, comments: filtered }, undefined);
            }
        }
    }
    _getOrCreatePRReviewData(sessionResource) {
        const key = sessionResource.toString();
        let data = this._prReviewBySession.get(key);
        if (!data) {
            data = {
                state: observableValue(`prReview.state.${key}`, { kind: "none" /* PRReviewStateKind.None */ }),
                disposables: new DisposableStore(),
                initialized: false,
            };
            this._prReviewBySession.set(key, data);
        }
        return data;
    }
    _ensurePRReviewInitialized(sessionResource) {
        const data = this._getOrCreatePRReviewData(sessionResource);
        if (data.initialized) {
            return;
        }
        const session = this._sessionsManagementService.getSession(sessionResource);
        const gitHubInfo = session?.gitHubInfo.get();
        if (!gitHubInfo?.pullRequest) {
            return;
        }
        data.initialized = true;
        data.state.set({ kind: "loading" /* PRReviewStateKind.Loading */ }, undefined);
        const prModel = this._gitHubService.getPullRequest(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number);
        const workspace = session?.workspace.get();
        // Watch the PR model's review threads and map to local state
        data.disposables.add(autorun(reader => {
            const threads = prModel.reviewThreads.read(reader);
            const converted = this._convertedPRCommentsBySession.get(sessionResource.toString());
            const comments = [];
            for (const thread of threads) {
                if (thread.isResolved) {
                    continue;
                }
                const threadId = String(thread.id);
                if (converted?.has(threadId)) {
                    continue;
                }
                const baseUri = workspace?.repositories[0]?.workingDirectory ?? workspace?.repositories[0]?.uri;
                if (!baseUri) {
                    continue;
                }
                const fileUri = URI.joinPath(baseUri, thread.path);
                const line = thread.line ?? 1;
                const firstComment = thread.comments[0];
                comments.push({
                    id: String(thread.id),
                    uri: fileUri,
                    range: new Range(line, 1, line, 1),
                    body: firstComment?.body ?? '',
                    author: firstComment?.author.login ?? '',
                });
            }
            data.state.set({ kind: "loaded" /* PRReviewStateKind.Loaded */, comments }, undefined);
        }));
        // Start polling and initial fetch
        prModel.refreshThreads().catch(err => {
            this._logService.error('[CodeReviewService] Failed to fetch PR review threads:', err);
            data.state.set({ kind: "error" /* PRReviewStateKind.Error */, reason: String(err) }, undefined);
        });
        prModel.startPolling();
    }
    _disposePRReview(sessionResource) {
        const key = sessionResource.toString();
        this._convertedPRCommentsBySession.delete(key);
        const data = this._prReviewBySession.get(key);
        if (data) {
            data.disposables.dispose();
            this._prReviewBySession.delete(key);
        }
    }
    dispose() {
        for (const data of this._prReviewBySession.values()) {
            data.disposables.dispose();
        }
        this._prReviewBySession.clear();
        super.dispose();
    }
};
CodeReviewService = CodeReviewService_1 = __decorate([
    __param(0, ICommandService),
    __param(1, ILogService),
    __param(2, IStorageService),
    __param(3, IGitHubService),
    __param(4, ISessionsManagementService)
], CodeReviewService);
export { CodeReviewService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZVJldmlld1NlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL2NvZGVSZXZpZXcvYnJvd3Nlci9jb2RlUmV2aWV3U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuRixPQUFPLEVBQUUsT0FBTyxFQUFlLGVBQWUsRUFBRSxXQUFXLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUMzRyxPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLGdDQUFnQyxDQUFDO0FBQ3BFLE9BQU8sRUFBVSxLQUFLLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDN0YsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzFELE9BQU8sRUFBbUQseUJBQXlCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUM5SixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDdkUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0scURBQXFELENBQUM7QUE2QmpHLE1BQU0sVUFBVSxvQ0FBb0MsQ0FBQyxPQUFzRTtJQUMxSCxP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