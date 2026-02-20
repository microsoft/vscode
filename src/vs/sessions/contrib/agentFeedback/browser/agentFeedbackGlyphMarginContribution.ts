/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentFeedbackGlyphMargin.css';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from '../../../../editor/browser/editorBrowser.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { IModelDeltaDecoration, TrackedRangeStickiness } from '../../../../editor/common/model.js';
import { ModelDecorationOptions } from '../../../../editor/common/model/textModel.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { URI } from '../../../../base/common/uri.js';
import { IAgentFeedbackService } from './agentFeedbackService.js';
import { IChatEditingService } from '../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { getSessionForResource } from './agentFeedbackEditorUtils.js';
import { Selection } from '../../../../editor/common/core/selection.js';

const feedbackGlyphDecoration = ModelDecorationOptions.register({
	description: 'agent-feedback-glyph',
	linesDecorationsClassName: `${ThemeIcon.asClassName(Codicon.comment)} agent-feedback-glyph`,
	stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
});

const addFeedbackHintDecoration = ModelDecorationOptions.register({
	description: 'agent-feedback-add-hint',
	linesDecorationsClassName: `${ThemeIcon.asClassName(Codicon.add)} agent-feedback-add-hint`,
	stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
});

export class AgentFeedbackGlyphMarginContribution extends Disposable implements IEditorContribution {

	static readonly ID = 'agentFeedback.glyphMarginContribution';

	private readonly _feedbackDecorations;

	private _hintDecorationId: string | null = null;
	private _hintLine = -1;
	private _sessionResource: URI | undefined;
	private _feedbackLines = new Set<number>();

	constructor(
		private readonly _editor: ICodeEditor,
		@IAgentFeedbackService private readonly _agentFeedbackService: IAgentFeedbackService,
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@IAgentSessionsService private readonly _agentSessionsService: IAgentSessionsService,
	) {
		super();

		this._feedbackDecorations = this._editor.createDecorationsCollection();

		this._store.add(this._agentFeedbackService.onDidChangeFeedback(() => this._updateFeedbackDecorations()));
		this._store.add(this._editor.onDidChangeModel(() => this._onModelChanged()));
		this._store.add(this._editor.onMouseMove((e: IEditorMouseEvent) => this._onMouseMove(e)));
		this._store.add(this._editor.onMouseLeave(() => this._updateHintDecoration(-1)));
		this._store.add(this._editor.onMouseDown((e: IEditorMouseEvent) => this._onMouseDown(e)));

		this._resolveSession();
		this._updateFeedbackDecorations();
	}

	private _onModelChanged(): void {
		this._updateHintDecoration(-1);
		this._resolveSession();
		this._updateFeedbackDecorations();
	}

	private _resolveSession(): void {
		const model = this._editor.getModel();
		if (!model) {
			this._sessionResource = undefined;
			return;
		}
		this._sessionResource = getSessionForResource(model.uri, this._chatEditingService, this._agentSessionsService);
	}

	private _updateFeedbackDecorations(): void {
		if (!this._sessionResource) {
			this._feedbackDecorations.clear();
			this._feedbackLines.clear();
			return;
		}

		const feedbackItems = this._agentFeedbackService.getFeedback(this._sessionResource);
		const decorations: IModelDeltaDecoration[] = [];
		const lines = new Set<number>();

		for (const item of feedbackItems) {
			const model = this._editor.getModel();
			if (!model || item.resourceUri.toString() !== model.uri.toString()) {
				continue;
			}

			const line = item.range.startLineNumber;
			lines.add(line);
			decorations.push({
				range: new Range(line, 1, line, 1),
				options: feedbackGlyphDecoration,
			});
		}

		this._feedbackLines = lines;
		this._feedbackDecorations.set(decorations);
	}

	private _onMouseMove(e: IEditorMouseEvent): void {
		if (!this._sessionResource) {
			this._updateHintDecoration(-1);
			return;
		}

		const isLineDecoration = e.target.type === MouseTargetType.GUTTER_LINE_DECORATIONS && !e.target.detail.isAfterLines;
		const isContentArea = e.target.type === MouseTargetType.CONTENT_TEXT || e.target.type === MouseTargetType.CONTENT_EMPTY;
		if (e.target.position
			&& (isLineDecoration || isContentArea)
			&& !this._feedbackLines.has(e.target.position.lineNumber)
		) {
			this._updateHintDecoration(e.target.position.lineNumber);
		} else {
			this._updateHintDecoration(-1);
		}
	}

	private _updateHintDecoration(line: number): void {
		if (line === this._hintLine) {
			return;
		}

		this._hintLine = line;
		this._editor.changeDecorations(accessor => {
			if (this._hintDecorationId) {
				accessor.removeDecoration(this._hintDecorationId);
				this._hintDecorationId = null;
			}
			if (line !== -1) {
				this._hintDecorationId = accessor.addDecoration(
					new Range(line, 1, line, 1),
					addFeedbackHintDecoration,
				);
			}
		});
	}

	private _onMouseDown(e: IEditorMouseEvent): void {
		if (!e.target.position
			|| e.target.type !== MouseTargetType.GUTTER_LINE_DECORATIONS
			|| e.target.detail.isAfterLines
			|| !this._sessionResource
		) {
			return;
		}

		const lineNumber = e.target.position.lineNumber;

		// Lines with existing feedback - do nothing
		if (this._feedbackLines.has(lineNumber)) {
			return;
		}

		// Select the line content and focus the editor
		const model = this._editor.getModel();
		if (!model) {
			return;
		}

		const startColumn = model.getLineFirstNonWhitespaceColumn(lineNumber);
		const endColumn = model.getLineLastNonWhitespaceColumn(lineNumber);
		if (startColumn === 0 || endColumn === 0) {
			// Empty line - select the whole line range
			this._editor.setSelection(new Selection(lineNumber, model.getLineMaxColumn(lineNumber), lineNumber, 1));
		} else {
			this._editor.setSelection(new Selection(lineNumber, endColumn, lineNumber, startColumn));
		}
		this._editor.focus();
	}

	override dispose(): void {
		this._feedbackDecorations.clear();
		this._updateHintDecoration(-1);
		super.dispose();
	}
}

registerEditorContribution(AgentFeedbackGlyphMarginContribution.ID, AgentFeedbackGlyphMarginContribution, EditorContributionInstantiation.Eventually);
