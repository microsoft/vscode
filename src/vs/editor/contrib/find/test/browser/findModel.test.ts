/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CoreNavigationCommands } from '../../../../browser/coreCommands.js';
import { IActiveCodeEditor, ICodeEditor } from '../../../../browser/editorBrowser.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { Selection } from '../../../../common/core/selection.js';
import { PieceTreeTextBufferBuilder } from '../../../../common/model/pieceTreeTextBuffer/pieceTreeTextBufferBuilder.js';
import { FindModelBoundToEditorModel } from '../../browser/findModel.js';
import { FindReplaceState } from '../../browser/findState.js';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';

suite('FindModel', () => {

	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function findTest(testName: string, callback: (editor: IActiveCodeEditor) => void): void {
		test(testName, () => {
			const textArr = [
				'// my cool header',
				'#include "cool.h"',
				'#include <iostream>',
				'',
				'int main() {',
				'    cout << "hello world, Hello!" << endl;',
				'    cout << "hello world again" << endl;',
				'    cout << "Hello world again" << endl;',
				'    cout << "helloworld again" << endl;',
				'}',
				'// blablablaciao',
				''
			];
			withTestCodeEditor(textArr, {}, (editor) => callback(editor as IActiveCodeEditor));

			const text = textArr.join('\n');
			const ptBuilder = new PieceTreeTextBufferBuilder();
			ptBuilder.acceptChunk(text.substr(0, 94));
			ptBuilder.acceptChunk(text.substr(94, 101));
			ptBuilder.acceptChunk(text.substr(195, 59));
			const factory = ptBuilder.finish();
			withTestCodeEditor(
				factory,
				{},
				(editor) => callback(editor as IActiveCodeEditor)
			);
		});
	}

	function fromRange(rng: Range): number[] {
		return [rng.startLineNumber, rng.startColumn, rng.endLineNumber, rng.endColumn];
	}

	function _getFindState(editor: ICodeEditor) {
		const model = editor.getModel()!;
		const currentFindMatches: Range[] = [];
		const allFindMatches: Range[] = [];

		for (const dec of model.getAllDecorations()) {
			if (dec.options.className === 'currentFindMatch') {
				currentFindMatches.push(dec.range);
				allFindMatches.push(dec.range);
			} else if (dec.options.className === 'findMatch') {
				allFindMatches.push(dec.range);
			}
		}

		currentFindMatches.sort(Range.compareRangesUsingStarts);
		allFindMatches.sort(Range.compareRangesUsingStarts);

		return {
			highlighted: currentFindMatches.map(fromRange),
			findDecorations: allFindMatches.map(fromRange)
		};
	}

	function assertFindState(editor: ICodeEditor, cursor: number[], highlighted: number[] | null, findDecorations: number[][]): void {
		assert.deepStrictEqual(fromRange(editor.getSelection()!), cursor, 'cursor');

		const expectedState = {
			highlighted: highlighted ? [highlighted] : [],
			findDecorations: findDecorations
		};
		assert.deepStrictEqual(_getFindState(editor), expectedState, 'state');
	}

	findTest('incremental find from beginning of file', (editor) => {
		editor.setPosition({ lineNumber: 1, column: 1 });
		const findState = disposables.add(new FindReplaceState());
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		// simulate typing the search string
		findState.change({ searchString: 'H' }, true);
		assertFindState(
			editor,
			[1, 12, 1, 13],
			[1, 12, 1, 13],
			[
				[1, 12, 1, 13],
				[2, 16, 2, 17],
				[6, 14, 6, 15],
				[6, 27, 6, 28],
				[7, 14, 7, 15],
				[8, 14, 8, 15],
				[9, 14, 9, 15]
			]
		);

		// simulate typing the search string
		findState.change({ searchString: 'He' }, true);
		assertFindState(
			editor,
			[1, 12, 1, 14],
			[1, 12, 1, 14],
			[
				[1, 12, 1, 14],
				[6, 14, 6, 16],
				[6, 27, 6, 29],
				[7, 14, 7, 16],
				[8, 14, 8, 16],
				[9, 14, 9, 16]
			]
		);

		// simulate typing the search string
		findState.change({ searchString: 'Hello' }, true);
		assertFindState(
			editor,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19],
				[9, 14, 9, 19]
			]
		);

		// simulate toggling on `matchCase`
		findState.change({ matchCase: true }, true);
		assertFindState(
			editor,
			[6, 27, 6, 32],
			[6, 27, 6, 32],
			[
				[6, 27, 6, 32],
				[8, 14, 8, 19]
			]
		);

		// simulate typing the search string
		findState.change({ searchString: 'hello' }, true);
		assertFindState(
			editor,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
				[9, 14, 9, 19]
			]
		);

		// simulate toggling on `wholeWord`
		findState.change({ wholeWord: true }, true);
		assertFindState(
			editor,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19]
			]
		);

		// simulate toggling off `matchCase`
		findState.change({ matchCase: false }, true);
		assertFindState(
			editor,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		// simulate toggling off `wholeWord`
		findState.change({ wholeWord: false }, true);
		assertFindState(
			editor,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19],
				[9, 14, 9, 19]
			]
		);

		// simulate adding a search scope
		findState.change({ searchScope: [new Range(8, 1, 10, 1)] }, true);
		assertFindState(
			editor,
			[8, 14, 8, 19],
			[8, 14, 8, 19],
			[
				[8, 14, 8, 19],
				[9, 14, 9, 19]
			]
		);

		// simulate removing the search scope
		findState.change({ searchScope: null }, true);
		assertFindState(
			editor,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19],
				[9, 14, 9, 19]
			]
		);

		findModel.dispose();
		findState.dispose();
	});

	findTest('find model removes its decorations', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'hello' }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assert.strictEqual(findState.matchesCount, 5);
		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19],
				[9, 14, 9, 19]
			]
		);

		findModel.dispose();
		findState.dispose();

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[]
		);
	});

	findTest('find model updates state matchesCount', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'hello' }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assert.strictEqual(findState.matchesCount, 5);
		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19],
				[9, 14, 9, 19]
			]
		);

		findState.change({ searchString: 'helloo' }, false);
		assert.strictEqual(findState.matchesCount, 0);
		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[]
		);

		findModel.dispose();
		findState.dispose();
	});

	findTest('find model reacts to position change', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'hello' }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19],
				[9, 14, 9, 19]
			]
		);

		editor.trigger('mouse', CoreNavigationCommands.MoveTo.id, {
			position: new Position(6, 20)
		});

		assertFindState(
			editor,
			[6, 20, 6, 20],
			null,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19],
				[9, 14, 9, 19]
			]
		);

		findState.change({ searchString: 'Hello' }, true);
		assertFindState(
			editor,
			[6, 27, 6, 32],
			[6, 27, 6, 32],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19],
				[9, 14, 9, 19]
			]
		);

		findModel.dispose();
		findState.dispose();
	});

	findTest('find model next', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'hello', wholeWord: true }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.moveToNextMatch();
		assertFindState(
			editor,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.moveToNextMatch();
		assertFindState(
			editor,
			[6, 27, 6, 32],
			[6, 27, 6, 32],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.moveToNextMatch();
		assertFindState(
			editor,
			[7, 14, 7, 19],
			[7, 14, 7, 19],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.moveToNextMatch();
		assertFindState(
			editor,
			[8, 14, 8, 19],
			[8, 14, 8, 19],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.moveToNextMatch();
		assertFindState(
			editor,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.dispose();
		findState.dispose();
	});

	findTest('find model next stays in scope', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'hello', wholeWord: true, searchScope: [new Range(7, 1, 9, 1)] }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.moveToNextMatch();
		assertFindState(
			editor,
			[7, 14, 7, 19],
			[7, 14, 7, 19],
			[
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.moveToNextMatch();
		assertFindState(
			editor,
			[8, 14, 8, 19],
			[8, 14, 8, 19],
			[
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.moveToNextMatch();
		assertFindState(
			editor,
			[7, 14, 7, 19],
			[7, 14, 7, 19],
			[
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.dispose();
		findState.dispose();
	});

	findTest('multi-selection find model next stays in scope (overlap)', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'hello', wholeWord: true, searchScope: [new Range(7, 1, 8, 2), new Range(8, 1, 9, 1)] }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.moveToNextMatch();
		assertFindState(
			editor,
			[7, 14, 7, 19],
			[7, 14, 7, 19],
			[
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.moveToNextMatch();
		assertFindState(
			editor,
			[8, 14, 8, 19],
			[8, 14, 8, 19],
			[
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.moveToNextMatch();
		assertFindState(
			editor,
			[7, 14, 7, 19],
			[7, 14, 7, 19],
			[
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.dispose();
		findState.dispose();
	});

	findTest('multi-selection find model next stays in scope', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'hello', matchCase: true, wholeWord: false, searchScope: [new Range(6, 1, 7, 38), new Range(9, 3, 9, 38)] }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[6, 14, 6, 19],
				// `matchCase: false` would
				// find this match as well:
				// [6, 27, 6, 32],
				[7, 14, 7, 19],
				// `wholeWord: true` would
				// exclude this match:
				[9, 14, 9, 19],
			]
		);

		findModel.moveToNextMatch();
		assertFindState(
			editor,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
				[9, 14, 9, 19],
			]
		);

		findModel.moveToNextMatch();
		assertFindState(
			editor,
			[7, 14, 7, 19],
			[7, 14, 7, 19],
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
				[9, 14, 9, 19],
			]
		);

		findModel.moveToNextMatch();
		assertFindState(
			editor,
			[9, 14, 9, 19],
			[9, 14, 9, 19],
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
				[9, 14, 9, 19],
			]
		);

		findModel.moveToNextMatch();
		assertFindState(
			editor,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
				[9, 14, 9, 19],
			]
		);

		findModel.dispose();
		findState.dispose();
	});

	findTest('find model prev', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'hello', wholeWord: true }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.moveToPrevMatch();
		assertFindState(
			editor,
			[8, 14, 8, 19],
			[8, 14, 8, 19],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.moveToPrevMatch();
		assertFindState(
			editor,
			[7, 14, 7, 19],
			[7, 14, 7, 19],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.moveToPrevMatch();
		assertFindState(
			editor,
			[6, 27, 6, 32],
			[6, 27, 6, 32],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.moveToPrevMatch();
		assertFindState(
			editor,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.moveToPrevMatch();
		assertFindState(
			editor,
			[8, 14, 8, 19],
			[8, 14, 8, 19],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.dispose();
		findState.dispose();
	});

	findTest('find model prev stays in scope', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'hello', wholeWord: true, searchScope: [new Range(7, 1, 9, 1)] }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.moveToPrevMatch();
		assertFindState(
			editor,
			[8, 14, 8, 19],
			[8, 14, 8, 19],
			[
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.moveToPrevMatch();
		assertFindState(
			editor,
			[7, 14, 7, 19],
			[7, 14, 7, 19],
			[
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.moveToPrevMatch();
		assertFindState(
			editor,
			[8, 14, 8, 19],
			[8, 14, 8, 19],
			[
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.dispose();
		findState.dispose();
	});

	findTest('find model next/prev with no matches', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'helloo', wholeWord: true }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[]
		);

		findModel.moveToNextMatch();
		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[]
		);

		findModel.moveToPrevMatch();
		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[]
		);

		findModel.dispose();
		findState.dispose();
	});

	findTest('find model next/prev respects cursor position', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'hello', wholeWord: true }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		editor.trigger('mouse', CoreNavigationCommands.MoveTo.id, {
			position: new Position(6, 20)
		});
		assertFindState(
			editor,
			[6, 20, 6, 20],
			null,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.moveToNextMatch();
		assertFindState(
			editor,
			[6, 27, 6, 32],
			[6, 27, 6, 32],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.dispose();
		findState.dispose();
	});

	findTest('find ^', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: '^', isRegex: true }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[1, 1, 1, 1],
				[2, 1, 2, 1],
				[3, 1, 3, 1],
				[4, 1, 4, 1],
				[5, 1, 5, 1],
				[6, 1, 6, 1],
				[7, 1, 7, 1],
				[8, 1, 8, 1],
				[9, 1, 9, 1],
				[10, 1, 10, 1],
				[11, 1, 11, 1],
				[12, 1, 12, 1],
			]
		);

		findModel.moveToNextMatch();
		assertFindState(
			editor,
			[2, 1, 2, 1],
			[2, 1, 2, 1],
			[
				[1, 1, 1, 1],
				[2, 1, 2, 1],
				[3, 1, 3, 1],
				[4, 1, 4, 1],
				[5, 1, 5, 1],
				[6, 1, 6, 1],
				[7, 1, 7, 1],
				[8, 1, 8, 1],
				[9, 1, 9, 1],
				[10, 1, 10, 1],
				[11, 1, 11, 1],
				[12, 1, 12, 1],
			]
		);

		findModel.moveToNextMatch();
		assertFindState(
			editor,
			[3, 1, 3, 1],
			[3, 1, 3, 1],
			[
				[1, 1, 1, 1],
				[2, 1, 2, 1],
				[3, 1, 3, 1],
				[4, 1, 4, 1],
				[5, 1, 5, 1],
				[6, 1, 6, 1],
				[7, 1, 7, 1],
				[8, 1, 8, 1],
				[9, 1, 9, 1],
				[10, 1, 10, 1],
				[11, 1, 11, 1],
				[12, 1, 12, 1],
			]
		);

		findModel.dispose();
		findState.dispose();
	});

	findTest('find $', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: '$', isRegex: true }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[1, 18, 1, 18],
				[2, 18, 2, 18],
				[3, 20, 3, 20],
				[4, 1, 4, 1],
				[5, 13, 5, 13],
				[6, 43, 6, 43],
				[7, 41, 7, 41],
				[8, 41, 8, 41],
				[9, 40, 9, 40],
				[10, 2, 10, 2],
				[11, 17, 11, 17],
				[12, 1, 12, 1],
			]
		);

		findModel.moveToNextMatch();
		assertFindState(
			editor,
			[1, 18, 1, 18],
			[1, 18, 1, 18],
			[
				[1, 18, 1, 18],
				[2, 18, 2, 18],
				[3, 20, 3, 20],
				[4, 1, 4, 1],
				[5, 13, 5, 13],
				[6, 43, 6, 43],
				[7, 41, 7, 41],
				[8, 41, 8, 41],
				[9, 40, 9, 40],
				[10, 2, 10, 2],
				[11, 17, 11, 17],
				[12, 1, 12, 1],
			]
		);

		findModel.moveToNextMatch();
		assertFindState(
			editor,
			[2, 18, 2, 18],
			[2, 18, 2, 18],
			[
				[1, 18, 1, 18],
				[2, 18, 2, 18],
				[3, 20, 3, 20],
				[4, 1, 4, 1],
				[5, 13, 5, 13],
				[6, 43, 6, 43],
				[7, 41, 7, 41],
				[8, 41, 8, 41],
				[9, 40, 9, 40],
				[10, 2, 10, 2],
				[11, 17, 11, 17],
				[12, 1, 12, 1],
			]
		);

		findModel.moveToNextMatch();
		assertFindState(
			editor,
			[3, 20, 3, 20],
			[3, 20, 3, 20],
			[
				[1, 18, 1, 18],
				[2, 18, 2, 18],
				[3, 20, 3, 20],
				[4, 1, 4, 1],
				[5, 13, 5, 13],
				[6, 43, 6, 43],
				[7, 41, 7, 41],
				[8, 41, 8, 41],
				[9, 40, 9, 40],
				[10, 2, 10, 2],
				[11, 17, 11, 17],
				[12, 1, 12, 1],
			]
		);

		findModel.dispose();
		findState.dispose();
	});

	findTest('find next ^$', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: '^$', isRegex: true }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[4, 1, 4, 1],
				[12, 1, 12, 1],
			]
		);

		findModel.moveToNextMatch();
		assertFindState(
			editor,
			[4, 1, 4, 1],
			[4, 1, 4, 1],
			[
				[4, 1, 4, 1],
				[12, 1, 12, 1],
			]
		);

		findModel.moveToNextMatch();
		assertFindState(
			editor,
			[12, 1, 12, 1],
			[12, 1, 12, 1],
			[
				[4, 1, 4, 1],
				[12, 1, 12, 1],
			]
		);

		findModel.moveToNextMatch();
		assertFindState(
			editor,
			[4, 1, 4, 1],
			[4, 1, 4, 1],
			[
				[4, 1, 4, 1],
				[12, 1, 12, 1],
			]
		);

		findModel.dispose();
		findState.dispose();
	});

	findTest('find .*', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: '.*', isRegex: true }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[1, 1, 1, 18],
				[2, 1, 2, 18],
				[3, 1, 3, 20],
				[4, 1, 4, 1],
				[5, 1, 5, 13],
				[6, 1, 6, 43],
				[7, 1, 7, 41],
				[8, 1, 8, 41],
				[9, 1, 9, 40],
				[10, 1, 10, 2],
				[11, 1, 11, 17],
				[12, 1, 12, 1],
			]
		);

		findModel.dispose();
		findState.dispose();
	});

	findTest('find next ^.*$', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: '^.*$', isRegex: true }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[1, 1, 1, 18],
				[2, 1, 2, 18],
				[3, 1, 3, 20],
				[4, 1, 4, 1],
				[5, 1, 5, 13],
				[6, 1, 6, 43],
				[7, 1, 7, 41],
				[8, 1, 8, 41],
				[9, 1, 9, 40],
				[10, 1, 10, 2],
				[11, 1, 11, 17],
				[12, 1, 12, 1],
			]
		);

		findModel.moveToNextMatch();
		assertFindState(
			editor,
			[1, 1, 1, 18],
			[1, 1, 1, 18],
			[
				[1, 1, 1, 18],
				[2, 1, 2, 18],
				[3, 1, 3, 20],
				[4, 1, 4, 1],
				[5, 1, 5, 13],
				[6, 1, 6, 43],
				[7, 1, 7, 41],
				[8, 1, 8, 41],
				[9, 1, 9, 40],
				[10, 1, 10, 2],
				[11, 1, 11, 17],
				[12, 1, 12, 1],
			]
		);

		findModel.moveToNextMatch();
		assertFindState(
			editor,
			[2, 1, 2, 18],
			[2, 1, 2, 18],
			[
				[1, 1, 1, 18],
				[2, 1, 2, 18],
				[3, 1, 3, 20],
				[4, 1, 4, 1],
				[5, 1, 5, 13],
				[6, 1, 6, 43],
				[7, 1, 7, 41],
				[8, 1, 8, 41],
				[9, 1, 9, 40],
				[10, 1, 10, 2],
				[11, 1, 11, 17],
				[12, 1, 12, 1],
			]
		);

		findModel.dispose();
		findState.dispose();
	});

	findTest('find prev ^.*$', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: '^.*$', isRegex: true }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[1, 1, 1, 18],
				[2, 1, 2, 18],
				[3, 1, 3, 20],
				[4, 1, 4, 1],
				[5, 1, 5, 13],
				[6, 1, 6, 43],
				[7, 1, 7, 41],
				[8, 1, 8, 41],
				[9, 1, 9, 40],
				[10, 1, 10, 2],
				[11, 1, 11, 17],
				[12, 1, 12, 1],
			]
		);

		findModel.moveToPrevMatch();
		assertFindState(
			editor,
			[12, 1, 12, 1],
			[12, 1, 12, 1],
			[
				[1, 1, 1, 18],
				[2, 1, 2, 18],
				[3, 1, 3, 20],
				[4, 1, 4, 1],
				[5, 1, 5, 13],
				[6, 1, 6, 43],
				[7, 1, 7, 41],
				[8, 1, 8, 41],
				[9, 1, 9, 40],
				[10, 1, 10, 2],
				[11, 1, 11, 17],
				[12, 1, 12, 1],
			]
		);

		findModel.moveToPrevMatch();
		assertFindState(
			editor,
			[11, 1, 11, 17],
			[11, 1, 11, 17],
			[
				[1, 1, 1, 18],
				[2, 1, 2, 18],
				[3, 1, 3, 20],
				[4, 1, 4, 1],
				[5, 1, 5, 13],
				[6, 1, 6, 43],
				[7, 1, 7, 41],
				[8, 1, 8, 41],
				[9, 1, 9, 40],
				[10, 1, 10, 2],
				[11, 1, 11, 17],
				[12, 1, 12, 1],
			]
		);

		findModel.dispose();
		findState.dispose();
	});

	findTest('find prev ^$', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: '^$', isRegex: true }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[4, 1, 4, 1],
				[12, 1, 12, 1],
			]
		);

		findModel.moveToPrevMatch();
		assertFindState(
			editor,
			[12, 1, 12, 1],
			[12, 1, 12, 1],
			[
				[4, 1, 4, 1],
				[12, 1, 12, 1],
			]
		);

		findModel.moveToPrevMatch();
		assertFindState(
			editor,
			[4, 1, 4, 1],
			[4, 1, 4, 1],
			[
				[4, 1, 4, 1],
				[12, 1, 12, 1],
			]
		);

		findModel.moveToPrevMatch();
		assertFindState(
			editor,
			[12, 1, 12, 1],
			[12, 1, 12, 1],
			[
				[4, 1, 4, 1],
				[12, 1, 12, 1],
			]
		);

		findModel.dispose();
		findState.dispose();
	});

	findTest('replace hello', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'hello', replaceString: 'hi', wholeWord: true }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		editor.trigger('mouse', CoreNavigationCommands.MoveTo.id, {
			position: new Position(6, 20)
		});
		assertFindState(
			editor,
			[6, 20, 6, 20],
			null,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);
		assert.strictEqual(editor.getModel()!.getLineContent(6), '    cout << "hello world, Hello!" << endl;');

		findModel.replace();
		assertFindState(
			editor,
			[6, 27, 6, 32],
			[6, 27, 6, 32],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);
		assert.strictEqual(editor.getModel()!.getLineContent(6), '    cout << "hello world, Hello!" << endl;');

		findModel.replace();
		assertFindState(
			editor,
			[7, 14, 7, 19],
			[7, 14, 7, 19],
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);
		assert.strictEqual(editor.getModel()!.getLineContent(6), '    cout << "hello world, hi!" << endl;');

		findModel.replace();
		assertFindState(
			editor,
			[8, 14, 8, 19],
			[8, 14, 8, 19],
			[
				[6, 14, 6, 19],
				[8, 14, 8, 19]
			]
		);
		assert.strictEqual(editor.getModel()!.getLineContent(7), '    cout << "hi world again" << endl;');

		findModel.replace();
		assertFindState(
			editor,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19]
			]
		);
		assert.strictEqual(editor.getModel()!.getLineContent(8), '    cout << "hi world again" << endl;');

		findModel.replace();
		assertFindState(
			editor,
			[6, 16, 6, 16],
			null,
			[]
		);
		assert.strictEqual(editor.getModel()!.getLineContent(6), '    cout << "hi world, hi!" << endl;');

		findModel.dispose();
		findState.dispose();
	});

	findTest('replace bla', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'bla', replaceString: 'ciao' }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[11, 4, 11, 7],
				[11, 7, 11, 10],
				[11, 10, 11, 13]
			]
		);

		findModel.replace();
		assertFindState(
			editor,
			[11, 4, 11, 7],
			[11, 4, 11, 7],
			[
				[11, 4, 11, 7],
				[11, 7, 11, 10],
				[11, 10, 11, 13]
			]
		);
		assert.strictEqual(editor.getModel()!.getLineContent(11), '// blablablaciao');

		findModel.replace();
		assertFindState(
			editor,
			[11, 8, 11, 11],
			[11, 8, 11, 11],
			[
				[11, 8, 11, 11],
				[11, 11, 11, 14]
			]
		);
		assert.strictEqual(editor.getModel()!.getLineContent(11), '// ciaoblablaciao');

		findModel.replace();
		assertFindState(
			editor,
			[11, 12, 11, 15],
			[11, 12, 11, 15],
			[
				[11, 12, 11, 15]
			]
		);
		assert.strictEqual(editor.getModel()!.getLineContent(11), '// ciaociaoblaciao');

		findModel.replace();
		assertFindState(
			editor,
			[11, 16, 11, 16],
			null,
			[]
		);
		assert.strictEqual(editor.getModel()!.getLineContent(11), '// ciaociaociaociao');

		findModel.dispose();
		findState.dispose();
	});

	findTest('replaceAll hello', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'hello', replaceString: 'hi', wholeWord: true }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		editor.trigger('mouse', CoreNavigationCommands.MoveTo.id, {
			position: new Position(6, 20)
		});
		assertFindState(
			editor,
			[6, 20, 6, 20],
			null,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);
		assert.strictEqual(editor.getModel()!.getLineContent(6), '    cout << "hello world, Hello!" << endl;');

		findModel.replaceAll();
		assertFindState(
			editor,
			[6, 17, 6, 17],
			null,
			[]
		);
		assert.strictEqual(editor.getModel()!.getLineContent(6), '    cout << "hi world, hi!" << endl;');
		assert.strictEqual(editor.getModel()!.getLineContent(7), '    cout << "hi world again" << endl;');
		assert.strictEqual(editor.getModel()!.getLineContent(8), '    cout << "hi world again" << endl;');

		findModel.dispose();
		findState.dispose();
	});

	findTest('replaceAll two spaces with one space', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: '  ', replaceString: ' ' }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[6, 1, 6, 3],
				[6, 3, 6, 5],
				[7, 1, 7, 3],
				[7, 3, 7, 5],
				[8, 1, 8, 3],
				[8, 3, 8, 5],
				[9, 1, 9, 3],
				[9, 3, 9, 5]
			]
		);

		findModel.replaceAll();
		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[6, 1, 6, 3],
				[7, 1, 7, 3],
				[8, 1, 8, 3],
				[9, 1, 9, 3]
			]
		);
		assert.strictEqual(editor.getModel()!.getLineContent(6), '  cout << "hello world, Hello!" << endl;');
		assert.strictEqual(editor.getModel()!.getLineContent(7), '  cout << "hello world again" << endl;');
		assert.strictEqual(editor.getModel()!.getLineContent(8), '  cout << "Hello world again" << endl;');
		assert.strictEqual(editor.getModel()!.getLineContent(9), '  cout << "helloworld again" << endl;');

		findModel.dispose();
		findState.dispose();
	});

	findTest('replaceAll bla', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'bla', replaceString: 'ciao' }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[11, 4, 11, 7],
				[11, 7, 11, 10],
				[11, 10, 11, 13]
			]
		);

		findModel.replaceAll();
		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[]
		);
		assert.strictEqual(editor.getModel()!.getLineContent(11), '// ciaociaociaociao');

		findModel.dispose();
		findState.dispose();
	});

	findTest('replaceAll bla with \\t\\n', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'bla', replaceString: '<\\n\\t>', isRegex: true }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[11, 4, 11, 7],
				[11, 7, 11, 10],
				[11, 10, 11, 13]
			]
		);

		findModel.replaceAll();
		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[]
		);
		assert.strictEqual(editor.getModel()!.getLineContent(11), '// <');
		assert.strictEqual(editor.getModel()!.getLineContent(12), '\t><');
		assert.strictEqual(editor.getModel()!.getLineContent(13), '\t><');
		assert.strictEqual(editor.getModel()!.getLineContent(14), '\t>ciao');

		findModel.dispose();
		findState.dispose();
	});

	findTest('issue #3516: "replace all" moves page/cursor/focus/scroll to the place of the last replacement', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'include', replaceString: 'bar' }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[2, 2, 2, 9],
				[3, 2, 3, 9]
			]
		);

		findModel.replaceAll();
		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[]
		);

		assert.strictEqual(editor.getModel()!.getLineContent(2), '#bar "cool.h"');
		assert.strictEqual(editor.getModel()!.getLineContent(3), '#bar <iostream>');

		findModel.dispose();
		findState.dispose();
	});

	findTest('listens to model content changes', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'hello', replaceString: 'hi', wholeWord: true }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		editor.getModel()!.setValue('hello\nhi');
		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[]
		);

		findModel.dispose();
		findState.dispose();
	});

	findTest('selectAllMatches', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'hello', replaceString: 'hi', wholeWord: true }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.selectAllMatches();

		assert.deepStrictEqual(editor.getSelections()!.map(s => s.toString()), [
			new Selection(6, 14, 6, 19),
			new Selection(6, 27, 6, 32),
			new Selection(7, 14, 7, 19),
			new Selection(8, 14, 8, 19)
		].map(s => s.toString()));

		assertFindState(
			editor,
			[6, 14, 6, 19],
			null,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.dispose();
		findState.dispose();
	});

	findTest('issue #14143 selectAllMatches should maintain primary cursor if feasible', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'hello', replaceString: 'hi', wholeWord: true }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		editor.setSelection(new Range(7, 14, 7, 19));

		findModel.selectAllMatches();

		assert.deepStrictEqual(editor.getSelections()!.map(s => s.toString()), [
			new Selection(7, 14, 7, 19),
			new Selection(6, 14, 6, 19),
			new Selection(6, 27, 6, 32),
			new Selection(8, 14, 8, 19)
		].map(s => s.toString()));

		assert.deepStrictEqual(editor.getSelection()!.toString(), new Selection(7, 14, 7, 19).toString());

		assertFindState(
			editor,
			[7, 14, 7, 19],
			null,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.dispose();
		findState.dispose();
	});

	findTest('issue #1914: NPE when there is only one find match', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'cool.h' }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[2, 11, 2, 17]
			]
		);

		findModel.moveToNextMatch();
		assertFindState(
			editor,
			[2, 11, 2, 17],
			[2, 11, 2, 17],
			[
				[2, 11, 2, 17]
			]
		);

		findModel.moveToNextMatch();
		assertFindState(
			editor,
			[2, 11, 2, 17],
			[2, 11, 2, 17],
			[
				[2, 11, 2, 17]
			]
		);

		findModel.dispose();
		findState.dispose();
	});

	findTest('replace when search string has look ahed regex', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'hello(?=\\sworld)', replaceString: 'hi', isRegex: true }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.replace();

		assertFindState(
			editor,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);
		assert.strictEqual(editor.getModel()!.getLineContent(6), '    cout << "hello world, Hello!" << endl;');

		findModel.replace();
		assertFindState(
			editor,
			[7, 14, 7, 19],
			[7, 14, 7, 19],
			[
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);
		assert.strictEqual(editor.getModel()!.getLineContent(6), '    cout << "hi world, Hello!" << endl;');

		findModel.replace();
		assertFindState(
			editor,
			[8, 14, 8, 19],
			[8, 14, 8, 19],
			[
				[8, 14, 8, 19]
			]
		);
		assert.strictEqual(editor.getModel()!.getLineContent(7), '    cout << "hi world again" << endl;');

		findModel.replace();
		assertFindState(
			editor,
			[8, 16, 8, 16],
			null,
			[]
		);
		assert.strictEqual(editor.getModel()!.getLineContent(8), '    cout << "hi world again" << endl;');

		findModel.dispose();
		findState.dispose();
	});

	findTest('replace when search string has look ahed regex and cursor is at the last find match', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'hello(?=\\sworld)', replaceString: 'hi', isRegex: true }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		editor.trigger('mouse', CoreNavigationCommands.MoveTo.id, {
			position: new Position(8, 14)
		});

		assertFindState(
			editor,
			[8, 14, 8, 14],
			null,
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.replace();

		assertFindState(
			editor,
			[8, 14, 8, 19],
			[8, 14, 8, 19],
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		assert.strictEqual(editor.getModel()!.getLineContent(8), '    cout << "Hello world again" << endl;');

		findModel.replace();
		assertFindState(
			editor,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
			]
		);
		assert.strictEqual(editor.getModel()!.getLineContent(8), '    cout << "hi world again" << endl;');

		findModel.replace();
		assertFindState(
			editor,
			[7, 14, 7, 19],
			[7, 14, 7, 19],
			[
				[7, 14, 7, 19]
			]
		);
		assert.strictEqual(editor.getModel()!.getLineContent(6), '    cout << "hi world, Hello!" << endl;');

		findModel.replace();
		assertFindState(
			editor,
			[7, 16, 7, 16],
			null,
			[]
		);
		assert.strictEqual(editor.getModel()!.getLineContent(7), '    cout << "hi world again" << endl;');

		findModel.dispose();
		findState.dispose();
	});

	findTest('replaceAll when search string has look ahed regex', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'hello(?=\\sworld)', replaceString: 'hi', isRegex: true }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.replaceAll();

		assert.strictEqual(editor.getModel()!.getLineContent(6), '    cout << "hi world, Hello!" << endl;');
		assert.strictEqual(editor.getModel()!.getLineContent(7), '    cout << "hi world again" << endl;');
		assert.strictEqual(editor.getModel()!.getLineContent(8), '    cout << "hi world again" << endl;');

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[]
		);

		findModel.dispose();
		findState.dispose();
	});

	findTest('replace when search string has look ahed regex and replace string has capturing groups', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'hel(lo)(?=\\sworld)', replaceString: 'hi$1', isRegex: true }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.replace();

		assertFindState(
			editor,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);
		assert.strictEqual(editor.getModel()!.getLineContent(6), '    cout << "hello world, Hello!" << endl;');

		findModel.replace();
		assertFindState(
			editor,
			[7, 14, 7, 19],
			[7, 14, 7, 19],
			[
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);
		assert.strictEqual(editor.getModel()!.getLineContent(6), '    cout << "hilo world, Hello!" << endl;');

		findModel.replace();
		assertFindState(
			editor,
			[8, 14, 8, 19],
			[8, 14, 8, 19],
			[
				[8, 14, 8, 19]
			]
		);
		assert.strictEqual(editor.getModel()!.getLineContent(7), '    cout << "hilo world again" << endl;');

		findModel.replace();
		assertFindState(
			editor,
			[8, 18, 8, 18],
			null,
			[]
		);
		assert.strictEqual(editor.getModel()!.getLineContent(8), '    cout << "hilo world again" << endl;');

		findModel.dispose();
		findState.dispose();
	});

	findTest('replaceAll when search string has look ahed regex and replace string has capturing groups', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'wo(rl)d(?=.*;$)', replaceString: 'gi$1', isRegex: true }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[6, 20, 6, 25],
				[7, 20, 7, 25],
				[8, 20, 8, 25],
				[9, 19, 9, 24]
			]
		);

		findModel.replaceAll();

		assert.strictEqual(editor.getModel()!.getLineContent(6), '    cout << "hello girl, Hello!" << endl;');
		assert.strictEqual(editor.getModel()!.getLineContent(7), '    cout << "hello girl again" << endl;');
		assert.strictEqual(editor.getModel()!.getLineContent(8), '    cout << "Hello girl again" << endl;');
		assert.strictEqual(editor.getModel()!.getLineContent(9), '    cout << "hellogirl again" << endl;');

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[]
		);

		findModel.dispose();
		findState.dispose();
	});

	findTest('replaceAll when search string is multiline and has look ahed regex and replace string has capturing groups', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'wo(rl)d(.*;\\n)(?=.*hello)', replaceString: 'gi$1$2', isRegex: true, matchCase: true }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[6, 20, 7, 1],
				[8, 20, 9, 1]
			]
		);

		findModel.replaceAll();

		assert.strictEqual(editor.getModel()!.getLineContent(6), '    cout << "hello girl, Hello!" << endl;');
		assert.strictEqual(editor.getModel()!.getLineContent(8), '    cout << "Hello girl again" << endl;');

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[]
		);

		findModel.dispose();
		findState.dispose();
	});

	findTest('replaceAll preserving case', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'hello', replaceString: 'goodbye', isRegex: false, matchCase: false, preserveCase: true }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19],
				[9, 14, 9, 19],
			]
		);

		findModel.replaceAll();

		assert.strictEqual(editor.getModel()!.getLineContent(6), '    cout << "goodbye world, Goodbye!" << endl;');
		assert.strictEqual(editor.getModel()!.getLineContent(7), '    cout << "goodbye world again" << endl;');
		assert.strictEqual(editor.getModel()!.getLineContent(8), '    cout << "Goodbye world again" << endl;');
		assert.strictEqual(editor.getModel()!.getLineContent(9), '    cout << "goodbyeworld again" << endl;');

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[]
		);

		findModel.dispose();
		findState.dispose();
	});

	findTest('issue #18711 replaceAll with empty string', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'hello', replaceString: '', wholeWord: true }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModel.replaceAll();
		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[]
		);
		assert.strictEqual(editor.getModel()!.getLineContent(6), '    cout << " world, !" << endl;');
		assert.strictEqual(editor.getModel()!.getLineContent(7), '    cout << " world again" << endl;');
		assert.strictEqual(editor.getModel()!.getLineContent(8), '    cout << " world again" << endl;');

		findModel.dispose();
		findState.dispose();
	});

	findTest('issue #32522 replaceAll with ^ on more than 1000 matches', (editor) => {
		let initialText = '';
		for (let i = 0; i < 1100; i++) {
			initialText += 'line' + i + '\n';
		}
		editor.getModel()!.setValue(initialText);
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: '^', replaceString: 'a ', isRegex: true }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		findModel.replaceAll();

		let expectedText = '';
		for (let i = 0; i < 1100; i++) {
			expectedText += 'a line' + i + '\n';
		}
		expectedText += 'a ';
		assert.strictEqual(editor.getModel()!.getValue(), expectedText);

		findModel.dispose();
		findState.dispose();
	});

	findTest('issue #19740 Find and replace capture group/backreference inserts `undefined` instead of empty string', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'hello(z)?', replaceString: 'hi$1', isRegex: true, matchCase: true }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
				[9, 14, 9, 19]
			]
		);

		findModel.replaceAll();
		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[]
		);
		assert.strictEqual(editor.getModel()!.getLineContent(6), '    cout << "hi world, Hello!" << endl;');
		assert.strictEqual(editor.getModel()!.getLineContent(7), '    cout << "hi world again" << endl;');
		assert.strictEqual(editor.getModel()!.getLineContent(9), '    cout << "hiworld again" << endl;');

		findModel.dispose();
		findState.dispose();
	});

	findTest('issue #27083. search scope works even if it is a single line', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'hello', wholeWord: true, searchScope: [new Range(7, 1, 8, 1)] }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assertFindState(
			editor,
			[1, 1, 1, 1],
			null,
			[
				[7, 14, 7, 19]
			]
		);

		findModel.dispose();
		findState.dispose();
	});

	findTest('issue #3516: Control behavior of "Next" operations (not looping back to beginning)', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'hello', loop: false }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assert.strictEqual(findState.matchesCount, 5);

		// Test next operations
		assert.strictEqual(findState.matchesPosition, 0);
		assert.strictEqual(findState.canNavigateForward(), true);
		assert.strictEqual(findState.canNavigateBack(), true);

		findModel.moveToNextMatch();
		assert.strictEqual(findState.matchesPosition, 1);
		assert.strictEqual(findState.canNavigateForward(), true);
		assert.strictEqual(findState.canNavigateBack(), false);

		findModel.moveToNextMatch();
		assert.strictEqual(findState.matchesPosition, 2);
		assert.strictEqual(findState.canNavigateForward(), true);
		assert.strictEqual(findState.canNavigateBack(), true);

		findModel.moveToNextMatch();
		assert.strictEqual(findState.matchesPosition, 3);
		assert.strictEqual(findState.canNavigateForward(), true);
		assert.strictEqual(findState.canNavigateBack(), true);

		findModel.moveToNextMatch();
		assert.strictEqual(findState.matchesPosition, 4);
		assert.strictEqual(findState.canNavigateForward(), true);
		assert.strictEqual(findState.canNavigateBack(), true);

		findModel.moveToNextMatch();
		assert.strictEqual(findState.matchesPosition, 5);
		assert.strictEqual(findState.canNavigateForward(), false);
		assert.strictEqual(findState.canNavigateBack(), true);

		findModel.moveToNextMatch();
		assert.strictEqual(findState.matchesPosition, 5);
		assert.strictEqual(findState.canNavigateForward(), false);
		assert.strictEqual(findState.canNavigateBack(), true);

		findModel.moveToNextMatch();
		assert.strictEqual(findState.matchesPosition, 5);
		assert.strictEqual(findState.canNavigateForward(), false);
		assert.strictEqual(findState.canNavigateBack(), true);

		// Test previous operations
		findModel.moveToPrevMatch();
		assert.strictEqual(findState.matchesPosition, 4);
		assert.strictEqual(findState.canNavigateForward(), true);
		assert.strictEqual(findState.canNavigateBack(), true);

		findModel.moveToPrevMatch();
		assert.strictEqual(findState.matchesPosition, 3);
		assert.strictEqual(findState.canNavigateForward(), true);
		assert.strictEqual(findState.canNavigateBack(), true);

		findModel.moveToPrevMatch();
		assert.strictEqual(findState.matchesPosition, 2);
		assert.strictEqual(findState.canNavigateForward(), true);
		assert.strictEqual(findState.canNavigateBack(), true);

		findModel.moveToPrevMatch();
		assert.strictEqual(findState.matchesPosition, 1);
		assert.strictEqual(findState.canNavigateForward(), true);
		assert.strictEqual(findState.canNavigateBack(), false);

		findModel.moveToPrevMatch();
		assert.strictEqual(findState.matchesPosition, 1);
		assert.strictEqual(findState.canNavigateForward(), true);
		assert.strictEqual(findState.canNavigateBack(), false);

		findModel.moveToPrevMatch();
		assert.strictEqual(findState.matchesPosition, 1);
		assert.strictEqual(findState.canNavigateForward(), true);
		assert.strictEqual(findState.canNavigateBack(), false);

	});

	findTest('issue #3516: Control behavior of "Next" operations (looping back to beginning)', (editor) => {
		const findState = disposables.add(new FindReplaceState());
		findState.change({ searchString: 'hello' }, false);
		const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));

		assert.strictEqual(findState.matchesCount, 5);

		// Test next operations
		assert.strictEqual(findState.matchesPosition, 0);
		assert.strictEqual(findState.canNavigateForward(), true);
		assert.strictEqual(findState.canNavigateBack(), true);

		findModel.moveToNextMatch();
		assert.strictEqual(findState.matchesPosition, 1);
		assert.strictEqual(findState.canNavigateForward(), true);
		assert.strictEqual(findState.canNavigateBack(), true);

		findModel.moveToNextMatch();
		assert.strictEqual(findState.matchesPosition, 2);
		assert.strictEqual(findState.canNavigateForward(), true);
		assert.strictEqual(findState.canNavigateBack(), true);

		findModel.moveToNextMatch();
		assert.strictEqual(findState.matchesPosition, 3);
		assert.strictEqual(findState.canNavigateForward(), true);
		assert.strictEqual(findState.canNavigateBack(), true);

		findModel.moveToNextMatch();
		assert.strictEqual(findState.matchesPosition, 4);
		assert.strictEqual(findState.canNavigateForward(), true);
		assert.strictEqual(findState.canNavigateBack(), true);

		findModel.moveToNextMatch();
		assert.strictEqual(findState.matchesPosition, 5);
		assert.strictEqual(findState.canNavigateForward(), true);
		assert.strictEqual(findState.canNavigateBack(), true);

		findModel.moveToNextMatch();
		assert.strictEqual(findState.matchesPosition, 1);
		assert.strictEqual(findState.canNavigateForward(), true);
		assert.strictEqual(findState.canNavigateBack(), true);

		findModel.moveToNextMatch();
		assert.strictEqual(findState.matchesPosition, 2);
		assert.strictEqual(findState.canNavigateForward(), true);
		assert.strictEqual(findState.canNavigateBack(), true);

		// Test previous operations
		findModel.moveToPrevMatch();
		assert.strictEqual(findState.matchesPosition, 1);
		assert.strictEqual(findState.canNavigateForward(), true);
		assert.strictEqual(findState.canNavigateBack(), true);

		findModel.moveToPrevMatch();
		assert.strictEqual(findState.matchesPosition, 5);
		assert.strictEqual(findState.canNavigateForward(), true);
		assert.strictEqual(findState.canNavigateBack(), true);

		findModel.moveToPrevMatch();
		assert.strictEqual(findState.matchesPosition, 4);
		assert.strictEqual(findState.canNavigateForward(), true);
		assert.strictEqual(findState.canNavigateBack(), true);

		findModel.moveToPrevMatch();
		assert.strictEqual(findState.matchesPosition, 3);
		assert.strictEqual(findState.canNavigateForward(), true);
		assert.strictEqual(findState.canNavigateBack(), true);

		findModel.moveToPrevMatch();
		assert.strictEqual(findState.matchesPosition, 2);
		assert.strictEqual(findState.canNavigateForward(), true);
		assert.strictEqual(findState.canNavigateBack(), true);

		findModel.moveToPrevMatch();
		assert.strictEqual(findState.matchesPosition, 1);
		assert.strictEqual(findState.canNavigateForward(), true);
		assert.strictEqual(findState.canNavigateBack(), true);

	});

});
