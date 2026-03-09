/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { extractUrlPatterns, getPatternLabel, isUrlApproved, getMatchingPattern, IUrlApprovalSettings } from '../../../../common/tools/builtinTools/chatUrlFetchingPatterns.js';

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
			const approved: Record<string, IUrlApprovalSettings> = {
				'https://example.com': { approveRequest: true, approveResponse: false }
			};
			assert.strictEqual(isUrlApproved(url, approved, true), true);
			assert.strictEqual(isUrlApproved(url, approved, false), false);
		});

		test('granular settings - response approved', () => {
			const url = URI.parse('https://example.com');
			const approved: Record<string, IUrlApprovalSettings> = {
				'https://example.com': { approveRequest: false, approveResponse: true }
			};
			assert.strictEqual(isUrlApproved(url, approved, true), false);
			assert.strictEqual(isUrlApproved(url, approved, false), true);
		});

		test('granular settings - both approved', () => {
			const url = URI.parse('https://example.com');
			const approved: Record<string, IUrlApprovalSettings> = {
				'https://example.com': { approveRequest: true, approveResponse: true }
			};
			assert.strictEqual(isUrlApproved(url, approved, true), true);
			assert.strictEqual(isUrlApproved(url, approved, false), true);
		});

		test('granular settings - missing property defaults to false', () => {
			const url = URI.parse('https://example.com');
			const approved: Record<string, IUrlApprovalSettings> = {
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
