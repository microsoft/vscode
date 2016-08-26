/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { Query } from '../../common/extensionQuery';

suite('Extension query', () => {
	test('parse', () => {
		let query = Query.parse('');
		assert.equal(query.value, '');
		assert.equal(query.sortBy, '');
		assert.equal(query.sortOrder, '');

		query = Query.parse('hello');
		assert.equal(query.value, 'hello');
		assert.equal(query.sortBy, '');
		assert.equal(query.sortOrder, '');

		query = Query.parse('   hello world ');
		assert.equal(query.value, 'hello world');
		assert.equal(query.sortBy, '');
		assert.equal(query.sortOrder, '');

		query = Query.parse('@sort');
		assert.equal(query.value, '@sort');
		assert.equal(query.sortBy, '');
		assert.equal(query.sortOrder, '');

		query = Query.parse('@sort:');
		assert.equal(query.value, '@sort:');
		assert.equal(query.sortBy, '');
		assert.equal(query.sortOrder, '');

		query = Query.parse('  @sort:  ');
		assert.equal(query.value, '@sort:');
		assert.equal(query.sortBy, '');
		assert.equal(query.sortOrder, '');

		query = Query.parse('@sort:installs');
		assert.equal(query.value, '');
		assert.equal(query.sortBy, 'installs');
		assert.equal(query.sortOrder, '');

		query = Query.parse('   @sort:installs   ');
		assert.equal(query.value, '');
		assert.equal(query.sortBy, 'installs');
		assert.equal(query.sortOrder, '');

		query = Query.parse('@sort:installs-');
		assert.equal(query.value, '');
		assert.equal(query.sortBy, 'installs');
		assert.equal(query.sortOrder, '');

		query = Query.parse('@sort:installs-foo');
		assert.equal(query.value, '');
		assert.equal(query.sortBy, 'installs');
		assert.equal(query.sortOrder, '');

		query = Query.parse('@sort:installs-asc');
		assert.equal(query.value, '');
		assert.equal(query.sortBy, 'installs');
		assert.equal(query.sortOrder, 'asc');

		query = Query.parse('@sort:installs-desc');
		assert.equal(query.value, '');
		assert.equal(query.sortBy, 'installs');
		assert.equal(query.sortOrder, 'desc');

		query = Query.parse('vs @sort:installs-desc');
		assert.equal(query.value, 'vs');
		assert.equal(query.sortBy, 'installs');
		assert.equal(query.sortOrder, 'desc');

		query = Query.parse('vs @sort:installs-desc code');
		assert.equal(query.value, 'vs  code');
		assert.equal(query.sortBy, 'installs');
		assert.equal(query.sortOrder, 'desc');

		query = Query.parse('@sort:installs @sort:ratings');
		assert.equal(query.value, '');
		assert.equal(query.sortBy, 'ratings');
		assert.equal(query.sortOrder, '');
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

		query = new Query('', 'installs', 'asc');
		assert.equal(query.toString(), '@sort:installs-asc');

		query = new Query('', 'installs', 'desc');
		assert.equal(query.toString(), '@sort:installs-desc');

		query = new Query('', 'installs', 'foo');
		assert.equal(query.toString(), '@sort:installs-foo');

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

		query = new Query('', 'installs', 'asc');
		assert(query.isValid());

		query = new Query('', 'installs', 'desc');
		assert(query.isValid());

		query = new Query('', 'installs', 'foo');
		assert(query.isValid());

		query = new Query('hello', 'installs', '');
		assert(query.isValid());

		query = new Query('  hello      ', 'installs', '');
		assert(query.isValid());

		query = new Query('hello', '', 'asc');
		assert(!query.isValid());

		query = new Query('', '', 'asc');
		assert(!query.isValid());
	});

	test('equals', () => {
		let query1 = new Query('hello', '', '');
		let query2 = new Query('hello', '', '');
		assert(query1.equals(query2));

		query2 = new Query('hello world', '', '');
		assert(!query1.equals(query2));

		query2 = new Query('hello', 'installs', '');
		assert(!query1.equals(query2));

		query2 = new Query('hello', 'installs', 'asc');
		assert(!query1.equals(query2));
	});
});