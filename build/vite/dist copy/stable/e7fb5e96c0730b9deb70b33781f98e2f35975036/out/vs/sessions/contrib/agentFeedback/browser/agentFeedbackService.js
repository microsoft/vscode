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
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { isEqual } from '../../../../base/common/resources.js';
import { IChatEditingService } from '../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { editingEntriesContainResource } from '../../../../workbench/contrib/chat/browser/sessionResourceMatching.js';
import { changeMatchesResource } from './agentFeedbackEditorUtils.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { logChangesViewReviewCommentAdded } from '../../../common/sessionsTelemetry.js';
// --- Service Interface --------------------------------------------------------
export const IAgentFeedbackService = createDecorator('agentFeedbackService');
// --- Implementation -----------------------------------------------------------
let AgentFeedbackService = class AgentFeedbackService extends Disposable {
    constructor(_chatEditingService, _sessionsManagementService, _editorService, _chatWidgetService, _commandService, _logService, _telemetryService) {
        super();
        this._chatEditingService = _chatEditingService;
        this._sessionsManagementService = _sessionsManagementService;
        this._editorService = _editorService;
        this._chatWidgetService = _chatWidgetService;
        this._commandService = _commandService;
        this._logService = _logService;
        this._telemetryService = _telemetryService;
        this._onDidChangeFeedback = this._store.add(new Emitter());
        this.onDidChangeFeedback = this._onDidChangeFeedback.event;
        this._onDidChangeNavigation = this._store.add(new Emitter());
        this.onDidChangeNavigation = this._onDidChangeNavigation.event;
        /** sessionResource → feedback items */
        this._feedbackBySession = new Map();
        this._sessionUpdatedOrder = new Map();
        this._sessionUpdatedSequence = 0;
        this._navigationAnchorBySession = new Map();
    }
    addFeedback(sessionResource, resourceUri, range, text, suggestion, context, sourcePRReviewCommentId) {
        const key = sessionResource.toString();
        let feedbackItems = this._feedbackBySession.get(key);
        if (!feedbackItems) {
            feedbackItems = [];
            this._feedbackBySession.set(key, feedbackItems);
        }
        const feedback = {
            id: generateUuid(),
            text,
            resourceUri,
            range,
            sessionResource,
            suggestion,
            codeSelection: context?.codeSelection,
            diffHunks: context?.diffHunks,
            sourcePRReviewCommentId,
        };
        // Insert at the correct sorted position.
        // Files are grouped by recency: first feedback for a new file appears after
        // all existing files. Within a file, items are sorted by startLineNumber.
        const resourceStr = resourceUri.toString();
        const hasExistingForFile = feedbackItems.some(f => f.resourceUri.toString() === resourceStr);
        if (!hasExistingForFile) {
            // New file — append at the end
            feedbackItems.push(feedback);
        }
        else {
            // Find insertion point: after the last item for a different file that
            // precedes this file's block, then within this file's block by line number.
            let insertIdx = feedbackItems.length;
            for (let i = 0; i < feedbackItems.length; i++) {
                if (feedbackItems[i].resourceUri.toString() === resourceStr
                    && feedbackItems[i].range.startLineNumber > range.startLineNumber) {
                    insertIdx = i;
                    break;
                }
                // If we passed the last item for this file without finding a larger
                // line number, insert right after the file's block.
                if (feedbackItems[i].resourceUri.toString() === resourceStr) {
                    insertIdx = i + 1;
                }
            }
            feedbackItems.splice(insertIdx, 0, feedback);
        }
        this._sessionUpdatedOrder.set(key, ++this._sessionUpdatedSequence);
        this._onDidChangeNavigation.fire(sessionResource);
        this._onDidChangeFeedback.fire({ sessionResource, feedbackItems });
        logChangesViewReviewCommentAdded(this._telemetryService, {
            hasExistingFeedback: hasExistingForFile,
            hasSuggestion: !!suggestion,
            isFromPRReview: !!sourcePRReviewCommentId,
        });
        return feedback;
    }
    removeFeedback(sessionResource, feedbackId) {
        const key = sessionResource.toString();
        const feedbackItems = this._feedbackBySession.get(key);
        if (!feedbackItems) {
            return;
        }
        const idx = feedbackItems.findIndex(f => f.id === feedbackId);
        if (idx >= 0) {
            feedbackItems.splice(idx, 1);
            if (this._navigationAnchorBySession.get(key) === feedbackId) {
                this._navigationAnchorBySession.delete(key);
                this._onDidChangeNavigation.fire(sessionResource);
            }
            if (feedbackItems.length > 0) {
                this._sessionUpdatedOrder.set(key, ++this._sessionUpdatedSequence);
            }
            else {
                this._sessionUpdatedOrder.delete(key);
            }
            this._onDidChangeFeedback.fire({ sessionResource, feedbackItems });
        }
    }
    updateFeedback(sessionResource, feedbackId, newText) {
        const key = sessionResource.toString();
        const feedbackItems = this._feedbackBySession.get(key);
        if (!feedbackItems) {
            return;
        }
        const idx = feedbackItems.findIndex(f => f.id === feedbackId);
        if (idx >= 0) {
            const existing = feedbackItems[idx];
            feedbackItems[idx] = {
                ...existing,
                text: newText,
            };
            this._sessionUpdatedOrder.set(key, ++this._sessionUpdatedSequence);
            this._onDidChangeFeedback.fire({ sessionResource, feedbackItems });
        }
    }
    getFeedback(sessionResource) {
        return this._feedbackBySession.get(sessionResource.toString()) ?? [];
    }
    getMostRecentSessionForResource(resourceUri) {
        let bestSession;
        let bestSequence = -1;
        for (const [, feedbackItems] of this._feedbackBySession) {
            if (!feedbackItems.length) {
                continue;
            }
            const candidate = feedbackItems[0].sessionResource;
            if (!this._sessionContainsResource(candidate, resourceUri, feedbackItems)) {
                continue;
            }
            const sequence = this._sessionUpdatedOrder.get(candidate.toString()) ?? 0;
            if (sequence > bestSequence) {
                bestSession = candidate;
                bestSequence = sequence;
            }
        }
        return bestSession;
    }
    _sessionContainsResource(sessionResource, resourceUri, feedbackItems) {
        if (feedbackItems.some(item => isEqual(item.resourceUri, resourceUri))) {
            return true;
        }
        for (const editingSession of this._chatEditingService.editingSessionsObs.get()) {
            if (!isEqual(editingSession.chatSessionResource, sessionResource)) {
                continue;
            }
            if (editingEntriesContainResource(editingSession.entries.get(), resourceUri)) {
                return true;
            }
        }
        const session = this._sessionsManagementService.getSession(sessionResource);
        if (!session) {
            return false;
        }
        const changes = session.changes.get();
        if (changes.some(change => changeMatchesResource(change, resourceUri))) {
            return true;
        }
        return false;
    }
    async revealFeedback(sessionResource, feedbackId) {
        const key = sessionResource.toString();
        const feedbackItems = this._feedbackBySession.get(key);
        const feedback = feedbackItems?.find(f => f.id === feedbackId);
        if (!feedback) {
            return;
        }
        await this.revealSessionComment(sessionResource, feedbackId, feedback.resourceUri, feedback.range);
    }
    async revealSessionComment(sessionResource, commentId, resourceUri, range) {
        const selection = { startLineNumber: range.startLineNumber, startColumn: range.startColumn };
        const sessionData = this._sessionsManagementService.getSession(sessionResource);
        const sessionChange = this._getSessionChange(resourceUri, sessionData?.changes.get());
        if (sessionChange?.isDeletion && sessionChange.originalUri) {
            await this._editorService.openEditor({
                resource: sessionChange.originalUri,
                options: {
                    modal: {},
                    preserveFocus: false,
                    revealIfVisible: true,
                    selection,
                }
            });
        }
        else if (sessionChange?.originalUri) {
            await this._editorService.openEditor({
                original: { resource: sessionChange.originalUri },
                modified: { resource: sessionChange.modifiedUri },
                options: {
                    modal: {},
                    preserveFocus: false,
                    revealIfVisible: true,
                    selection,
                }
            });
        }
        else {
            await this._editorService.openEditor({
                resource: sessionChange?.modifiedUri ?? resourceUri,
                options: {
                    modal: {},
                    preserveFocus: false,
                    revealIfVisible: true,
                    selection,
                }
            });
        }
        this.setNavigationAnchor(sessionResource, commentId);
    }
    _getSessionChange(resourceUri, changes) {
        if (!(changes instanceof Array)) {
            return undefined;
        }
        const matchingChange = changes.find(change => this._changeContainsResource(change, resourceUri));
        if (!matchingChange) {
            return undefined;
        }
        if (isIChatSessionFileChange2(matchingChange)) {
            return {
                originalUri: matchingChange.originalUri,
                modifiedUri: matchingChange.modifiedUri ?? matchingChange.uri,
                isDeletion: matchingChange.modifiedUri === undefined,
            };
        }
        return {
            originalUri: matchingChange.originalUri,
            modifiedUri: matchingChange.modifiedUri,
            isDeletion: false,
        };
    }
    _changeContainsResource(change, resourceUri) {
        if (isIChatSessionFileChange2(change)) {
            return change.uri.fsPath === resourceUri.fsPath
                || change.originalUri?.fsPath === resourceUri.fsPath
                || change.modifiedUri?.fsPath === resourceUri.fsPath;
        }
        return change.modifiedUri.fsPath === resourceUri.fsPath
            || change.originalUri?.fsPath === resourceUri.fsPath;
    }
    getNextFeedback(sessionResource, next) {
        return this.getNextNavigableItem(sessionResource, this.getFeedback(sessionResource), next);
    }
    getNextNavigableItem(sessionResource, items, next) {
        const key = sessionResource.toString();
        if (!items.length) {
            this._navigationAnchorBySession.delete(key);
            return undefined;
        }
        const anchorId = this._navigationAnchorBySession.get(key);
        let anchorIndex = anchorId ? items.findIndex(item => item.id === anchorId) : -1;
        if (anchorIndex < 0 && !next) {
            anchorIndex = 0;
        }
        const nextIndex = next
            ? (anchorIndex + 1) % items.length
            : (anchorIndex - 1 + items.length) % items.length;
        const item = items[nextIndex];
        this.setNavigationAnchor(sessionResource, item.id);
        return item;
    }
    setNavigationAnchor(sessionResource, itemId) {
        const key = sessionResource.toString();
        if (itemId) {
            this._navigationAnchorBySession.set(key, itemId);
        }
        else {
            this._navigationAnchorBySession.delete(key);
        }
        this._onDidChangeNavigation.fire(sessionResource);
    }
    getNavigationBearing(sessionResource, items = this._feedbackBySession.get(sessionResource.toString()) ?? []) {
        const key = sessionResource.toString();
        const anchorId = this._navigationAnchorBySession.get(key);
        const activeIdx = anchorId ? items.findIndex(item => item.id === anchorId) : -1;
        return { activeIdx, totalCount: items.length };
    }
    clearFeedback(sessionResource) {
        const key = sessionResource.toString();
        this._feedbackBySession.delete(key);
        this._sessionUpdatedOrder.delete(key);
        this._navigationAnchorBySession.delete(key);
        this._onDidChangeNavigation.fire(sessionResource);
        this._onDidChangeFeedback.fire({ sessionResource, feedbackItems: [] });
    }
    async addFeedbackAndSubmit(sessionResource, resourceUri, range, text, suggestion, context, sourcePRReviewCommentId) {
        this.addFeedback(sessionResource, resourceUri, range, text, suggestion, context, sourcePRReviewCommentId);
        // Wait for the attachment contribution to update the chat widget's attachment model
        const widget = this._chatWidgetService.getWidgetBySessionResource(sessionResource);
        if (widget) {
            const attachmentId = 'agentFeedback:' + sessionResource.toString();
            const hasAttachment = () => widget.attachmentModel.attachments.some(a => a.id === attachmentId);
            if (!hasAttachment()) {
                await Event.toPromise(Event.filter(widget.attachmentModel.onDidChange, () => hasAttachment()));
            }
        }
        else {
            this._logService.error('[AgentFeedback] addFeedbackAndSubmit: no chat widget found for session, feedback may not be submitted correctly', sessionResource.toString());
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        try {
            await this._commandService.executeCommand('agentFeedbackEditor.action.submit');
        }
        catch (err) {
            this._logService.error('[AgentFeedback] Failed to execute submit feedback command', err);
        }
    }
};
AgentFeedbackService = __decorate([
    __param(0, IChatEditingService),
    __param(1, ISessionsManagementService),
    __param(2, IEditorService),
    __param(3, IChatWidgetService),
    __param(4, ICommandService),
    __param(5, ILogService),
    __param(6, ITelemetryService)
], AgentFeedbackService);
export { AgentFeedbackService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRGZWVkYmFja1NlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL2FnZW50RmVlZGJhY2svYnJvd3Nlci9hZ2VudEZlZWRiYWNrU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUdsRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDN0YsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMvRCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5RUFBeUUsQ0FBQztBQUM5RyxPQUFPLEVBQW1ELHlCQUF5QixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDOUosT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDakcsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sdUVBQXVFLENBQUM7QUFDdEgsT0FBTyxFQUFFLHFCQUFxQixFQUF5QixNQUFNLCtCQUErQixDQUFDO0FBQzdGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUMvRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN4RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbkYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRXJFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FB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