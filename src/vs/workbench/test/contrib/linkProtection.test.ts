/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { isURLDomainTrusted } from 'vs/workbench/contrib/url/common/trustedDomainsValidator';
import { URI } from 'vs/base/common/uri';

suite('Link protection domain matching', () => {

	test('simple', () => {
		assert.ok(!isURLDomainTrusted(URI.parse('https://x.org'), []));
		assert.ok(isURLDomainTrusted(URI.parse('https://x.org'), ['https://x.org']));
		assert.ok(isURLDomainTrusted(URI.parse('https://x.org/foo'), ['https://x.org']));

		assert.ok(!isURLDomainTrusted(URI.parse('https://x.org'), ['http://x.org']));
		assert.ok(!isURLDomainTrusted(URI.parse('http://x.org'), ['https://x.org']));

		assert.ok(!isURLDomainTrusted(URI.parse('https://www.x.org'), ['https://x.org']));

		assert.ok(isURLDomainTrusted(URI.parse('https://www.x.org'), ['https://www.x.org', 'https://y.org']));
	});

	test('localhost', () => {
		assert.ok(isURLDomainTrusted(URI.parse('https://127.0.0.1'), []));
		assert.ok(isURLDomainTrusted(URI.parse('https://127.0.0.1:3000'), []));
		assert.ok(isURLDomainTrusted(URI.parse('https://localhost'), []));
		assert.ok(isURLDomainTrusted(URI.parse('https://localhost:3000'), []));
	});

	test('* star', () => {
		assert.ok(isURLDomainTrusted(URI.parse('https://a.x.org'), ['https://*.x.org']));
		assert.ok(isURLDomainTrusted(URI.parse('https://a.b.x.org'), ['https://*.x.org']));
		assert.ok(isURLDomainTrusted(URI.parse('https://a.x.org'), ['https://a.x.*']));
		assert.ok(isURLDomainTrusted(URI.parse('https://a.x.org'), ['https://a.*.org']));
		assert.ok(isURLDomainTrusted(URI.parse('https://a.x.org'), ['https://*.*.org']));
		assert.ok(isURLDomainTrusted(URI.parse('https://a.b.x.org'), ['https://*.b.*.org']));
		assert.ok(isURLDomainTrusted(URI.parse('https://a.a.b.x.org'), ['https://*.b.*.org']));
	});

	test('no scheme', () => {
		assert.ok(isURLDomainTrusted(URI.parse('https://a.x.org'), ['a.x.org']));
		assert.ok(isURLDomainTrusted(URI.parse('https://a.x.org'), ['*.x.org']));
		assert.ok(isURLDomainTrusted(URI.parse('https://a.b.x.org'), ['*.x.org']));
		assert.ok(isURLDomainTrusted(URI.parse('https://x.org'), ['*.x.org']));
	});
});
