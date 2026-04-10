/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IAgentFeedbackService } from './agentFeedbackService.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IAgentFeedbackVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';

export const ATTACHMENT_ID_PREFIX = 'agentFeedback:';

/**
 * Keeps the "N feedback items" attachment in the chat input in sync with the
 * AgentFeedbackService. One attachment per session resource, updated reactively.
 * Clears feedback after the chat prompt is sent.
 */
export class AgentFeedbackAttachmentContribution extends Disposable {

	static readonly ID = 'workbench.contrib.agentFeedbackAttachment';

	/** Track onDidAcceptInput subscriptions per widget session */
	private readonly _widgetListeners = this._store.add(new DisposableMap<string>());

	constructor(
		@IAgentFeedbackService private readonly _agentFeedbackService: IAgentFeedbackService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
	) {
		super();

		this._store.add(this._agentFeedbackService.onDidChangeFeedback(e => {
			this._updateAttachment(e.sessionResource);
			this._ensureAcceptListener(e.sessionResource);
		}));
	}

	private async _updateAttachment(sessionResource: URI): Promise<void> {
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

		const entry: IAgentFeedbackVariableEntry = {
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
	private _buildFeedbackValue(feedbackItems: IAgentFeedbackVariableEntry['feedbackItems']): string {
		const parts: string[] = ['The following comments were made on the code changes:'];
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
	private _ensureAcceptListener(sessionResource: URI): void {
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
}
