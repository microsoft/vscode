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
		const selections = await getSelectionRangesForDocument(`Hel${CURSOR}lo`);
		if (selections) {
			assert.strictEqual(selections[0].range.start.line, 0);
			assert.strictEqual(selections[0].range.end.line, 1);
		} else {
			throw new Error('selections is undefined');
		}
	});
	test('Smart select multi-line paragraph', async () => {
		const selections = await getSelectionRangesForDocument(
			joinLines(
				`Many of the core components and extensions to ${CURSOR}VS Code live in their own repositories on GitHub. `,
				`For example, the[node debug adapter](https://github.com/microsoft/vscode-node-debug) and the [mono debug adapter]`,
				`(https://github.com/microsoft/vscode-mono-debug) have their own repositories. For a complete list, please visit the [Related Projects](https://github.com/microsoft/vscode/wiki/Related-Projects) page on our [wiki](https://github.com/microsoft/vscode/wiki).`
			));
		if (selections) {
			assert.strictEqual(selections[0].range.start.line, 0);
			assert.strictEqual(selections[0].range.end.line, 3);
		} else {
			throw new Error('selections is undefined');
		}
	});
	test('Smart select paragraph', async () => {
		const selections = await getSelectionRangesForDocument(`Many of the core components and extensions to ${CURSOR}VS Code live in their own repositories on GitHub. For example, the [node debug adapter](https://github.com/microsoft/vscode-node-debug) and the [mono debug adapter](https://github.com/microsoft/vscode-mono-debug) have their own repositories. For a complete list, please visit the [Related Projects](https://github.com/microsoft/vscode/wiki/Related-Projects) page on our [wiki](https://github.com/microsoft/vscode/wiki).`);
		if (selections) {
			assert.strictEqual(selections[0].range.start.line, 0);
			assert.strictEqual(selections[0].range.end.line, 1);
		} else {
			throw new Error('selections is undefined');
		}
	});
	test('Smart select html block', async () => {
		const selections = await getSelectionRangesForDocument(
			joinLines(
				`<p align="center">`,
				`${CURSOR}<img alt="VS Code in action" src="https://user-images.githubusercontent.com/1487073/58344409-70473b80-7e0a-11e9-8570-b2efc6f8fa44.png">`,
				`</p>`));
		if (selections) {
			assert.strictEqual(selections[0].range.start.line, 0);
			assert.strictEqual(selections[0].range.end.line, 3);
		} else {
			throw new Error('selections is undefined');
		}
	});
	test('Smart select header on header line', async () => {
		const selections = await getSelectionRangesForDocument(
			joinLines(
				`# Header${CURSOR}`,
				`Hello`));
		if (selections) {
			assert.strictEqual(selections[0].range.start.line, 1);
			assert.strictEqual(selections[0].range.start.line, 1);
			assert.strictEqual(selections[0].range.start.character, 0);
			assert.strictEqual(selections[0].range.end.character, 5);
			if (selections[0].parent) {
				assert.strictEqual(selections[0].range.start.line, 1);
				assert.strictEqual(selections[0].range.start.line, 1);
				assert.strictEqual(selections[0].range.start.character, 0);
				assert.strictEqual(selections[0].range.end.character, 5);
			}
		}
		else {
			throw new Error('selections is undefined');
		}
	});
	test('Smart select single word w grandparent header on text line', async () => {
		const selections = await getSelectionRangesForDocument(
			joinLines(
				`## ParentHeader`,
				`# Header`,
				`${CURSOR}Hello`
			));
		if (selections) {
			assert.strictEqual(selections[0].range.start.line, 2);
			assert.strictEqual(selections[0].range.end.line, 3);
		} else {
			throw new Error('selections is undefined');
		}
	});
	test('Smart select html block w parent header', async () => {
		const selections = await getSelectionRangesForDocument(
			joinLines(
				`# Header`,
				`${CURSOR}<p align="center">`,
				`<img alt="VS Code in action" src="https://user-images.githubusercontent.com/1487073/58344409-70473b80-7e0a-11e9-8570-b2efc6f8fa44.png">`,
				`</p>`));
		if (selections) {
			assert.strictEqual(selections[0].range.start.line, 1);
			assert.strictEqual(selections[0].range.end.line, 3);
		} else {
			throw new Error('selections is undefined');
		}
	});
	test('Smart select fenced code block', async () => {
		const selections = await getSelectionRangesForDocument(
			joinLines(
				`~~~`,
				`a${CURSOR}`,
				`~~~`));
		if (selections) {
			assert.strictEqual(selections[0].range.start.line, 1);
			assert.strictEqual(selections[0].range.end.line, 2);
		} else {
			throw new Error('selections is undefined');
		}
	});
	test('Smart select list', async () => {
		const selections = await getSelectionRangesForDocument(
			joinLines(
				`- item 1`,
				`- ${CURSOR}item 2`,
				`- item 3`,
				`- item 4`));
		if (selections) {
			assert.strictEqual(selections[0].range.start.line, 0);
			assert.strictEqual(selections[0].range.end.line, 4);
		} else {
			throw new Error('selections is undefined');
		}
	});
	test('Smart select list with fenced code block', async () => {
		const selections = await getSelectionRangesForDocument(
			joinLines(
				`- item 1`,
				`- ~~~`,
				`- ${CURSOR}a`,
				`- ~~~`,
				`- item 3`,
				`- item 4`));
		if (selections) {
			assert.strictEqual(selections[0].range.start.line, 1);
			assert.strictEqual(selections[0].range.end.line, 3);
		} else {
			throw new Error('selections is undefined');
		}
	});
	test('Smart select multi cursor', async () => {
		const selections = await getSelectionRangesForDocument(
			joinLines(
				`- ${CURSOR}item 1`,
				`- ~~~`,
				`- a`,
				`- ~~~`,
				`- ${CURSOR}item 3`,
				`- item 4`));
		if (selections) {
			assert.strictEqual(selections[0].range.start.line, 1);
			assert.strictEqual(selections[0].range.end.line, 3);
		} else {
			throw new Error('selections is undefined');
		}
	});
});

async function getSelectionRangesForDocument(contents: string) {
	const doc = new InMemoryDocument(testFileName, contents);
	const provider = new MarkdownSmartSelect(createNewMarkdownEngine());
	return await provider.provideSelectionRanges(doc, getCursorPositions(contents, doc), new vscode.CancellationTokenSource().token);
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
