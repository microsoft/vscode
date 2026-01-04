/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { WebContentCache } from '../../electron-main/webContentCache.js';
import { WebContentExtractResult } from '../../common/webContentExtractor.js';

suite('WebContentCache', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let cache: WebContentCache;

	setup(() => {
		cache = new WebContentCache();
	});

	//#region Basic Cache Operations

	test('returns undefined for uncached URI', () => {
		const uri = URI.parse('https://example.com/page');
		const result = cache.tryGet(uri, undefined);
		assert.strictEqual(result, undefined);
	});

	test('returns cached result for previously added URI', () => {
		const uri = URI.parse('https://example.com/page');
		const extractResult: WebContentExtractResult = { status: 'ok', result: 'Test content', title: 'Test Title' };

		cache.add(uri, undefined, extractResult);
		const cached = cache.tryGet(uri, undefined);

		assert.deepStrictEqual(cached, extractResult);
	});

	test('returns cached ok result', () => {
		const uri = URI.parse('https://example.com/page');
		const extractResult: WebContentExtractResult = { status: 'ok', result: 'Content', title: 'Title' };

		cache.add(uri, undefined, extractResult);
		const cached = cache.tryGet(uri, undefined);

		assert.deepStrictEqual(cached, extractResult);
	});

	test('returns cached redirect result', () => {
		const uri = URI.parse('https://example.com/old');
		const redirectUri = URI.parse('https://example.com/new');
		const extractResult: WebContentExtractResult = { status: 'redirect', toURI: redirectUri };

		cache.add(uri, undefined, extractResult);
		const cached = cache.tryGet(uri, undefined);

		assert.deepStrictEqual(cached, extractResult);
	});

	test('returns cached error result', () => {
		const uri = URI.parse('https://example.com/error');
		const extractResult: WebContentExtractResult = { status: 'error', error: 'Not found', statusCode: 404 };

		cache.add(uri, undefined, extractResult);
		const cached = cache.tryGet(uri, undefined);

		assert.deepStrictEqual(cached, extractResult);
	});

	//#endregion

	//#region Options-Based Cache Key

	test('different options produce different cache entries', () => {
		const uri = URI.parse('https://example.com/page');
		const resultWithRedirects: WebContentExtractResult = { status: 'ok', result: 'With redirects', title: 'Redirects Title' };
		const resultWithoutRedirects: WebContentExtractResult = { status: 'ok', result: 'Without redirects', title: 'No Redirects Title' };

		cache.add(uri, { followRedirects: true }, resultWithRedirects);
		cache.add(uri, { followRedirects: false }, resultWithoutRedirects);

		assert.deepStrictEqual(cache.tryGet(uri, { followRedirects: true }), resultWithRedirects);
		assert.deepStrictEqual(cache.tryGet(uri, { followRedirects: false }), resultWithoutRedirects);
	});

	test('undefined options and followRedirects: false use same cache key', () => {
		const uri = URI.parse('https://example.com/page');
		const extractResult: WebContentExtractResult = { status: 'ok', result: 'Content', title: 'Title' };

		cache.add(uri, undefined, extractResult);

		// Both undefined and { followRedirects: false } should resolve to the same key
		// because !!undefined === false and !!false === false
		assert.deepStrictEqual(cache.tryGet(uri, undefined), extractResult);
		assert.deepStrictEqual(cache.tryGet(uri, { followRedirects: false }), extractResult);
	});

	//#endregion

	//#region URI Case Sensitivity

	test('URI path case is ignored for cache lookup', () => {
		const uri1 = URI.parse('https://example.com/Page');
		const uri2 = URI.parse('https://example.com/page');
		const extractResult: WebContentExtractResult = { status: 'ok', result: 'Content', title: 'Title' };

		cache.add(uri1, undefined, extractResult);

		// extUriIgnorePathCase should make these equivalent
		assert.deepStrictEqual(cache.tryGet(uri2, undefined), extractResult);
	});

	//#endregion

	//#region Cache Expiration

	test('expired success entries are not returned', () => {
		const uri = URI.parse('https://example.com/page');
		const extractResult: WebContentExtractResult = { status: 'ok', result: 'Content', title: 'Title' };

		// Mock Date.now to control expiration
		const originalDateNow = Date.now;
		let currentTime = 1000000;
		Date.now = () => currentTime;

		try {
			cache.add(uri, undefined, extractResult);

			// Move time forward past the 24-hour success cache duration
			currentTime += (1000 * 60 * 60 * 24) + 1; // 24 hours + 1ms

			const cached = cache.tryGet(uri, undefined);
			assert.strictEqual(cached, undefined);
		} finally {
			Date.now = originalDateNow;
		}
	});

	test('expired error entries are not returned', () => {
		const uri = URI.parse('https://example.com/error');
		const extractResult: WebContentExtractResult = { status: 'error', error: 'Server error', statusCode: 500 };

		const originalDateNow = Date.now;
		let currentTime = 1000000;
		Date.now = () => currentTime;

		try {
			cache.add(uri, undefined, extractResult);

			// Move time forward past the 5-minute error cache duration
			currentTime += (1000 * 60 * 5) + 1; // 5 minutes + 1ms

			const cached = cache.tryGet(uri, undefined);
			assert.strictEqual(cached, undefined);
		} finally {
			Date.now = originalDateNow;
		}
	});

	test('non-expired success entries are returned', () => {
		const uri = URI.parse('https://example.com/page');
		const extractResult: WebContentExtractResult = { status: 'ok', result: 'Content', title: 'Title' };

		const originalDateNow = Date.now;
		let currentTime = 1000000;
		Date.now = () => currentTime;

		try {
			cache.add(uri, undefined, extractResult);

			// Move time forward but stay within the 24-hour success cache duration
			currentTime += (1000 * 60 * 60 * 23); // 23 hours

			const cached = cache.tryGet(uri, undefined);
			assert.deepStrictEqual(cached, extractResult);
		} finally {
			Date.now = originalDateNow;
		}
	});

	test('non-expired error entries are returned', () => {
		const uri = URI.parse('https://example.com/error');
		const extractResult: WebContentExtractResult = { status: 'error', error: 'Server error', statusCode: 500 };

		const originalDateNow = Date.now;
		let currentTime = 1000000;
		Date.now = () => currentTime;

		try {
			cache.add(uri, undefined, extractResult);

			// Move time forward but stay within the 5-minute error cache duration
			currentTime += (1000 * 60 * 4); // 4 minutes

			const cached = cache.tryGet(uri, undefined);
			assert.deepStrictEqual(cached, extractResult);
		} finally {
			Date.now = originalDateNow;
		}
	});

	test('redirect results use success cache duration', () => {
		const uri = URI.parse('https://example.com/old');
		const extractResult: WebContentExtractResult = { status: 'redirect', toURI: URI.parse('https://example.com/new') };

		const originalDateNow = Date.now;
		let currentTime = 1000000;
		Date.now = () => currentTime;

		try {
			cache.add(uri, undefined, extractResult);

			// Move time forward past error duration but within success duration
			currentTime += (1000 * 60 * 60); // 1 hour (past 5 min error, within 24 hour success)

			const cached = cache.tryGet(uri, undefined);
			assert.deepStrictEqual(cached, extractResult);
		} finally {
			Date.now = originalDateNow;
		}
	});

	//#endregion

	//#region Cache Overwrite

	test('adding same URI overwrites previous entry', () => {
		const uri = URI.parse('https://example.com/page');
		const firstResult: WebContentExtractResult = { status: 'ok', result: 'First content', title: 'First Title' };
		const secondResult: WebContentExtractResult = { status: 'ok', result: 'Second content', title: 'Second Title' };

		cache.add(uri, undefined, firstResult);
		cache.add(uri, undefined, secondResult);

		const cached = cache.tryGet(uri, undefined);
		assert.deepStrictEqual(cached, secondResult);
	});

	//#endregion

	//#region Different URI Components

	test('different hosts produce different cache entries', () => {
		const uri1 = URI.parse('https://example.com/page');
		const uri2 = URI.parse('https://other.com/page');
		const result1: WebContentExtractResult = { status: 'ok', result: 'Example content', title: 'Example Title' };
		const result2: WebContentExtractResult = { status: 'ok', result: 'Other content', title: 'Other Title' };

		cache.add(uri1, undefined, result1);
		cache.add(uri2, undefined, result2);

		assert.deepStrictEqual(cache.tryGet(uri1, undefined), result1);
		assert.deepStrictEqual(cache.tryGet(uri2, undefined), result2);
	});

	test('different paths produce different cache entries', () => {
		const uri1 = URI.parse('https://example.com/page1');
		const uri2 = URI.parse('https://example.com/page2');
		const result1: WebContentExtractResult = { status: 'ok', result: 'Page 1 content', title: 'Page 1 Title' };
		const result2: WebContentExtractResult = { status: 'ok', result: 'Page 2 content', title: 'Page 2 Title' };

		cache.add(uri1, undefined, result1);
		cache.add(uri2, undefined, result2);

		assert.deepStrictEqual(cache.tryGet(uri1, undefined), result1);
		assert.deepStrictEqual(cache.tryGet(uri2, undefined), result2);
	});

	test('different query strings produce different cache entries', () => {
		const uri1 = URI.parse('https://example.com/page?a=1');
		const uri2 = URI.parse('https://example.com/page?a=2');
		const result1: WebContentExtractResult = { status: 'ok', result: 'Query 1 content', title: 'Query 1 Title' };
		const result2: WebContentExtractResult = { status: 'ok', result: 'Query 2 content', title: 'Query 2 Title' };

		cache.add(uri1, undefined, result1);
		cache.add(uri2, undefined, result2);

		assert.deepStrictEqual(cache.tryGet(uri1, undefined), result1);
		assert.deepStrictEqual(cache.tryGet(uri2, undefined), result2);
	});

	//#endregion
});
