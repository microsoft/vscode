/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { getLeadingWhitespace } from 'vs/base/common/strings';
import { ICommonCodeEditor, IModel } from 'vs/editor/common/editorCommon';
import { TextmateSnippet } from '../common/snippetParser';


export class SnippetSession {

	private readonly _editor: ICommonCodeEditor;
	private readonly _model: IModel;
	private readonly _snippets: TextmateSnippet[] = [];

	constructor(editor: ICommonCodeEditor, snippet: TextmateSnippet) {
		this._editor = editor;
		this._model = editor.getModel();

		for (const selection of editor.getSelections()) {
			// for each selection get the leading 'reference' whitespace and
			// adjust the snippet accordingly. this makes one snippet per selection/cursor
			const line = this._model.getLineContent(selection.startLineNumber);
			const leadingWhitespace = getLeadingWhitespace(line, 0, selection.startColumn - 1);
			const newSnippet = snippet.withIndentation(whitespace => this._model.normalizeIndentation(leadingWhitespace + whitespace));
			this._snippets.push(newSnippet);

			// const offset = this._model.getOffsetAt(selection.getStartPosition());
			// for (const placeholder of snippet.getPlaceholders()) {
			// 	const pos = this._model.getPositionAt(offset + snippet.offset(placeholder));
			// 	this._model.deltaDecorations
			// }
		}
	}
}
