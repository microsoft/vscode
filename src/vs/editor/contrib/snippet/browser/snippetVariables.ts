/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { basename, dirname } from 'vs/base/common/paths';
import { IModel } from 'vs/editor/common/editorCommon';
import { Selection } from 'vs/editor/common/core/selection';
import { VariableResolver, Variable, Text } from 'vs/editor/contrib/snippet/browser/snippetParser';
import { getLeadingWhitespace, commonPrefixLength } from 'vs/base/common/strings';

export class EditorSnippetVariableResolver implements VariableResolver {

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

	resolve(variable: Variable): string {

		const { name } = variable;

		if (name === 'SELECTION' || name === 'TM_SELECTED_TEXT') {
			let value = this._model.getValueInRange(this._selection) || undefined;
			if (value && this._selection.startLineNumber !== this._selection.endLineNumber) {
				// Selection is a multiline string which we indentation we now
				// need to adjust. We compare the indentation of this variable
				// with the indentation at the editor position and add potential
				// extra indentation to the value

				const line = this._model.getLineContent(this._selection.startLineNumber);
				const lineLeadingWhitespace = getLeadingWhitespace(line, 0, this._selection.startColumn - 1);

				let varLeadingWhitespace = lineLeadingWhitespace;
				variable.snippet.walk(marker => {
					if (marker === variable) {
						return false;
					}
					if (marker instanceof Text) {
						varLeadingWhitespace = getLeadingWhitespace(marker.value.split(/\r\n|\r|\n/).pop());
					}
					return true;
				});
				const whitespaceCommonLength = commonPrefixLength(varLeadingWhitespace, lineLeadingWhitespace);

				value = value.replace(
					/(\r\n|\r|\n)(.*)/g,
					(m, newline, rest) => `${newline}${varLeadingWhitespace.substr(whitespaceCommonLength)}${rest}`
				);
			}
			return value;

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
