/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { LRUMemory, NoMemory, PrefixMemory } from 'vs/editor/contrib/suggest/suggestMemory';
import { ITextModel } from 'vs/editor/common/model';
import { TextModel } from 'vs/editor/common/model/textModel';
import { ICompletionItem } from 'vs/editor/contrib/suggest/completionModel';
import { createSuggestItem } from 'vs/editor/contrib/suggest/test/completionModel.test';
import { IPosition } from 'vs/editor/common/core/position';

suite('SuggestMemories', function () {

	let pos: IPosition;
	let buffer: ITextModel;
	let items: ICompletionItem[];

	setup(function () {
		pos = { lineNumber: 1, column: 1 };
		buffer = TextModel.createFromString('This is some text.\nthis.\nfoo: ,');
		items = [
			createSuggestItem('foo', 0),
			createSuggestItem('bar', 0)
		];
	});

	test('NoMemory', function () {

		const mem = new NoMemory();

		assert.equal(mem.select(buffer, pos, items), 0);
		assert.equal(mem.select(buffer, pos, []), 0);

		mem.memorize(buffer, pos, items[0]);
		mem.memorize(buffer, pos, null);
	});

	test('LRUMemory', function () {

		pos = { lineNumber: 2, column: 6 };

		const mem = new LRUMemory();
		mem.memorize(buffer, pos, items[1]);

		assert.equal(mem.select(buffer, pos, items), 1);
		assert.equal(mem.select(buffer, { lineNumber: 1, column: 3 }, items), 0);

		mem.memorize(buffer, pos, items[0]);
		assert.equal(mem.select(buffer, pos, items), 0);

		assert.equal(mem.select(buffer, pos, [
			createSuggestItem('new', 0),
			createSuggestItem('bar', 0)
		]), 1);

		assert.equal(mem.select(buffer, pos, [
			createSuggestItem('new1', 0),
			createSuggestItem('new2', 0)
		]), 0);
	});

	test('intellisense is not showing top options first #43429', function () {
		// ensure we don't memorize for whitespace prefixes

		pos = { lineNumber: 2, column: 6 };
		const mem = new LRUMemory();

		mem.memorize(buffer, pos, items[1]);
		assert.equal(mem.select(buffer, pos, items), 1);

		assert.equal(mem.select(buffer, { lineNumber: 3, column: 5 }, items), 0); // foo: |,
		assert.equal(mem.select(buffer, { lineNumber: 3, column: 6 }, items), 1); // foo: ,|
	});

	test('PrefixMemory', function () {

		const mem = new PrefixMemory();
		buffer.setValue('constructor');
		const item0 = createSuggestItem('console', 0);
		const item1 = createSuggestItem('const', 0);
		const item2 = createSuggestItem('constructor', 0);
		const item3 = createSuggestItem('constant', 0);
		const items = [item0, item1, item2, item3];

		mem.memorize(buffer, { lineNumber: 1, column: 2 }, item1); // c -> const
		mem.memorize(buffer, { lineNumber: 1, column: 3 }, item0); // co -> console
		mem.memorize(buffer, { lineNumber: 1, column: 4 }, item2); // con -> constructor

		assert.equal(mem.select(buffer, { lineNumber: 1, column: 1 }, items), 0);
		assert.equal(mem.select(buffer, { lineNumber: 1, column: 2 }, items), 1);
		assert.equal(mem.select(buffer, { lineNumber: 1, column: 3 }, items), 0);
		assert.equal(mem.select(buffer, { lineNumber: 1, column: 4 }, items), 2);
		assert.equal(mem.select(buffer, { lineNumber: 1, column: 7 }, items), 2); // find substr
	});

});
