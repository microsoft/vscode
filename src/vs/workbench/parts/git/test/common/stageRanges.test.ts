/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


import * as assert from 'assert';
import { getSelectedChanges, applyChangesToModel } from 'vs/workbench/parts/git/common/stageRanges';
import { Model } from 'vs/editor/common/model/model';
import { NullMode } from 'vs/editor/common/modes/nullMode';
import { IChange, IEditorSelection, DefaultEndOfLine } from 'vs/editor/common/editorCommon';
import { Selection } from 'vs/editor/common/core/selection';

function changesEqual(actual: IChange[], expected: IChange[]) {
	assert.equal(actual.length, expected.length);
	if (actual.length === expected.length) {
		for (var i = 0; i < actual.length; ++i) {
			assert.equal(actual[i].modifiedStartLineNumber, expected[i].modifiedStartLineNumber);
			assert.equal(actual[i].modifiedEndLineNumber, expected[i].modifiedEndLineNumber);
			assert.equal(actual[i].originalStartLineNumber, expected[i].originalStartLineNumber);
			assert.equal(actual[i].originalEndLineNumber, expected[i].originalEndLineNumber);
		}
	}
}

function createChange(modifiedStart:number, modifiedEnd:number, originalStart:number, originalEnd:number): IChange {
	return {
		modifiedStartLineNumber : modifiedStart,
		modifiedEndLineNumber : modifiedEnd,
		originalStartLineNumber : originalStart,
		originalEndLineNumber : originalEnd
	};
}

