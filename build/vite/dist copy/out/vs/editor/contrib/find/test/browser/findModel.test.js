/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CoreNavigationCommands } from '../../../../browser/coreCommands.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { Selection } from '../../../../common/core/selection.js';
import { PieceTreeTextBufferBuilder } from '../../../../common/model/pieceTreeTextBuffer/pieceTreeTextBufferBuilder.js';
import { FindModelBoundToEditorModel } from '../../browser/findModel.js';
import { FindReplaceState } from '../../browser/findState.js';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
suite('FindModel', () => {
    let disposables;
    setup(() => {
        disposables = new DisposableStore();
    });
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function findTest(testName, callback) {
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
            withTestCodeEditor(textArr, {}, (editor) => callback(editor));
            const text = textArr.join('\n');
            const ptBuilder = new PieceTreeTextBufferBuilder();
            ptBuilder.acceptChunk(text.substr(0, 94));
            ptBuilder.acceptChunk(text.substr(94, 101));
            ptBuilder.acceptChunk(text.substr(195, 59));
            const factory = ptBuilder.finish();
            withTestCodeEditor(factory, {}, (editor) => callback(editor));
        });
    }
    function fromRange(rng) {
        return [rng.startLineNumber, rng.startColumn, rng.endLineNumber, rng.endColumn];
    }
    function _getFindState(editor) {
        const model = editor.getModel();
        const currentFindMatches = [];
        const allFindMatches = [];
        for (const dec of model.getAllDecorations()) {
            if (dec.options.className === 'currentFindMatch') {
                currentFindMatches.push(dec.range);
                allFindMatches.push(dec.range);
            }
            else if (dec.options.className === 'findMatch') {
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
    function assertFindState(editor, cursor, highlighted, findDecorations) {
        assert.deepStrictEqual(fromRange(editor.getSelection()), cursor, 'cursor');
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
        assertFindState(editor, [1, 12, 1, 13], [1, 12, 1, 13], [
            [1, 12, 1, 13],
            [2, 16, 2, 17],
            [6, 14, 6, 15],
            [6, 27, 6, 28],
            [7, 14, 7, 15],
            [8, 14, 8, 15],
            [9, 14, 9, 15]
        ]);
        // simulate typing the search string
        findState.change({ searchString: 'He' }, true);
        assertFindState(editor, [1, 12, 1, 14], [1, 12, 1, 14], [
            [1, 12, 1, 14],
            [6, 14, 6, 16],
            [6, 27, 6, 29],
            [7, 14, 7, 16],
            [8, 14, 8, 16],
            [9, 14, 9, 16]
        ]);
        // simulate typing the search string
        findState.change({ searchString: 'Hello' }, true);
        assertFindState(editor, [6, 14, 6, 19], [6, 14, 6, 19], [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19],
            [9, 14, 9, 19]
        ]);
        // simulate toggling on `matchCase`
        findState.change({ matchCase: true }, true);
        assertFindState(editor, [6, 27, 6, 32], [6, 27, 6, 32], [
            [6, 27, 6, 32],
            [8, 14, 8, 19]
        ]);
        // simulate typing the search string
        findState.change({ searchString: 'hello' }, true);
        assertFindState(editor, [6, 14, 6, 19], [6, 14, 6, 19], [
            [6, 14, 6, 19],
            [7, 14, 7, 19],
            [9, 14, 9, 19]
        ]);
        // simulate toggling on `wholeWord`
        findState.change({ wholeWord: true }, true);
        assertFindState(editor, [6, 14, 6, 19], [6, 14, 6, 19], [
            [6, 14, 6, 19],
            [7, 14, 7, 19]
        ]);
        // simulate toggling off `matchCase`
        findState.change({ matchCase: false }, true);
        assertFindState(editor, [6, 14, 6, 19], [6, 14, 6, 19], [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        // simulate toggling off `wholeWord`
        findState.change({ wholeWord: false }, true);
        assertFindState(editor, [6, 14, 6, 19], [6, 14, 6, 19], [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19],
            [9, 14, 9, 19]
        ]);
        // simulate adding a search scope
        findState.change({ searchScope: [new Range(8, 1, 10, 1)] }, true);
        assertFindState(editor, [8, 14, 8, 19], [8, 14, 8, 19], [
            [8, 14, 8, 19],
            [9, 14, 9, 19]
        ]);
        // simulate removing the search scope
        findState.change({ searchScope: null }, true);
        assertFindState(editor, [6, 14, 6, 19], [6, 14, 6, 19], [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19],
            [9, 14, 9, 19]
        ]);
        findModel.dispose();
        findState.dispose();
    });
    findTest('find model removes its decorations', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'hello' }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assert.strictEqual(findState.matchesCount, 5);
        assertFindState(editor, [1, 1, 1, 1], null, [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19],
            [9, 14, 9, 19]
        ]);
        findModel.dispose();
        findState.dispose();
        assertFindState(editor, [1, 1, 1, 1], null, []);
    });
    findTest('find model updates state matchesCount', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'hello' }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assert.strictEqual(findState.matchesCount, 5);
        assertFindState(editor, [1, 1, 1, 1], null, [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19],
            [9, 14, 9, 19]
        ]);
        findState.change({ searchString: 'helloo' }, false);
        assert.strictEqual(findState.matchesCount, 0);
        assertFindState(editor, [1, 1, 1, 1], null, []);
        findModel.dispose();
        findState.dispose();
    });
    findTest('find model reacts to position change', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'hello' }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19],
            [9, 14, 9, 19]
        ]);
        editor.trigger('mouse', CoreNavigationCommands.MoveTo.id, {
            position: new Position(6, 20)
        });
        assertFindState(editor, [6, 20, 6, 20], null, [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19],
            [9, 14, 9, 19]
        ]);
        findState.change({ searchString: 'Hello' }, true);
        assertFindState(editor, [6, 27, 6, 32], [6, 27, 6, 32], [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19],
            [9, 14, 9, 19]
        ]);
        findModel.dispose();
        findState.dispose();
    });
    findTest('find model next', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'hello', wholeWord: true }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.moveToNextMatch();
        assertFindState(editor, [6, 14, 6, 19], [6, 14, 6, 19], [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.moveToNextMatch();
        assertFindState(editor, [6, 27, 6, 32], [6, 27, 6, 32], [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.moveToNextMatch();
        assertFindState(editor, [7, 14, 7, 19], [7, 14, 7, 19], [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.moveToNextMatch();
        assertFindState(editor, [8, 14, 8, 19], [8, 14, 8, 19], [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.moveToNextMatch();
        assertFindState(editor, [6, 14, 6, 19], [6, 14, 6, 19], [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.dispose();
        findState.dispose();
    });
    findTest('find model next stays in scope', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'hello', wholeWord: true, searchScope: [new Range(7, 1, 9, 1)] }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.moveToNextMatch();
        assertFindState(editor, [7, 14, 7, 19], [7, 14, 7, 19], [
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.moveToNextMatch();
        assertFindState(editor, [8, 14, 8, 19], [8, 14, 8, 19], [
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.moveToNextMatch();
        assertFindState(editor, [7, 14, 7, 19], [7, 14, 7, 19], [
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.dispose();
        findState.dispose();
    });
    findTest('multi-selection find model next stays in scope (overlap)', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'hello', wholeWord: true, searchScope: [new Range(7, 1, 8, 2), new Range(8, 1, 9, 1)] }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.moveToNextMatch();
        assertFindState(editor, [7, 14, 7, 19], [7, 14, 7, 19], [
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.moveToNextMatch();
        assertFindState(editor, [8, 14, 8, 19], [8, 14, 8, 19], [
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.moveToNextMatch();
        assertFindState(editor, [7, 14, 7, 19], [7, 14, 7, 19], [
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.dispose();
        findState.dispose();
    });
    findTest('multi-selection find model next stays in scope', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'hello', matchCase: true, wholeWord: false, searchScope: [new Range(6, 1, 7, 38), new Range(9, 3, 9, 38)] }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [6, 14, 6, 19],
            // `matchCase: false` would
            // find this match as well:
            // [6, 27, 6, 32],
            [7, 14, 7, 19],
            // `wholeWord: true` would
            // exclude this match:
            [9, 14, 9, 19],
        ]);
        findModel.moveToNextMatch();
        assertFindState(editor, [6, 14, 6, 19], [6, 14, 6, 19], [
            [6, 14, 6, 19],
            [7, 14, 7, 19],
            [9, 14, 9, 19],
        ]);
        findModel.moveToNextMatch();
        assertFindState(editor, [7, 14, 7, 19], [7, 14, 7, 19], [
            [6, 14, 6, 19],
            [7, 14, 7, 19],
            [9, 14, 9, 19],
        ]);
        findModel.moveToNextMatch();
        assertFindState(editor, [9, 14, 9, 19], [9, 14, 9, 19], [
            [6, 14, 6, 19],
            [7, 14, 7, 19],
            [9, 14, 9, 19],
        ]);
        findModel.moveToNextMatch();
        assertFindState(editor, [6, 14, 6, 19], [6, 14, 6, 19], [
            [6, 14, 6, 19],
            [7, 14, 7, 19],
            [9, 14, 9, 19],
        ]);
        findModel.dispose();
        findState.dispose();
    });
    findTest('find model prev', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'hello', wholeWord: true }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.moveToPrevMatch();
        assertFindState(editor, [8, 14, 8, 19], [8, 14, 8, 19], [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.moveToPrevMatch();
        assertFindState(editor, [7, 14, 7, 19], [7, 14, 7, 19], [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.moveToPrevMatch();
        assertFindState(editor, [6, 27, 6, 32], [6, 27, 6, 32], [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.moveToPrevMatch();
        assertFindState(editor, [6, 14, 6, 19], [6, 14, 6, 19], [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.moveToPrevMatch();
        assertFindState(editor, [8, 14, 8, 19], [8, 14, 8, 19], [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.dispose();
        findState.dispose();
    });
    findTest('find model prev stays in scope', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'hello', wholeWord: true, searchScope: [new Range(7, 1, 9, 1)] }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.moveToPrevMatch();
        assertFindState(editor, [8, 14, 8, 19], [8, 14, 8, 19], [
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.moveToPrevMatch();
        assertFindState(editor, [7, 14, 7, 19], [7, 14, 7, 19], [
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.moveToPrevMatch();
        assertFindState(editor, [8, 14, 8, 19], [8, 14, 8, 19], [
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.dispose();
        findState.dispose();
    });
    findTest('find model next/prev with no matches', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'helloo', wholeWord: true }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, []);
        findModel.moveToNextMatch();
        assertFindState(editor, [1, 1, 1, 1], null, []);
        findModel.moveToPrevMatch();
        assertFindState(editor, [1, 1, 1, 1], null, []);
        findModel.dispose();
        findState.dispose();
    });
    findTest('find model next/prev respects cursor position', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'hello', wholeWord: true }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        editor.trigger('mouse', CoreNavigationCommands.MoveTo.id, {
            position: new Position(6, 20)
        });
        assertFindState(editor, [6, 20, 6, 20], null, [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.moveToNextMatch();
        assertFindState(editor, [6, 27, 6, 32], [6, 27, 6, 32], [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.dispose();
        findState.dispose();
    });
    findTest('find ^', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: '^', isRegex: true }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
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
        ]);
        findModel.moveToNextMatch();
        assertFindState(editor, [2, 1, 2, 1], [2, 1, 2, 1], [
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
        ]);
        findModel.moveToNextMatch();
        assertFindState(editor, [3, 1, 3, 1], [3, 1, 3, 1], [
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
        ]);
        findModel.dispose();
        findState.dispose();
    });
    findTest('find $', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: '$', isRegex: true }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
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
        ]);
        findModel.moveToNextMatch();
        assertFindState(editor, [1, 18, 1, 18], [1, 18, 1, 18], [
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
        ]);
        findModel.moveToNextMatch();
        assertFindState(editor, [2, 18, 2, 18], [2, 18, 2, 18], [
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
        ]);
        findModel.moveToNextMatch();
        assertFindState(editor, [3, 20, 3, 20], [3, 20, 3, 20], [
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
        ]);
        findModel.dispose();
        findState.dispose();
    });
    findTest('find next ^$', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: '^$', isRegex: true }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [4, 1, 4, 1],
            [12, 1, 12, 1],
        ]);
        findModel.moveToNextMatch();
        assertFindState(editor, [4, 1, 4, 1], [4, 1, 4, 1], [
            [4, 1, 4, 1],
            [12, 1, 12, 1],
        ]);
        findModel.moveToNextMatch();
        assertFindState(editor, [12, 1, 12, 1], [12, 1, 12, 1], [
            [4, 1, 4, 1],
            [12, 1, 12, 1],
        ]);
        findModel.moveToNextMatch();
        assertFindState(editor, [4, 1, 4, 1], [4, 1, 4, 1], [
            [4, 1, 4, 1],
            [12, 1, 12, 1],
        ]);
        findModel.dispose();
        findState.dispose();
    });
    findTest('find .*', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: '.*', isRegex: true }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
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
        ]);
        findModel.dispose();
        findState.dispose();
    });
    findTest('find next ^.*$', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: '^.*$', isRegex: true }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
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
        ]);
        findModel.moveToNextMatch();
        assertFindState(editor, [1, 1, 1, 18], [1, 1, 1, 18], [
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
        ]);
        findModel.moveToNextMatch();
        assertFindState(editor, [2, 1, 2, 18], [2, 1, 2, 18], [
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
        ]);
        findModel.dispose();
        findState.dispose();
    });
    findTest('find prev ^.*$', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: '^.*$', isRegex: true }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
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
        ]);
        findModel.moveToPrevMatch();
        assertFindState(editor, [12, 1, 12, 1], [12, 1, 12, 1], [
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
        ]);
        findModel.moveToPrevMatch();
        assertFindState(editor, [11, 1, 11, 17], [11, 1, 11, 17], [
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
        ]);
        findModel.dispose();
        findState.dispose();
    });
    findTest('find prev ^$', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: '^$', isRegex: true }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [4, 1, 4, 1],
            [12, 1, 12, 1],
        ]);
        findModel.moveToPrevMatch();
        assertFindState(editor, [12, 1, 12, 1], [12, 1, 12, 1], [
            [4, 1, 4, 1],
            [12, 1, 12, 1],
        ]);
        findModel.moveToPrevMatch();
        assertFindState(editor, [4, 1, 4, 1], [4, 1, 4, 1], [
            [4, 1, 4, 1],
            [12, 1, 12, 1],
        ]);
        findModel.moveToPrevMatch();
        assertFindState(editor, [12, 1, 12, 1], [12, 1, 12, 1], [
            [4, 1, 4, 1],
            [12, 1, 12, 1],
        ]);
        findModel.dispose();
        findState.dispose();
    });
    findTest('replace hello', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'hello', replaceString: 'hi', wholeWord: true }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        editor.trigger('mouse', CoreNavigationCommands.MoveTo.id, {
            position: new Position(6, 20)
        });
        assertFindState(editor, [6, 20, 6, 20], null, [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hello world, Hello!" << endl;');
        findModel.replace();
        assertFindState(editor, [6, 27, 6, 32], [6, 27, 6, 32], [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hello world, Hello!" << endl;');
        findModel.replace();
        assertFindState(editor, [7, 14, 7, 19], [7, 14, 7, 19], [
            [6, 14, 6, 19],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hello world, hi!" << endl;');
        findModel.replace();
        assertFindState(editor, [8, 14, 8, 19], [8, 14, 8, 19], [
            [6, 14, 6, 19],
            [8, 14, 8, 19]
        ]);
        assert.strictEqual(editor.getModel().getLineContent(7), '    cout << "hi world again" << endl;');
        findModel.replace();
        assertFindState(editor, [6, 14, 6, 19], [6, 14, 6, 19], [
            [6, 14, 6, 19]
        ]);
        assert.strictEqual(editor.getModel().getLineContent(8), '    cout << "hi world again" << endl;');
        findModel.replace();
        assertFindState(editor, [6, 16, 6, 16], null, []);
        assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hi world, hi!" << endl;');
        findModel.dispose();
        findState.dispose();
    });
    findTest('replace bla', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'bla', replaceString: 'ciao' }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [11, 4, 11, 7],
            [11, 7, 11, 10],
            [11, 10, 11, 13]
        ]);
        findModel.replace();
        assertFindState(editor, [11, 4, 11, 7], [11, 4, 11, 7], [
            [11, 4, 11, 7],
            [11, 7, 11, 10],
            [11, 10, 11, 13]
        ]);
        assert.strictEqual(editor.getModel().getLineContent(11), '// blablablaciao');
        findModel.replace();
        assertFindState(editor, [11, 8, 11, 11], [11, 8, 11, 11], [
            [11, 8, 11, 11],
            [11, 11, 11, 14]
        ]);
        assert.strictEqual(editor.getModel().getLineContent(11), '// ciaoblablaciao');
        findModel.replace();
        assertFindState(editor, [11, 12, 11, 15], [11, 12, 11, 15], [
            [11, 12, 11, 15]
        ]);
        assert.strictEqual(editor.getModel().getLineContent(11), '// ciaociaoblaciao');
        findModel.replace();
        assertFindState(editor, [11, 16, 11, 16], null, []);
        assert.strictEqual(editor.getModel().getLineContent(11), '// ciaociaociaociao');
        findModel.dispose();
        findState.dispose();
    });
    findTest('replaceAll hello', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'hello', replaceString: 'hi', wholeWord: true }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        editor.trigger('mouse', CoreNavigationCommands.MoveTo.id, {
            position: new Position(6, 20)
        });
        assertFindState(editor, [6, 20, 6, 20], null, [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hello world, Hello!" << endl;');
        findModel.replaceAll();
        assertFindState(editor, [6, 17, 6, 17], null, []);
        assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hi world, hi!" << endl;');
        assert.strictEqual(editor.getModel().getLineContent(7), '    cout << "hi world again" << endl;');
        assert.strictEqual(editor.getModel().getLineContent(8), '    cout << "hi world again" << endl;');
        findModel.dispose();
        findState.dispose();
    });
    findTest('replaceAll two spaces with one space', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: '  ', replaceString: ' ' }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [6, 1, 6, 3],
            [6, 3, 6, 5],
            [7, 1, 7, 3],
            [7, 3, 7, 5],
            [8, 1, 8, 3],
            [8, 3, 8, 5],
            [9, 1, 9, 3],
            [9, 3, 9, 5]
        ]);
        findModel.replaceAll();
        assertFindState(editor, [1, 1, 1, 1], null, [
            [6, 1, 6, 3],
            [7, 1, 7, 3],
            [8, 1, 8, 3],
            [9, 1, 9, 3]
        ]);
        assert.strictEqual(editor.getModel().getLineContent(6), '  cout << "hello world, Hello!" << endl;');
        assert.strictEqual(editor.getModel().getLineContent(7), '  cout << "hello world again" << endl;');
        assert.strictEqual(editor.getModel().getLineContent(8), '  cout << "Hello world again" << endl;');
        assert.strictEqual(editor.getModel().getLineContent(9), '  cout << "helloworld again" << endl;');
        findModel.dispose();
        findState.dispose();
    });
    findTest('replaceAll bla', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'bla', replaceString: 'ciao' }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [11, 4, 11, 7],
            [11, 7, 11, 10],
            [11, 10, 11, 13]
        ]);
        findModel.replaceAll();
        assertFindState(editor, [1, 1, 1, 1], null, []);
        assert.strictEqual(editor.getModel().getLineContent(11), '// ciaociaociaociao');
        findModel.dispose();
        findState.dispose();
    });
    findTest('replaceAll bla with \\t\\n', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'bla', replaceString: '<\\n\\t>', isRegex: true }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [11, 4, 11, 7],
            [11, 7, 11, 10],
            [11, 10, 11, 13]
        ]);
        findModel.replaceAll();
        assertFindState(editor, [1, 1, 1, 1], null, []);
        assert.strictEqual(editor.getModel().getLineContent(11), '// <');
        assert.strictEqual(editor.getModel().getLineContent(12), '\t><');
        assert.strictEqual(editor.getModel().getLineContent(13), '\t><');
        assert.strictEqual(editor.getModel().getLineContent(14), '\t>ciao');
        findModel.dispose();
        findState.dispose();
    });
    findTest('issue #3516: "replace all" moves page/cursor/focus/scroll to the place of the last replacement', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'include', replaceString: 'bar' }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [2, 2, 2, 9],
            [3, 2, 3, 9]
        ]);
        findModel.replaceAll();
        assertFindState(editor, [1, 1, 1, 1], null, []);
        assert.strictEqual(editor.getModel().getLineContent(2), '#bar "cool.h"');
        assert.strictEqual(editor.getModel().getLineContent(3), '#bar <iostream>');
        findModel.dispose();
        findState.dispose();
    });
    findTest('listens to model content changes', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'hello', replaceString: 'hi', wholeWord: true }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        editor.getModel().setValue('hello\nhi');
        assertFindState(editor, [1, 1, 1, 1], null, []);
        findModel.dispose();
        findState.dispose();
    });
    findTest('selectAllMatches', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'hello', replaceString: 'hi', wholeWord: true }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.selectAllMatches();
        assert.deepStrictEqual(editor.getSelections().map(s => s.toString()), [
            new Selection(6, 14, 6, 19),
            new Selection(6, 27, 6, 32),
            new Selection(7, 14, 7, 19),
            new Selection(8, 14, 8, 19)
        ].map(s => s.toString()));
        assertFindState(editor, [6, 14, 6, 19], null, [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.dispose();
        findState.dispose();
    });
    findTest('issue #14143 selectAllMatches should maintain primary cursor if feasible', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'hello', replaceString: 'hi', wholeWord: true }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        editor.setSelection(new Range(7, 14, 7, 19));
        findModel.selectAllMatches();
        assert.deepStrictEqual(editor.getSelections().map(s => s.toString()), [
            new Selection(7, 14, 7, 19),
            new Selection(6, 14, 6, 19),
            new Selection(6, 27, 6, 32),
            new Selection(8, 14, 8, 19)
        ].map(s => s.toString()));
        assert.deepStrictEqual(editor.getSelection().toString(), new Selection(7, 14, 7, 19).toString());
        assertFindState(editor, [7, 14, 7, 19], null, [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.dispose();
        findState.dispose();
    });
    findTest('issue #1914: NPE when there is only one find match', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'cool.h' }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [2, 11, 2, 17]
        ]);
        findModel.moveToNextMatch();
        assertFindState(editor, [2, 11, 2, 17], [2, 11, 2, 17], [
            [2, 11, 2, 17]
        ]);
        findModel.moveToNextMatch();
        assertFindState(editor, [2, 11, 2, 17], [2, 11, 2, 17], [
            [2, 11, 2, 17]
        ]);
        findModel.dispose();
        findState.dispose();
    });
    findTest('replace when search string has look ahed regex', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'hello(?=\\sworld)', replaceString: 'hi', isRegex: true }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [6, 14, 6, 19],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.replace();
        assertFindState(editor, [6, 14, 6, 19], [6, 14, 6, 19], [
            [6, 14, 6, 19],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hello world, Hello!" << endl;');
        findModel.replace();
        assertFindState(editor, [7, 14, 7, 19], [7, 14, 7, 19], [
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hi world, Hello!" << endl;');
        findModel.replace();
        assertFindState(editor, [8, 14, 8, 19], [8, 14, 8, 19], [
            [8, 14, 8, 19]
        ]);
        assert.strictEqual(editor.getModel().getLineContent(7), '    cout << "hi world again" << endl;');
        findModel.replace();
        assertFindState(editor, [8, 16, 8, 16], null, []);
        assert.strictEqual(editor.getModel().getLineContent(8), '    cout << "hi world again" << endl;');
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
        assertFindState(editor, [8, 14, 8, 14], null, [
            [6, 14, 6, 19],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.replace();
        assertFindState(editor, [8, 14, 8, 19], [8, 14, 8, 19], [
            [6, 14, 6, 19],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        assert.strictEqual(editor.getModel().getLineContent(8), '    cout << "Hello world again" << endl;');
        findModel.replace();
        assertFindState(editor, [6, 14, 6, 19], [6, 14, 6, 19], [
            [6, 14, 6, 19],
            [7, 14, 7, 19],
        ]);
        assert.strictEqual(editor.getModel().getLineContent(8), '    cout << "hi world again" << endl;');
        findModel.replace();
        assertFindState(editor, [7, 14, 7, 19], [7, 14, 7, 19], [
            [7, 14, 7, 19]
        ]);
        assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hi world, Hello!" << endl;');
        findModel.replace();
        assertFindState(editor, [7, 16, 7, 16], null, []);
        assert.strictEqual(editor.getModel().getLineContent(7), '    cout << "hi world again" << endl;');
        findModel.dispose();
        findState.dispose();
    });
    findTest('replaceAll when search string has look ahed regex', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'hello(?=\\sworld)', replaceString: 'hi', isRegex: true }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [6, 14, 6, 19],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.replaceAll();
        assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hi world, Hello!" << endl;');
        assert.strictEqual(editor.getModel().getLineContent(7), '    cout << "hi world again" << endl;');
        assert.strictEqual(editor.getModel().getLineContent(8), '    cout << "hi world again" << endl;');
        assertFindState(editor, [1, 1, 1, 1], null, []);
        findModel.dispose();
        findState.dispose();
    });
    findTest('replace when search string has look ahed regex and replace string has capturing groups', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'hel(lo)(?=\\sworld)', replaceString: 'hi$1', isRegex: true }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [6, 14, 6, 19],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.replace();
        assertFindState(editor, [6, 14, 6, 19], [6, 14, 6, 19], [
            [6, 14, 6, 19],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hello world, Hello!" << endl;');
        findModel.replace();
        assertFindState(editor, [7, 14, 7, 19], [7, 14, 7, 19], [
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hilo world, Hello!" << endl;');
        findModel.replace();
        assertFindState(editor, [8, 14, 8, 19], [8, 14, 8, 19], [
            [8, 14, 8, 19]
        ]);
        assert.strictEqual(editor.getModel().getLineContent(7), '    cout << "hilo world again" << endl;');
        findModel.replace();
        assertFindState(editor, [8, 18, 8, 18], null, []);
        assert.strictEqual(editor.getModel().getLineContent(8), '    cout << "hilo world again" << endl;');
        findModel.dispose();
        findState.dispose();
    });
    findTest('replaceAll when search string has look ahed regex and replace string has capturing groups', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'wo(rl)d(?=.*;$)', replaceString: 'gi$1', isRegex: true }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [6, 20, 6, 25],
            [7, 20, 7, 25],
            [8, 20, 8, 25],
            [9, 19, 9, 24]
        ]);
        findModel.replaceAll();
        assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hello girl, Hello!" << endl;');
        assert.strictEqual(editor.getModel().getLineContent(7), '    cout << "hello girl again" << endl;');
        assert.strictEqual(editor.getModel().getLineContent(8), '    cout << "Hello girl again" << endl;');
        assert.strictEqual(editor.getModel().getLineContent(9), '    cout << "hellogirl again" << endl;');
        assertFindState(editor, [1, 1, 1, 1], null, []);
        findModel.dispose();
        findState.dispose();
    });
    findTest('replaceAll when search string is multiline and has look ahed regex and replace string has capturing groups', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'wo(rl)d(.*;\\n)(?=.*hello)', replaceString: 'gi$1$2', isRegex: true, matchCase: true }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [6, 20, 7, 1],
            [8, 20, 9, 1]
        ]);
        findModel.replaceAll();
        assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hello girl, Hello!" << endl;');
        assert.strictEqual(editor.getModel().getLineContent(8), '    cout << "Hello girl again" << endl;');
        assertFindState(editor, [1, 1, 1, 1], null, []);
        findModel.dispose();
        findState.dispose();
    });
    findTest('replaceAll preserving case', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'hello', replaceString: 'goodbye', isRegex: false, matchCase: false, preserveCase: true }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19],
            [9, 14, 9, 19],
        ]);
        findModel.replaceAll();
        assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "goodbye world, Goodbye!" << endl;');
        assert.strictEqual(editor.getModel().getLineContent(7), '    cout << "goodbye world again" << endl;');
        assert.strictEqual(editor.getModel().getLineContent(8), '    cout << "Goodbye world again" << endl;');
        assert.strictEqual(editor.getModel().getLineContent(9), '    cout << "goodbyeworld again" << endl;');
        assertFindState(editor, [1, 1, 1, 1], null, []);
        findModel.dispose();
        findState.dispose();
    });
    findTest('issue #18711 replaceAll with empty string', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'hello', replaceString: '', wholeWord: true }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [6, 14, 6, 19],
            [6, 27, 6, 32],
            [7, 14, 7, 19],
            [8, 14, 8, 19]
        ]);
        findModel.replaceAll();
        assertFindState(editor, [1, 1, 1, 1], null, []);
        assert.strictEqual(editor.getModel().getLineContent(6), '    cout << " world, !" << endl;');
        assert.strictEqual(editor.getModel().getLineContent(7), '    cout << " world again" << endl;');
        assert.strictEqual(editor.getModel().getLineContent(8), '    cout << " world again" << endl;');
        findModel.dispose();
        findState.dispose();
    });
    findTest('issue #32522 replaceAll with ^ on more than 1000 matches', (editor) => {
        let initialText = '';
        for (let i = 0; i < 1100; i++) {
            initialText += 'line' + i + '\n';
        }
        editor.getModel().setValue(initialText);
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: '^', replaceString: 'a ', isRegex: true }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        findModel.replaceAll();
        let expectedText = '';
        for (let i = 0; i < 1100; i++) {
            expectedText += 'a line' + i + '\n';
        }
        expectedText += 'a ';
        assert.strictEqual(editor.getModel().getValue(), expectedText);
        findModel.dispose();
        findState.dispose();
    });
    findTest('issue #19740 Find and replace capture group/backreference inserts `undefined` instead of empty string', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'hello(z)?', replaceString: 'hi$1', isRegex: true, matchCase: true }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [6, 14, 6, 19],
            [7, 14, 7, 19],
            [9, 14, 9, 19]
        ]);
        findModel.replaceAll();
        assertFindState(editor, [1, 1, 1, 1], null, []);
        assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hi world, Hello!" << endl;');
        assert.strictEqual(editor.getModel().getLineContent(7), '    cout << "hi world again" << endl;');
        assert.strictEqual(editor.getModel().getLineContent(9), '    cout << "hiworld again" << endl;');
        findModel.dispose();
        findState.dispose();
    });
    findTest('issue #27083. search scope works even if it is a single line', (editor) => {
        const findState = disposables.add(new FindReplaceState());
        findState.change({ searchString: 'hello', wholeWord: true, searchScope: [new Range(7, 1, 8, 1)] }, false);
        const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
        assertFindState(editor, [1, 1, 1, 1], null, [
            [7, 14, 7, 19]
        ]);
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
    test('issue #288515: Wrong current index in find widget if matches > 1000', () => {
        // Create 1001 lines of 'hello'
        const textArr = Array(1001).fill('hello');
        withTestCodeEditor(textArr, {}, (_editor) => {
            const editor = _editor;
            // Place cursor at line 900, selecting 'hello'
            editor.setSelection(new Selection(900, 1, 900, 6));
            const findState = disposables.add(new FindReplaceState());
            findState.change({ searchString: 'hello' }, false);
            disposables.add(new FindModelBoundToEditorModel(editor, findState));
            assert.strictEqual(findState.matchesCount, 1001);
            // With cursor selecting 'hello' at line 900, matchesPosition should be 900
            assert.strictEqual(findState.matchesPosition, 900);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmluZE1vZGVsLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9maW5kL3Rlc3QvYnJvd3Nlci9maW5kTW9kZWwudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRTdFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDRFQUE0RSxDQUFDO0FBQ3hILE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ3pFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQzlELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRWhGLEtBQUssQ0FBQyxXQUFXLEVBQUUsR0FBRyxFQUFFO0lBRXZCLElBQUksV0FBNEIsQ0FBQztJQUVqQyxLQUFLLENBQUMsR0FBRyxFQUFFO1FBQ1YsV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7SUFDckMsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsR0FBRyxFQUFFO1FBQ2IsV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ3ZCLENBQUMsQ0FBQyxDQUFDO0lBRUgsdUNBQXVD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RUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1NBQ2QsQ0FDRCxDQUFDO1FBRUYsb0NBQW9DO1FBQ3BDLFNBQVMsQ0FBQyxNQUFNLENBQUMsRUFBRSxZQUFZLEVBQUUsSUFBSSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDL0MsZUFBZSxDQUNkLE1BQU0sRUFDTixDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQ2Q7WUFDQyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7U0FDZCxDQUNELENBQUM7UUFFRixvQ0FBb0M7UUFDcEMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxFQUFFLFlBQVksRUFBRSxPQUFPLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNsRCxlQUFlLENBQ2QsTUFBTSxFQUNOLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDZDtZQUNDLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7U0FDZCxDQUNELENBQUM7UUFFRixtQ0FBbUM7UUFDbkMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM1QyxlQUFlLENBQ2QsTUFBTSxFQUNOLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDZDtZQUNDLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7U0FDZCxDQUNELENBQUM7UUFFRixvQ0FBb0M7UUFDcEMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxFQUFFLFlBQVksRUFBRSxPQUFPLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNsRCxlQUFlLENBQ2QsTUFBTSxFQUNOLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDZDtZQUNDLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztTQUNkLENBQ0QsQ0FBQztRQUVGLG1DQUFtQztRQUNuQyxTQUFTLENBQUMsTUFBTSxDQUFDLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzVDLGVBQWUsQ0FDZCxNQUFNLEVBQ04sQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUNkO1lBQ0MsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztTQUNkLENBQ0QsQ0FBQztRQUVGLG9DQUFvQztRQUNwQyxTQUFTLENBQUMsTUFBTSxDQUFDLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzdDLGVBQWUsQ0FDZCxNQUFNLEVBQ04sQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUNkO1lBQ0MsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7U0FDZCxDQUNELENBQUM7UUFFRixvQ0FBb0M7UUFDcEMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM3QyxlQUFlLENBQ2QsTUFBTSxFQUNOLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDZDtZQUNDLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7U0FDZCxDQUNELENBQUM7UUFFRixpQ0FBaUM7UUFDakMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxFQUFFLFdBQVcsRUFBRSxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNsRSxlQUFlLENBQ2QsTUFBTSxFQUNOLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDZDtZQUNDLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7U0FDZCxDQUNELENBQUM7UUFFRixxQ0FBcUM7UUFDckMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxFQUFFLFdBQVcs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QUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7U0FDZCxDQUNELENBQUM7UUFFRixTQUFTLENBQUMsZUFBZSxFQUFFLENBQUM7UUFDNUIsZUFBZSxDQUNkLE1BQU0sRUFDTixDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQ2Q7WUFDQyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztTQUNkLENBQ0QsQ0FBQztRQUVGLFNBQVMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUM1QixlQUFlLENBQ2QsTUFBTSxFQUNOLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDZDtZQUNDLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1NBQ2QsQ0FDRCxDQUFDO1FBRUYsU0FBUyxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQzVCLGVBQWUsQ0FDZCxNQUFNLEVBQ04sQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUNkO1lBQ0MsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7U0FDZCxDQUNELENBQUM7UUFFRixTQUFTLENBQUMsZUFBZSxFQUFFLENBQUM7UUFDNUIsZUFBZSxDQUNkLE1BQU0sRUFDTixDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQ2Q7WUFDQyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztTQUNkLENBQ0QsQ0FBQztRQUVGLFNBQVMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUM1QixlQUFlLENBQ2QsTUFBTSxFQUNOLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDZDtZQUNDLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVB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QyxFQUNkO1lBQ0MsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1NBQ2QsQ0FDRCxDQUFDO1FBRUYsU0FBUyxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQzVCLGVBQWUsQ0FDZCxNQUFNLEVBQ04sQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUNkO1lBQ0MsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1NBQ2QsQ0FDRCxDQUFDO1FBRUYsU0FBUyxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQzVCLGVBQWUsQ0FDZCxNQUFNLEVBQ04sQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUNkO1lBQ0MsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1NBQ2QsQ0FDRCxDQUFDO1FBRUYsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3BCLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNyQixDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLE1BQU0sRUFBRSxFQUFFO1FBQ3RDLE1BQU0sU0FBUyxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDLENBQUM7UUFDMUQsU0FBUyxDQUFDLE1BQU0sQ0FBQyxFQUFFLFlBQVksRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3BFLE1BQU0sU0FBUyxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSwyQkFBMkIsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUV0RixlQUFlLENBQ2QsTUFBTSxFQUNOLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQ1osSUFBSSxFQUNKO1lBQ0MsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7U0FDZCxDQUNELENBQUM7UUFFRixTQUFTLENBQUMsZUFBZSxFQUFFLENBQUM7UUFDNUIsZUFBZSxDQUNkLE1BQU0sRUFDTixDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQ2Q7WUFDQyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztTQUNkLENBQ0QsQ0FBQztRQUVGLFNBQVMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUM1QixlQUFlLENBQ2QsTUFBTSxFQUNOLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDZDtZQUNDLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1NBQ2QsQ0FDRCxDQUFDO1FBRUYsU0FBUyxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQzVCLGVBQWUsQ0FDZCxNQUFNLEVBQ04sQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUNkO1lBQ0MsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7U0FDZCxDQUNELENBQUM7UUFFRixTQUFTLENBQUMsZUFBZSxFQUFFLENBQUM7UUFDNUIsZUFBZSxDQUNkLE1BQU0sRUFDTixDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQ2Q7WUFDQyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztTQUNkLENBQ0QsQ0FBQztRQUVGLFNBQVMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUM1QixlQUFlLENBQ2QsTUFBTSxFQUNOLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDZDtZQUNDLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1NBQ2QsQ0FDRCxDQUFDO1FBRUYsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3BCLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNyQixDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyxnQ0FBZ0MsRUFBRSxDQUFDLE1BQU0sRUFBRSxFQUFFO1FBQ3JELE1BQU0sU0FBUyxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDLENBQUM7UUFDMUQsU0FBUyxDQUFDLE1BQU0sQ0FBQyxFQUFFLFlBQVksRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDMUcsTUFBTSxTQUFTLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLDJCQUEyQixDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBRXRGLGVBQWUsQ0FDZCxNQUFNLEVBQ04sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFDWixJQUFJLEVBQ0o7WUFDQyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1NBQ2QsQ0FDRCxDQUFDO1FBRUYsU0FBUyxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQzVCLGVBQWUsQ0FDZCxNQUFNLEVBQ04sQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUNkO1lBQ0MsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztTQUNkLENBQ0QsQ0FBQztRQUVGLFNBQVMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUM1QixlQUFlLENBQ2QsTUFBTSxFQUNOLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDZDtZQUNDLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUs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QUN6RCxRQUFRLEVBQUUsSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQztTQUM3QixDQUFDLENBQUM7UUFDSCxlQUFlLENBQ2QsTUFBTSxFQUNOLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQ2QsSUFBSSxFQUNKO1lBQ0MsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7U0FDZCxDQUNELENBQUM7UUFFRixTQUFTLENBQUMsZUFBZSxFQUFFLENBQUM7UUFDNUIsZUFBZSxDQUNkLE1BQU0sRUFDTixDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQ2Q7WUFDQyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztTQUNkLENBQ0QsQ0FBQztRQUVGLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNwQixTQUFTLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDckIsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsUUFBUSxFQUFFLENBQUMsTUFBTSxFQUFFLEVBQUU7UUFDN0IsTUFBTSxTQUFTLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLGdCQUFnQixFQUFFLENBQUMsQ0FBQztRQUMxRCxTQUFTLENBQUMsTUFBTSxDQUFDLEVBQUUsWUFBWSxFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDOUQsTUFBTSxTQUFTLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLDJCQUEyQixDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBRXRGLGVBQWUsQ0FDZCxNQUFNLEVBQ04sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFDWixJQUFJLEVBQ0o7WUFDQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNaLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ1osQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDWixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNaLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ1osQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDWixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNaLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ1osQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDWixDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUNkLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ2QsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7U0FDZCxDQUNELENBQUM7UUFFRixTQUFTLENBQUMsZUFBZSxFQUFFLENBQUM7UUFDNUIsZUFBZSxDQUNkLE1BQU0sRUFDTixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUNaLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQ1o7WUFDQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNaLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ1osQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDWixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNaLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ1osQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDWixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNaLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ1osQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDWixDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUNkLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ2QsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7U0FDZCxDQUNELENBQUM7UUFFRixTQUFTLENBQUMsZUFBZSxFQUFFLENBQUM7UUFDNUIsZUFBZSxDQUNkLE1BQU0sRUFDTixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUNaLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQ1o7WUFDQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNaLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ1osQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDWixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNaLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ1osQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDWixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNaLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ1osQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDWixDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUNkLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ2QsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7U0FDZCxDQUNELENBQUM7UUFFRixTQUFTLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDcEIsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ3JCLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUFDLE1BQU0sRUFBRSxFQUFFO1FBQzdCLE1BQU0sU0FBUyxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDLENBQUM7UUFDMUQsU0FBUyxDQUFDLE1BQU0sQ0FBQyxFQUFFLFlBQVksRUFBRSxHQUFHLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzlELE1BQU0sU0FBUyxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSwyQkFBMkIsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUV0RixlQUFlLENBQ2QsTUFBTSxFQUNOLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQ1osSUFBSSxFQUNKO1lBQ0MsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDWixDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDZCxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztZQUNoQixDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztTQUNkLENBQ0QsQ0FBQztRQUVGLFNBQVMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUM1QixlQUFlLENBQ2QsTUFBTSxFQUNOLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDZDtZQUNDLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ1osQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ2QsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7WUFDaEIsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7U0FDZCxDQUNELENBQUM7UUFFRixTQUFTLENBQUMsZUFBZSxFQUFFLENBQUM7UUFDNUIsZUFBZSxDQUNkLE1BQU0sRUFDTixDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQ2Q7WUFDQyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNaLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUNkLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDO1lBQ2hCLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1NBQ2QsQ0FDRCxDQUFDO1FBRUYsU0FBUyxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQzVCLGVBQWUsQ0FDZCxNQUFNLEVBQ04sQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUNkO1lBQ0MsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDWixDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDZCxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztZQUNoQixDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztTQUNkLENBQ0QsQ0FBQztRQUVGLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNwQixTQUFTLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDckIsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsY0FBYyxFQUFFLENBQUMsTUFBTSxFQUFFLEVBQUU7UUFDbkMsTUFBTSxTQUFTLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLGdCQUFnQixFQUFFLENBQUMsQ0FBQztRQUMxRCxTQUFTLENBQUMsTUFBTSxDQUFDLEVBQUUsWUFBWSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDL0QsTUFBTSxTQUFTLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLDJCQUEyQixDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBRXRGLGVBQWUsQ0FDZCxNQUFNLEVBQ04sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFDWixJQUFJLEVBQ0o7WUFDQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNaLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1NBQ2QsQ0FDRCxDQUFDO1FBRUYsU0FBUyxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQzVCLGVBQWUsQ0FDZCxNQUFNLEVBQ04sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFDWixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUNaO1lBQ0MsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDWixDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztTQUNkLENBQ0QsQ0FBQztRQUVGLFNBQVMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUM1QixlQUFlLENBQ2QsTUFBTSxFQUNOLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQ2QsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFDZDtZQUNDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ1osQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7U0FDZCxDQUNELENBQUM7UUFFRixTQUFTLENBQUMsZUFBZSxFQUFFLENBQUM7UUFDNUIsZUFBZSxDQUNkLE1BQU0sRUFDTixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUNaLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQ1o7WUFDQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNaLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxF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LENBQUMsRUFBRSxFQUFFLENBQUM7WUFDYixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNiLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDYixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNiLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ2QsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7WUFDZixDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztTQUNkLENBQ0QsQ0FBQztRQUVGLFNBQVMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUM1QixlQUFlLENBQ2QsTUFBTSxFQUNOLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQ2IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDYjtZQUNDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDYixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNiLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ1osQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDYixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNiLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDYixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNiLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ2QsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7WUFDZixDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztTQUNkLENBQ0QsQ0FBQztRQUVGLFNBQVMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUM1QixlQUFlLENBQ2QsTUFBTSxFQUNOLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQ2IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDYjtZQUNDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDYixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNiLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ1osQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDYixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNiLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDYixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNiLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ2QsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7WUFDZixDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztTQUNkLENBQ0QsQ0FBQztRQUVGLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNwQixTQUFTLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDckIsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxNQUFNLEVBQUUsRUFBRTtRQUNyQyxNQUFNLFNBQVMsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDO1FBQzFELFNBQVMsQ0FBQyxNQUFNLENBQUMsRUFBRSxZQUFZLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNqRSxNQUFNLFNBQVMsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksMkJBQTJCLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFFdEYsZUFBZSxDQUNkLE1BQU0sRUFDTixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUNaLElBQUksRUFDSjtZQUNDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDYixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNiLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ1osQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDYixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNiLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDYixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNiLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ2QsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7WUFDZixDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztTQUNkLENBQ0QsQ0FBQztRQUVGLFNBQVMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUM1QixlQUFlLENBQ2QsTUFBTSxFQUNOLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQ2QsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFDZDtZQUNDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDYixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNiLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ1osQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDYixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNiLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDYixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNiLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ2QsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7WUFDZixDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztTQUNkLENBQ0QsQ0FBQztRQUVGLFNBQVMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUM1QixlQUFlLENBQ2QsTUFBTSxFQUNOLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQ2YsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFDZjtZQUNDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDYixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNiLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ1osQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDYixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNiLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDYixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNiLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ2QsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7WUFDZixDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztTQUNkLENBQ0QsQ0FBQztRQUVGLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNwQixTQUFTLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDckIsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsY0FBYyxFQUFFLENBQUMsTUFBTSxFQUFFLEVBQUU7UUFDbkMsTUFBTSxTQUFTLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLGdCQUFnQixFQUFFLENBQUMsQ0FBQztRQUMxRCxTQUFTLENBQUMsTUFBTSxDQUFDLEVBQUUsWUFBWSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDL0QsTUFBTSxTQUFTLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLDJCQUEyQixDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBRXRGLGVBQWUsQ0FDZCxNQUFNLEVBQ04sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFDWixJQUFJLEVBQ0o7WUFDQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNaLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1NBQ2QsQ0FDRCxDQUFDO1FBRUYsU0FBUyxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQzVCLGVBQWUsQ0FDZCxNQUFNLEVBQ04sQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFDZCxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUNkO1lBQ0MsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDWixDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztTQUNkLENBQ0QsQ0FBQztRQUVGLFNBQVMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUM1QixlQUFlLENBQ2QsTUFBTSxFQUNOLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQ1osQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFDWjtZQUNDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ1osQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7U0FDZCxDQUNELENBQUM7UUFFRixTQUFTLENBQUMsZUFBZSxFQUFFLENBQUM7UUFDNUIsZUFBZSxDQUNkLE1BQU0sRUFDTixDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUNkLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQ2Q7WUFDQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNaLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1NBQ2QsQ0FDRCxDQUFDO1FBRUYsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3BCLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNyQixDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyxlQUFlLEVBQUUsQ0FBQyxNQUFNLEVBQUUsRUFBRTtRQUNwQyxNQUFNLFNBQVMsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDO1FBQzFELFNBQVMsQ0FBQyxNQUFNLENBQUMsRUFBRSxZQUFZLEVBQUUsT0FBTyxFQUFFLGFBQWEsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3pGLE1BQU0sU0FBUyxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSwyQkFBMkIsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUV0RixlQUFlLENBQ2QsTUFBTSxFQUNOLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQ1osSUFBSSxFQUNKO1lBQ0MsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7U0FDZCxDQUNELENBQUM7UUFFRixNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxzQkFBc0IsQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFO1lBQ3pELFFBQVEsRUFBRSxJQUFJLFFBQVEsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDO1NBQzdCLENBQUMsQ0FBQztRQUNILGVBQWUsQ0FDZCxNQUFNLEVBQ04sQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDZCxJQUFJLEVBQ0o7WUFDQyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztTQUNkLENBQ0QsQ0FBQztRQUNGLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsRUFBRSw0Q0FBNEMsQ0FBQyxDQUFDO1FBRXZHLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNwQixlQUFlLENBQ2QsTUFBTSxFQUNOLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDZDtZQUNDLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1NBQ2QsQ0FDRCxDQUFDO1FBQ0YsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFHLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxFQUFFLDRDQUE0QyxDQUFDLENBQUM7UUFFdkcsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3BCLGVBQWUsQ0FDZCxNQUFNLEVBQ04sQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUNkO1lBQ0MsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1NBQ2QsQ0FDRCxDQUFDO1FBQ0YsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFHLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxFQUFFLHlDQUF5QyxDQUFDLENBQUM7UUFFcEcsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3BCLGVBQWUsQ0FDZCxNQUFNLEVBQ04sQ0FBQyxDQUFD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RSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztTQUNkLENBQ0QsQ0FBQztRQUVGLE1BQU0sQ0FBQyxZQUFZLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUU3QyxTQUFTLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUU3QixNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsRUFBRTtZQUN0RSxJQUFJLFNBQVMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDM0IsSUFBSSxTQUFTLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQzNCLElBQUksU0FBUyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUMzQixJQUFJLFNBQVMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7U0FDM0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRTFCLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRyxDQUFDLFFBQVEsRUFBRSxFQUFFLElBQUksU0FBUyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFF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LEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7U0FDZCxDQUNELENBQUM7UUFFRixTQUFTLENBQUMsT0FBTyxFQUFFLENBQUM7UUFFcEIsZUFBZSxDQUNkLE1BQU0sRUFDTixDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQ2Q7WUFDQyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7U0FDZCxDQUNELENBQUM7UUFDRixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLEVBQUUsNENBQTRDLENBQUMsQ0FBQztRQUV2RyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDcEIsZUFBZSxDQUNkLE1BQU0sRUFDTixDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQ2Q7WUFDQyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1NBQ2QsQ0FDRCxDQUFDO1FBQ0YsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFHLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxFQUFFLHlDQUF5QyxDQUFDLENBQUM7UUFFcEcsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3BCLGVBQWUsQ0FDZCxNQUFNLEVBQ04sQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUNkO1lBQ0MsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7U0FDZCxDQUNELENBQUM7UUFDRixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLEVBQUUsdUNBQXVDLENBQUMsQ0FBQztRQUVsRyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDcEIsZUFBZSxDQUNkLE1BQU0sRUFDTixDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUNkLElBQUksRUFDSixFQUFFLENBQ0YsQ0FBQztRQUNGLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsRUFBRSx1Q0FBdUMsQ0FBQyxDQUFDO1FBRWxHLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNwQixTQUFTLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDckIsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMscUZBQXFGLEVBQUUsQ0FBQyxNQUFNLEVBQUUsRUFBRTtRQUMxRyxNQUFNLFNBQVMsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDO1FBQzFELFNBQVMsQ0FBQyxNQUFNLENBQUMsRUFBRSxZQUFZLEVBQUUsbUJBQW1CLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDbkcsTUFBTSxTQUFTLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLDJCQUEyQixDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBRXRGLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLHNCQUFzQixDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUU7WUFDekQsUUFBUSxFQUFFLElBQUksUUFBUSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUM7U0FDN0IsQ0FBQyxDQUFDO1FBRUgsZUFBZSxDQUNkLE1BQU0sRUFDTixDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUNkLElBQUksRUFDSjtZQUNDLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztTQUNkLENBQ0QsQ0FBQztRQUVGLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUVwQixlQUFlLENBQ2QsTUFBTSxFQUNOLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDZDtZQUNDLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztTQUNkLENBQ0QsQ0FBQztRQUVGLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsRUFBRSwwQ0FBMEMsQ0FBQyxDQUFDO1FBRXJHLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNwQixlQUFlLENBQ2QsTUFBTSxFQUNOLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUs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