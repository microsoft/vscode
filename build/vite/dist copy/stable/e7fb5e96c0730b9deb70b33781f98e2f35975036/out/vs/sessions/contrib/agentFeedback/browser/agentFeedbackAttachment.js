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
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { basename } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { IAgentFeedbackService } from './agentFeedbackService.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
export const ATTACHMENT_ID_PREFIX = 'agentFeedback:';
/**
 * Keeps the "N feedback items" attachment in the chat input in sync with the
 * AgentFeedbackService. One attachment per session resource, updated reactively.
 * Clears feedback after the chat prompt is sent.
 */
let AgentFeedbackAttachmentContribution = class AgentFeedbackAttachmentContribution extends Disposable {
    static { this.ID = 'workbench.contrib.agentFeedbackAttachment'; }
    constructor(_agentFeedbackService, _chatWidgetService) {
        super();
        this._agentFeedbackService = _agentFeedbackService;
        this._chatWidgetService = _chatWidgetService;
        /** Track onDidAcceptInput subscriptions per widget session */
        this._widgetListeners = this._store.add(new DisposableMap());
        this._store.add(this._agentFeedbackService.onDidChangeFeedback(e => {
            this._updateAttachment(e.sessionResource);
            this._ensureAcceptListener(e.sessionResource);
        }));
    }
    async _updateAttachment(sessionResource) {
        const widget = this._chatWidgetService.getWidgetBySessionResource(sessionResource);
        if (!widget) {
            return;
        }
        const feedbackItems = this._agentFeedbackService.getFeedback(sessionResource);
        const attachmentId = ATTACHMENT_ID_PREFIX + sessionResource.toString();
        if (feedbackItems.length === 0) {
            widget.attachmentModel.delete(attachmentId);
            return;
        }
        const value = this._buildFeedbackValue(feedbackItems);
        const entry = {
            kind: 'agentFeedback',
            id: attachmentId,
            name: feedbackItems.length === 1
                ? localize('agentFeedback.one', "1 comment")
                : localize('agentFeedback.many', "{0} comments", feedbackItems.length),
            icon: Codicon.comment,
            sessionResource,
            feedbackItems: feedbackItems.map(f => ({
                id: f.id,
                text: f.text,
                resourceUri: f.resourceUri,
                range: f.range,
                codeSelection: f.codeSelection,
                diffHunks: f.diffHunks,
                sourcePRReviewCommentId: f.sourcePRReviewCommentId,
            })),
            value,
        };
        // Upsert
        widget.attachmentModel.delete(attachmentId);
        widget.attachmentModel.addContext(entry);
    }
    /**
     * Builds a rich string value for the agent feedback attachment from
     * the selection and diff context already stored on each feedback item.
     */
    _buildFeedbackValue(feedbackItems) {
        const parts = ['The following comments were made on the code changes:'];
        for (const item of feedbackItems) {
            const fileName = basename(item.resourceUri);
            const lineRef = item.range.startLineNumber === item.range.endLineNumber
                ? `${item.range.startLineNumber}`
                : `${item.range.startLineNumber}-${item.range.endLineNumber}`;
            let part = `[${fileName}:${lineRef}]`;
            if (item.sourcePRReviewCommentId) {
                part += `\n(PR review comment, thread ID: ${item.sourcePRReviewCommentId} — resolve this thread when addressed)`;
            }
            if (item.codeSelection) {
                part += `\nSelection:\n\`\`\`\n${item.codeSelection}\n\`\`\``;
            }
            if (item.diffHunks) {
                part += `\nDiff Hunks:\n\`\`\`diff\n${item.diffHunks}\n\`\`\``;
            }
            part += `\nComment: ${item.text}`;
            parts.push(part);
        }
        return parts.join('\n\n');
    }
    /**
     * Ensure we listen for the chat widget's submit event so we can clear feedback after send.
     */
    _ensureAcceptListener(sessionResource) {
        const key = sessionResource.toString();
        if (this._widgetListeners.has(key)) {
            return;
        }
        const widget = this._chatWidgetService.getWidgetBySessionResource(sessionResource);
        if (!widget) {
            return;
        }
        this._widgetListeners.set(key, widget.onDidSubmitAgent(() => {
            this._agentFeedbackService.clearFeedback(sessionResource);
            this._widgetListeners.deleteAndDispose(key);
        }));
    }
};
AgentFeedbackAttachmentContribution = __decorate([
    __param(0, IAgentFeedbackService),
    __param(1, IChatWidgetService)
], AgentFeedbackAttachmentContribution);
export { AgentFeedbackAttachmentContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRGZWVkYmFja0F0dGFjaG1lbnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL2FnZW50RmVlZGJhY2svYnJvd3Nlci9hZ2VudEZlZWRiYWNrQXR0YWNobWVudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFaEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ2xFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBR3hGLE1BQU0sQ0FBQyxNQUFNLG9CQUFvQixHQUFHLGdCQUFnQixDQUFDO0FBRXJEOzs7O0dBSUc7QUFDSSxJQUFNLG1DQUFtQyxHQUF6QyxNQUFNLG1DQUFvQyxTQUFRLFVBQVU7YUFFbEQsT0FBRSxHQUFHLDJDQUEyQyxBQUE5QyxDQUErQztJQUtqRSxZQUN3QixxQkFBNkQsRUFDaEUsa0JBQXVEO1FBRTNFLEtBQUssRUFBRSxDQUFDO1FBSGdDLDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBdUI7UUFDL0MsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFvQjtRQUw1RSw4REFBOEQ7UUFDN0MscUJBQWdCLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxhQUFhLEVBQVUsQ0FBQyxDQUFDO1FBUWhGLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxxQkFBcUIs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