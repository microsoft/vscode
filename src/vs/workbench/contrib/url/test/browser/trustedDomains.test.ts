/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';

import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isURLDomainTrusted } from '../../../../../platform/url/common/trustedDomains.js';

function linkAllowedByRules(link: string, rules: string[]) {
	assert.ok(isURLDomainTrusted(URI.parse(link), rules), `Link\n${link}\n should be allowed by rules\n${JSON.stringify(rules)}`);
}
function linkNotAllowedByRules(link: string, rules: string[]) {
	assert.ok(!isURLDomainTrusted(URI.parse(link), rules), `Link\n${link}\n should NOT be allowed by rules\n${JSON.stringify(rules)}`);
}

suite('Link protection domain matching', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	test('simple', () => {
		linkNotAllowedByRules('https://x.org', []);

		linkAllowedByRules('https://x.org', ['https://x.org']);
		linkAllowedByRules('https://x.org/foo', ['https://x.org']);

		linkNotAllowedByRules('https://x.org', ['http://x.org']);
		linkNotAllowedByRules('http://x.org', ['https://x.org']);

		linkNotAllowedByRules('https://www.x.org', ['https://x.org']);

		linkAllowedByRules('https://www.x.org', ['https://www.x.org', 'https://y.org']);
	});

	test('localhost', () => {
		linkAllowedByRules('https://127.0.0.1', []);
		linkAllowedByRules('https://127.0.0.1:3000', []);
		linkAllowedByRules('https://localhost', []);
		linkAllowedByRules('https://localhost:3000', []);
		linkAllowedByRules('https://dev.localhost', []);
		linkAllowedByRules('https://dev.localhost:3000', []);
		linkAllowedByRules('https://app.localhost', []);
		linkAllowedByRules('https://api.localhost:8080', []);
		linkAllowedByRules('https://myapp.dev.localhost:8080', []);
	});

	test('* star', () => {
		linkAllowedByRules('https://a.x.org', ['https://*.x.org']);
		linkAllowedByRules('https://a.b.x.org', ['https://*.x.org']);
	});

	test('no scheme', () => {
		linkAllowedByRules('https://a.x.org', ['a.x.org']);
		linkAllowedByRules('https://a.x.org', ['*.x.org']);
		linkAllowedByRules('https://a.b.x.org', ['*.x.org']);
		linkAllowedByRules('https://x.org', ['*.x.org']);
		// https://github.com/microsoft/vscode/issues/249353
		linkAllowedByRules('https://x.org:3000', ['*.x.org:3000']);
	});

	test('sub paths', () => {
		linkAllowedByRules('https://x.org/foo', ['https://x.org/foo']);
		linkAllowedByRules('https://x.org/foo/bar', ['https://x.org/foo']);

		linkAllowedByRules('https://x.org/foo', ['https://x.org/foo/']);
		linkAllowedByRules('https://x.org/foo/bar', ['https://x.org/foo/']);

		linkAllowedByRules('https://x.org/foo', ['x.org/foo']);
		linkAllowedByRules('https://x.org/foo', ['*.org/foo']);

		linkNotAllowedByRules('https://x.org/bar', ['https://x.org/foo']);
		linkNotAllowedByRules('https://x.org/bar', ['x.org/foo']);
		linkNotAllowedByRules('https://x.org/bar', ['*.org/foo']);

		linkAllowedByRules('https://x.org/foo/bar', ['https://x.org/foo']);
		linkNotAllowedByRules('https://x.org/foo2', ['https://x.org/foo']);

		linkNotAllowedByRules('https://www.x.org/foo', ['https://x.org/foo']);

		linkNotAllowedByRules('https://a.x.org/bar', ['https://*.x.org/foo']);
		linkNotAllowedByRules('https://a.b.x.org/bar', ['https://*.x.org/foo']);

		linkAllowedByRules('https://github.com', ['https://github.com/foo/bar', 'https://github.com']);
	});

	test('ports', () => {
		linkNotAllowedByRules('https://x.org:8080/foo/bar', ['https://x.org:8081/foo']);
		linkAllowedByRules('https://x.org:8080/foo/bar', ['https://x.org:*/foo']);
		linkAllowedByRules('https://x.org/foo/bar', ['https://x.org:*/foo']);
		linkAllowedByRules('https://x.org:8080/foo/bar', ['https://x.org:8080/foo']);
	});

	test('ip addresses', () => {
		linkAllowedByRules('http://192.168.1.7/', ['http://192.168.1.7/']);
		linkAllowedByRules('http://192.168.1.7/', ['http://192.168.1.7']);
		linkAllowedByRules('http://192.168.1.7/', ['http://192.168.1.*']);

		linkNotAllowedByRules('http://192.168.1.7:3000/', ['http://192.168.*.6:*']);
		linkAllowedByRules('http://192.168.1.7:3000/', ['http://192.168.1.7:3000/']);
		linkAllowedByRules('http://192.168.1.7:3000/', ['http://192.168.1.7:*']);
		linkAllowedByRules('http://192.168.1.7:3000/', ['http://192.168.1.*:*']);
		linkNotAllowedByRules('http://192.168.1.7:3000/', ['http://192.168.*.6:*']);
	});

	test('scheme match', () => {
		linkAllowedByRules('http://192.168.1.7/', ['http://*']);
		linkAllowedByRules('http://twitter.com', ['http://*']);
		linkAllowedByRules('http://twitter.com/hello', ['http://*']);
		linkNotAllowedByRules('https://192.168.1.7/', ['http://*']);
		linkNotAllowedByRules('https://twitter.com/', ['http://*']);
	});

	test('case normalization', () => {
		// https://github.com/microsoft/vscode/issues/99294
		linkAllowedByRules('https://github.com/microsoft/vscode/issues/new', ['https://github.com/microsoft']);
		linkAllowedByRules('https://github.com/microsoft/vscode/issues/new', ['https://github.com/microsoft']);
	});

	test('ignore query & fragment - https://github.com/microsoft/vscode/issues/156839', () => {
		linkAllowedByRules('https://github.com/login/oauth/authorize?foo=4', ['https://github.com/login/oauth/authorize']);
		linkAllowedByRules('https://github.com/login/oauth/authorize#foo', ['https://github.com/login/oauth/authorize']);
	});

	test('ensure individual parts of url are compared and wildcard does not leak out', () => {
		linkNotAllowedByRules('https://x.org/github.com', ['https://*.github.com']);
		linkNotAllowedByRules('https://x.org/y.github.com', ['https://*.github.com']);
	});
});
