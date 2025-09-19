/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { sanitizeHtml } from '../../browser/domSanitize.js';
import { Schemas } from '../../common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

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
		{
			const html = '<div>removed</div><custom-tag>hello</custom-tag>';
			const result = sanitizeHtml(html, {
				allowedTags: { override: ['custom-tag'] }
			});
			assert.strictEqual(result.toString(), 'removed<custom-tag>hello</custom-tag>');
		}
		{
			const html = '<div>kept</div><augmented-tag>world</augmented-tag>';
			const result = sanitizeHtml(html, {
				allowedTags: { augment: ['augmented-tag'] }
			});
			assert.strictEqual(result.toString(), '<div>kept</div><augmented-tag>world</augmented-tag>');
		}
	});

	test('allows custom attributes via config', () => {
		const html = '<div custom-attr="value">content</div>';
		const result = sanitizeHtml(html, {
			allowedAttributes: { override: ['custom-attr'] }
		});
		const str = result.toString();

		assert.ok(str.includes('custom-attr="value"'));
	});

	test('Attributes in config should be case insensitive', () => {
		const html = '<div Custom-Attr="value">content</div>';

		{
			const result = sanitizeHtml(html, {
				allowedAttributes: { override: ['custom-attr'] }
			});
			assert.ok(result.toString().includes('custom-attr="value"'));
		}
		{
			const result = sanitizeHtml(html, {
				allowedAttributes: { override: ['CUSTOM-ATTR'] }
			});
			assert.ok(result.toString().includes('custom-attr="value"'));
		}
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

		assert.ok(result.toString().includes('href="https://example.com"'));
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
		const result = sanitizeHtml(html, {
			allowedMediaProtocols: { override: [Schemas.data] }
		});

		assert.ok(result.toString().includes('src="data:image/png;base64,'));
	});

	test('Removes relative paths for img src by default', () => {
		const html = '<img src="path/img.png">';
		const result = sanitizeHtml(html);
		assert.strictEqual(result.toString(), '<img>');
	});

	test('Can allow relative paths for image', () => {
		const html = '<img src="path/img.png">';
		const result = sanitizeHtml(html, {
			allowRelativeMediaPaths: true,
		});
		assert.strictEqual(result.toString(), '<img src="path/img.png">');
	});

	test('Supports dynamic attribute sanitization', () => {
		const html = '<div title="a" other="1">text1</div><div title="b" other="2">text2</div>';
		const result = sanitizeHtml(html, {
			allowedAttributes: {
				override: [
					{
						attributeName: 'title',
						shouldKeep: (_el, data) => {
							return data.attrValue.includes('b');
						}
					}
				]
			}
		});
		assert.strictEqual(result.toString(), '<div>text1</div><div title="b">text2</div>');
	});

	test('Supports changing attributes in dynamic sanitization', () => {
		const html = '<div title="abc" other="1">text1</div><div title="xyz" other="2">text2</div>';
		const result = sanitizeHtml(html, {
			allowedAttributes: {
				override: [
					{
						attributeName: 'title',
						shouldKeep: (_el, data) => {
							if (data.attrValue === 'abc') {
								return false;
							}
							return data.attrValue + data.attrValue;
						}
					}
				]
			}
		});
		// xyz title should be preserved and doubled
		assert.strictEqual(result.toString(), '<div>text1</div><div title="xyzxyz">text2</div>');
	});

	test('Attr name should clear previously set dynamic sanitizer', () => {
		const html = '<div title="abc" other="1">text1</div><div title="xyz" other="2">text2</div>';
		const result = sanitizeHtml(html, {
			allowedAttributes: {
				override: [
					{
						attributeName: 'title',
						shouldKeep: () => false
					},
					'title' // Should allow everything since it comes after custom rule
				]
			}
		});
		assert.strictEqual(result.toString(), '<div title="abc">text1</div><div title="xyz">text2</div>');
	});

	suite('replaceWithPlaintext', () => {

		test('replaces unsupported tags with plaintext representation', () => {
			const html = '<div>safe<script>alert(1)</script>content</div>';
			const result = sanitizeHtml(html, {
				replaceWithPlaintext: true
			});
			const str = result.toString();
			assert.strictEqual(str, `<div>safe&lt;script&gt;alert(1)&lt;/script&gt;content</div>`);
		});

		test('handles self-closing tags correctly', () => {
			const html = '<div><input type="text"><custom-input /></div>';
			const result = sanitizeHtml(html, {
				replaceWithPlaintext: true
			});
			assert.strictEqual(result.toString(), '<div>&lt;input type="text"&gt;&lt;custom-input&gt;&lt;/custom-input&gt;</div>');
		});

		test('handles tags with attributes', () => {
			const html = '<div><unknown-tag class="test" id="myid">content</unknown-tag></div>';
			const result = sanitizeHtml(html, {
				replaceWithPlaintext: true
			});
			assert.strictEqual(result.toString(), '<div>&lt;unknown-tag class="test" id="myid"&gt;content&lt;/unknown-tag&gt;</div>');
		});

		test('handles nested unsupported tags', () => {
			const html = '<div><outer><inner>nested</inner></outer></div>';
			const result = sanitizeHtml(html, {
				replaceWithPlaintext: true
			});
			assert.strictEqual(result.toString(), '<div>&lt;outer&gt;&lt;inner&gt;nested&lt;/inner&gt;&lt;/outer&gt;</div>');
		});

		test('handles comments correctly', () => {
			const html = '<div><!-- this is a comment -->content</div>';
			const result = sanitizeHtml(html, {
				replaceWithPlaintext: true
			});
			assert.strictEqual(result.toString(), '<div>&lt;!-- this is a comment --&gt;content</div>');
		});

		test('handles empty tags', () => {
			const html = '<div><empty></empty></div>';
			const result = sanitizeHtml(html, {
				replaceWithPlaintext: true
			});
			assert.strictEqual(result.toString(), '<div>&lt;empty&gt;&lt;/empty&gt;</div>');
		});

		test('works with custom allowed tags configuration', () => {
			const html = '<div><custom>allowed</custom><forbidden>not allowed</forbidden></div>';
			const result = sanitizeHtml(html, {
				replaceWithPlaintext: true,
				allowedTags: { augment: ['custom'] }
			});
			assert.strictEqual(result.toString(), '<div><custom>allowed</custom>&lt;forbidden&gt;not allowed&lt;/forbidden&gt;</div>');
		});
	});
});
