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
		if (ranges) {
			assert.strictEqual(ranges[0].range.start.line, 0);
			assert.strictEqual(ranges[0].range.end.line, 1);
		} else {
			throw new Error('ranges are undefined');
		}
	});
	test('Smart select multi-line paragraph', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`Many of the core components and extensions to ${CURSOR}VS Code live in their own repositories on GitHub. `,
				`For example, the[node debug adapter](https://github.com/microsoft/vscode-node-debug) and the [mono debug adapter]`,
				`(https://github.com/microsoft/vscode-mono-debug) have their own repositories. For a complete list, please visit the [Related Projects](https://github.com/microsoft/vscode/wiki/Related-Projects) page on our [wiki](https://github.com/microsoft/vscode/wiki).`
			));
		if (ranges) {
			assert.strictEqual(ranges[0].range.start.line, 0);
			assert.strictEqual(ranges[0].range.end.line, 3);
		} else {
			throw new Error('ranges are undefined');
		}
	});
	test('Smart select paragraph', async () => {
		const ranges = await getSelectionRangesForDocument(`Many of the core components and extensions to ${CURSOR}VS Code live in their own repositories on GitHub. For example, the [node debug adapter](https://github.com/microsoft/vscode-node-debug) and the [mono debug adapter](https://github.com/microsoft/vscode-mono-debug) have their own repositories. For a complete list, please visit the [Related Projects](https://github.com/microsoft/vscode/wiki/Related-Projects) page on our [wiki](https://github.com/microsoft/vscode/wiki).`);
		if (ranges) {
			assert.strictEqual(ranges[0].range.start.line, 0);
			assert.strictEqual(ranges[0].range.end.line, 1);
		} else {
			throw new Error('ranges are undefined');
		}
	});
	test('Smart select html block', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`<p align="center">`,
				`${CURSOR}<img alt="VS Code in action" src="https://user-images.githubusercontent.com/1487073/58344409-70473b80-7e0a-11e9-8570-b2efc6f8fa44.png">`,
				`</p>`));
		if (ranges) {
			assert.strictEqual(ranges[0].range.start.line, 0);
			assert.strictEqual(ranges[0].range.end.line, 3);
		} else {
			throw new Error('ranges are undefined');
		}
	});
	test('Smart select header on header line', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`# Header${CURSOR}`,
				`Hello`));
		if (ranges) {
			assert.strictEqual(ranges[0].range.start.line, 1);
			assert.strictEqual(ranges[0].range.start.line, 1);
			assert.strictEqual(ranges[0].range.start.character, 0);
			assert.strictEqual(ranges[0].range.end.character, 5);
			if (ranges[0].parent) {
				assert.strictEqual(ranges[0].range.start.line, 1);
				assert.strictEqual(ranges[0].range.start.line, 1);
				assert.strictEqual(ranges[0].range.start.character, 0);
				assert.strictEqual(ranges[0].range.end.character, 5);
			}
		}
		else {
			throw new Error('ranges are undefined');
		}
	});
	test('Smart select single word w grandparent header on text line', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`## ParentHeader`,
				`# Header`,
				`${CURSOR}Hello`
			));
		if (ranges) {
			assert.strictEqual(ranges[0].range.start.line, 2);
			assert.strictEqual(ranges[0].range.end.line, 2);
			if (ranges[0].parent) {
				assert.strictEqual(ranges[0].parent.range.start.line, 1);
				assert.strictEqual(ranges[0].parent.range.end.line, 2);
			}
		} else {
			throw new Error('ranges are undefined');
		}
	});
	test('Smart select html block w parent header', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`# Header`,
				`${CURSOR}<p align="center">`,
				`<img alt="VS Code in action" src="https://user-images.githubusercontent.com/1487073/58344409-70473b80-7e0a-11e9-8570-b2efc6f8fa44.png">`,
				`</p>`));
		if (ranges) {
			assert.strictEqual(ranges[0].range.start.line, 1);
			assert.strictEqual(ranges[0].range.end.line, 3);
			if (ranges[0].parent) {
				assert.strictEqual(ranges[0].parent.range.start.line, 1);
				assert.strictEqual(ranges[0].parent.range.end.line, 3);
				if (ranges[0].parent.parent) {
					assert.strictEqual(ranges[0].parent.parent.range.start.line, 0);
					assert.strictEqual(ranges[0].parent.parent.range.end.line, 3);
				}
			}
		} else {
			throw new Error('ranges are undefined');
		}
	});
	test('Smart select fenced code block', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`~~~`,
				`a${CURSOR}`,
				`~~~`));
		if (ranges) {
			assert.strictEqual(ranges[0].range.start.line, 1);
			assert.strictEqual(ranges[0].range.end.line, 2);
			if (ranges[0].parent) {
				assert.strictEqual(ranges[0].parent.range.start.line, 0);
				assert.strictEqual(ranges[0].parent.range.end.line, 3);
			}
		} else {
			throw new Error('ranges are undefined');
		}
	});
	test('Smart select list', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`- item 1`,
				`- ${CURSOR}item 2`,
				`- item 3`,
				`- item 4`));
		if (ranges) {
			assert.strictEqual(ranges[0].range.start.line, 1);
			assert.strictEqual(ranges[0].range.end.line, 2);
			if (ranges[0].parent) {
				assert.strictEqual(ranges[0].parent.range.start.line, 1);
				assert.strictEqual(ranges[0].parent.range.end.line, 2);
				if (ranges[0].parent.parent) {
					assert.strictEqual(ranges[0].parent.parent.range.start.line, 0);
					assert.strictEqual(ranges[0].parent.parent.range.end.line, 4);
				}
			}
		} else {
			throw new Error('ranges are undefined');
		}
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
		if (ranges) {
			assert.strictEqual(ranges[0].range.start.line, 2);
			assert.strictEqual(ranges[0].range.end.line, 3);
			if (ranges[0].parent) {
				assert.strictEqual(ranges[0].parent.range.start.line, 1);
				assert.strictEqual(ranges[0].parent.range.end.line, 4);
				if (ranges[0].parent.parent) {
					assert.strictEqual(ranges[0].parent.parent.range.start.line, 1);
					assert.strictEqual(ranges[0].parent.parent.range.end.line, 4);
					if (ranges[0].parent.parent.parent) {
						assert.strictEqual(ranges[0].parent.parent.parent.range.start.line, 0);
						assert.strictEqual(ranges[0].parent.parent.parent.range.end.line, 6);
					}
				}
			}
		} else {
			throw new Error('ranges are undefined');
		}
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
		if (ranges) {
			assert.strictEqual(ranges[0].range.start.line, 0);
			assert.strictEqual(ranges[0].range.end.line, 1);
			if (ranges[0].parent) {
				assert.strictEqual(ranges[0].parent.range.start.line, 0);
				assert.strictEqual(ranges[0].parent.range.end.line, 1);
				if (ranges[0].parent.parent) {
					assert.strictEqual(ranges[0].parent.parent.range.start.line, 0);
					assert.strictEqual(ranges[0].parent.parent.range.end.line, 6);
				}
			}
			assert.strictEqual(ranges[1].range.start.line, 4);
			assert.strictEqual(ranges[1].range.end.line, 5);
			if (ranges[1].parent) {
				assert.strictEqual(ranges[1].parent.range.start.line, 4);
				assert.strictEqual(ranges[1].parent.range.end.line, 5);
				if (ranges[1].parent.parent) {
					assert.strictEqual(ranges[1].parent.parent.range.start.line, 0);
					assert.strictEqual(ranges[1].parent.parent.range.end.line, 6);
				}
			}
		} else {
			throw new Error('ranges are undefined');
		}
	});
	test('Smart select nested block quotes', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`> item 1`,
				`> item 2`,
				`>> ${CURSOR}item 3`,
				`>> item 4`));
		if (ranges) {
			assert.strictEqual(ranges[0].range.start.line, 2);
			assert.strictEqual(ranges[0].range.end.line, 4);
			if (ranges[0].parent) {
				assert.strictEqual(ranges[0].parent.range.start.line, 2);
				assert.strictEqual(ranges[0].parent.range.end.line, 4);
				if (ranges[0].parent.parent) {
					assert.strictEqual(ranges[0].parent.parent.range.start.line, 0);
					assert.strictEqual(ranges[0].parent.parent.range.end.line, 4);
				}
			}
		} else {
			throw new Error('ranges are undefined');
		}
	});
	test('Smart select multi nested block quotes', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`> item 1`,
				`>> item 2`,
				`>>> ${CURSOR}item 3`,
				`>>>> item 4`));
		if (ranges) {
			assert.strictEqual(ranges[0].range.start.line, 2);
			assert.strictEqual(ranges[0].range.end.line, 3);
			if (ranges[0].parent) {
				assert.strictEqual(ranges[0].parent.range.start.line, 2);
				assert.strictEqual(ranges[0].parent.range.end.line, 4);
				if (ranges[0].parent.parent) {
					assert.strictEqual(ranges[0].parent.parent.range.start.line, 1);
					assert.strictEqual(ranges[0].parent.parent.range.end.line, 4);
					if (ranges[0].parent.parent.parent) {
						assert.strictEqual(ranges[0].parent.parent.parent.range.start.line, 0);
						assert.strictEqual(ranges[0].parent.parent.parent.range.end.line, 4);
					}
				}
			}
		} else {
			throw new Error('ranges are undefined');
		}
	});
	test('Smart select subheader content', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`# main header 1`,
				`content 1`,
				`## sub header 1`,
				`${CURSOR}content 2`,
				`# main header 2`));
		if (ranges) {
			assert.strictEqual(ranges[0].range.start.line, 3);
			assert.strictEqual(ranges[0].range.end.line, 3);
			if (ranges[0].parent) {
				assert.strictEqual(ranges[0].parent.range.start.line, 2);
				assert.strictEqual(ranges[0].parent.range.end.line, 3);
				if (ranges[0].parent.parent) {
					assert.strictEqual(ranges[0].parent.parent.range.start.line, 1);
					assert.strictEqual(ranges[0].parent.parent.range.end.line, 3);
					if (ranges[0].parent.parent.parent) {
						assert.strictEqual(ranges[0].parent.parent.parent.range.start.line, 0);
						assert.strictEqual(ranges[0].parent.parent.parent.range.end.line, 3);
					}
				}
			}
		} else {
			throw new Error('ranges are undefined');
		}
	});
	test('Smart select subheader line', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`# main header 1`,
				`content 1`,
				`${CURSOR}## sub header 1`,
				`content 2`,
				`# main header 2`));
		if (ranges) {
			assert.strictEqual(ranges[0].range.start.line, 1);
			assert.strictEqual(ranges[0].range.end.line, 3);
			if (ranges[0].parent) {
				assert.strictEqual(ranges[0].parent.range.start.line, 0);
				assert.strictEqual(ranges[0].parent.range.end.line, 3);
			}
		} else {
			throw new Error('ranges are undefined');
		}
	});
	test('Smart select blank line', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`# main header 1`,
				`content 1`,
				`${CURSOR}             `,
				`content 2`,
				`# main header 2`));
		if (ranges) {
			assert.strictEqual(ranges[0].range.start.line, 1);
			assert.strictEqual(ranges[0].range.end.line, 3);
			if (ranges[0].parent) {
				assert.strictEqual(ranges[0].parent.range.start.line, 0);
				assert.strictEqual(ranges[0].parent.range.end.line, 3);
			}
		} else {
			throw new Error('ranges are undefined');
		}
	});
	test('Smart select line between paragraphs', async () => {
		const ranges = await getSelectionRangesForDocument(
			joinLines(
				`paragraph 1`,
				`${CURSOR}`,
				`paragraph 2`));
		if (ranges) {
			assert.strictEqual(ranges[0].range.start.line, 0);
			assert.strictEqual(ranges[0].range.end.line, 3);
		} else {
			throw new Error('ranges are undefined');
		}
	});
	test('Smart select empty document', async () => {
		const ranges = await getSelectionRangesForDocument(``, [new vscode.Position(0, 0)]);
		assert.strictEqual(ranges?.length, 0);
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
		if (ranges) {
			assert.strictEqual(ranges[0].range.start.line, 5);
			assert.strictEqual(ranges[0].range.end.line, 6);
			if (ranges[0].parent) {
				assert.strictEqual(ranges[0].parent.range.start.line, 4);
				assert.strictEqual(ranges[0].parent.range.end.line, 7);
				if (ranges[0].parent.parent) {
					assert.strictEqual(ranges[0].parent.parent.range.start.line, 4);
					assert.strictEqual(ranges[0].parent.parent.range.end.line, 7);
					if (ranges[0].parent.parent.parent) {
						assert.strictEqual(ranges[0].parent.parent.parent.range.start.line, 3);
						assert.strictEqual(ranges[0].parent.parent.parent.range.end.line, 10);
						if (ranges[0].parent.parent.parent.parent) {
							assert.strictEqual(ranges[0].parent.parent.parent.parent.range.start.line, 3);
							assert.strictEqual(ranges[0].parent.parent.parent.parent.range.end.line, 10);
							if (ranges[0].parent.parent.parent.parent.parent) {
								assert.strictEqual(ranges[0].parent.parent.parent.parent.parent.range.start.line, 2);
								assert.strictEqual(ranges[0].parent.parent.parent.parent.parent.range.end.line, 10);
								if (ranges[0].parent.parent.parent.parent.parent.parent) {
									assert.strictEqual(ranges[0].parent.parent.parent.parent.parent.parent.range.start.line, 1);
									assert.strictEqual(ranges[0].parent.parent.parent.parent.parent.parent.range.end.line, 10);
									if (ranges[0].parent.parent.parent.parent.parent.parent.parent) {
										assert.strictEqual(ranges[0].parent.parent.parent.parent.parent.parent.parent.range.start.line, 0);
										assert.strictEqual(ranges[0].parent.parent.parent.parent.parent.parent.parent.range.end.line, 10);
									}
								}
							}
						}
					}
				}
			}
		} else {
			throw new Error('ranges are undefined');
		}
	});
});

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
