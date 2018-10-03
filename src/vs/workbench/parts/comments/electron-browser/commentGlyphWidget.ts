/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor, IContentWidgetPosition, ContentWidgetPositionPreference } from 'vs/editor/browser/editorBrowser';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';

export class CommentGlyphWidget {
	private _lineNumber: number;
	private _editor: ICodeEditor;
	private commentsDecorations: string[] = [];
	private _commentsOptions: ModelDecorationOptions;


	constructor(editor: ICodeEditor, lineNumber: number, commentsOptions: ModelDecorationOptions, onClick: () => void) {
		this._commentsOptions = commentsOptions;
		this._lineNumber = lineNumber;
		this._editor = editor;
		this.update();
	}

	update() {
		let commentsDecorations = [{
			range: {
				startLineNumber: this._lineNumber, startColumn: 1,
				endLineNumber: this._lineNumber, endColumn: 1
			},
			options: this._commentsOptions
		}];

		this.commentsDecorations = this._editor.deltaDecorations(this.commentsDecorations, commentsDecorations);
	}

	setLineNumber(lineNumber: number): void {
		this._lineNumber = lineNumber;
		this.update();
	}

	getPosition(): IContentWidgetPosition {
		return {
			position: {
				lineNumber: this._lineNumber,
				column: 1
			},
			preference: [ContentWidgetPositionPreference.EXACT]
		};
	}

	dispose() {
		if (this.commentsDecorations) {
			this._editor.deltaDecorations(this.commentsDecorations, []);
		}
	}
}