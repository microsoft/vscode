/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { WebContentCache } from '../../electron-main/webContentCache.js';
suite('WebContentCache', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    let cache;
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
        const extractResult = { status: 'ok', result: 'Test content', title: 'Test Title' };
        cache.add(uri, undefined, extractResult);
        const cached = cache.tryGet(uri, undefined);
        assert.deepStrictEqual(cached, extractResult);
    });
    test('returns cached ok result', () => {
        const uri = URI.parse('https://example.com/page');
        const extractResult = { status: 'ok', result: 'Content', title: 'Title' };
        cache.add(uri, undefined, extractResult);
        const cached = cache.tryGet(uri, undefined);
        assert.deepStrictEqual(cached, extractResult);
    });
    test('returns cached redirect result', () => {
        const uri = URI.parse('https://example.com/old');
        const redirectUri = URI.parse('https://example.com/new');
        const extractResult = { status: 'redirect', toURI: redirectUri };
        cache.add(uri, undefined, extractResult);
        const cached = cache.tryGet(uri, undefined);
        assert.deepStrictEqual(cached, extractResult);
    });
    test('returns cached error result', () => {
        const uri = URI.parse('https://example.com/error');
        const extractResult = { status: 'error', error: 'Not found', statusCode: 404 };
        cache.add(uri, undefined, extractResult);
        const cached = cache.tryGet(uri, undefined);
        assert.deepStrictEqual(cached, extractResult);
    });
    //#endregion
    //#region Options-Based Cache Key
    test('different options produce different cache entries', () => {
        const uri = URI.parse('https://example.com/page');
        const resultWithRedirects = { status: 'ok', result: 'With redirects', title: 'Redirects Title' };
        const resultWithoutRedirects = { status: 'ok', result: 'Without redirects', title: 'No Redirects Title' };
        cache.add(uri, { followRedirects: true }, resultWithRedirects);
        cache.add(uri, { followRedirects: false }, resultWithoutRedirects);
        assert.deepStrictEqual(cache.tryGet(uri, { followRedirects: true }), resultWithRedirects);
        assert.deepStrictEqual(cache.tryGet(uri, { followRedirects: false }), resultWithoutRedirects);
    });
    test('undefined options and followRedirects: false use same cache key', () => {
        const uri = URI.parse('https://example.com/page');
        const extractResult = { status: 'ok', result: 'Content', title: 'Title' };
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
        const extractResult = { status: 'ok', result: 'Content', title: 'Title' };
        cache.add(uri1, undefined, extractResult);
        // extUriIgnorePathCase should make these equivalent
        assert.deepStrictEqual(cache.tryGet(uri2, undefined), extractResult);
    });
    //#endregion
    //#region Cache Expiration
    test('expired success entries are not returned', () => {
        const uri = URI.parse('https://example.com/page');
        const extractResult = { status: 'ok', result: 'Content', title: 'Title' };
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
        }
        finally {
            Date.now = originalDateNow;
        }
    });
    test('expired error entries are not returned', () => {
        const uri = URI.parse('https://example.com/error');
        const extractResult = { status: 'error', error: 'Server error', statusCode: 500 };
        const originalDateNow = Date.now;
        let currentTime = 1000000;
        Date.now = () => currentTime;
        try {
            cache.add(uri, undefined, extractResult);
            // Move time forward past the 5-minute error cache duration
            currentTime += (1000 * 60 * 5) + 1; // 5 minutes + 1ms
            const cached = cache.tryGet(uri, undefined);
            assert.strictEqual(cached, undefined);
        }
        finally {
            Date.now = originalDateNow;
        }
    });
    test('non-expired success entries are returned', () => {
        const uri = URI.parse('https://example.com/page');
        const extractResult = { status: 'ok', result: 'Content', title: 'Title' };
        const originalDateNow = Date.now;
        let currentTime = 1000000;
        Date.now = () => currentTime;
        try {
            cache.add(uri, undefined, extractResult);
            // Move time forward but stay within the 24-hour success cache duration
            currentTime += (1000 * 60 * 60 * 23); // 23 hours
            const cached = cache.tryGet(uri, undefined);
            assert.deepStrictEqual(cached, extractResult);
        }
        finally {
            Date.now = originalDateNow;
        }
    });
    test('non-expired error entries are returned', () => {
        const uri = URI.parse('https://example.com/error');
        const extractResult = { status: 'error', error: 'Server error', statusCode: 500 };
        const originalDateNow = Date.now;
        let currentTime = 1000000;
        Date.now = () => currentTime;
        try {
            cache.add(uri, undefined, extractResult);
            // Move time forward but stay within the 5-minute error cache duration
            currentTime += (1000 * 60 * 4); // 4 minutes
            const cached = cache.tryGet(uri, undefined);
            assert.deepStrictEqual(cached, extractResult);
        }
        finally {
            Date.now = originalDateNow;
        }
    });
    test('redirect results use success cache duration', () => {
        const uri = URI.parse('https://example.com/old');
        const extractResult = { status: 'redirect', toURI: URI.parse('https://example.com/new') };
        const originalDateNow = Date.now;
        let currentTime = 1000000;
        Date.now = () => currentTime;
        try {
            cache.add(uri, undefined, extractResult);
            // Move time forward past error duration but within success duration
            currentTime += (1000 * 60 * 60); // 1 hour (past 5 min error, within 24 hour success)
            const cached = cache.tryGet(uri, undefined);
            assert.deepStrictEqual(cached, extractResult);
        }
        finally {
            Date.now = originalDateNow;
        }
    });
    //#endregion
    //#region Cache Overwrite
    test('adding same URI overwrites previous entry', () => {
        const uri = URI.parse('https://example.com/page');
        const firstResult = { status: 'ok', result: 'First content', title: 'First Title' };
        const secondResult = { status: 'ok', result: 'Second content', title: 'Second Title' };
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
        const result1 = { status: 'ok', result: 'Example content', title: 'Example Title' };
        const result2 = { status: 'ok', result: 'Other content', title: 'Other Title' };
        cache.add(uri1, undefined, result1);
        cache.add(uri2, undefined, result2);
        assert.deepStrictEqual(cache.tryGet(uri1, undefined), result1);
        assert.deepStrictEqual(cache.tryGet(uri2, undefined), result2);
    });
    test('different paths produce different cache entries', () => {
        const uri1 = URI.parse('https://example.com/page1');
        const uri2 = URI.parse('https://example.com/page2');
        const result1 = { status: 'ok', result: 'Page 1 content', title: 'Page 1 Title' };
        const result2 = { status: 'ok', result: 'Page 2 content', title: 'Page 2 Title' };
        cache.add(uri1, undefined, result1);
        cache.add(uri2, undefined, result2);
        assert.deepStrictEqual(cache.tryGet(uri1, undefined), result1);
        assert.deepStrictEqual(cache.tryGet(uri2, undefined), result2);
    });
    test('different query strings produce different cache entries', () => {
        const uri1 = URI.parse('https://example.com/page?a=1');
        const uri2 = URI.parse('https://example.com/page?a=2');
        const result1 = { status: 'ok', result: 'Query 1 content', title: 'Query 1 Title' };
        const result2 = { status: 'ok', result: 'Query 2 content', title: 'Query 2 Title' };
        cache.add(uri1, undefined, result1);
        cache.add(uri2, undefined, result2);
        assert.deepStrictEqual(cache.tryGet(uri1, undefined), result1);
        assert.deepStrictEqual(cache.tryGet(uri2, undefined), result2);
    });
    //#endregion
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViQ29udGVudENhY2hlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS93ZWJDb250ZW50RXh0cmFjdG9yL3Rlc3QvZWxlY3Ryb24tbWFpbi93ZWJDb250ZW50Q2FjaGUudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUNqQyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBR3pFLEtBQUssQ0FBQyxpQkFBaUIsRUFBRSxHQUFHLEVBQUU7SUFDN0IsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLEtBQXNCLENBQUM7SUFFM0IsS0FBSyxDQUFDLEdBQUcsRUFBRTtRQUNWLEtBQUssR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO0lBQy9CLENBQUMsQ0FBQyxDQUFDO0lBRUgsZ0NBQWdDO0lBRWhDLElBQUksQ0FBQyxvQ0FBb0MsRUFBRSxHQUFHLEVBQUU7UUFDL0MsTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1FBQ2xELE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzVDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQ3ZDLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGdEQUFnRCxFQUFFLEdBQUcsRUFBRTtRQUMzRCxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLDBCQUEwQixDQUFDLENBQUM7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