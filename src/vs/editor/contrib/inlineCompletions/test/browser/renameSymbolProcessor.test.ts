/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../common/core/range.js';
import { RenameInferenceEngine } from '../../browser/model/renameSymbolProcessor.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import type { Position } from '../../../../common/core/position.js';
import { StandardTokenType } from '../../../../common/encodedTokenAttributes.js';
import type { ITextModel } from '../../../../common/model.js';

class TestRenameInferenceEngine extends RenameInferenceEngine {

	constructor(private readonly identifiers: { type: StandardTokenType; range: Range }[]) {
		super();
	}

	protected override getTokenAtPosition(textModel: ITextModel, position: Position): { type: StandardTokenType; range: Range } {
		for (const id of this.identifiers) {
			if (id.range.containsPosition(position)) {
				return { type: id.type, range: id.range };
			}
		}
		throw new Error('No token found at position');
	}
}

function assertDefined<T>(value: T | undefined | null): asserts value is T {
	assert.ok(value !== undefined && value !== null);
}

suite('renameSymbolProcessor', () => {

	// This got copied from the TypeScript language configuration.
	const wordPattern = /(-?\d*\.\d\w*)|([^\`\@\~\!\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>/\?\s]+)/;

	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('Full identifier rename', () => {
		const model = createTextModel([
			'const foo = 1;',
		].join('\n'), 'typescript', {});
		disposables.add(model);

		const renameInferenceEngine = new TestRenameInferenceEngine([{ type: StandardTokenType.Other, range: new Range(1, 7, 1, 10) }]);
		const result = renameInferenceEngine.inferRename(model, new Range(1, 7, 1, 10), 'bar', wordPattern);
		assertDefined(result);
		assert.strictEqual(result.renames.edits.length, 1);
		assert.strictEqual(result.renames.oldName, 'foo');
		assert.strictEqual(result.renames.newName, 'bar');
		const edit = result.renames.edits[0];
		assert.strictEqual(edit.range.startLineNumber, 1);
		assert.strictEqual(edit.range.startColumn, 7);
		assert.strictEqual(edit.range.endLineNumber, 1);
		assert.strictEqual(edit.range.endColumn, 10);
		assert.strictEqual(edit.text, 'bar');
	});

	test('Prefix rename - replacement', () => {
		const model = createTextModel([
			'const fooABC = 1;',
		].join('\n'), 'typescript', {});
		disposables.add(model);

		const renameInferenceEngine = new TestRenameInferenceEngine([{ type: StandardTokenType.Other, range: new Range(1, 7, 1, 13) }]);
		const result = renameInferenceEngine.inferRename(model, new Range(1, 7, 1, 10), 'bazz', wordPattern);
		assertDefined(result);
		assert.strictEqual(result.renames.edits.length, 1);
		assert.strictEqual(result.renames.oldName, 'fooABC');
		assert.strictEqual(result.renames.newName, 'bazzABC');
		const edit = result.renames.edits[0];
		assert.strictEqual(edit.range.startLineNumber, 1);
		assert.strictEqual(edit.range.startColumn, 7);
		assert.strictEqual(edit.range.endLineNumber, 1);
		assert.strictEqual(edit.range.endColumn, 13);
		assert.strictEqual(edit.text, 'bazzABC');
	});

	test('Prefix rename - full line', () => {
		const model = createTextModel([
			'const fooABC = 1;',
		].join('\n'), 'typescript', {});
		disposables.add(model);

		const renameInferenceEngine = new TestRenameInferenceEngine([{ type: StandardTokenType.Other, range: new Range(1, 7, 1, 13) }]);
		const result = renameInferenceEngine.inferRename(model, new Range(1, 1, 1, 18), 'const bazzABC = 1;', wordPattern);
		assertDefined(result);
		assert.strictEqual(result.renames.edits.length, 1);
		assert.strictEqual(result.renames.oldName, 'fooABC');
		assert.strictEqual(result.renames.newName, 'bazzABC');
		const edit = result.renames.edits[0];
		assert.strictEqual(edit.range.startLineNumber, 1);
		assert.strictEqual(edit.range.startColumn, 7);
		assert.strictEqual(edit.range.endLineNumber, 1);
		assert.strictEqual(edit.range.endColumn, 13);
		assert.strictEqual(edit.text, 'bazzABC');
	});

	test('Insertion - with whitespace', () => {
		const model = createTextModel([
			'foo',
		].join('\n'), 'typescript', {});
		disposables.add(model);

		const renameInferenceEngine = new TestRenameInferenceEngine([{ type: StandardTokenType.Other, range: new Range(1, 1, 1, 4) }]);
		const result = renameInferenceEngine.inferRename(model, new Range(1, 4, 1, 4), '.map(x => x);', wordPattern);
		assert.ok(result === undefined);
	});

	test('Insertion - with whitespace - full line', () => {
		const model = createTextModel([
			'foo',
		].join('\n'), 'typescript', {});
		disposables.add(model);

		const renameInferenceEngine = new TestRenameInferenceEngine([{ type: StandardTokenType.Other, range: new Range(1, 1, 1, 4) }]);
		const result = renameInferenceEngine.inferRename(model, new Range(1, 1, 1, 4), 'foo.map(x => x);', wordPattern);
		assert.ok(result === undefined);
	});

	test('Insertion - no word', () => {
		const model = createTextModel([
			'foo',
		].join('\n'), 'typescript', {});
		disposables.add(model);

		const renameInferenceEngine = new TestRenameInferenceEngine([{ type: StandardTokenType.Other, range: new Range(1, 1, 1, 4) }]);
		const result = renameInferenceEngine.inferRename(model, new Range(1, 4, 1, 4), '.map(x=>x);', wordPattern);
		assert.ok(result === undefined);
	});

	test('Insertion - no word - full line', () => {
		const model = createTextModel([
			'foo',
		].join('\n'), 'typescript', {});
		disposables.add(model);

		const renameInferenceEngine = new TestRenameInferenceEngine([{ type: StandardTokenType.Other, range: new Range(1, 1, 1, 4) }]);
		const result = renameInferenceEngine.inferRename(model, new Range(1, 1, 1, 4), '.map(x=>x);', wordPattern);
		assert.ok(result === undefined);
	});

	test('Suffix rename - replacement', () => {
		const model = createTextModel([
			'const ABCfoo = 1;',
		].join('\n'), 'typescript', {});
		disposables.add(model);
		const renameInferenceEngine = new TestRenameInferenceEngine([{ type: StandardTokenType.Other, range: new Range(1, 7, 1, 13) }]);
		const result = renameInferenceEngine.inferRename(model, new Range(1, 10, 1, 13), 'bazz', wordPattern);
		assertDefined(result);
		assert.strictEqual(result.renames.edits.length, 1);
		assert.strictEqual(result.renames.oldName, 'ABCfoo');
		assert.strictEqual(result.renames.newName, 'ABCbazz');
		const edit = result.renames.edits[0];
		assert.strictEqual(edit.range.startLineNumber, 1);
		assert.strictEqual(edit.range.startColumn, 7);
		assert.strictEqual(edit.range.endLineNumber, 1);
		assert.strictEqual(edit.range.endColumn, 13);
		assert.strictEqual(edit.text, 'ABCbazz');
	});

	test('Suffix rename - full line', () => {
		const model = createTextModel([
			'const ABCfoo = 1;',
		].join('\n'), 'typescript', {});
		disposables.add(model);
		const renameInferenceEngine = new TestRenameInferenceEngine([{ type: StandardTokenType.Other, range: new Range(1, 7, 1, 13) }]);
		const result = renameInferenceEngine.inferRename(model, new Range(1, 1, 1, 18), 'const ABCbazz = 1;', wordPattern);
		assertDefined(result);
		assert.strictEqual(result.renames.oldName, 'ABCfoo');
		assert.strictEqual(result.renames.newName, 'ABCbazz');
		assert.strictEqual(result.renames.edits.length, 1);
		const edit = result.renames.edits[0];
		assert.strictEqual(edit.range.startLineNumber, 1);
		assert.strictEqual(edit.range.startColumn, 7);
		assert.strictEqual(edit.range.endLineNumber, 1);
		assert.strictEqual(edit.range.endColumn, 13);
		assert.strictEqual(edit.text, 'ABCbazz');
	});

	test('Prefix and suffix rename - full line', () => {
		const model = createTextModel([
			'const abcfooxyz = 1;',
		].join('\n'), 'typescript', {});
		disposables.add(model);
		const renameInferenceEngine = new TestRenameInferenceEngine([{ type: StandardTokenType.Other, range: new Range(1, 7, 1, 16) }]);
		const result = renameInferenceEngine.inferRename(model, new Range(1, 1, 1, 21), 'const ABCfooXYZ = 1;', wordPattern);
		assertDefined(result);
		assert.strictEqual(result.renames.edits.length, 1);
		assert.strictEqual(result.renames.oldName, 'abcfooxyz');
		assert.strictEqual(result.renames.newName, 'ABCfooXYZ');
		const edit = result.renames.edits[0];
		assert.strictEqual(edit.range.startLineNumber, 1);
		assert.strictEqual(edit.range.startColumn, 7);
		assert.strictEqual(edit.range.endLineNumber, 1);
		assert.strictEqual(edit.range.endColumn, 16);
		assert.strictEqual(edit.text, 'ABCfooXYZ');
	});

	test('Prefix and suffix rename - replacement', () => {
		const model = createTextModel([
			'const abcfooxyz = 1;',
		].join('\n'), 'typescript', {});
		disposables.add(model);
		const renameInferenceEngine = new TestRenameInferenceEngine([{ type: StandardTokenType.Other, range: new Range(1, 7, 1, 16) }]);
		const result = renameInferenceEngine.inferRename(model, new Range(1, 7, 1, 16), 'ABCfooXYZ', wordPattern);
		assertDefined(result);
		assert.strictEqual(result.renames.edits.length, 1);
		assert.strictEqual(result.renames.oldName, 'abcfooxyz');
		assert.strictEqual(result.renames.newName, 'ABCfooXYZ');
		const edit = result.renames.edits[0];
		assert.strictEqual(edit.range.startLineNumber, 1);
		assert.strictEqual(edit.range.startColumn, 7);
		assert.strictEqual(edit.range.endLineNumber, 1);
		assert.strictEqual(edit.range.endColumn, 16);
		assert.strictEqual(edit.text, 'ABCfooXYZ');
	});

	test('No rename - different identifiers - replacement', () => {
		const model = createTextModel([
			'const foo bar = 1;',
		].join('\n'), 'typescript', {});
		disposables.add(model);
		const renameInferenceEngine = new TestRenameInferenceEngine([{ type: StandardTokenType.Other, range: new Range(1, 7, 1, 15) }]);
		const result = renameInferenceEngine.inferRename(model, new Range(1, 7, 1, 15), 'faz baz', wordPattern);
		assert.ok(result === undefined);
	});

	test('No rename - different identifiers - full line', () => {
		const model = createTextModel([
			'const foo bar = 1;',
		].join('\n'), 'typescript', {});
		disposables.add(model);
		const renameInferenceEngine = new TestRenameInferenceEngine([{ type: StandardTokenType.Other, range: new Range(1, 7, 1, 15) }]);
		const result = renameInferenceEngine.inferRename(model, new Range(1, 1, 1, 18), 'const faz baz = 1;', wordPattern);
		assert.ok(result === undefined);
	});

	test('Suffix insertion', () => {
		const model = createTextModel([
			'const w = 1;',
		].join('\n'), 'typescript', {});
		disposables.add(model);
		const renameInferenceEngine = new TestRenameInferenceEngine([{ type: StandardTokenType.Other, range: new Range(1, 7, 1, 8) }, { type: StandardTokenType.Other, range: new Range(1, 8, 1, 9) }]);
		const result = renameInferenceEngine.inferRename(model, new Range(1, 8, 1, 8), 'idth', wordPattern);
		assertDefined(result);
		assert.strictEqual(result.renames.edits.length, 1);
		assert.strictEqual(result.renames.oldName, 'w');
		assert.strictEqual(result.renames.newName, 'width');
		const edit = result.renames.edits[0];
		assert.strictEqual(edit.range.startLineNumber, 1);
		assert.strictEqual(edit.range.startColumn, 7);
		assert.strictEqual(edit.range.endLineNumber, 1);
		assert.strictEqual(edit.range.endColumn, 8);
		assert.strictEqual(edit.text, 'width');
	});
});
