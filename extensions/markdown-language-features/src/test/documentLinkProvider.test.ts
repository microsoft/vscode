/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { MdLinkComputer, MdLinkProvider } from '../languageFeatures/documentLinkProvider';
import { noopToken } from '../util/cancellation';
import { InMemoryDocument } from '../util/inMemoryDocument';
import { createNewMarkdownEngine } from './engine';
import { assertRangeEqual, joinLines } from './util';


const testFile = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'x.md');

function getLinksForFile(fileContents: string) {
	const doc = new InMemoryDocument(testFile, fileContents);
	const linkComputer = new MdLinkComputer(createNewMarkdownEngine());
	const provider = new MdLinkProvider(linkComputer);
	return provider.provideDocumentLinks(doc, noopToken);
}

function assertLinksEqual(actualLinks: readonly vscode.DocumentLink[], expectedRanges: readonly vscode.Range[]) {
	assert.strictEqual(actualLinks.length, expectedRanges.length);

	for (let i = 0; i < actualLinks.length; ++i) {
		assertRangeEqual(actualLinks[i].range, expectedRanges[i], `Range ${i} to be equal`);
	}
}

suite('markdown.DocumentLinkProvider', () => {
	test('Should not return anything for empty document', async () => {
		const links = await getLinksForFile('');
		assert.strictEqual(links.length, 0);
	});

	test('Should not return anything for simple document without links', async () => {
		const links = await getLinksForFile(joinLines(
			'# a',
			'fdasfdfsafsa',
		));
		assert.strictEqual(links.length, 0);
	});

	test('Should detect basic http links', async () => {
		const links = await getLinksForFile('a [b](https://example.com) c');
		assertLinksEqual(links, [
			new vscode.Range(0, 6, 0, 25)
		]);
	});

	test('Should detect basic workspace links', async () => {
		{
			const links = await getLinksForFile('a [b](./file) c');
			assertLinksEqual(links, [
				new vscode.Range(0, 6, 0, 12)
			]);
		}
		{
			const links = await getLinksForFile('a [b](file.png) c');
			assertLinksEqual(links, [
				new vscode.Range(0, 6, 0, 14)
			]);
		}
	});

	test('Should detect links with title', async () => {
		const links = await getLinksForFile('a [b](https://example.com "abc") c');
		assertLinksEqual(links, [
			new vscode.Range(0, 6, 0, 25)
		]);
	});

	test('Should handle links with escaped characters in name (#35245)', async () => {
		const links = await getLinksForFile('a [b\\]](./file)');
		assertLinksEqual(links, [
			new vscode.Range(0, 8, 0, 14)
		]);
	});

	test('Should handle links with balanced parens', async () => {
		{
			const links = await getLinksForFile('a [b](https://example.com/a()c) c');
			assertLinksEqual(links, [
				new vscode.Range(0, 6, 0, 30)
			]);
		}
		{
			const links = await getLinksForFile('a [b](https://example.com/a(b)c) c');
			assertLinksEqual(links, [
				new vscode.Range(0, 6, 0, 31)
			]);
		}
		{
			// #49011
			const links = await getLinksForFile('[A link](http://ThisUrlhasParens/A_link(in_parens))');
			assertLinksEqual(links, [
				new vscode.Range(0, 9, 0, 50)
			]);
		}
	});

	test('Should ignore texts in brackets inside link title (#150921)', async () => {
		{
			const links = await getLinksForFile('[some [inner bracket pairs] in title](<link>)');
			assertLinksEqual(links, [
				new vscode.Range(0, 39, 0, 43),
			]);
		}
		{
			const links = await getLinksForFile('[some [inner bracket pairs] in title](link)');
			assertLinksEqual(links, [
				new vscode.Range(0, 38, 0, 42)
			]);
		}
	});

	test('Should handle two links without space', async () => {
		const links = await getLinksForFile('a ([test](test)[test2](test2)) c');
		assertLinksEqual(links, [
			new vscode.Range(0, 10, 0, 14),
			new vscode.Range(0, 23, 0, 28)
		]);
	});

	test('should handle hyperlinked images (#49238)', async () => {
		{
			const links = await getLinksForFile('[![alt text](image.jpg)](https://example.com)');
			assertLinksEqual(links, [
				new vscode.Range(0, 13, 0, 22),
				new vscode.Range(0, 25, 0, 44)
			]);
		}
		{
			const links = await getLinksForFile('[![a]( whitespace.jpg )]( https://whitespace.com )');
			assertLinksEqual(links, [
				new vscode.Range(0, 7, 0, 21),
				new vscode.Range(0, 26, 0, 48)
			]);
		}
		{
			const links = await getLinksForFile('[![a](img1.jpg)](file1.txt) text [![a](img2.jpg)](file2.txt)');
			assertLinksEqual(links, [
				new vscode.Range(0, 6, 0, 14),
				new vscode.Range(0, 17, 0, 26),
				new vscode.Range(0, 39, 0, 47),
				new vscode.Range(0, 50, 0, 59),
			]);
		}
	});

	test('Should not consider link references starting with ^ character valid (#107471)', async () => {
		const links = await getLinksForFile('[^reference]: https://example.com');
		assert.strictEqual(links.length, 0);
	});

	test('Should find definitions links with spaces in angle brackets (#136073)', async () => {
		const links = await getLinksForFile(joinLines(
			'[a]: <b c>',
			'[b]: <cd>',
		));

		assertLinksEqual(links, [
			new vscode.Range(0, 6, 0, 9),
			new vscode.Range(1, 6, 1, 8),
		]);
	});

	test('Should only find one link for reference sources [a]: source (#141285)', async () => {
		const links = await getLinksForFile(joinLines(
			'[Works]: https://example.com',
		));

		assert.strictEqual(links.length, 1);
	});

	test('Should find reference link shorthand (#141285)', async () => {
		let links = await getLinksForFile(joinLines(
			'[ref]',
			'[ref]: https://example.com',
		));
		assert.strictEqual(links.length, 2);

		links = await getLinksForFile(joinLines(
			'[Does Not Work]',
			'[def]: https://example.com',
		));
		assert.strictEqual(links.length, 1);
	});

	test('Should not include reference link shorthand when source does not exist (#141285)', async () => {
		const links = await getLinksForFile('[Works]');
		assert.strictEqual(links.length, 0);
	});

	test('Should not include reference links with escaped leading brackets', async () => {
		const links = await getLinksForFile(joinLines(
			`\\[bad link][good]`,
			`\\[good]`,
			`[good]: http://example.com`,
		));
		assertLinksEqual(links, [
			new vscode.Range(2, 8, 2, 26) // Should only find the definition
		]);
	});

	test('Should not consider links in code fenced with backticks', async () => {
		const links = await getLinksForFile(joinLines(
			'```',
			'[b](https://example.com)',
			'```'));
		assert.strictEqual(links.length, 0);
	});

	test('Should not consider links in code fenced with tilde', async () => {
		const links = await getLinksForFile(joinLines(
			'~~~',
			'[b](https://example.com)',
			'~~~'));
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
		const links = await getLinksForFile(joinLines(
			'`` ',
			'[b](https://example.com)',
			'``'));
		assert.strictEqual(links.length, 0);
	});

	test('Should not consider link references in code fenced with backticks (#146714)', async () => {
		const links = await getLinksForFile(joinLines(
			'```',
			'[a] [bb]',
			'```'));
		assert.strictEqual(links.length, 0);
	});

	test('Should not consider reference sources in code fenced with backticks (#146714)', async () => {
		const links = await getLinksForFile(joinLines(
			'```',
			'[a]: http://example.com;',
			'[b]: <http://example.com>;',
			'[c]: (http://example.com);',
			'```'));
		assert.strictEqual(links.length, 0);
	});

	test('Should not consider links in multiline inline code span between between text', async () => {
		const links = await getLinksForFile(joinLines(
			'[b](https://1.com) `[b](https://2.com)',
			'` [b](https://3.com)'));
		assert.deepStrictEqual(links.map(l => l.target?.authority), ['1.com', '3.com']);
	});

	test('Should not consider links in multiline inline code span with new line after the first backtick', async () => {
		const links = await getLinksForFile(joinLines(
			'`',
			'[b](https://example.com)`'));
		assert.strictEqual(links.length, 0);
	});

	test('Should not miss links in invalid multiline inline code span', async () => {
		const links = await getLinksForFile(joinLines(
			'`` ',
			'',
			'[b](https://example.com)',
			'',
			'``'));
		assert.strictEqual(links.length, 1);
	});

	test('Should find autolinks', async () => {
		const links = await getLinksForFile('pre <http://example.com> post');
		assertLinksEqual(links, [
			new vscode.Range(0, 5, 0, 23)
		]);
	});

	test('Should not detect links inside html comment blocks', async () => {
		const links = await getLinksForFile(joinLines(
			`<!-- <http://example.com> -->`,
			`<!-- [text](./foo.md) -->`,
			`<!-- [text]: ./foo.md -->`,
			``,
			`<!--`,
			`<http://example.com>`,
			`-->`,
			``,
			`<!--`,
			`[text](./foo.md)`,
			`-->`,
			``,
			`<!--`,
			`[text]: ./foo.md`,
			`-->`,
		));
		assert.strictEqual(links.length, 0);
	});

	test.skip('Should not detect links inside inline html comments', async () => {
		// See #149678
		const links = await getLinksForFile(joinLines(
			`text <!-- <http://example.com> --> text`,
			`text <!-- [text](./foo.md) --> text`,
			`text <!-- [text]: ./foo.md --> text`,
			``,
			`text <!--`,
			`<http://example.com>`,
			`--> text`,
			``,
			`text <!--`,
			`[text](./foo.md)`,
			`--> text`,
			``,
			`text <!--`,
			`[text]: ./foo.md`,
			`--> text`,
		));
		assert.strictEqual(links.length, 0);
	});

	test('Should not mark checkboxes as links', async () => {
		const links = await getLinksForFile(joinLines(
			'- [x]',
			'- [X]',
			'- [ ]',
			'* [x]',
			'* [X]',
			'* [ ]',
			``,
			`[x]: http://example.com`
		));
		assertLinksEqual(links, [
			new vscode.Range(7, 5, 7, 23)
		]);
	});

	test('Should still find links on line with checkbox', async () => {
		const links = await getLinksForFile(joinLines(
			'- [x] [x]',
			'- [X] [x]',
			'- [] [x]',
			``,
			`[x]: http://example.com`
		));

		assertLinksEqual(links, [
			new vscode.Range(0, 7, 0, 8),
			new vscode.Range(1, 7, 1, 8),
			new vscode.Range(2, 6, 2, 7),
			new vscode.Range(4, 5, 4, 23),
		]);
	});

	test('Should find link only within angle brackets.', async () => {
		const links = await getLinksForFile(joinLines(
			`[link](<path>)`
		));
		assertLinksEqual(links, [new vscode.Range(0, 8, 0, 12)]);
	});

	test('Should find link within angle brackets even with link title.', async () => {
		const links = await getLinksForFile(joinLines(
			`[link](<path> "test title")`
		));
		assertLinksEqual(links, [new vscode.Range(0, 8, 0, 12)]);
	});

	test('Should find link within angle brackets even with surrounding spaces.', async () => {
		const links = await getLinksForFile(joinLines(
			`[link]( <path> )`
		));
		assertLinksEqual(links, [new vscode.Range(0, 9, 0, 13)]);
	});

	test('Should find link within angle brackets for image hyperlinks.', async () => {
		const links = await getLinksForFile(joinLines(
			`![link](<path>)`
		));
		assertLinksEqual(links, [new vscode.Range(0, 9, 0, 13)]);
	});

	test('Should find link with spaces in angle brackets for image hyperlinks with titles.', async () => {
		const links = await getLinksForFile(joinLines(
			`![link](< path > "test")`
		));
		assertLinksEqual(links, [new vscode.Range(0, 9, 0, 15)]);
	});


	test('Should not find link due to incorrect angle bracket notation or usage.', async () => {
		const links = await getLinksForFile(joinLines(
			`[link](<path )`,
			`[link](<> path>)`,
			`[link](> path)`,
		));
		assert.strictEqual(links.length, 0);
	});

	test('Should find link within angle brackets even with space inside link.', async () => {

		const links = await getLinksForFile(joinLines(
			`[link](<pa th>)`
		));

		assertLinksEqual(links, [new vscode.Range(0, 8, 0, 13)]);
	});

	test('Should find links with titles', async () => {
		const links = await getLinksForFile(joinLines(
			`[link](<no such.md> "text")`,
			`[link](<no such.md> 'text')`,
			`[link](<no such.md> (text))`,
			`[link](no-such.md "text")`,
			`[link](no-such.md 'text')`,
			`[link](no-such.md (text))`,
		));
		assertLinksEqual(links, [
			new vscode.Range(0, 8, 0, 18),
			new vscode.Range(1, 8, 1, 18),
			new vscode.Range(2, 8, 2, 18),
			new vscode.Range(3, 7, 3, 17),
			new vscode.Range(4, 7, 4, 17),
			new vscode.Range(5, 7, 5, 17),
		]);
	});
});
