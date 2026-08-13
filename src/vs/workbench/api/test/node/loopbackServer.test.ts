/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { URI } from '../../../../base/common/uri.js';
import { NullLogger } from '../../../../platform/log/common/log.js';
import { LoopbackAuthServer } from '../../node/loopbackServer.js';

/**
 * Decodes the five entities produced by `htmlAttributeEncodeValue`, the same way a browser
 * does when reading a quoted attribute value back via `getAttribute()`.
 */
function decodeHtmlAttribute(value: string): string {
	return value.replace(/&(lt|gt|quot|apos|amp);/g, (_, entity) => {
		switch (entity) {
			case 'lt': return '<';
			case 'gt': return '>';
			case 'quot': return '"';
			case 'apos': return '\'';
			case 'amp': return '&';
		}
		return _;
	});
}

/**
 * Extracts the source of the redirect anchor tag. Deliberately does not rely on any attribute
 * added by the fix, so that these tests detect a regression rather than just a missing marker.
 */
function getRedirectAnchor(html: string): string {
	const end = html.indexOf('>click here</a>');
	assert.ok(end !== -1, 'redirect anchor should be present');
	const start = html.lastIndexOf('<a ', end);
	assert.ok(start !== -1, 'redirect anchor should have an opening tag');
	return html.substring(start, end + 1);
}

/**
 * Returns the anchor source with quoted attribute values removed, leaving only the region a
 * browser tokenizes as attribute names. Text inside a quoted value is inert, so this is what
 * distinguishes an injected handler from an escaped one that merely looks like markup.
 */
function getAnchorAttributeRegion(html: string): string {
	return getRedirectAnchor(html).replace(/"[^"]*"/g, '');
}

/** Extracts the anchor's `href` attribute value, the way a browser parses a quoted attribute. */
function getRedirectHref(html: string): string {
	const match = /href="([^"]*)"/.exec(getRedirectAnchor(html));
	assert.ok(match, 'redirect anchor should have a quoted href attribute');
	return match[1];
}

/** Extracts the trailing inline `<script>` block that performs the redirect. */
function getScriptBlock(html: string): string {
	const start = html.lastIndexOf('<script>');
	const end = html.lastIndexOf('</script>');
	assert.ok(start !== -1 && end > start, 'inline script block should be present');
	return html.substring(start + '<script>'.length, end);
}

function render(appUri: URI, appName = 'Visual Studio Code'): string {
	return new LoopbackAuthServer(new NullLogger(), appUri, appName).getHtml();
}

/**
 * Builds a callback URI whose path segment carries the given authorization server authority,
 * mirroring how the dynamic auth provider constructs it.
 */
function appUriForAuthority(authority: string): URI {
	return URI.from({
		scheme: 'vscode',
		authority: 'dynamicauthprovider',
		path: `/${authority}/redirect`,
		query: 'nonce=NONCE123'
	});
}

suite('LoopbackAuthServer - getHtml', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('does not interpolate the app URI into the inline script', () => {
		// The redirect reads the URI back off the anchor rather than embedding it in the
		// script, so quote characters cannot terminate a JavaScript string literal.
		const appUri = appUriForAuthority('x\';alert(1)//@evil.example');

		assert.deepStrictEqual(
			{
				scriptMentionsUri: getScriptBlock(render(appUri)).includes('vscode://'),
				scriptMentionsPayload: getScriptBlock(render(appUri)).includes('alert(1)')
			},
			{ scriptMentionsUri: false, scriptMentionsPayload: false }
		);
	});

	test('encodes characters that would break out of the href attribute', () => {
		const appUri = appUriForAuthority('x" onmouseover=alert(1) z@evil.example');

		assert.deepStrictEqual(
			{
				// A raw quote terminates the attribute early and injects an event handler.
				injectsEventHandler: /\son[a-z]+\s*=/i.test(getAnchorAttributeRegion(render(appUri))),
				hasRawQuoteInHref: /["'<>]/.test(getRedirectHref(render(appUri)))
			},
			{ injectsEventHandler: false, hasRawQuoteInHref: false }
		);
	});

	test('href round-trips to the exact app URI', () => {
		// Guards the redirect target: the anchor must decode back to the byte-exact URI that
		// was handed to `$waitForUriHandler`, which compares scheme, authority and path.
		// Note the production code reads `getAttribute('href')`, not the `.href` property,
		// because the latter returns a browser-normalized (percent-encoded) URL.
		const uris = [
			appUriForAuthority('login.microsoftonline.com'),
			appUriForAuthority('x\';alert(1)//@evil.example'),
			URI.from({
				scheme: 'vscode',
				authority: 'dynamicauthprovider',
				path: '/a"b<c>d&e/redirect',
				query: 'nonce=ABC&state=XYZ'
			})
		];

		assert.deepStrictEqual(
			uris.map(uri => decodeHtmlAttribute(getRedirectHref(render(uri)))),
			uris.map(uri => uri.toString(true))
		);
	});

	test('escapes the app name', () => {
		const html = render(appUriForAuthority('login.example.com'), 'Code <img src=x onerror=alert(1)>');

		assert.deepStrictEqual(
			{
				hasRawTag: html.includes('<img src=x'),
				hasEscapedTag: html.includes('&lt;img src=x onerror=alert(1)&gt;')
			},
			{ hasRawTag: false, hasEscapedTag: true }
		);
	});
});
