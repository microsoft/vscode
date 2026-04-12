/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { extractUrlPatterns, getPatternLabel, isUrlApproved, getMatchingPattern } from '../../../../common/tools/builtinTools/chatUrlFetchingPatterns.js';
suite('ChatUrlFetchingPatterns', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('extractUrlPatterns', () => {
        test('simple domain', () => {
            const url = URI.parse('https://example.com');
            const patterns = extractUrlPatterns(url);
            assert.deepStrictEqual(patterns, [
                'https://example.com',
            ]);
        });
        test('subdomain', () => {
            const url = URI.parse('https://api.example.com');
            const patterns = extractUrlPatterns(url);
            assert.deepStrictEqual(patterns, [
                'https://api.example.com',
                'https://*.example.com'
            ]);
        });
        test('multiple subdomains', () => {
            const url = URI.parse('https://foo.bar.example.com/path');
            const patterns = extractUrlPatterns(url);
            assert.deepStrictEqual(patterns, [
                'https://foo.bar.example.com/path',
                'https://foo.bar.example.com',
                'https://*.bar.example.com',
                'https://*.example.com',
            ]);
        });
        test('with path', () => {
            const url = URI.parse('https://example.com/api/v1/users');
            const patterns = extractUrlPatterns(url);
            assert.deepStrictEqual(patterns, [
                'https://example.com/api/v1/users',
                'https://example.com',
                'https://example.com/api/v1',
                'https://example.com/api',
            ]);
        });
        test('IP address - no wildcard subdomain', () => {
            const url = URI.parse('https://192.168.1.1');
            const patterns = extractUrlPatterns(url);
            assert.strictEqual(patterns.filter(p => p.includes('*')).length, 0);
        });
        test('with query and fragment', () => {
            const url = URI.parse('https://example.com/path?query=1#fragment');
            const patterns = extractUrlPatterns(url);
            assert.deepStrictEqual(patterns, [
                'https://example.com/path?query=1#fragment',
                'https://example.com',
            ]);
        });
    });
    suite('getPatternLabel', () => {
        test('removes https protocol', () => {
            const url = URI.parse('https://example.com');
            const label = getPatternLabel(url, 'https://example.com');
            assert.strictEqual(label, 'example.com');
        });
        test('removes http protocol', () => {
            const url = URI.parse('http://example.com');
            const label = getPatternLabel(url, 'http://example.com');
            assert.strictEqual(label, 'example.com');
        });
        test('removes trailing slashes', () => {
            const url = URI.parse('https://example.com/');
            const label = getPatternLabel(url, 'https://example.com/');
            assert.strictEqual(label, 'example.com');
        });
        test('preserves path', () => {
            const url = URI.parse('https://example.com/api/v1');
            const label = getPatternLabel(url, 'https://example.com/api/v1');
            assert.strictEqual(label, 'example.com/api/v1');
        });
    });
    suite('isUrlApproved', () => {
        test('exact match with boolean', () => {
            const url = URI.parse('https://example.com');
            const approved = { 'https://example.com': true };
            assert.strictEqual(isUrlApproved(url, approved, true), true);
            assert.strictEqual(isUrlApproved(url, approved, false), true);
        });
        test('no match returns false', () => {
            const url = URI.parse('https://example.com');
            const approved = { 'https://other.com': true };
            assert.strictEqual(isUrlApproved(url, approved, true), false);
        });
        test('wildcard subdomain match', () => {
            const url = URI.parse('https://api.example.com');
            const approved = { 'https://*.example.com': true };
            assert.strictEqual(isUrlApproved(url, approved, true), true);
        });
        test('path wildcard match', () => {
            const url = URI.parse('https://example.com/api/users');
            const approved = { 'https://example.com/api/*': true };
            assert.strictEqual(isUrlApproved(url, approved, true), true);
        });
        test('granular settings - request approved', () => {
            const url = URI.parse('https://example.com');
            const approved = {
                'https://example.com': { approveRequest: true, approveResponse: false }
            };
            assert.strictEqual(isUrlApproved(url, approved, true), true);
            assert.strictEqual(isUrlApproved(url, approved, false), false);
        });
        test('granular settings - response approved', () => {
            const url = URI.parse('https://example.com');
            const approved = {
                'https://example.com': { approveRequest: false, approveResponse: true }
            };
            assert.strictEqual(isUrlApproved(url, approved, true), false);
            assert.strictEqual(isUrlApproved(url, approved, false), true);
        });
        test('granular settings - both approved', () => {
            const url = URI.parse('https://example.com');
            const approved = {
                'https://example.com': { approveRequest: true, approveResponse: true }
            };
            assert.strictEqual(isUrlApproved(url, approved, true), true);
            assert.strictEqual(isUrlApproved(url, approved, false), true);
        });
        test('granular settings - missing property defaults to false', () => {
            const url = URI.parse('https://example.com');
            const approved = {
                'https://example.com': { approveRequest: true }
            };
            assert.strictEqual(isUrlApproved(url, approved, false), false);
        });
    });
    suite('getMatchingPattern', () => {
        test('exact match', () => {
            const url = URI.parse('https://example.com/path');
            const approved = { 'https://example.com/path': true };
            const pattern = getMatchingPattern(url, approved);
            assert.strictEqual(pattern, 'https://example.com/path');
        });
        test('wildcard match', () => {
            const url = URI.parse('https://api.example.com');
            const approved = { 'https://*.example.com': true };
            const pattern = getMatchingPattern(url, approved);
            assert.strictEqual(pattern, 'https://*.example.com');
        });
        test('no match returns undefined', () => {
            const url = URI.parse('https://example.com');
            const approved = { 'https://other.com': true };
            const pattern = getMatchingPattern(url, approved);
            assert.strictEqual(pattern, undefined);
        });
        test('most specific match', () => {
            const url = URI.parse('https://api.example.com/v1/users');
            const approved = {
                'https://*.example.com': true,
                'https://api.example.com': true,
                'https://api.example.com/v1/*': true
            };
            const pattern = getMatchingPattern(url, approved);
            assert.ok(pattern !== undefined);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFVybEZldGNoaW5nUGF0dGVybnMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vdG9vbHMvYnVpbHRpblRvb2xzL2NoYXRVcmxGZXRjaGluZ1BhdHRlcm5zLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN6RyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsZUFBZSxFQUFFLGFBQWEsRUFBRSxrQkFBa0IsRUFBd0IsTUFBTSxrRUFBa0UsQ0FBQztBQUVoTCxLQUFLLENBQUMseUJBQXlCLEVBQUUsR0FBRyxFQUFFO0lBQ3JDLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsS0FBSyxDQUFDLG9CQUFvQixFQUFFLEdBQUcsRUFBRTtRQUNoQyxJQUFJLENBQUMsZUFBZSxFQUFFLEdBQUcsRUFBRTtZQUMxQixNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLHFCQUFxQixDQUFDLENBQUM7WUFDN0MsTUFBTSxRQUFRLEdBQUcsa0JBQWtCLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDekMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxRQUFRLEVBQUU7Z0JBQ2hDLHFCQUFxQjthQUNyQixDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxXQUFXLEVBQUUsR0FBRyxFQUFFO1lBQ3RCLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQztZQUNqRCxNQUFNLFFBQVEsR0FBRyxrQkFBa0IsQ0FBQyxH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