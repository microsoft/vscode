/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {Cursor} from 'vs/editor/common/controller/cursor';
import {Range} from 'vs/editor/common/core/range';
import {Selection} from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {Model} from 'vs/editor/common/model/model';
import {IMode} from 'vs/editor/common/modes';
import {MockConfiguration} from 'vs/editor/test/common/mocks/mockConfiguration';

export function testCommand(
	lines: string[],
	mode: IMode,
	selection: Selection,
	commandFactory: (selection:Selection) => editorCommon.ICommand,
	expectedLines: string[],
	expectedSelection: Selection
): void {

	let model = new Model(lines.join('\n'), Model.DEFAULT_CREATION_OPTIONS, mode);
	let config = new MockConfiguration(null);
	let cursor = new Cursor(0, config, model, null, false);

	cursor.setSelections('tests', [selection]);

	cursor.configuration.handlerDispatcher.trigger('tests', editorCommon.Handler.ExecuteCommand, commandFactory(cursor.getSelection()));

	let actualValue = model.toRawText().lines;
	assert.deepEqual(actualValue, expectedLines);

	let actualSelection = cursor.getSelection();
	assert.deepEqual(actualSelection.toString(), expectedSelection.toString());

	cursor.dispose();
	config.dispose();
	model.dispose();
}

/**
 * Extract edit operations if command `command` were to execute on model `model`
 */
export function getEditOperation(model: editorCommon.IModel, command: editorCommon.ICommand): editorCommon.IIdentifiedSingleEditOperation[] {
	var operations: editorCommon.IIdentifiedSingleEditOperation[] = [];
	var editOperationBuilder: editorCommon.IEditOperationBuilder = {
		addEditOperation: (range: editorCommon.IEditorRange, text: string) => {
			operations.push({
				identifier: null,
				range: range,
				text: text,
				forceMoveMarkers: false
			});
		},

		trackSelection: (selection: editorCommon.IEditorSelection) => {
			return null;
		}
	};
	command.getEditOperations(model, editOperationBuilder);
	return operations;
}

/**
 * Create single edit operation
 */
export function createSingleEditOp(text:string, positionLineNumber:number, positionColumn:number, selectionLineNumber:number = positionLineNumber, selectionColumn:number = positionColumn):editorCommon.IIdentifiedSingleEditOperation {
	return {
		identifier: null,
		range: new Range(selectionLineNumber, selectionColumn, positionLineNumber, positionColumn),
		text: text,
		forceMoveMarkers: false
	};
}

/**
 * Create single edit operation
 */
export function createInsertDeleteSingleEditOp(text:string, positionLineNumber:number, positionColumn:number, selectionLineNumber:number = positionLineNumber, selectionColumn:number = positionColumn):editorCommon.IIdentifiedSingleEditOperation {
	return {
		identifier: null,
		range: new Range(selectionLineNumber, selectionColumn, positionLineNumber, positionColumn),
		text: text,
		forceMoveMarkers: true
	};
}
