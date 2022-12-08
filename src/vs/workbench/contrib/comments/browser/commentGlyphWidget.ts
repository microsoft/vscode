/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Color } from 'vs/base/common/color';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { IModelDecorationOptions, OverviewRulerLane } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { darken, listInactiveSelectionBackground, registerColor } from 'vs/platform/theme/common/colorRegistry';
import { themeColorFromId } from 'vs/platform/theme/common/themeService';
import { IEditorDecorationsCollection } from 'vs/editor/common/editorCommon';

export const overviewRulerCommentingRangeForeground = registerColor('editorGutter.commentRangeForeground', { dark: listInactiveSelectionBackground, light: darken(listInactiveSelectionBackground, .05), hcDark: Color.white, hcLight: Color.black }, nls.localize('editorGutterCommentRangeForeground', 'Editor gutter decoration color for commenting ranges.'));

export class CommentGlyphWidget {
	public static description = 'comment-glyph-widget';
	private _lineNumber!: number;
	private _editor: ICodeEditor;
	private readonly _commentsDecorations: IEditorDecorationsCollection;
	private _commentsOptions: ModelDecorationOptions;

	constructor(editor: ICodeEditor, lineNumber: number) {
		this._commentsOptions = this.createDecorationOptions();
		this._editor = editor;
		this._commentsDecorations = this._editor.createDecorationsCollection();
		this.setLineNumber(lineNumber);
	}

	private createDecorationOptions(): ModelDecorationOptions {
		const decorationOptions: IModelDecorationOptions = {
			description: CommentGlyphWidget.description,
			isWholeLine: true,
			overviewRuler: {
				color: themeColorFromId(overviewRulerCommentingRangeForeground),
				position: OverviewRulerLane.Center
			},
			collapseOnReplaceEdit: true,
			linesDecorationsClassName: `comment-range-glyph comment-thread`
		};

		return ModelDecorationOptions.createDynamic(decorationOptions);
	}

	setLineNumber(lineNumber: number): void {
		this._lineNumber = lineNumber;
		const commentsDecorations = [{
			range: {
				startLineNumber: lineNumber, startColumn: 1,
				endLineNumber: lineNumber, endColumn: 1
			},
			options: this._commentsOptions
		}];

		this._commentsDecorations.set(commentsDecorations);
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

	dispose() {
		this._commentsDecorations.clear();
	}
}
