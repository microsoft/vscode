/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Cursor } from 'vs/editor/common/controller/cursor';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { IIdentifiedSingleEditOperation } from 'vs/editor/common/editorCommon';
import { Model } from 'vs/editor/common/model/model';
import { ILineEdit, ModelLine, LineMarker, MarkersTracker } from 'vs/editor/common/model/modelLine';
import { MockConfiguration } from 'vs/editor/test/common/mocks/mockConfiguration';
import { viewModelHelper } from 'vs/editor/test/common/editorTestUtils';

const NO_TAB_SIZE = 0;

function testCommand(lines: string[], selections: Selection[], edits: IIdentifiedSingleEditOperation[], expectedLines: string[], expectedSelections: Selection[]): void {
	let model = Model.createFromString(lines.join('\n'));
	let config = new MockConfiguration(null);
	let cursor = new Cursor(config, model, viewModelHelper(model), false);

	cursor.setSelections('tests', selections);

	model.applyEdits(edits);

	let actualValue = model.toRawText().lines;
	assert.deepEqual(actualValue, expectedLines);

	let actualSelections = cursor.getSelections();
	assert.deepEqual(actualSelections.map(s => s.toString()), expectedSelections.map(s => s.toString()));

	cursor.dispose();
	config.dispose();
	model.dispose();
}

function testLineEditMarker(text: string, column: number, stickToPreviousCharacter: boolean, edit: ILineEdit, expectedColumn: number): void {
	var line = new ModelLine(1, text, NO_TAB_SIZE);
	line.addMarker(new LineMarker('1', 0, new Position(0, column), stickToPreviousCharacter));

	line.applyEdits(new MarkersTracker(), [edit], NO_TAB_SIZE);

	assert.equal(line.getMarkers()[0].position.column, expectedColumn);
}

suite('Editor Side Editing - collapsed selection', () => {

	test('replace at selection', () => {
		testCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth'
			],
			[new Selection(1, 1, 1, 1)],
			[
				EditOperation.replace(new Selection(1, 1, 1, 1), 'something ')
			],
			[
				'something first',
				'second line',
				'third line',
				'fourth'
			],
			[new Selection(1, 1, 1, 11)]
		);
	});

	test('replace at selection 2', () => {
		testCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth'
			],
			[new Selection(1, 1, 1, 6)],
			[
				EditOperation.replace(new Selection(1, 1, 1, 6), 'something')
			],
			[
				'something',
				'second line',
				'third line',
				'fourth'
			],
			[new Selection(1, 1, 1, 10)]
		);
	});

	test('ModelLine.applyEdits uses `isReplace`', () => {
		testLineEditMarker('something', 1, true, { startColumn: 1, endColumn: 1, text: 'asd', forceMoveMarkers: false }, 1);
		testLineEditMarker('something', 1, true, { startColumn: 1, endColumn: 1, text: 'asd', forceMoveMarkers: true }, 4);

		testLineEditMarker('something', 1, false, { startColumn: 1, endColumn: 1, text: 'asd', forceMoveMarkers: false }, 4);
		testLineEditMarker('something', 1, false, { startColumn: 1, endColumn: 1, text: 'asd', forceMoveMarkers: true }, 4);
	});

	test('insert at selection', () => {
		testCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth'
			],
			[new Selection(1, 1, 1, 1)],
			[
				EditOperation.insert(new Position(1, 1), 'something ')
			],
			[
				'something first',
				'second line',
				'third line',
				'fourth'
			],
			[new Selection(1, 11, 1, 11)]
		);
	});

	test('insert at selection sitting on max column', () => {
		testCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth'
			],
			[new Selection(1, 6, 1, 6)],
			[
				EditOperation.insert(new Position(1, 6), ' something\nnew ')
			],
			[
				'first something',
				'new ',
				'second line',
				'third line',
				'fourth'
			],
			[new Selection(2, 5, 2, 5)]
		);
	});

	test('issue #3994: replace on top of selection', () => {
		testCommand(
			[
				'$obj = New-Object "system.col"'
			],
			[new Selection(1, 30, 1, 30)],
			[
				EditOperation.replaceMove(new Range(1, 19, 1, 31), '"System.Collections"')
			],
			[
				'$obj = New-Object "System.Collections"'
			],
			[new Selection(1, 39, 1, 39)]
		);
	});

	test('issue #15267: Suggestion that adds a line - cursor goes to the wrong line ', () => {
		testCommand(
			[
				'package main',
				'',
				'import (',
				'	"fmt"',
				')',
				'',
				'func main(',
				'	fmt.Println(strings.Con)',
				'}'
			],
			[new Selection(8, 25, 8, 25)],
			[
				EditOperation.replaceMove(new Range(5, 1, 5, 1), '\t\"strings\"\n')
			],
			[
				'package main',
				'',
				'import (',
				'	"fmt"',
				'	"strings"',
				')',
				'',
				'func main(',
				'	fmt.Println(strings.Con)',
				'}'
			],
			[new Selection(9, 25, 9, 25)]
		);
	});

	test('issue #15236: Selections broke after deleting text using vscode.TextEditor.edit ', () => {
		testCommand(
			[
				'foofoofoo, foofoofoo, bar'
			],
			[new Selection(1, 1, 1, 10), new Selection(1, 12, 1, 21)],
			[
				EditOperation.replace(new Range(1, 1, 1, 10), ''),
				EditOperation.replace(new Range(1, 12, 1, 21), ''),
			],
			[
				', , bar'
			],
			[new Selection(1, 1, 1, 1), new Selection(1, 3, 1, 3)]
		);
	});

});