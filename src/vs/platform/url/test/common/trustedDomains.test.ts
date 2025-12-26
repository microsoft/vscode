/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isLocalhostAuthority, isURLDomainTrusted, normalizeURL } from '../../common/trustedDomains.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('trustedDomains', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('isURLDomainTrusted', () => {

		test('localhost is always trusted', () => {
			assert.strictEqual(isURLDomainTrusted(URI.parse('http://localhost:3000'), []), true);
			assert.strictEqual(isURLDomainTrusted(URI.parse('http://127.0.0.1:3000'), []), true);
			assert.strictEqual(isURLDomainTrusted(URI.parse('http://subdomain.localhost'), []), true);
		});

		test('wildcard (*) matches everything', () => {
			assert.strictEqual(isURLDomainTrusted(URI.parse('https://example.com'), ['*']), true);
			assert.strictEqual(isURLDomainTrusted(URI.parse('http://anything.org'), ['*']), true);
			assert.strictEqual(isURLDomainTrusted(URI.parse('https://github.com/microsoft'), ['*']), true);
		});

		test('exact domain match', () => {
			assert.strictEqual(isURLDomainTrusted(URI.parse('https://example.com'), ['https://example.com']), true);
			assert.strictEqual(isURLDomainTrusted(URI.parse('https://example.com/path'), ['https://example.com']), true);
			assert.strictEqual(isURLDomainTrusted(URI.parse('http://example.com'), ['https://example.com']), false);
		});

		test('subdomain wildcard matching', () => {
			assert.strictEqual(isURLDomainTrusted(URI.parse('https://api.github.com'), ['https://*.github.com']), true);
			assert.strictEqual(isURLDomainTrusted(URI.parse('https://github.com'), ['https://*.github.com']), true);
			assert.strictEqual(isURLDomainTrusted(URI.parse('https://sub.api.github.com'), ['https://*.github.com']), true);
		});

		test('path matching', () => {
			assert.strictEqual(isURLDomainTrusted(URI.parse('https://example.com/api/v1'), ['https://example.com/api/*']), true);
			// Path without trailing content doesn't match a wildcard pattern requiring more path segments
			assert.strictEqual(isURLDomainTrusted(URI.parse('https://example.com/api'), ['https://example.com/api/*']), false);
		});

		test('scheme must match', () => {
			assert.strictEqual(isURLDomainTrusted(URI.parse('https://example.com'), ['http://example.com']), false);
			assert.strictEqual(isURLDomainTrusted(URI.parse('http://example.com'), ['https://example.com']), false);
		});

		test('not trusted when no match', () => {
			assert.strictEqual(isURLDomainTrusted(URI.parse('https://example.com'), ['https://other.com']), false);
			assert.strictEqual(isURLDomainTrusted(URI.parse('https://example.com'), []), false);
		});

		test('multiple trusted domains', () => {
			const trusted = ['https://github.com', 'https://microsoft.com'];
			assert.strictEqual(isURLDomainTrusted(URI.parse('https://github.com'), trusted), true);
			assert.strictEqual(isURLDomainTrusted(URI.parse('https://microsoft.com'), trusted), true);
			assert.strictEqual(isURLDomainTrusted(URI.parse('https://google.com'), trusted), false);
		});

		test('case normalization for github', () => {
			assert.strictEqual(isURLDomainTrusted(URI.parse('https://github.com/Microsoft/VSCode'), ['https://github.com/microsoft/vscode']), true);
			assert.strictEqual(isURLDomainTrusted(URI.parse('https://github.com/microsoft/vscode'), ['https://github.com/Microsoft/VSCode']), true);
		});
	});

	suite('normalizeURL', () => {

		test('normalizes github.com URLs to lowercase path', () => {
			assert.strictEqual(normalizeURL('https://github.com/Microsoft/VSCode'), 'https://github.com/microsoft/vscode');
			assert.strictEqual(normalizeURL('https://github.com/OWNER/REPO'), 'https://github.com/owner/repo');
		});

		test('does not normalize non-github URLs', () => {
			assert.strictEqual(normalizeURL('https://example.com/Path/To/Resource'), 'https://example.com/Path/To/Resource');
			assert.strictEqual(normalizeURL('https://microsoft.com/Products'), 'https://microsoft.com/Products');
		});

		test('handles URI objects', () => {
			const uri = URI.parse('https://github.com/Microsoft/VSCode');
			assert.strictEqual(normalizeURL(uri), 'https://github.com/microsoft/vscode');
		});

		test('handles invalid URIs gracefully', () => {
			const result = normalizeURL('not-a-valid-uri');
			assert.strictEqual(typeof result, 'string');
		});
	});

	suite('isLocalhostAuthority', () => {

		test('recognizes localhost', () => {
			assert.strictEqual(isLocalhostAuthority('localhost'), true);
			assert.strictEqual(isLocalhostAuthority('localhost:3000'), true);
			assert.strictEqual(isLocalhostAuthority('localhost:8080'), true);
		});

		test('recognizes subdomains of localhost', () => {
			assert.strictEqual(isLocalhostAuthority('subdomain.localhost'), true);
			assert.strictEqual(isLocalhostAuthority('api.localhost:3000'), true);
			assert.strictEqual(isLocalhostAuthority('a.b.c.localhost'), true);
		});

		test('recognizes 127.0.0.1', () => {
			assert.strictEqual(isLocalhostAuthority('127.0.0.1'), true);
			assert.strictEqual(isLocalhostAuthority('127.0.0.1:3000'), true);
			assert.strictEqual(isLocalhostAuthority('127.0.0.1:8080'), true);
		});

		test('case insensitive for localhost', () => {
			assert.strictEqual(isLocalhostAuthority('LOCALHOST'), true);
			assert.strictEqual(isLocalhostAuthority('LocalHost:3000'), true);
			assert.strictEqual(isLocalhostAuthority('SUB.LOCALHOST'), true);
		});

		test('does not match non-localhost authorities', () => {
			assert.strictEqual(isLocalhostAuthority('example.com'), false);
			assert.strictEqual(isLocalhostAuthority('notlocalhost.com'), false);
			assert.strictEqual(isLocalhostAuthority('127.0.0.2'), false);
			assert.strictEqual(isLocalhostAuthority('192.168.1.1'), false);
		});
	});
});
