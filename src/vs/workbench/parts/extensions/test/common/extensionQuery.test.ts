/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { Query } from 'vs/workbench/parts/extensions/common/extensionQuery';

suite('Extension query', () => {
	test('parse', () => {
		let query = Query.parse('');
		assert.equal(query.value, '');
		assert.equal(query.sortBy, '');

		query = Query.parse('hello');
		assert.equal(query.value, 'hello');
		assert.equal(query.sortBy, '');

		query = Query.parse('   hello world ');
		assert.equal(query.value, 'hello world');
		assert.equal(query.sortBy, '');

		query = Query.parse('@sort');
		assert.equal(query.value, '@sort');
		assert.equal(query.sortBy, '');

		query = Query.parse('@sort:');
		assert.equal(query.value, '@sort:');
		assert.equal(query.sortBy, '');

		query = Query.parse('  @sort:  ');
		assert.equal(query.value, '@sort:');
		assert.equal(query.sortBy, '');

		query = Query.parse('@sort:installs');
		assert.equal(query.value, '');
		assert.equal(query.sortBy, 'installs');

		query = Query.parse('   @sort:installs   ');
		assert.equal(query.value, '');
		assert.equal(query.sortBy, 'installs');

		query = Query.parse('@sort:installs-');
		assert.equal(query.value, '');
		assert.equal(query.sortBy, 'installs');

		query = Query.parse('@sort:installs-foo');
		assert.equal(query.value, '');
		assert.equal(query.sortBy, 'installs');

		query = Query.parse('@sort:installs');
		assert.equal(query.value, '');
		assert.equal(query.sortBy, 'installs');

		query = Query.parse('@sort:installs');
		assert.equal(query.value, '');
		assert.equal(query.sortBy, 'installs');

		query = Query.parse('vs @sort:installs');
		assert.equal(query.value, 'vs');
		assert.equal(query.sortBy, 'installs');

		query = Query.parse('vs @sort:installs code');
		assert.equal(query.value, 'vs  code');
		assert.equal(query.sortBy, 'installs');

		query = Query.parse('@sort:installs @sort:ratings');
		assert.equal(query.value, '');
		assert.equal(query.sortBy, 'ratings');
	});

	test('toString', () => {
		let query = new Query('hello', '', '');
		assert.equal(query.toString(), 'hello');

		query = new Query('hello world', '', '');
		assert.equal(query.toString(), 'hello world');

		query = new Query('  hello    ', '', '');
		assert.equal(query.toString(), 'hello');

		query = new Query('', 'installs', '');
		assert.equal(query.toString(), '@sort:installs');

		query = new Query('', 'installs', '');
		assert.equal(query.toString(), '@sort:installs');

		query = new Query('', 'installs', '');
		assert.equal(query.toString(), '@sort:installs');

		query = new Query('hello', 'installs', '');
		assert.equal(query.toString(), 'hello @sort:installs');

		query = new Query('  hello      ', 'installs', '');
		assert.equal(query.toString(), 'hello @sort:installs');
	});

	test('isValid', () => {
		let query = new Query('hello', '', '');
		assert(query.isValid());

		query = new Query('hello world', '', '');
		assert(query.isValid());

		query = new Query('  hello    ', '', '');
		assert(query.isValid());

		query = new Query('', 'installs', '');
		assert(query.isValid());

		query = new Query('', 'installs', '');
		assert(query.isValid());

		query = new Query('', 'installs', '');
		assert(query.isValid());

		query = new Query('', 'installs', '');
		assert(query.isValid());

		query = new Query('hello', 'installs', '');
		assert(query.isValid());

		query = new Query('  hello      ', 'installs', '');
		assert(query.isValid());
	});

	test('equals', () => {
		let query1 = new Query('hello', '', '');
		let query2 = new Query('hello', '', '');
		assert(query1.equals(query2));

		query2 = new Query('hello world', '', '');
		assert(!query1.equals(query2));

		query2 = new Query('hello', 'installs', '');
		assert(!query1.equals(query2));

		query2 = new Query('hello', 'installs', '');
		assert(!query1.equals(query2));
	});

	test('autocomplete', () => {
		// no completion
		assert.equal(Query.autocomplete(''), '');
		assert.equal(Query.autocomplete('@'), '@');
		assert.equal(Query.autocomplete('s'), 's');
		assert.equal(Query.autocomplete('@e'), '@e');
		assert.equal(Query.autocomplete('@category:s'), '@category:s');
		assert.equal(Query.autocomplete('@category:"s'), '@category:"s');
		assert.equal(Query.autocomplete('@category:"none'), '@category:"none');

		// command completion
		assert.equal(Query.autocomplete('@s'), '@sort:');
		assert.equal(Query.autocomplete('@i'), '@installed');
		assert.equal(Query.autocomplete('@ins'), '@installed');
		assert.equal(Query.autocomplete('@ca'), '@category');
		assert.equal(Query.autocomplete('@en'), '@enabled');
		assert.equal(Query.autocomplete('@ex'), '@ext');

		// refinement completion
		assert.equal(Query.autocomplete('@sort:i'), '@sort:installs');
		assert.equal(Query.autocomplete('@sort:r'), '@sort:rating');
		assert.equal(Query.autocomplete('@category:sn'), '@category:snippets');
		assert.equal(Query.autocomplete('@category:"sn'), '@category:"snippets"');
		assert.equal(Query.autocomplete('@category:pro'), '@category:"programming languages"');
		assert.equal(Query.autocomplete('@category:"pro'), '@category:"programming languages"');
	});
});