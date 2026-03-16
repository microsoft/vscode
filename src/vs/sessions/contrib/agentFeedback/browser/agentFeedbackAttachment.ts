/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { basename, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { linesDiffComputers } from '../../../../editor/common/diff/linesDiffComputers.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../nls.js';
import { IAgentFeedbackService, IAgentFeedback } from './agentFeedbackService.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IAgentFeedbackVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { getSessionChangeForResource } from './agentFeedbackEditorUtils.js';

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
	private readonly _feedbackContextCache = new Map<string, { codeSelection?: string; diffHunks?: string }>();

	constructor(
		@IAgentFeedbackService private readonly _agentFeedbackService: IAgentFeedbackService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IAgentSessionsService private readonly _agentSessionsService: IAgentSessionsService,
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
			this._feedbackContextCache.clear();
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
				codeSelection: this._feedbackContextCache.get(f.id)?.codeSelection,
				diffHunks: this._feedbackContextCache.get(f.id)?.diffHunks,
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
		for (const cachedId of this._feedbackContextCache.keys()) {
			if (!currentIds.has(cachedId)) {
				this._feedbackContextCache.delete(cachedId);
			}
		}

		// Resolve only new (uncached) selection/diff contexts
		const uncachedItems = feedbackItems.filter(f => !this._feedbackContextCache.has(f.id));
		if (uncachedItems.length > 0) {
			await Promise.all(uncachedItems.map(async f => {
				const [codeSelection, diffHunks] = await Promise.all([
					this._getCodeSnippet(f.resourceUri, f.range),
					this._getDiffHunks(f),
				]);
				this._feedbackContextCache.set(f.id, { codeSelection, diffHunks });
			}));
		}

		// Build the final string from cache
		const parts: string[] = ['The following comments were made on the code changes:'];
		for (const item of feedbackItems) {
			const feedbackContext = this._feedbackContextCache.get(item.id);
			const codeSnippet = feedbackContext?.codeSelection;
			const diffHunks = feedbackContext?.diffHunks;
			const fileName = basename(item.resourceUri);
			const lineRef = item.range.startLineNumber === item.range.endLineNumber
				? `${item.range.startLineNumber}`
				: `${item.range.startLineNumber}-${item.range.endLineNumber}`;

			let part = `[${fileName}:${lineRef}]`;
			if (codeSnippet) {
				part += `\nSelection:\n\`\`\`\n${codeSnippet}\n\`\`\``;
			}
			if (diffHunks) {
				part += `\nDiff Hunks:\n\`\`\`diff\n${diffHunks}\n\`\`\``;
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
				const snippet = ref.object.textEditorModel.getValueInRange(range);
				return snippet.length > 0 ? snippet : undefined;
			} finally {
				ref.dispose();
			}
		} catch {
			return undefined;
		}
	}

	private async _getDiffHunks(feedbackItem: IAgentFeedback): Promise<string | undefined> {
		const sessionChange = getSessionChangeForResource(feedbackItem.sessionResource, feedbackItem.resourceUri, this._agentSessionsService);
		if (!sessionChange) {
			return undefined;
		}

		const originalUri = sessionChange.originalUri;
		const modifiedUri = isIChatSessionFileChange2(sessionChange)
			? sessionChange.modifiedUri ?? (sessionChange.originalUri ? undefined : sessionChange.uri)
			: sessionChange.modifiedUri;
		const selectionIsInOriginal = !!originalUri && isEqual(feedbackItem.resourceUri, originalUri);

		const [originalContent, modifiedContent] = await Promise.all([
			this._getResourceContents(originalUri),
			this._getResourceContents(modifiedUri),
		]);
		if ((originalUri && originalContent === undefined) || (modifiedUri && modifiedContent === undefined)) {
			return undefined;
		}

		const originalText = originalContent ?? '';
		const modifiedText = modifiedContent ?? '';
		const originalEndsWithNewline = originalText.length > 0 && originalText.endsWith('\n');
		const modifiedEndsWithNewline = modifiedText.length > 0 && modifiedText.endsWith('\n');
		const originalLines = originalText.split('\n');
		const modifiedLines = modifiedText.split('\n');

		if (originalEndsWithNewline && originalLines[originalLines.length - 1] === '') {
			originalLines.pop();
		}
		if (modifiedEndsWithNewline && modifiedLines[modifiedLines.length - 1] === '') {
			modifiedLines.pop();
		}

		const diffResult = linesDiffComputers.getDefault().computeDiff(originalLines, modifiedLines, {
			ignoreTrimWhitespace: false,
			maxComputationTimeMs: 1000,
			computeMoves: false,
		});
		if (diffResult.changes.length === 0) {
			return undefined;
		}

		const relevantGroups = this._groupChanges(diffResult.changes).filter(group =>
			group.some(change => this._rangeTouchesChange(feedbackItem.range, change, selectionIsInOriginal))
		);
		if (relevantGroups.length === 0) {
			return undefined;
		}

		const hunks = relevantGroups.map(group => this._renderHunkGroup(group, originalLines, modifiedLines, originalEndsWithNewline, modifiedEndsWithNewline));
		return hunks.join('\n');
	}

	private _groupChanges<T extends { original: { startLineNumber: number; endLineNumberExclusive: number }; modified: { startLineNumber: number; endLineNumberExclusive: number } }>(changes: readonly T[]): T[][] {
		const contextSize = 3;
		const groups: T[][] = [];
		let currentGroup: T[] = [];

		for (const change of changes) {
			if (currentGroup.length === 0) {
				currentGroup.push(change);
				continue;
			}

			const lastChange = currentGroup[currentGroup.length - 1];
			const lastContextEnd = lastChange.original.endLineNumberExclusive - 1 + contextSize;
			const currentContextStart = change.original.startLineNumber - contextSize;
			if (currentContextStart <= lastContextEnd + 1) {
				currentGroup.push(change);
			} else {
				groups.push(currentGroup);
				currentGroup = [change];
			}
		}

		if (currentGroup.length > 0) {
			groups.push(currentGroup);
		}

		return groups;
	}

	private _rangeTouchesChange(
		range: IRange,
		change: { original: { startLineNumber: number; endLineNumberExclusive: number; isEmpty: boolean; contains(lineNumber: number): boolean }; modified: { startLineNumber: number; endLineNumberExclusive: number; isEmpty: boolean; contains(lineNumber: number): boolean } },
		selectionIsInOriginal: boolean,
	): boolean {
		const lineRange = selectionIsInOriginal ? change.original : change.modified;
		const isEmptySelection = range.startLineNumber === range.endLineNumber && range.startColumn === range.endColumn;
		if (isEmptySelection) {
			return !lineRange.isEmpty && lineRange.contains(range.startLineNumber);
		}

		const selectionStart = range.startLineNumber;
		const selectionEndExclusive = range.endLineNumber + 1;
		return selectionStart < lineRange.endLineNumberExclusive && lineRange.startLineNumber < selectionEndExclusive;
	}

	private _renderHunkGroup(
		group: readonly { original: { startLineNumber: number; endLineNumberExclusive: number }; modified: { startLineNumber: number; endLineNumberExclusive: number } }[],
		originalLines: string[],
		modifiedLines: string[],
		originalEndsWithNewline: boolean,
		modifiedEndsWithNewline: boolean,
	): string {
		const contextSize = 3;
		const firstChange = group[0];
		const lastChange = group[group.length - 1];
		const hunkOrigStart = Math.max(1, firstChange.original.startLineNumber - contextSize);
		const hunkOrigEnd = Math.min(originalLines.length, lastChange.original.endLineNumberExclusive - 1 + contextSize);
		const hunkModStart = Math.max(1, firstChange.modified.startLineNumber - contextSize);

		const hunkLines: string[] = [];
		let lastOriginalLineIndex = -1;
		let lastModifiedLineIndex = -1;
		let origLineNum = hunkOrigStart;
		let origCount = 0;
		let modCount = 0;

		for (const change of group) {
			const origStart = change.original.startLineNumber;
			const origEnd = change.original.endLineNumberExclusive;
			const modStart = change.modified.startLineNumber;
			const modEnd = change.modified.endLineNumberExclusive;

			while (origLineNum < origStart) {
				const idx = hunkLines.length;
				hunkLines.push(` ${originalLines[origLineNum - 1]}`);
				if (origLineNum === originalLines.length) {
					lastOriginalLineIndex = idx;
				}
				const modLineNum = hunkModStart + modCount;
				if (modLineNum === modifiedLines.length) {
					lastModifiedLineIndex = idx;
				}
				origLineNum++;
				origCount++;
				modCount++;
			}

			for (let i = origStart; i < origEnd; i++) {
				const idx = hunkLines.length;
				hunkLines.push(`-${originalLines[i - 1]}`);
				if (i === originalLines.length) {
					lastOriginalLineIndex = idx;
				}
				origLineNum++;
				origCount++;
			}

			for (let i = modStart; i < modEnd; i++) {
				const idx = hunkLines.length;
				hunkLines.push(`+${modifiedLines[i - 1]}`);
				if (i === modifiedLines.length) {
					lastModifiedLineIndex = idx;
				}
				modCount++;
			}
		}

		while (origLineNum <= hunkOrigEnd) {
			const idx = hunkLines.length;
			hunkLines.push(` ${originalLines[origLineNum - 1]}`);
			if (origLineNum === originalLines.length) {
				lastOriginalLineIndex = idx;
			}
			const modLineNum = hunkModStart + modCount;
			if (modLineNum === modifiedLines.length) {
				lastModifiedLineIndex = idx;
			}
			origLineNum++;
			origCount++;
			modCount++;
		}

		const header = `@@ -${hunkOrigStart},${origCount} +${hunkModStart},${modCount} @@`;
		const result = [header, ...hunkLines];

		if (!originalEndsWithNewline && lastOriginalLineIndex >= 0) {
			result.splice(lastOriginalLineIndex + 2, 0, '\\ No newline at end of file');
		} else if (!modifiedEndsWithNewline && lastModifiedLineIndex >= 0) {
			result.splice(lastModifiedLineIndex + 2, 0, '\\ No newline at end of file');
		}

		return result.join('\n');
	}

	private async _getResourceContents(resourceUri: URI | undefined): Promise<string | undefined> {
		if (!resourceUri) {
			return undefined;
		}

		try {
			const ref = await this._textModelService.createModelReference(resourceUri);
			try {
				return ref.object.textEditorModel.getValue();
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