suite('Git - Stage ranges', () => {
	var mode = new NullMode();

	test('Get selected changes test - no change selected (selection before changes)', () => {
		var selections: IEditorSelection[] = [];
		selections.push(Selection.createSelection(1, 1, 1, 1));
		var changes: IChange[] = [];
		changes.push(createChange(2, 3, 1, 1));
		var result = getSelectedChanges(changes, selections);
		assert.equal(result.length, 0);
	});

	test('Get selected changes test - no change selected (selection after changes)', () => {
		var selections: IEditorSelection[] = [];
		selections.push(Selection.createSelection(5, 3, 7, 8));
		var changes: IChange[] = [];
		changes.push(createChange(2, 3, 1, 1));
		var result = getSelectedChanges(changes, selections);
		assert.equal(result.length, 0);
	});

	test('Get selected changes test - one change fully selected', () => {
		var selections: IEditorSelection[] = [];
		selections.push(Selection.createSelection(5, 3, 7, 8));
		var changes: IChange[] = [];
		changes.push(createChange(2, 3, 1, 1), createChange(5, 7, 2, 6));
		var result = getSelectedChanges(changes, selections);
		var expected: IChange[] = [];
		expected.push(createChange(5, 7, 2, 6));
		changesEqual(result, expected);
	});

	test('Get selected changes test - one change fully selected(deletion)', () => {
		var selections: IEditorSelection[] = [];
		selections.push(Selection.createSelection(5, 3, 7, 8));
		var changes: IChange[] = [];
		changes.push(createChange(2, 3, 1, 1), createChange(5, 0, 5, 6));
		var result = getSelectedChanges(changes, selections);
		var expected: IChange[] = [];
		expected.push(createChange(5, 0, 5, 6));
		changesEqual(result, expected);
	});

	test('Get selected changes test - one change (insertion) partially selected', () => {
		var selections: IEditorSelection[] = [];
		selections.push(Selection.createSelection(5, 3, 6, 1));
		var changes: IChange[] = [];
		changes.push(createChange(2, 3, 1, 0), createChange(5, 7, 2, 0));
		var result = getSelectedChanges(changes, selections);
		var expected: IChange[] = [];
		expected.push(createChange(5, 6, 2, 0));
		changesEqual(result, expected);
	});

	test('Get selected changes test - multiple changes selected with one selection', () => {
		var selections: IEditorSelection[] = [];
		selections.push(Selection.createSelection(2, 7, 7, 1));
		var changes: IChange[] = [];
		changes.push(createChange(2, 3, 1, 1), createChange(5, 7, 2, 6));
		var result = getSelectedChanges(changes, selections);
		var expected = changes;
		changesEqual(result, expected);
	});

	test('Get selected changes test - one change partially seleceted with multiple selections', () => {
		var selections: IEditorSelection[] = [];
		selections.push(Selection.createSelection(2, 2, 5, 5),  Selection.createSelection(7, 2, 9, 1));
		var changes: IChange[] = [];
		changes.push(createChange(1, 15, 1, 10), createChange(120, 127, 122, 126));
		var result = getSelectedChanges(changes, selections);
		var expected: IChange[] = [];
		expected.push(createChange(2, 5, 1, 10), createChange(7, 9, 1, 10));
		changesEqual(result, expected);
	});

	test('Get selected changes test - one change partially seleceted with overlapping selections', () => {
		var selections: IEditorSelection[] = [];
		selections.push(Selection.createSelection(2, 2, 5, 5),  Selection.createSelection(5, 2, 9, 1));
		var changes: IChange[] = [];
		changes.push(createChange(1, 15, 1, 10), createChange(120, 127, 122, 126));
		var result = getSelectedChanges(changes, selections);
		var expected: IChange[] = [];
		expected.push(createChange(2, 5, 1, 10), createChange(6, 9, 1, 10));
		changesEqual(result, expected);
	});

	test('Get selected changes test - multiple changes partially selected with multiple selections', () => {
		var selections: IEditorSelection[] = [];
		selections.push(Selection.createSelection(3, 1, 9, 5),  Selection.createSelection(115, 2, 129, 1));
		var changes: IChange[] = [];
		changes.push(createChange(1, 15, 1, 10), createChange(116, 135, 122, 126));
		var result = getSelectedChanges(changes, selections);
		var expected: IChange[] = [];
		expected.push(createChange(3, 9, 1, 10), createChange(116, 129, 122, 126));
		changesEqual(result, expected);
	});

	test('Get selected changes test - multiple changes selected with multiple selections. Multiple changes not selected', () => {
		var selections: IEditorSelection[] = [];
		selections.push(Selection.createSelection(33, 11, 79, 15),  Selection.createSelection(155, 21, 189, 11));
		var changes: IChange[] = [];
		changes.push(createChange(1, 45, 1, 0), createChange(80, 89, 72, 79), createChange(154, 190, 152, 186), createChange(216, 235, 222, 226));
		var result = getSelectedChanges(changes, selections);
		var expected: IChange[] = [];
		expected.push(createChange(33, 45, 1, 0), createChange(155, 189, 152, 186));
		changesEqual(result, expected);
	});

	function createModel(text:string): Model {
		return new Model(text, Model.DEFAULT_CREATION_OPTIONS, mode);
	}

	test('Apply changes to model - no changes', () => {
		var original = createModel('One line that is equal. ');
		var modified = createModel('One line that is equal. \n Second line is new.');
		var changes: IChange[] = [];
		var result = applyChangesToModel(original, modified, changes);
		var expected = original;
		assert.equal(result, expected.getValue());
		original.dispose();
		modified.dispose();
	});

	test('Apply changes to model - one line change at the end', () => {
		var original = createModel('One line that is equal. ');
		var modified = createModel('One line that is equal. \n Second line is new.');
		var changes: IChange[] = [];
		changes.push(createChange(2, 2, 2, 2));
		var result = applyChangesToModel(original, modified, changes);
		var expected = modified;
		assert.equal(result, expected.getValue());
		original.dispose();
		modified.dispose();
	});

	test('Apply changes to model - one line insertion in the middle', () => {
		var original = createModel('One line that is equal. \n Last line same. ');
		var modified = createModel('One line that is equal. \n Second line is new. \n Last line same. ');
		var changes: IChange[] = [];
		changes.push(createChange(2, 2, 1, 0));
		var result = applyChangesToModel(original, modified, changes);
		var expected = modified;
		assert.equal(result, expected.getValue());
		original.dispose();
		modified.dispose();
	});

	test('Apply changes to model - three empty lines insertion in the middle', () => {
		var original = createModel('hello\n there\n isidor\n');
		var modified = createModel('hello\n there\n \n \n \n isidor\n');
		var changes: IChange[] = [];
		changes.push(createChange(3, 5, 2, 0));
		var result = applyChangesToModel(original, modified, changes);
		var expected = modified;
		assert.equal(result, expected.getValue());
		original.dispose();
		modified.dispose();
	});

	test('Apply changes to model - one line deletion', () => {
		var original = createModel('One line that is equal. \n Second line is old. \n Third line same. \n Forth line not important');
		var modified = createModel('One line that is equal. \n Third line same. ');
		var changes: IChange[] = [];
		changes.push(createChange(2, 0, 2, 2));
		var result = applyChangesToModel(original, modified, changes);
		var expected = createModel('One line that is equal. \n Third line same. \n Forth line not important');
		assert.equal(result, expected.getValue());
		original.dispose();
		modified.dispose();
		expected.dispose();
	});

	test('Apply changes to model - one multi line change', () => {
		var original = createModel('One line that is equal. \n Second line is different. \n Third line also different. \n Forth line is same. \n Fifth line is different.');
		var modified = createModel('One line that is equal. \n 2nd line is different. \n 3rd line also different. \n Forth line is same. \n 5th line is different.');
		var changes: IChange[] = [];
		changes.push(createChange(2, 3, 2, 3));
		var result = applyChangesToModel(original, modified, changes);
		var expected = createModel('One line that is equal. \n 2nd line is different. \n 3rd line also different. \n Forth line is same. \n Fifth line is different.');
		assert.equal(result, expected.getValue());
		original.dispose();
		modified.dispose();
		expected.dispose();
	});

	test('Apply changes to model - two overlapping changes', () => {
		var original = createModel(' One \n Two \n Three \n Four \n Five \n');
		var modified = createModel(' One \n 2 \n 3 \n 4 \n NotSelected \n');
		var changes: IChange[] = [];
		changes.push(createChange(2, 3, 2, 4), createChange(4, 4, 2, 4));
		var result = applyChangesToModel(original, modified, changes);
		var expected = createModel(' One \n 2 \n 3 \n 4 \n Five \n');
		assert.equal(result, expected.getValue());
		original.dispose();
		modified.dispose();
		expected.dispose();
	});

	test('Apply changes to model - multiple small changes', () => {
		var original = createModel(' One \n Two \n Three \n Four \n Five \n Six \n Seven \n Eight \n');
		var modified = createModel(' One \n 2 \n Three \n 4 \n 5 \n Six \n 7 \n 8 \n');
		var changes: IChange[] = [];
		changes.push(createChange(1, 2, 1, 2), createChange(5, 5, 5, 5), createChange(7, 8, 7, 8));
		var result = applyChangesToModel(original, modified, changes);
		var expected = createModel(' One \n 2 \n Three \n Four \n 5 \n Six \n 7 \n 8 \n');
		assert.equal(result, expected.getValue());
		original.dispose();
		modified.dispose();
		expected.dispose();
	});

	test('Apply changes to model - multiple changes - insertion, deletion and modification', () => {
		var original = createModel(' One \n Two \n Three \n Four \n Five \n Six \n Seven \n Eight \n Nine \n Ten');
		var modified = createModel(' 1 \n Three \n 4 \n 5 \n Six \n 7 \n NEWLINE \n Eight ');
		var changes: IChange[] = [];
		changes.push(createChange(1, 1, 1, 1), createChange(2, 0, 2, 2), createChange(3, 3, 4, 4), createChange(7, 7, 7, 0), createChange(7, 0, 9, 10));
		var result = applyChangesToModel(original, modified, changes);
		var expected = createModel(' 1 \n Three \n 4 \n Five \n Six \n Seven \n NEWLINE \n Eight ');
		assert.equal(result, expected.getValue());
		original.dispose();
		modified.dispose();
		expected.dispose();
	});

	test('Apply changes to model - multiple changes 2 - insertion, deletion and modification', () => {
		var original = createModel(' One \n Two \n Three \n Four \n Five \n Six \n Seven \n Eight \n Nine \n Ten ');
		var modified = createModel(' Two \n Three \n INSERTED \n Four \n Six \n 7 \n Eight \n 9 \n CHANGEIGNORED \n INSERTED');
		var changes: IChange[] = [];
		changes.push(createChange(1, 0, 1, 1), createChange(3, 3, 3, 0), createChange(5, 0, 5, 5), createChange(6, 8, 7, 9), createChange(10, 10, 10, 0));
		var result = applyChangesToModel(original, modified, changes);
		var expected = createModel(' Two \n Three \n INSERTED \n Four \n Six \n 7 \n Eight \n 9 \n Ten \n INSERTED');
		assert.equal(result, expected.getValue());
		original.dispose();
		modified.dispose();
		expected.dispose();
	});
});
