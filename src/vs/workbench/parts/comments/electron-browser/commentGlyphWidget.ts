/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ICodeEditor, IContentWidget, IContentWidgetPosition, ContentWidgetPositionPreference } from 'vs/editor/browser/editorBrowser';

export class CommentGlyphWidget implements IContentWidget {
	private _id: string;
	private _lineNumber: number;
	private _domNode: HTMLDivElement;
	private _editor: ICodeEditor;

	constructor(id: string, editor: ICodeEditor, lineNumber: number, onClick: () => void) {
		this._id = id;
		this._domNode = document.createElement('div');
		this._domNode.className = 'new-comment-hint';
		this._domNode.addEventListener('click', onClick);

		this._lineNumber = lineNumber;

		this._editor = editor;
		this._editor.addContentWidget(this);

	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getId(): string {
		return this._id;
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
}