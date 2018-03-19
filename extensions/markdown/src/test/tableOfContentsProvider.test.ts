/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import 'mocha';

import { TableOfContentsProvider } from '../tableOfContentsProvider';
import { MarkdownEngine } from '../markdownEngine';
import { MarkdownContributions } from '../markdownExtensions';
import { InMemoryDocument } from './inMemoryDocument';

const testFileName = vscode.Uri.parse('test.md');

suite('markdown.TableOfContentsProvider', () => {
	test('Lookup should not return anything for empty document', async () => {
		const doc = new InMemoryDocument(testFileName, '');
		const provider = new TableOfContentsProvider(newEngine(), doc);

		assert.strictEqual(await provider.lookup(''), undefined);
		assert.strictEqual(await provider.lookup('foo'), undefined);
	});

	test('Lookup should not return anything for document with no headers', async () => {
		const doc = new InMemoryDocument(testFileName, 'a *b*\nc');
		const provider = new TableOfContentsProvider(newEngine(), doc);

		assert.strictEqual(await provider.lookup(''), undefined);
		assert.strictEqual(await provider.lookup('foo'), undefined);
		assert.strictEqual(await provider.lookup('a'), undefined);
		assert.strictEqual(await provider.lookup('b'), undefined);
	});

	test('Lookup should return basic #header', async () => {
		const doc = new InMemoryDocument(testFileName, `# a\nx\n# c`);
		const provider = new TableOfContentsProvider(newEngine(), doc);

		{
			const entry = await provider.lookup('a');
			assert.ok(entry);
			assert.strictEqual(entry!.line, 0);
		}
		{
			assert.strictEqual(await provider.lookup('x'), undefined);
		}
		{
			const entry = await provider.lookup('c');
			assert.ok(entry);
			assert.strictEqual(entry!.line, 2);
		}
	});

	test('Lookups should be case in-sensitive', async () => {
		const doc = new InMemoryDocument(testFileName, `# fOo\n`);
		const provider = new TableOfContentsProvider(newEngine(), doc);

		assert.strictEqual((await provider.lookup('fOo'))!.line, 0);
		assert.strictEqual((await provider.lookup('foo'))!.line, 0);
		assert.strictEqual((await provider.lookup('FOO'))!.line, 0);
	});

	test('Lookups should ignore leading and trailing white-space, and collapse internal whitespace', async () => {
		const doc = new InMemoryDocument(testFileName, `#      f o  o    \n`);
		const provider = new TableOfContentsProvider(newEngine(), doc);

		assert.strictEqual((await provider.lookup('f o  o'))!.line, 0);
		assert.strictEqual((await provider.lookup('  f o  o'))!.line, 0);
		assert.strictEqual((await provider.lookup('  f o  o  '))!.line, 0);
		assert.strictEqual((await provider.lookup('f o o'))!.line, 0);
		assert.strictEqual((await provider.lookup('f o       o'))!.line, 0);

		assert.strictEqual(await provider.lookup('f'), undefined);
		assert.strictEqual(await provider.lookup('foo'), undefined);
		assert.strictEqual(await provider.lookup('fo o'), undefined);
	});

	test('should normalize special characters #44779', async () => {
		const doc = new InMemoryDocument(testFileName, `# Indentação\n`);
		const provider = new TableOfContentsProvider(newEngine(), doc);

		assert.strictEqual((await provider.lookup('indentacao'))!.line, 0);
	});
});

function newEngine(): MarkdownEngine {
	return new MarkdownEngine(new class implements MarkdownContributions {
		readonly previewScripts: vscode.Uri[] = [];
		readonly previewStyles: vscode.Uri[] = [];
		readonly previewResourceRoots: vscode.Uri[] = [];
		readonly markdownItPlugins: Promise<(md: any) => any>[]  = [];

	});
}

