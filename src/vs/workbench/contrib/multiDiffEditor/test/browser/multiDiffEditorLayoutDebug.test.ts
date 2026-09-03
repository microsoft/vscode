/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { applyJsonPatchToText, createJsonPatch, JsonPatch } from '../../browser/multiDiffEditorLayoutDebug.js';

suite('MultiDiffEditorLayoutDebug', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('creates and applies structural JSON patches', () => {
		const previous = {
			scrollTop: 10,
			items: [
				{ label: 'a', height: 20, visible: true },
				{ label: 'b', height: 30, visible: false },
			],
			obsolete: true,
		};
		const next = {
			scrollTop: 15,
			items: [
				{ label: 'a', height: 25, visible: true },
				{ label: 'b', height: 30, visible: true },
			],
			added: 'value',
		};

		const operations = createJsonPatch(previous, next);
		assert.deepStrictEqual({
			operations,
			result: JSON.parse(applyJsonPatchToText(JSON.stringify(previous, undefined, '\t'), operations)),
		}, {
			operations: [
				{ op: 'remove', path: '/obsolete' },
				{ op: 'replace', path: '/scrollTop', value: 15 },
				{ op: 'replace', path: '/items/0/height', value: 25 },
				{ op: 'replace', path: '/items/1/visible', value: true },
				{ op: 'add', path: '/added', value: 'value' },
			],
			result: next,
		});
	});

	test('escapes JSON pointer segments', () => {
		assert.deepStrictEqual(createJsonPatch({ 'a/b': { '~key': 1 } }, { 'a/b': { '~key': 2 } }), [
			{ op: 'replace', path: '/a~1b/~0key', value: 2 },
		]);
	});

	test('treats undefined object properties as absent JSON properties', () => {
		const previous = {
			added: undefined,
			removed: { value: 1 },
			nested: {
				added: undefined,
				removed: { value: 2 },
			},
		};
		const next = {
			added: { value: 3 },
			removed: undefined,
			nested: {
				added: { value: 4 },
				removed: undefined,
			},
		};

		const operations = createJsonPatch(previous, next);
		assert.deepStrictEqual({
			operations,
			result: JSON.parse(applyJsonPatchToText(JSON.stringify(previous), operations)),
		}, {
			operations: [
				{ op: 'remove', path: '/removed' },
				{ op: 'add', path: '/added', value: { value: 3 } },
				{ op: 'remove', path: '/nested/removed' },
				{ op: 'add', path: '/nested/added', value: { value: 4 } },
			],
			result: JSON.parse(JSON.stringify(next)),
		});
	});

	test('composes nested patches', () => {
		const initial = { value: 1, nested: { enabled: false } };
		const updatedValue = { value: 2, nested: { enabled: false } };
		const final = { value: 2, nested: { enabled: true } };
		const patch: JsonPatch = [
			createJsonPatch(initial, updatedValue),
			[createJsonPatch(updatedValue, final)],
		];

		assert.deepStrictEqual(JSON.parse(applyJsonPatchToText(JSON.stringify(initial), patch)), final);
	});
});
