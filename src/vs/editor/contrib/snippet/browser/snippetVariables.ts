/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { basename, dirname } from 'vs/base/common/paths';
import { IModel } from 'vs/editor/common/editorCommon';
import { Selection } from 'vs/editor/common/core/selection';

export class EditorSnippetVariableResolver {

	static readonly VariableNames = Object.freeze({
		'SELECTION': true,
		'TM_SELECTED_TEXT': true,
		'TM_CURRENT_LINE': true,
		'TM_CURRENT_WORD': true,
		'TM_LINE_INDEX': true,
		'TM_LINE_NUMBER': true,
		'TM_FILENAME': true,
		'TM_DIRECTORY': true,
		'TM_FILEPATH': true,
	});

	constructor(
		private readonly _model: IModel,
		private readonly _selection: Selection
	) {
		//
	}

	resolve(name: string): string {
		if (name === 'SELECTION' || name === 'TM_SELECTED_TEXT') {
			return this._model.getValueInRange(this._selection) || undefined;

		} else if (name === 'TM_CURRENT_LINE') {
			return this._model.getLineContent(this._selection.positionLineNumber);

		} else if (name === 'TM_CURRENT_WORD') {
			const info = this._model.getWordAtPosition({
				lineNumber: this._selection.positionLineNumber,
				column: this._selection.positionColumn
			});
			return info && info.word || undefined;

		} else if (name === 'TM_LINE_INDEX') {
			return String(this._selection.positionLineNumber - 1);

		} else if (name === 'TM_LINE_NUMBER') {
			return String(this._selection.positionLineNumber);

		} else if (name === 'TM_FILENAME') {
			return basename(this._model.uri.fsPath);

		} else if (name === 'TM_DIRECTORY') {
			const dir = dirname(this._model.uri.fsPath);
			return dir !== '.' ? dir : '';

		} else if (name === 'TM_FILEPATH') {
			return this._model.uri.fsPath;

		} else {
			return undefined;
		}
	}
}
