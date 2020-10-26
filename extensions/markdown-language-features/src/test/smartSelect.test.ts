/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';

import MarkdownSmartSelect from '../features/smartSelect';
import { InMemoryDocument } from './inMemoryDocument';
import { createNewMarkdownEngine } from './engine';
import { joinLines } from './util';
const CURSOR = '$$CURSOR$$';

const testFileName = vscode.Uri.file('test.md');

suite.only('markdown.SmartSelect', () => {
	test('Smart select single word', async () => {
		const ranges = await getSelectionRangesForDocument(`Hel${CURSOR}lo`);
		assertNestedRangesEqual(ranges![0], [0, 1]);
	});
	test('Smart select multi-line paragraph', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`Many of the core components and extensions to ${CURSOR}VS Code live in their own repositories on GitHub. `,
				`For example, the[node debug adapter](https://github.com/microsoft/vscode-node-debug) and the [mono debug adapter]`,
				`(https://github.com/microsoft/vscode-mono-debug) have their own repositories. For a complete list, please visit the [Related Projects](https://github.com/microsoft/vscode/wiki/Related-Projects) page on our [wiki](https://github.com/microsoft/vscode/wiki).`
			));
		assertNestedRangesEqual(ranges![0], [0, 3]);
	});
	test('Smart select paragraph', async () => {
		const ranges = await getSelectionRangesForDocument(`Many of the core components and extensions to ${CURSOR}VS Code live in their own repositories on GitHub. For example, the [node debug adapter](https://github.com/microsoft/vscode-node-debug) and the [mono debug adapter](https://github.com/microsoft/vscode-mono-debug) have their own repositories. For a complete list, please visit the [Related Projects](https://github.com/microsoft/vscode/wiki/Related-Projects) page on our [wiki](https://github.com/microsoft/vscode/wiki).`);

		assertNestedRangesEqual(ranges![0], [0, 1]);
	});
	test('Smart select html block', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`<p align="center">`,
				`${CURSOR}<img alt="VS Code in action" src="https://user-images.githubusercontent.com/1487073/58344409-70473b80-7e0a-11e9-8570-b2efc6f8fa44.png">`,
				`</p>`));

		assertNestedRangesEqual(ranges![0], [0, 3]);
	});
	test('Smart select header on header line', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`# Header${CURSOR}`,
				`Hello`));

		assertNestedRangesEqual(ranges![0], [0, 1]);

	});
	test('Smart select single word w grandparent header on text line', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`## ParentHeader`,
				`# Header`,
				`${CURSOR}Hello`
			));

		assertNestedRangesEqual(ranges![0], [2, 2], [1, 2]);
	});
	test('Smart select html block w parent header', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`# Header`,
				`${CURSOR}<p align="center">`,
				`<img alt="VS Code in action" src="https://user-images.githubusercontent.com/1487073/58344409-70473b80-7e0a-11e9-8570-b2efc6f8fa44.png">`,
				`</p>`));

		assertNestedRangesEqual(ranges![0], [1, 3], [1, 3], [0, 3]);
	});
	test('Smart select fenced code block', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`~~~`,
				`a${CURSOR}`,
				`~~~`));

		assertNestedRangesEqual(ranges![0], [0, 2]);
	});
	test('Smart select list', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`- item 1`,
				`- ${CURSOR}item 2`,
				`- item 3`,
				`- item 4`));

		assertNestedRangesEqual(ranges![0], [1, 1], [0, 3]);
	});
	test('Smart select list with fenced code block', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`- item 1`,
				`- ~~~`,
				`  ${CURSOR}a`,
				`  ~~~`,
				`- item 3`,
				`- item 4`));

		assertNestedRangesEqual(ranges![0], [1, 3], [0, 5]);
	});
	test('Smart select multi cursor', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`- ${CURSOR}item 1`,
				`- ~~~`,
				`  a`,
				`  ~~~`,
				`- ${CURSOR}item 3`,
				`- item 4`));

		assertNestedRangesEqual(ranges![0], [0, 0], [0, 5]);
		assertNestedRangesEqual(ranges![1], [4, 4], [0, 5]);
	});
	test('Smart select nested block quotes', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`> item 1`,
				`> item 2`,
				`>> ${CURSOR}item 3`,
				`>> item 4`));
		assertNestedRangesEqual(ranges![0], [2, 4], [0, 4]);
	});
	test('Smart select multi nested block quotes', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`> item 1`,
				`>> item 2`,
				`>>> ${CURSOR}item 3`,
				`>>>> item 4`));

		assertNestedRangesEqual(ranges![0], [2, 3], [2, 4], [1, 4], [0, 4]);
	});
	test('Smart select subheader content', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`# main header 1`,
				`content 1`,
				`## sub header 1`,
				`${CURSOR}content 2`,
				`# main header 2`));

		assertNestedRangesEqual(ranges![0], [3, 3], [2, 3], [1, 3], [0, 3]);
	});
	test('Smart select subheader line', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`# main header 1`,
				`content 1`,
				`## sub header 1${CURSOR}`,
				`content 2`,
				`# main header 2`));

		assertNestedRangesEqual(ranges![0], [2, 3], [1, 3], [0, 3]);
	});
	test('Smart select blank line', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`# main header 1`,
				`content 1`,
				`${CURSOR}             `,
				`content 2`,
				`# main header 2`));

		assertNestedRangesEqual(ranges![0], [1, 3], [0, 3]);
	});
	test('Smart select line between paragraphs', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`paragraph 1`,
				`${CURSOR}`,
				`paragraph 2`));

		assertNestedRangesEqual(ranges![0], [0, 3]);
	});
	test('Smart select empty document', async () => {
		const ranges = await getSelectionRangesForDocument(``, [new vscode.Position(0, 0)]);
		assert.strictEqual(ranges!.length, 0);
	});
	test('Smart select fenced code block then list then subheader content then subheader then header content then header', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`# main header 1`,
				`content 1`,
				`## sub header 1`,
				`- item 1`,
				`- ~~~`,
				`  ${CURSOR}a`,
				`  ~~~`,
				`- item 3`,
				`- item 4`,
				``,
				`more content`,
				`# main header 2`));

		assertNestedRangesEqual(ranges![0], [4, 6], [3, 9], [3, 10], [2, 10], [1, 10], [0, 10]);
	});
	test('Smart select list with one element without selecting child subheader', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`# main header 1`,
				``,
				`- list ${CURSOR}`,
				``,
				`## sub header`,
				``,
				`content 2`,
				`# main header 2`));

		assertNestedRangesEqual(ranges![0], [2, 3], [1, 3], [1, 6], [0, 6]);
	});
	test('Smart select content under header then subheaders and their content', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`# main ${CURSOR}header 1`,
				``,
				`- list`,
				`paragraph`,
				`## sub header`,
				``,
				`content 2`,
				`# main header 2`));

		assertNestedRangesEqual(ranges![0], [0, 3], [0, 6]);
	});
	test('Smart select last blockquote element under header then subheaders and their content', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`# main header 1`,
				``,
				`> block`,
				`> block`,
				`>> block`,
				`>> ${CURSOR}block`,
				``,
				`paragraph`,
				`## sub header`,
				``,
				`content 2`,
				`# main header 2`));

		assertNestedRangesEqual(ranges![0], [4, 6], [2, 6], [1, 7], [1, 10], [0, 10]);
	});
	test('Smart select content of subheader then subheader then content of main header then main header', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`# main header 1`,
				``,
				`> block`,
				`> block`,
				`>> block`,
				`>> block`,
				``,
				`paragraph`,
				`## sub header`,
				``,
				``,
				`${CURSOR}`,
				``,
				`### main header 2`,
				`- content 2`,
				`- content 2`,
				`- content 2`,
				`content 2`));

		assertNestedRangesEqual(ranges![0], [11, 12], [9, 12], [9, 17], [8, 17], [1, 17], [0, 17]);
	});
	test('Smart select last line content of subheader then subheader then content of main header then main header', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`# main header 1`,
				``,
				`> block`,
				`> block`,
				`>> block`,
				`>> block`,
				``,
				`paragraph`,
				`## sub header`,
				``,
				``,
				``,
				``,
				`### main header 2`,
				`- content 2`,
				`- content 2`,
				`- content 2`,
				`${CURSOR}content 2`));

		assertNestedRangesEqual(ranges![0], [16, 17], [14, 17], [14, 17], [13, 17], [9, 17], [8, 17], [1, 17], [0, 17]);
	});
	test('Smart select last line content after content of subheader then subheader then content of main header then main header', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`# main header 1`,
				``,
				`> block`,
				`> block`,
				`>> block`,
				`>> block`,
				``,
				`paragraph`,
				`## sub header`,
				``,
				``,
				``,
				``,
				`### main header 2`,
				`- content 2`,
				`- content 2`,
				`- content 2`,
				`content 2${CURSOR}`));

		assertNestedRangesEqual(ranges![0], [16, 17], [14, 17], [14, 17], [13, 17], [9, 17], [8, 17], [1, 17], [0, 17]);
	});
	test('Smart select fenced code block then list then rest of content', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`# main header 1`,
				``,
				`> block`,
				`> block`,
				`>> block`,
				`>> block`,
				``,
				`- paragraph`,
				`- ~~~`,
				`  my`,
				`  ${CURSOR}code`,
				`  goes here`,
				`  ~~~`,
				`- content`,
				`- content 2`,
				`- content 2`,
				`- content 2`,
				`- content 2`));

		assertNestedRangesEqual(ranges![0], [9, 11], [8, 12], [7, 17], [1, 17], [0, 17]);
	});
	test('Smart select fenced code block then list then rest of content on fenced line', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`# main header 1`,
				``,
				`> block`,
				`> block`,
				`>> block`,
				`>> block`,
				``,
				`- paragraph`,
				`- ~~~${CURSOR}`,
				`  my`,
				`  code`,
				`  goes here`,
				`  ~~~`,
				`- content`,
				`- content 2`,
				`- content 2`,
				`- content 2`,
				`- content 2`));

		assertNestedRangesEqual(ranges![0], [8, 12], [7, 17], [1, 17], [0, 17]);
	});
});

