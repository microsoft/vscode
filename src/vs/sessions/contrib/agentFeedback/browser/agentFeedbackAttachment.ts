/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../nls.js';
import { IAgentFeedbackService, IAgentFeedback } from './agentFeedbackService.js';
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

	/** Cache of resolved code snippets keyed by feedback ID */
	private readonly _snippetCache = new Map<string, string | undefined>();

	constructor(
		@IAgentFeedbackService private readonly _agentFeedbackService: IAgentFeedbackService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@ITextModelService private readonly _textModelService: ITextModelService,
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
			this._snippetCache.clear();
			return;
		}

		const value = await this._buildFeedbackValue(feedbackItems);

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
			})),
			value,
		};

		// Upsert
		widget.attachmentModel.delete(attachmentId);
		widget.attachmentModel.addContext(entry);
	}

	/**
	 * Builds a rich string value for the agent feedback attachment that includes
	 * the code snippet at each feedback item's location alongside the feedback text.
	 * Uses a cache keyed by feedback ID to avoid re-resolving snippets for
	 * items that haven't changed.
	 */
	private async _buildFeedbackValue(feedbackItems: readonly IAgentFeedback[]): Promise<string> {
		// Prune stale cache entries for items that no longer exist
		const currentIds = new Set(feedbackItems.map(f => f.id));
		for (const cachedId of this._snippetCache.keys()) {
			if (!currentIds.has(cachedId)) {
				this._snippetCache.delete(cachedId);
			}
		}

		// Resolve only new (uncached) snippets
		const uncachedItems = feedbackItems.filter(f => !this._snippetCache.has(f.id));
		if (uncachedItems.length > 0) {
			await Promise.all(uncachedItems.map(async f => {
				const snippet = await this._getCodeSnippet(f.resourceUri, f.range);
				this._snippetCache.set(f.id, snippet);
			}));
		}

		// Build the final string from cache
		const parts: string[] = ['The following comments were made on the code changes:'];
		for (const item of feedbackItems) {
			const codeSnippet = this._snippetCache.get(item.id);
			const fileName = basename(item.resourceUri);
			const lineRef = item.range.startLineNumber === item.range.endLineNumber
				? `${item.range.startLineNumber}`
				: `${item.range.startLineNumber}-${item.range.endLineNumber}`;

			let part = `[${fileName}:${lineRef}]`;
			if (codeSnippet) {
				part += `\n\`\`\`\n${codeSnippet}\n\`\`\``;
			}
			part += `\nComment: ${item.text}`;
			parts.push(part);
		}

		return parts.join('\n\n');
	}

	/**
	 * Resolves the text model for a resource and extracts the code in the given range.
	 * Returns undefined if the model cannot be resolved.
	 */
	private async _getCodeSnippet(resourceUri: URI, range: IRange): Promise<string | undefined> {
		try {
			const ref = await this._textModelService.createModelReference(resourceUri);
			try {
				return ref.object.textEditorModel.getValueInRange(range);
			} finally {
				ref.dispose();
			}
		} catch {
			return undefined;
		}
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
