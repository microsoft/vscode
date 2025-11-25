/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Query } from '../../common/extensionQuery.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Extension query', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('parse', () => {
		let query = Query.parse('');
		assert.strictEqual(query.value, '');
		assert.strictEqual(query.sortBy, '');

		query = Query.parse('hello');
		assert.strictEqual(query.value, 'hello');
		assert.strictEqual(query.sortBy, '');

		query = Query.parse('   hello world ');
		assert.strictEqual(query.value, 'hello world');
		assert.strictEqual(query.sortBy, '');

		query = Query.parse('@sort');
		assert.strictEqual(query.value, '@sort');
		assert.strictEqual(query.sortBy, '');

		query = Query.parse('@sort:');
		assert.strictEqual(query.value, '@sort:');
		assert.strictEqual(query.sortBy, '');

		query = Query.parse('  @sort:  ');
		assert.strictEqual(query.value, '@sort:');
		assert.strictEqual(query.sortBy, '');

		query = Query.parse('@sort:installs');
		assert.strictEqual(query.value, '');
		assert.strictEqual(query.sortBy, 'installs');

		query = Query.parse('   @sort:installs   ');
		assert.strictEqual(query.value, '');
		assert.strictEqual(query.sortBy, 'installs');

		query = Query.parse('@sort:installs-');
		assert.strictEqual(query.value, '');
		assert.strictEqual(query.sortBy, 'installs');

		query = Query.parse('@sort:installs-foo');
		assert.strictEqual(query.value, '');
		assert.strictEqual(query.sortBy, 'installs');

		query = Query.parse('@sort:installs');
		assert.strictEqual(query.value, '');
		assert.strictEqual(query.sortBy, 'installs');

		query = Query.parse('@sort:installs');
		assert.strictEqual(query.value, '');
		assert.strictEqual(query.sortBy, 'installs');

		query = Query.parse('vs @sort:installs');
		assert.strictEqual(query.value, 'vs');
		assert.strictEqual(query.sortBy, 'installs');

		query = Query.parse('vs @sort:installs code');
		assert.strictEqual(query.value, 'vs  code');
		assert.strictEqual(query.sortBy, 'installs');

		query = Query.parse('@sort:installs @sort:ratings');
		assert.strictEqual(query.value, '');
		assert.strictEqual(query.sortBy, 'ratings');
	});

	test('toString', () => {
		let query = new Query('hello', '');
		assert.strictEqual(query.toString(), 'hello');

		query = new Query('hello world', '');
		assert.strictEqual(query.toString(), 'hello world');

		query = new Query('  hello    ', '');
		assert.strictEqual(query.toString(), 'hello');

		query = new Query('', 'installs');
		assert.strictEqual(query.toString(), '@sort:installs');

		query = new Query('', 'installs');
		assert.strictEqual(query.toString(), '@sort:installs');

		query = new Query('', 'installs');
		assert.strictEqual(query.toString(), '@sort:installs');

		query = new Query('hello', 'installs');
		assert.strictEqual(query.toString(), 'hello @sort:installs');

		query = new Query('  hello      ', 'installs');
		assert.strictEqual(query.toString(), 'hello @sort:installs');
	});

	test('isValid', () => {
		let query = new Query('hello', '');
		assert(query.isValid());

		query = new Query('hello world', '');
		assert(query.isValid());

		query = new Query('  hello    ', '');
		assert(query.isValid());

		query = new Query('', 'installs');
		assert(query.isValid());

		query = new Query('', 'installs');
		assert(query.isValid());

		query = new Query('', 'installs');
		assert(query.isValid());

		query = new Query('', 'installs');
		assert(query.isValid());

		query = new Query('hello', 'installs');
		assert(query.isValid());

		query = new Query('  hello      ', 'installs');
		assert(query.isValid());
	});

	test('equals', () => {
		const query1 = new Query('hello', '');
		let query2 = new Query('hello', '');
		assert(query1.equals(query2));

		query2 = new Query('hello world', '');
		assert(!query1.equals(query2));

		query2 = new Query('hello', 'installs');
		assert(!query1.equals(query2));

		query2 = new Query('hello', 'installs');
		assert(!query1.equals(query2));
	});

	test('autocomplete', () => {
		Query.suggestions('@sort:in', null).some(x => x === '@sort:installs ');
		Query.suggestions('@sort:installs', null).every(x => x !== '@sort:rating ');

		Query.suggestions('@category:blah', null).some(x => x === '@category:"extension packs" ');
		Query.suggestions('@category:"extension packs"', null).every(x => x !== '@category:formatters ');
	});

	test('parse minRating', () => {
		let query = Query.parse('@minRating:4');
		assert.strictEqual(query.value, '');
		assert.strictEqual(query.minRating, 4);

		query = Query.parse('@minRating:4.5');
		assert.strictEqual(query.minRating, 4.5);

		query = Query.parse('python @minRating:3');
		assert.strictEqual(query.value, 'python');
		assert.strictEqual(query.minRating, 3);

		query = Query.parse('@minRating:6');
		assert.strictEqual(query.minRating, undefined);

		query = Query.parse('@minRating:invalid');
		assert.strictEqual(query.minRating, undefined);
	});

	test('parse minDownloads', () => {
		let query = Query.parse('@minDownloads:1000');
		assert.strictEqual(query.value, '');
		assert.strictEqual(query.minDownloads, 1000);

		query = Query.parse('@minDownloads:10K');
		assert.strictEqual(query.minDownloads, 10000);

		query = Query.parse('@minDownloads:10k');
		assert.strictEqual(query.minDownloads, 10000);

		query = Query.parse('@minDownloads:1M');
		assert.strictEqual(query.minDownloads, 1000000);

		query = Query.parse('react @minDownloads:100K');
		assert.strictEqual(query.value, 'react');
		assert.strictEqual(query.minDownloads, 100000);
	});

	test('parse combined filters', () => {
		const query = Query.parse('python @minRating:4 @minDownloads:10K @sort:installs');
		assert.strictEqual(query.value, 'python');
		assert.strictEqual(query.minRating, 4);
		assert.strictEqual(query.minDownloads, 10000);
		assert.strictEqual(query.sortBy, 'installs');
	});

	test('toString with filters', () => {
		let query = new Query('hello', '', 4, undefined);
		assert.strictEqual(query.toString(), 'hello @minRating:4');

		query = new Query('hello', '', undefined, 10000);
		assert.strictEqual(query.toString(), 'hello @minDownloads:10000');

		query = new Query('hello', 'installs', 4, 10000);
		assert.strictEqual(query.toString(), 'hello @sort:installs @minRating:4 @minDownloads:10000');
	});

	test('equals with filters', () => {
		const query1 = new Query('hello', '', 4, 1000);
		let query2 = new Query('hello', '', 4, 1000);
		assert(query1.equals(query2));

		query2 = new Query('hello', '', 3, 1000);
		assert(!query1.equals(query2));

		query2 = new Query('hello', '', 4, 2000);
		assert(!query1.equals(query2));
	});

	test('parseDownloadCount', () => {
		assert.strictEqual(Query.parseDownloadCount('1000'), 1000);
		assert.strictEqual(Query.parseDownloadCount('10K'), 10000);
		assert.strictEqual(Query.parseDownloadCount('10k'), 10000);
		assert.strictEqual(Query.parseDownloadCount('1M'), 1000000);
		assert.strictEqual(Query.parseDownloadCount('1m'), 1000000);
		assert.strictEqual(Query.parseDownloadCount('invalid'), undefined);
		assert.strictEqual(Query.parseDownloadCount(''), undefined);
	});
});
