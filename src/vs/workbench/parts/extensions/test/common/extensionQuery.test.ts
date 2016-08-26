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
});