function assertNestedRangesEqual(range: vscode.SelectionRange, ...expectedRanges: [number, number][]) {
	const lineage = getLineage(range);
	assert.strictEqual(lineage.length, expectedRanges.length, `expected depth: ${expectedRanges.length}, but was ${lineage.length}`);
	for (let i = 0; i < lineage.length; i++) {
		assertRangesEqual(lineage[i], expectedRanges[i][0], expectedRanges[i][1], `parent at a depth of ${i}`);
	}
}

function getLineage(range: vscode.SelectionRange): vscode.SelectionRange[] {
	const result: vscode.SelectionRange[] = [];
	let currentRange: vscode.SelectionRange | undefined = range;
	while (currentRange) {
		result.push(currentRange);
		currentRange = currentRange.parent;
	}
	return result;
}

function assertRangesEqual(selectionRange: vscode.SelectionRange, startLine: number, endLine: number, message: string) {
	assert.strictEqual(selectionRange.range.start.line, startLine, `failed on start line ${message}`);
	assert.strictEqual(selectionRange.range.end.line, endLine, `failed on end line ${message}`);
}

async function getSelectionRangesForDocument(contents: string, pos?: vscode.Position[]) {
	const doc = new InMemoryDocument(testFileName, contents);
	const provider = new MarkdownSmartSelect(createNewMarkdownEngine());
	const positions = pos ? pos : getCursorPositions(contents, doc);
	return await provider.provideSelectionRanges(doc, positions, new vscode.CancellationTokenSource().token);
}

let getCursorPositions = (contents: string, doc: InMemoryDocument): vscode.Position[] => {
	let positions: vscode.Position[] = [];
	let index = 0;
	let wordLength = 0;
	while (index !== -1) {
		index = contents.indexOf(CURSOR, index + wordLength);
		if (index !== -1) {
			positions.push(doc.positionAt(index));
		}
		wordLength = CURSOR.length;
	}
	return positions;
};
