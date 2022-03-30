/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { MdLinkProvider } from '../languageFeatures/documentLinkProvider';
import { createNewMarkdownEngine } from './engine';
import { InMemoryDocument } from '../util/inMemoryDocument';
import { joinLines, noopToken } from './util';


const testFile = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'x.md');

function getLinksForFile(fileContents: string) {
	const doc = new InMemoryDocument(testFile, fileContents);
	const provider = new MdLinkProvider(createNewMarkdownEngine());
	return provider.provideDocumentLinks(doc, noopToken);
}

function assertRangeEqual(expected: vscode.Range, actual: vscode.Range) {
	assert.strictEqual(expected.start.line, actual.start.line);
	assert.strictEqual(expected.start.character, actual.start.character);
	assert.strictEqual(expected.end.line, actual.end.line);
	assert.strictEqual(expected.end.character, actual.end.character);
}

suite('markdown.DocumentLinkProvider', () => {
	test('Should not return anything for empty document', async () => {
		const links = await getLinksForFile('');
		assert.strictEqual(links.length, 0);
	});

	test('Should not return anything for simple document without links', async () => {
		const links = await getLinksForFile('# a\nfdasfdfsafsa');
		assert.strictEqual(links.length, 0);
	});

	test('Should detect basic http links', async () => {
		const links = await getLinksForFile('a [b](https://example.com) c');
		assert.strictEqual(links.length, 1);
		const [link] = links;
		assertRangeEqual(link.range, new vscode.Range(0, 6, 0, 25));
	});

	test('Should detect basic workspace links', async () => {
		{
			const links = await getLinksForFile('a [b](./file) c');
			assert.strictEqual(links.length, 1);
			const [link] = links;
			assertRangeEqual(link.range, new vscode.Range(0, 6, 0, 12));
		}
		{
			const links = await getLinksForFile('a [b](file.png) c');
			assert.strictEqual(links.length, 1);
			const [link] = links;
			assertRangeEqual(link.range, new vscode.Range(0, 6, 0, 14));
		}
	});

	test('Should detect links with title', async () => {
		const links = await getLinksForFile('a [b](https://example.com "abc") c');
		assert.strictEqual(links.length, 1);
		const [link] = links;
		assertRangeEqual(link.range, new vscode.Range(0, 6, 0, 25));
	});

	// #35245
	test('Should handle links with escaped characters in name', async () => {
		const links = await getLinksForFile('a [b\\]](./file)');
		assert.strictEqual(links.length, 1);
		const [link] = links;
		assertRangeEqual(link.range, new vscode.Range(0, 8, 0, 14));
	});


	test('Should handle links with balanced parens', async () => {
		{
			const links = await getLinksForFile('a [b](https://example.com/a()c) c');
			assert.strictEqual(links.length, 1);
			const [link] = links;
			assertRangeEqual(link.range, new vscode.Range(0, 6, 0, 30));
		}
		{
			const links = await getLinksForFile('a [b](https://example.com/a(b)c) c');
			assert.strictEqual(links.length, 1);
			const [link] = links;
			assertRangeEqual(link.range, new vscode.Range(0, 6, 0, 31));

		}
		{
			// #49011
			const links = await getLinksForFile('[A link](http://ThisUrlhasParens/A_link(in_parens))');
			assert.strictEqual(links.length, 1);
			const [link] = links;
			assertRangeEqual(link.range, new vscode.Range(0, 9, 0, 50));
		}
	});

	test('Should handle two links without space', async () => {
		const links = await getLinksForFile('a ([test](test)[test2](test2)) c');
		assert.strictEqual(links.length, 2);
		const [link1, link2] = links;
		assertRangeEqual(link1.range, new vscode.Range(0, 10, 0, 14));
		assertRangeEqual(link2.range, new vscode.Range(0, 23, 0, 28));
	});

	// #49238
	test('should handle hyperlinked images', async () => {
		{
			const links = await getLinksForFile('[![alt text](image.jpg)](https://example.com)');
			assert.strictEqual(links.length, 2);
			const [link1, link2] = links;
			assertRangeEqual(link1.range, new vscode.Range(0, 13, 0, 22));
			assertRangeEqual(link2.range, new vscode.Range(0, 25, 0, 44));
		}
		{
			const links = await getLinksForFile('[![a]( whitespace.jpg )]( https://whitespace.com )');
			assert.strictEqual(links.length, 2);
			const [link1, link2] = links;
			assertRangeEqual(link1.range, new vscode.Range(0, 7, 0, 21));
			assertRangeEqual(link2.range, new vscode.Range(0, 26, 0, 48));
		}
		{
			const links = await getLinksForFile('[![a](img1.jpg)](file1.txt) text [![a](img2.jpg)](file2.txt)');
			assert.strictEqual(links.length, 4);
			const [link1, link2, link3, link4] = links;
			assertRangeEqual(link1.range, new vscode.Range(0, 6, 0, 14));
			assertRangeEqual(link2.range, new vscode.Range(0, 17, 0, 26));
			assertRangeEqual(link3.range, new vscode.Range(0, 39, 0, 47));
			assertRangeEqual(link4.range, new vscode.Range(0, 50, 0, 59));
		}
	});

	test('Should not consider link references starting with ^ character valid (#107471)', async () => {
		const links = await getLinksForFile('[^reference]: https://example.com');
		assert.strictEqual(links.length, 0);
	});

	test('Should find definitions links with spaces in angle brackets (#136073)', async () => {
		const links = await getLinksForFile([
			'[a]: <b c>',
			'[b]: <cd>',
		].join('\n'));
		assert.strictEqual(links.length, 2);

		const [link1, link2] = links;
		assertRangeEqual(link1.range, new vscode.Range(0, 6, 0, 9));
		assertRangeEqual(link2.range, new vscode.Range(1, 6, 1, 8));
	});

	test('Should only find one link for reference sources [a]: source (#141285)', async () => {
		const links = await getLinksForFile([
			'[Works]: https://microsoft.com',
		].join('\n'));

		assert.strictEqual(links.length, 1);
	});

	test('Should find links for referees with only one [] (#141285)', async () => {
		let links = await getLinksForFile([
			'[ref]',
			'[ref]: https://microsoft.com',
		].join('\n'));
		assert.strictEqual(links.length, 2);

		links = await getLinksForFile([
			'[Does Not Work]',
			'[def]: https://microsoft.com',
		].join('\n'));
		assert.strictEqual(links.length, 1);
	});

	test('Should not find link for reference using one [] when source does not exist (#141285)', async () => {
		const links = await getLinksForFile('[Works]');
		assert.strictEqual(links.length, 0);
	});

	test('Should not consider links in code fenced with backticks', async () => {
		const text = joinLines(
			'```',
			'[b](https://example.com)',
			'```');
		const links = await getLinksForFile(text);
		assert.strictEqual(links.length, 0);
	});

	test('Should not consider links in code fenced with tilda', async () => {
		const text = joinLines(
			'~~~',
			'[b](https://example.com)',
			'~~~');
		const links = await getLinksForFile(text);
		assert.strictEqual(links.length, 0);
	});

	test('Should not consider links in indented code', async () => {
		const links = await getLinksForFile('    [b](https://example.com)');
		assert.strictEqual(links.length, 0);
	});

	test('Should not consider links in inline code span', async () => {
		const links = await getLinksForFile('`[b](https://example.com)`');
		assert.strictEqual(links.length, 0);
	});

	test('Should not consider links with code span inside', async () => {
		const links = await getLinksForFile('[li`nk](https://example.com`)');
		assert.strictEqual(links.length, 0);
	});

	test('Should not consider links in multiline inline code span', async () => {
		const text = joinLines(
			'`` ',
			'[b](https://example.com)',
			'``');
		const links = await getLinksForFile(text);
		assert.strictEqual(links.length, 0);
	});

	test('Should not consider links in multiline inline code span between between text', async () => {
		const text = joinLines(
			'[b](https://1.com) `[b](https://2.com)',
			'` [b](https://3.com)');
		const links = await getLinksForFile(text);
		assert.deepStrictEqual(links.map(l => l.target?.authority), ['1.com', '3.com']);
	});

	test('Should not consider links in multiline inline code span with new line after the first backtick', async () => {
		const text = joinLines(
			'`',
			'[b](https://example.com)`');
		const links = await getLinksForFile(text);
		assert.strictEqual(links.length, 0);
	});

	test('Should not miss links in invalid multiline inline code span', async () => {
		const text = joinLines(
			'`` ',
			'',
			'[b](https://example.com)',
			'',
			'``');
		const links = await getLinksForFile(text);
		assert.strictEqual(links.length, 1);
	});
});
