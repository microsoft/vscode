/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { TextModel } from 'vs/editor/common/model/textModel';
import { LanguageIdentifier } from 'vs/editor/common/modes';
import { withTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { ITextModel, IIdentifiedSingleEditOperation } from 'vs/editor/common/model';

export function testCommand(
	lines: string[],
	languageIdentifier: LanguageIdentifier,
	selection: Selection,
	commandFactory: (selection: Selection) => editorCommon.ICommand,
	expectedLines: string[],
	expectedSelection: Selection
): void {
	let model = TextModel.createFromString(lines.join('\n'), undefined, languageIdentifier);
	withTestCodeEditor(null, { model: model }, (editor, cursor) => {

		cursor.setSelections('tests', [selection]);

		cursor.trigger('tests', editorCommon.Handler.ExecuteCommand, commandFactory(cursor.getSelection()));

		assert.deepEqual(model.getLinesContent(), expectedLines);

		let actualSelection = cursor.getSelection();
		assert.deepEqual(actualSelection.toString(), expectedSelection.toString());

	});
	model.dispose();
}

/**
 * Extract edit operations if command `command` were to execute on model `model`
 */
export function getEditOperation(model: ITextModel, command: editorCommon.ICommand): IIdentifiedSingleEditOperation[] {
	var operations: IIdentifiedSingleEditOperation[] = [];
	var editOperationBuilder: editorCommon.IEditOperationBuilder = {
		addEditOperation: (range: Range, text: string) => {
			operations.push({
				range: range,
				text: text
			});
		},

		addTrackedEditOperation: (range: Range, text: string) => {
			operations.push({
				range: range,
				text: text
			});
		},


		trackSelection: (selection: Selection) => {
			return null;
		}
	};
	command.getEditOperations(model, editOperationBuilder);
	return operations;
}
