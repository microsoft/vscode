/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { getLanguageModes, TextDocument, ClientCapabilities } from '../modes/languageModes.js';
import { getNodeFileFS } from '../node/nodeFs.js';

const testUri = 'test://test/test.html';

async function getHoverValue(value: string): Promise<string> {
	const offset = value.indexOf('|');
	value = value.substr(0, offset) + value.substr(offset + 1);

	const workspace = {
		settings: {},
		folders: [{ name: 'x', uri: testUri.substr(0, testUri.lastIndexOf('/')) }]
	};

	const document = TextDocument.create(testUri, 'html', 0, value);
	const position = document.positionAt(offset);

	const languageModes = getLanguageModes({ css: true, javascript: true }, workspace, ClientCapabilities.LATEST, getNodeFileFS());
	const mode = languageModes.getModeAtPosition(document, position)!;

	try {
		const hover = await mode.doHover!(document, position);
		assert.ok(hover, 'expected a hover result');
		const contents = hover.contents;
		if (typeof contents === 'string') {
			return contents;
		}
		if (Array.isArray(contents)) {
			return contents.map(c => typeof c === 'string' ? c : c.value).join('\n');
		}
		return (contents as { value: string }).value;
	} finally {
		languageModes.dispose();
	}
}

suite('HTML Hover', () => {
	test('JavaScript hover in <script> includes JSDoc description for user-defined class', async () => {
		const html = [
			'<html><head><script>',
			'/**',
			' * A greeter that says hello.',
			' * @param name the person to greet',
			' */',
			'class Greeter {',
			'  constructor(name) { this.name = name; }',
			'}',
			'new Gree|ter("world");',
			'</script></head></html>'
		].join('\n');
		const value = await getHoverValue(html);

		// The signature should still be present in a typescript code block
		assert.match(value, /```typescript[\s\S]*Greeter[\s\S]*```/, `signature missing in hover: ${value}`);
		// The JSDoc summary should also be present (this is the bug fix)
		assert.ok(value.includes('A greeter that says hello.'), `JSDoc description missing in hover: ${value}`);
	});

	test('JavaScript hover in <script> includes JSDoc description for user-defined method', async () => {
		const html = [
			'<html><head><script>',
			'class Greeter {',
			'  /**',
			'   * Returns a friendly greeting.',
			'   */',
			'  sayHello() { return "hi"; }',
			'}',
			'new Greeter().sayHe|llo();',
			'</script></head></html>'
		].join('\n');
		const value = await getHoverValue(html);

		assert.match(value, /```typescript[\s\S]*sayHello[\s\S]*```/, `signature missing in hover: ${value}`);
		assert.ok(value.includes('Returns a friendly greeting.'), `JSDoc description missing in hover: ${value}`);
	});
});
