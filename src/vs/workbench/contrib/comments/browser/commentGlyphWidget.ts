/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Color } from '../../../../base/common/color.js';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidgetPosition } from '../../../../editor/browser/editorBrowser.js';
import { IModelDecorationOptions, OverviewRulerLane } from '../../../../editor/common/model.js';
import { ModelDecorationOptions } from '../../../../editor/common/model/textModel.js';
import { darken, editorBackground, editorForeground, listInactiveSelectionBackground, opaque, registerColor } from '../../../../platform/theme/common/colorRegistry.js';
import { themeColorFromId } from '../../../../platform/theme/common/themeService.js';
import { IEditorDecorationsCollection } from '../../../../editor/common/editorCommon.js';
import { CommentThreadState } from '../../../../editor/common/languages.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';

export const overviewRulerCommentingRangeForeground = registerColor('editorGutter.commentRangeForeground', { dark: opaque(listInactiveSelectionBackground, editorBackground), light: darken(opaque(listInactiveSelectionBackground, editorBackground), .05), hcDark: Color.white, hcLight: Color.black }, nls.localize('editorGutterCommentRangeForeground', 'Editor gutter decoration color for commenting ranges. This color should be opaque.'));
const overviewRulerCommentForeground = registerColor('editorOverviewRuler.commentForeground', overviewRulerCommentingRangeForeground, nls.localize('editorOverviewRuler.commentForeground', 'Editor overview ruler decoration color for resolved comments. This color should be opaque.'));
const overviewRulerCommentUnresolvedForeground = registerColor('editorOverviewRuler.commentUnresolvedForeground', overviewRulerCommentForeground, nls.localize('editorOverviewRuler.commentUnresolvedForeground', 'Editor overview ruler decoration color for unresolved comments. This color should be opaque.'));
const overviewRulerCommentDraftForeground = registerColor('editorOverviewRuler.commentDraftForeground', overviewRulerCommentUnresolvedForeground, nls.localize('editorOverviewRuler.commentDraftForeground', 'Editor overview ruler decoration color for comment threads with draft comments. This color should be opaque.'));

const editorGutterCommentGlyphForeground = registerColor('editorGutter.commentGlyphForeground', { dark: editorForeground, light: editorForeground, hcDark: Color.black, hcLight: Color.white }, nls.localize('editorGutterCommentGlyphForeground', 'Editor gutter decoration color for commenting glyphs.'));
registerColor('editorGutter.commentUnresolvedGlyphForeground', editorGutterCommentGlyphForeground, nls.localize('editorGutterCommentUnresolvedGlyphForeground', 'Editor gutter decoration color for commenting glyphs for unresolved comment threads.'));
registerColor('editorGutter.commentDraftGlyphForeground', editorGutterCommentGlyphForeground, nls.localize('editorGutterCommentDraftGlyphForeground', 'Editor gutter decoration color for commenting glyphs for comment threads with draft comments.'));

export class CommentGlyphWidget extends Disposable {
	public static description = 'comment-glyph-widget';
	private _lineNumber!: number;
	private _editor: ICodeEditor;
	private _threadState: CommentThreadState | undefined;
	private _threadHasDraft: boolean = false;
	private readonly _commentsDecorations: IEditorDecorationsCollection;
	private _commentsOptions: ModelDecorationOptions;

	private readonly _onDidChangeLineNumber = this._register(new Emitter<number>());
	public readonly onDidChangeLineNumber = this._onDidChangeLineNumber.event;

	constructor(editor: ICodeEditor, lineNumber: number) {
		super();
		this._commentsOptions = this.createDecorationOptions();
		this._editor = editor;
		this._commentsDecorations = this._editor.createDecorationsCollection();
		this._register(this._commentsDecorations.onDidChange(e => {
			const range = (this._commentsDecorations.length > 0 ? this._commentsDecorations.getRange(0) : null);
			if (range && range.endLineNumber !== this._lineNumber) {
				this._lineNumber = range.endLineNumber;
				this._onDidChangeLineNumber.fire(this._lineNumber);
			}
		}));
		this._register(toDisposable(() => this._commentsDecorations.clear()));
		this.setLineNumber(lineNumber);
	}

	private createDecorationOptions(): ModelDecorationOptions {
		// Priority: draft > unresolved > resolved
		let className: string;
		if (this._threadHasDraft) {
			className = 'comment-range-glyph comment-thread-draft';
		} else {
			const unresolved = this._threadState === CommentThreadState.Unresolved;
			className = `comment-range-glyph comment-thread${unresolved ? '-unresolved' : ''}`;
		}

		const decorationOptions: IModelDecorationOptions = {
			description: CommentGlyphWidget.description,
			isWholeLine: true,
			overviewRuler: {
				color: themeColorFromId(this._threadHasDraft ? overviewRulerCommentDraftForeground :
					(this._threadState === CommentThreadState.Unresolved ? overviewRulerCommentUnresolvedForeground : overviewRulerCommentForeground)),
				position: OverviewRulerLane.Center
			},
			collapseOnReplaceEdit: true,
			linesDecorationsClassName: className
		};

		return ModelDecorationOptions.createDynamic(decorationOptions);
	}

	setThreadState(state: CommentThreadState | undefined, hasDraft: boolean = false): void {
		if (this._threadState !== state || this._threadHasDraft !== hasDraft) {
			this._threadState = state;
			this._threadHasDraft = hasDraft;
			this._commentsOptions = this.createDecorationOptions();
			this._updateDecorations();
		}
	}

	private _updateDecorations(): void {
		const commentsDecorations = [{
			range: {
				startLineNumber: this._lineNumber, startColumn: 1,
				endLineNumber: this._lineNumber, endColumn: 1
			},
			options: this._commentsOptions
		}];

		this._commentsDecorations.set(commentsDecorations);
	}

	setLineNumber(lineNumber: number): void {
		this._lineNumber = lineNumber;
		this._updateDecorations();
	}

	getPosition(): IContentWidgetPosition {
		const range = (this._commentsDecorations.length > 0 ? this._commentsDecorations.getRange(0) : null);

		return {
			position: {
				lineNumber: range ? range.endLineNumber : this._lineNumber,
				column: 1
			},
			preference: [ContentWidgetPositionPreference.EXACT]
		};
	}
}
