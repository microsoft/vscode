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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZG9tU2FuaXRpemUudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvdGVzdC9icm93c2VyL2RvbVNhbml0aXplLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDakMsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQzVELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUNsRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUU3RSxLQUFLLENBQUMsYUFBYSxFQUFFLEdBQUcsRUFBRTtJQUV6Qix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksQ0FBQyxxQ0FBcUMsRUFBRSxHQUFHLEVBQUU7UUFDaEQsTUFBTSxJQUFJLEdBQUcsaURBQWlELENBQUM7UUFDL0QsTUFBTSxNQUFNLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2xDLE1BQU0sR0FBRyxHQUFHLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUU5QixNQUFNLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUNqQyxNQUFNLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUNoQyxNQUFNLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUNuQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO1FBQ3JDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLFVB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