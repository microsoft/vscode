/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';

// `@vscode/markdown-editor` ships as ESM-only, so it must be loaded with a
// real dynamic `import()` from this CommonJS-compiled extension. TypeScript
// downlevels a literal `import()` back into `require()` under a commonjs
// module target, which would defeat the purpose here, so the call is built
// via `new Function` to keep it a genuine dynamic import at runtime.
const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<typeof import('@vscode/markdown-editor')>;

async function loadMarkdownEditor() {
	return dynamicImport('@vscode/markdown-editor');
}

async function parse(source: string) {
	const { MarkdownParser, StringValue, visualizeAst } = await loadMarkdownEditor();
	const doc = new MarkdownParser().parse(new StringValue(source));
	return visualizeAst(doc, source);
}

function findLinkUrls(node: any, out: string[] = []): string[] {
	if (node && typeof node === 'object') {
		if (typeof node.label === 'string') {
			const match = /^link\(url="([^"]*)"\)/.exec(node.label);
			if (match) {
				out.push(match[1]);
			}
		}
		for (const child of node.children ?? []) {
			findLinkUrls(child, out);
		}
	}
	return out;
}

// See https://github.com/microsoft/vscode/issues/326604
suite('markdownEditor: link rendering (issue #326604)', () => {
	test('Reference-style link is parsed as a link node, not glue', async () => {
		// The reference (`[spec]`) is not resolved against its `[spec]: url`
		// definition elsewhere in the document, so `url` stays empty -- only
		// the rendering gap is fixed here, not making the link navigable.
		const source = 'A [reference-style link][spec] to the spec.\n\n[spec]: https://example.com/\n';
		const urls = findLinkUrls((await parse(source)).root);
		assert.deepStrictEqual(urls, ['']);
	});

	test('Undefined reference falls back to literal text', async () => {
		const source = 'A [reference-style link][doesnotexist] to nowhere.\n';
		const urls = findLinkUrls((await parse(source)).root);
		assert.deepStrictEqual(urls, []);
	});

	test('Autolink is parsed as a link node with the correct url', async () => {
		const source = 'An autolink: <https://github.com/microsoft/vscode>.\n';
		const urls = findLinkUrls((await parse(source)).root);
		assert.deepStrictEqual(urls, ['https://github.com/microsoft/vscode']);
	});

	test('Email autolink gets a mailto: url', async () => {
		const source = 'Contact <user@example.com> now.\n';
		const urls = findLinkUrls((await parse(source)).root);
		assert.deepStrictEqual(urls, ['mailto:user@example.com']);
	});

	test('Already mailto-prefixed autolink is not double-prefixed', async () => {
		const source = 'Already prefixed: <mailto:user@example.com>.\n';
		const urls = findLinkUrls((await parse(source)).root);
		assert.deepStrictEqual(urls, ['mailto:user@example.com']);
	});

	test('Inline link is unaffected', async () => {
		const source = 'An [external link](https://code.visualstudio.com) to the VS Code website.\n';
		const urls = findLinkUrls((await parse(source)).root);
		assert.deepStrictEqual(urls, ['https://code.visualstudio.com']);
	});
});
