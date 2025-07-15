/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';
import { sanitizeHtml } from '../../browser/domSanitize.js';
import * as assert from 'assert';

suite('DomSanitize', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('removes unsupported tags by default', () => {
		const html = '<div>safe<script>alert(1)</script>content</div>';
		const result = sanitizeHtml(html);
		const str = result.toString();

		assert.ok(str.includes('<div>'));
		assert.ok(str.includes('safe'));
		assert.ok(str.includes('content'));
		assert.ok(!str.includes('<script>'));
		assert.ok(!str.includes('alert(1)'));
	});

	test('removes unsupported attributes by default', () => {
		const html = '<div onclick="alert(1)" title="safe">content</div>';
		const result = sanitizeHtml(html);
		const str = result.toString();

		assert.ok(str.includes('<div title="safe">'));
		assert.ok(!str.includes('onclick'));
		assert.ok(!str.includes('alert(1)'));
	});

	test('allows custom tags via config', () => {
		const html = '<custom-tag>hello</custom-tag>';
		const result = sanitizeHtml(html, {
			overrideAllowedTags: ['custom-tag']
		});
		const str = result.toString();

		assert.ok(str.includes('<custom-tag>hello</custom-tag>'));
	});

	test('allows custom attributes via config', () => {
		const html = '<div custom-attr="value">content</div>';
		const result = sanitizeHtml(html, {
			overrideAllowedAttributes: ['custom-attr']
		});
		const str = result.toString();

		assert.ok(str.includes('custom-attr="value"'));
	});

	test('removes unsupported protocols for href by default', () => {
		const html = '<a href="javascript:alert(1)">bad link</a>';
		const result = sanitizeHtml(html);
		const str = result.toString();

		assert.ok(str.includes('<a>bad link</a>'));
		assert.ok(!str.includes('javascript:'));
	});

	test('removes unsupported protocols for src by default', () => {
		const html = '<img alt="text" src="javascript:alert(1)">';
		const result = sanitizeHtml(html);
		const str = result.toString();

		assert.ok(str.includes('<img alt="text">'));
		assert.ok(!str.includes('javascript:'));
	});

	test('allows safe protocols for href', () => {
		const html = '<a href="https://example.com">safe link</a>';
		const result = sanitizeHtml(html);
		const str = result.toString();

		assert.ok(str.includes('href="https://example.com"'));
	});

	test('allows fragment links', () => {
		const html = '<a href="#section">fragment link</a>';
		const result = sanitizeHtml(html);
		const str = result.toString();

		assert.ok(str.includes('href="#section"'));
	});

	test('removes data images by default', () => {
		const html = '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==">';
		const result = sanitizeHtml(html);
		const str = result.toString();

		assert.ok(str.includes('<img>'));
		assert.ok(!str.includes('src="data:'));
	});

	test('allows data images when enabled', () => {
		const html = '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==">';
		const result = sanitizeHtml(html, { allowDataImages: true });
		const str = result.toString();

		assert.ok(str.includes('src="data:image/png;base64,'));
	});
});
