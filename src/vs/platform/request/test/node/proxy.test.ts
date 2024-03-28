/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { parse as parseUrl } from 'url';
import { shouldProxyUrl, urlMatchDenyList } from 'vs/platform/request/node/proxy';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';


suite("proxy support", () => {
	const urlWithDomain = parseUrl("https://example.com/some/path");
	const urlWithDomainAndPort = parseUrl("https://example.com:80/some/path");
	const urlWithSubdomain = parseUrl("https://internal.example.com/some/path");
	const urlWithIPv4 = parseUrl("https://127.0.0.1/some/path");
	const urlWithIPv4AndPort = parseUrl("https://127.0.0.1:80/some/path");
	const urlWithIPv6 = parseUrl("https://[::1]/some/path");

	test("returns true if no denylists are provided", () => {
		assert.strictEqual(shouldProxyUrl(urlWithDomain, [], {}), true);
	});

	test("gives precedence to direct config value rather than environment", () => {
		assert.strictEqual(shouldProxyUrl(urlWithDomain, ["otherexample.com"], { no_proxy: "example.com" }), true);
		assert.strictEqual(shouldProxyUrl(urlWithDomain, ["example.com"], { no_proxy: "otherexample.com" }), false);
	});

	test("match wildcard", () => {
		assert.strictEqual(urlMatchDenyList(urlWithDomain, ['*']), true);
		assert.strictEqual(urlMatchDenyList(urlWithSubdomain, ['*']), true);
		assert.strictEqual(urlMatchDenyList(urlWithIPv4, ['*']), true);
		assert.strictEqual(urlMatchDenyList(urlWithIPv6, ['*']), true);
	});

	test("match direct hostname", () => {
		assert.strictEqual(urlMatchDenyList(urlWithDomain, ['example.com']), true);
		assert.strictEqual(urlMatchDenyList(urlWithDomain, ['otherexample.com']), false);
		// Technically the following are a suffix match but it's a known behavior in the ecosystem
		assert.strictEqual(urlMatchDenyList(urlWithDomain, ['.example.com']), true);
		assert.strictEqual(urlMatchDenyList(urlWithDomain, ['.otherexample.com']), false);
	});

	test("match hostname suffixes", () => {
		assert.strictEqual(urlMatchDenyList(urlWithSubdomain, ['example.com']), true);
		assert.strictEqual(urlMatchDenyList(urlWithSubdomain, ['.example.com']), true);
		assert.strictEqual(urlMatchDenyList(urlWithSubdomain, ['otherexample.com']), false);
		assert.strictEqual(urlMatchDenyList(urlWithSubdomain, ['.otherexample.com']), false);
	});

	test("match hostname with ports", () => {
		assert.strictEqual(urlMatchDenyList(urlWithDomainAndPort, ['example.com:80']), true);
		assert.strictEqual(urlMatchDenyList(urlWithDomainAndPort, ['otherexample.com:80']), false);
		assert.strictEqual(urlMatchDenyList(urlWithDomainAndPort, ['example.com:70']), false);
	});

	test("match IP addresses", () => {
		assert.strictEqual(urlMatchDenyList(urlWithIPv4, ['example.com']), false);
		assert.strictEqual(urlMatchDenyList(urlWithIPv6, ['example.com']), false);
		assert.strictEqual(urlMatchDenyList(urlWithIPv4, ['127.0.0.1']), true);
		assert.strictEqual(urlMatchDenyList(urlWithIPv6, ['::1']), true);
	});

	test("match IP addresses with port", () => {
		assert.strictEqual(urlMatchDenyList(urlWithIPv4AndPort, ['127.0.0.1:80']), true);
		assert.strictEqual(urlMatchDenyList(urlWithIPv4AndPort, ['127.0.0.1:70']), false);
	});

	test("match IP addresses with range deny list", () => {
		assert.strictEqual(urlMatchDenyList(urlWithIPv4, ['127.0.0.0/8']), true);
		assert.strictEqual(urlMatchDenyList(urlWithIPv4, ['10.0.0.0/8']), false);
		assert.strictEqual(urlMatchDenyList(urlWithIPv6, ['::0/64']), true);
		assert.strictEqual(urlMatchDenyList(urlWithIPv6, ['100::0/64']), false);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
