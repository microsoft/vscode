/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TextEdit } from '../../../types/src/index';
import { createCompletionState } from '../completionState';
import { IntelliSenseInsertion } from '../textDocument';
import { createTextDocument } from './textDocument';

suite('CompletionState', function () {
	test('position unchanged when before edit range', function () {
		const textDocument = createTextDocument('file:///test.ts', 'typescript', 1, 'hello\nworld');
		const position = { line: 0, character: 2 };
		const edit: TextEdit = {
			range: {
				start: { line: 1, character: 0 },
				end: { line: 1, character: 5 },
			},
			newText: 'everyone',
		};
		const completionState = createCompletionState(textDocument, position);

		const newState = completionState.applyEdits([edit]);
		assert.deepStrictEqual(newState.position, position);
		assert.deepStrictEqual(newState.originalPosition, position);
		assert.deepStrictEqual(newState.originalOffset, textDocument.offsetAt(position));
		assert.deepStrictEqual(newState.textDocument.getText(), 'hello\neveryone');
		assert.deepStrictEqual(newState.editsWithPosition.length, 1);
	});

	test('position adjusts when within edit range', function () {
		const textDocument = createTextDocument('file:///test.ts', 'typescript', 1, 'hello\nworld');
		const position = { line: 1, character: 2 };
		const edit: TextEdit = {
			range: {
				start: { line: 1, character: 0 },
				end: { line: 1, character: 5 },
			},
			newText: 'everyone',
		};
		const completionState = createCompletionState(textDocument, position);

		const newState = completionState.applyEdits([edit]);
		assert.deepStrictEqual(newState.position, { line: 1, character: 8 });
		assert.deepStrictEqual(newState.textDocument.getText(), 'hello\neveryone');
		assert.deepStrictEqual(newState.editsWithPosition.length, 1);
		assert.deepStrictEqual(newState.originalPosition, position);
		assert.deepStrictEqual(newState.originalOffset, textDocument.offsetAt(position));
	});

	test('position at exact start of edit range gets moved to end of edit', function () {
		const textDocument = createTextDocument('file:///test.ts', 'typescript', 1, 'hello\nworld');
		const position = { line: 1, character: 0 };
		const edit: TextEdit = {
			range: {
				start: { line: 1, character: 0 },
				end: { line: 1, character: 5 },
			},
			newText: 'everyone',
		};
		const completionState = createCompletionState(textDocument, position);

		const newState = completionState.applyEdits([edit]);
		assert.deepStrictEqual(newState.position, { line: 1, character: 8 });
		assert.deepStrictEqual(newState.textDocument.getText(), 'hello\neveryone');
		assert.deepStrictEqual(newState.editsWithPosition.length, 1);
		assert.deepStrictEqual(newState.originalPosition, position);
		assert.deepStrictEqual(newState.originalOffset, textDocument.offsetAt(position));
	});

	test('position after edit range adjusts by edit length difference', function () {
		const textDocument = createTextDocument('file:///test.ts', 'typescript', 1, 'hello\nworld! How are you?');
		const position = { line: 1, character: 12 };
		const edit: TextEdit = {
			range: {
				start: { line: 1, character: 0 },
				end: { line: 1, character: 5 },
			},
			newText: 'everyone',
		};
		const completionState = createCompletionState(textDocument, position);

		const newState = completionState.applyEdits([edit]);
		assert.deepStrictEqual(newState.position, { line: 1, character: 15 });
		assert.deepStrictEqual(newState.textDocument.getText(), 'hello\neveryone! How are you?');
		assert.deepStrictEqual(newState.editsWithPosition.length, 1);
		assert.deepStrictEqual(newState.originalPosition, position);
		assert.deepStrictEqual(newState.originalOffset, textDocument.offsetAt(position));
	});

	test('can apply multiple edits', function () {
		const textDocument = createTextDocument('file:///test.ts', 'typescript', 1, 'hello\nworld! How are you?');
		const position = { line: 1, character: 12 };
		const edits: TextEdit[] = [
			{
				range: {
					start: { line: 1, character: 0 },
					end: { line: 1, character: 5 },
				},
				newText: 'everyone',
			},
			{
				range: {
					start: { line: 0, character: 0 },
					end: { line: 0, character: 5 },
				},
				newText: 'hi',
			},
		];
		const completionState = createCompletionState(textDocument, position);

		const newState = completionState.applyEdits(edits);
		assert.deepStrictEqual(newState.position, { line: 1, character: 15 });
		assert.deepStrictEqual(newState.textDocument.getText(), 'hi\neveryone! How are you?');
		assert.deepStrictEqual(newState.editsWithPosition.length, 2);
		assert.deepStrictEqual(newState.originalPosition, position);
		assert.deepStrictEqual(newState.originalOffset, textDocument.offsetAt(position));
	});

	test('can apply multiple edits in different calls', function () {
		const textDocument = createTextDocument('file:///test.ts', 'typescript', 1, 'hello\nworld! How are you?');
		const position = { line: 1, character: 12 };
		const completionState = createCompletionState(textDocument, position);

		const intermediateState = completionState.applyEdits([
			{
				range: {
					start: { line: 1, character: 0 },
					end: { line: 1, character: 5 },
				},
				newText: 'everyone',
			},
		]);
		const newState = intermediateState.applyEdits([
			{
				range: {
					start: { line: 0, character: 0 },
					end: { line: 0, character: 5 },
				},
				newText: 'hi',
			},
		]);
		assert.deepStrictEqual(newState.position, { line: 1, character: 15 });
		assert.deepStrictEqual(newState.textDocument.getText(), 'hi\neveryone! How are you?');
		assert.deepStrictEqual(newState.editsWithPosition.length, 2);
		assert.deepStrictEqual(newState.originalPosition, position);
		assert.deepStrictEqual(newState.originalOffset, textDocument.offsetAt(position));
	});

	test('selectedCompletionInfo is stored on its own, but applied as a normal edit', function () {
		const textDocument = createTextDocument('file:///test.ts', 'typescript', 1, 'const person = Person.');
		const position = { line: 0, character: 22 };
		const completionState = createCompletionState(textDocument, position);

		const selectedCompletionInfo: IntelliSenseInsertion = {
			text: 'getName',
			range: {
				start: { line: 0, character: 22 },
				end: { line: 0, character: 22 },
			},
		};

		const newState = completionState.addSelectedCompletionInfo(selectedCompletionInfo);
		assert.deepStrictEqual(newState.position, { line: 0, character: 29 });
		assert.deepStrictEqual(newState.textDocument.getText(), 'const person = Person.getName');
		assert.deepStrictEqual(newState.editsWithPosition.length, 1);
		assert.deepStrictEqual(newState.editsWithPosition[0].source, 'selectedCompletionInfo');
		assert.deepStrictEqual(newState.originalPosition, position);
		assert.deepStrictEqual(newState.originalOffset, textDocument.offsetAt(position));
	});

	test('selectedCompletionInfo can only be applied once', function () {
		const textDocument = createTextDocument('file:///test.ts', 'typescript', 1, 'const person = Person.');
		const position = { line: 0, character: 22 };
		const completionState = createCompletionState(textDocument, position);

		const selectedCompletionInfo: IntelliSenseInsertion = {
			text: 'getName',
			range: {
				start: { line: 0, character: 22 },
				end: { line: 0, character: 22 },
			},
		};

		const newState = completionState.addSelectedCompletionInfo(selectedCompletionInfo);
		assert.throws(() => {
			newState.addSelectedCompletionInfo(selectedCompletionInfo);
		});
	});

	test('selectedCompletionInfo combined with other edits', function () {
		const textDocument = createTextDocument('file:///test.ts', 'typescript', 1, 'const person = Person.');
		const position = { line: 0, character: 22 };
		const completionState = createCompletionState(textDocument, position);
		const selectedCompletionInfo: IntelliSenseInsertion = {
			text: 'getName',
			range: {
				start: { line: 0, character: 22 },
				end: { line: 0, character: 22 },
			},
		};

		const intermediateState = completionState.addSelectedCompletionInfo(selectedCompletionInfo);

		const speculativeEdit: TextEdit = {
			newText: '()',
			range: {
				start: intermediateState.position,
				end: intermediateState.position,
			},
		};

		const newState = intermediateState.applyEdits([speculativeEdit]);
		assert.deepStrictEqual(newState.position, { line: 0, character: 31 });
		assert.deepStrictEqual(newState.textDocument.getText(), 'const person = Person.getName()');
		assert.deepStrictEqual(newState.editsWithPosition.length, 2);
		assert.deepStrictEqual(newState.editsWithPosition[0].source, 'selectedCompletionInfo');
		assert.deepStrictEqual(newState.originalPosition, position);
		assert.deepStrictEqual(newState.originalOffset, textDocument.offsetAt(position));
	});

	test('updating position does not affect edits', function () {
		const textDocument = createTextDocument('file:///test.ts', 'typescript', 1, 'hello\nworld');
		const position = { line: 0, character: 2 };
		const edit: TextEdit = {
			range: {
				start: { line: 1, character: 0 },
				end: { line: 1, character: 5 },
			},
			newText: 'everyone',
		};
		const completionState = createCompletionState(textDocument, position);
		const newState = completionState.applyEdits([edit]);
		const updatedState = newState.updatePosition({ line: 0, character: 5 });

		assert.deepStrictEqual(updatedState.position, { line: 0, character: 5 });
		assert.deepStrictEqual(updatedState.textDocument.getText(), 'hello\neveryone');
		assert.deepStrictEqual(updatedState.editsWithPosition.length, 1);
		assert.deepStrictEqual(updatedState.originalPosition, position);
		assert.deepStrictEqual(updatedState.originalOffset, textDocument.offsetAt(position));
	});
});
