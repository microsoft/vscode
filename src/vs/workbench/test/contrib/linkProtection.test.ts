/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { isURLDomainTrusted } from 'vs/workbench/contrib/url/common/trustedDomainsValidator';
import { URI } from 'vs/base/common/uri';

function linkProtectedByRules(link: string, rules: string[]) {
	assert.ok(isURLDomainTrusted(URI.parse(link), rules));
}
function linkNotProtectedByRules(link: string, rules: string[]) {
	assert.ok(!isURLDomainTrusted(URI.parse(link), rules));
}

suite('Link protection domain matching', () => {
	test('simple', () => {
		linkNotProtectedByRules('https://x.org', []);

		linkProtectedByRules('https://x.org', ['https://x.org']);
		linkProtectedByRules('https://x.org/foo', ['https://x.org']);

		linkNotProtectedByRules('https://x.org', ['http://x.org']);
		linkNotProtectedByRules('http://x.org', ['https://x.org']);

		linkNotProtectedByRules('https://www.x.org', ['https://x.org']);

		linkProtectedByRules('https://www.x.org', ['https://www.x.org', 'https://y.org']);
	});

	test('localhost', () => {
		linkProtectedByRules('https://127.0.0.1', []);
		linkProtectedByRules('https://127.0.0.1:3000', []);
		linkProtectedByRules('https://localhost', []);
		linkProtectedByRules('https://localhost:3000', []);
	});

	test('* star', () => {
		linkProtectedByRules('https://a.x.org', ['https://*.x.org']);
		linkProtectedByRules('https://a.b.x.org', ['https://*.x.org']);
		linkProtectedByRules('https://a.x.org', ['https://a.x.*']);
		linkProtectedByRules('https://a.x.org', ['https://a.*.org']);
		linkProtectedByRules('https://a.x.org', ['https://*.*.org']);
		linkProtectedByRules('https://a.b.x.org', ['https://*.b.*.org']);
		linkProtectedByRules('https://a.a.b.x.org', ['https://*.b.*.org']);
	});

	test('no scheme', () => {
		linkProtectedByRules('https://a.x.org', ['a.x.org']);
		linkProtectedByRules('https://a.x.org', ['*.x.org']);
		linkProtectedByRules('https://a.b.x.org', ['*.x.org']);
		linkProtectedByRules('https://x.org', ['*.x.org']);
	});
});
