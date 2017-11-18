/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { Model } from 'vs/editor/common/model/model';
import { LanguageIdentifier } from 'vs/editor/common/modes';
import { withTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';

export function testCommand(
	lines: string[],
	languageIdentifier: LanguageIdentifier,
	selection: Selection,
	commandFactory: (selection: Selection) => editorCommon.ICommand,
	expectedLines: string[],
	expectedSelection: Selection
): void {
	let model = Model.createFromString(lines.join('\n'), undefined, languageIdentifier);
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
export function getEditOperation(model: editorCommon.IModel, command: editorCommon.ICommand): editorCommon.IIdentifiedSingleEditOperation[] {
	var operations: editorCommon.IIdentifiedSingleEditOperation[] = [];
	var editOperationBuilder: editorCommon.IEditOperationBuilder = {
		addEditOperation: (range: Range, text: string) => {
			operations.push({
				identifier: null,
				range: range,
				text: text,
				forceMoveMarkers: false
			});
		},

		addTrackedEditOperation: (range: Range, text: string) => {
			operations.push({
				identifier: null,
				range: range,
				text: text,
				forceMoveMarkers: false
			});
		},


		trackSelection: (selection: Selection) => {
			return null;
		}
	};
	command.getEditOperations(model, editOperationBuilder);
	return operations;
}
