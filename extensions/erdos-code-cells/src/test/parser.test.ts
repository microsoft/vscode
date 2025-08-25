/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { Cell, CellType, getParser, parseCells } from '../parser';
import { closeAllEditors } from './utils';

suite('Parsers', () => {
	teardown(closeAllEditors);

	const noCellsTests: [string, string, string][] = [
		['Empty Python document should have no cells', 'python', ''],
		['Empty R document should have no cells', 'r', ''],
		['Document with an unsupported language should have no cells', 'unknown-language', '# %%\n123']
	];
	noCellsTests.forEach(([title, language, content]) => {
		test(title, async () => {
			const document = await vscode.workspace.openTextDocument({ language, content });
			assert.deepStrictEqual(parseCells(document), []);
		});
	});

	suite('Python Parser', () => {
		const language = 'python';
		const codeCellBody = '123\n456';
		const codeCell = `# %%\n${codeCellBody}`;
		const markdownBody = `# H1
## H2

And a [link](target)`;
		const commentedMarkdownBody = markdownBody.split('\n').map(line => `# ${line}`).join('\n');
		const commentedMarkdownCell = `# %% [markdown]\n${commentedMarkdownBody}`;
		const singleQuotedMarkdownCell = `# %% [markdown]\n'''\n${markdownBody}\n'''`;
		const doubleQuotedMarkdownCell = `# %% [markdown]\n"""\n${markdownBody}\n"""`;

		const parser = getParser(language);

		test('Has a parser', () => {
			assert.ok(parser);
		});

		const singleCellTests: [string, string, CellType][] = [
			['Parses a single code cell', codeCell, CellType.Code],
			['Parses a single markdown cell', commentedMarkdownCell, CellType.Markdown],
		];
		singleCellTests.forEach(([title, content, expectedType]) => {
			test(title, async () => {
				const document = await vscode.workspace.openTextDocument({ language, content });
				assert.deepStrictEqual(parseCells(document), [singleCell(document, expectedType)]);
			});
		});

		test('Parses multiple cells', async () => {
			const content = [codeCell, commentedMarkdownCell].join('\n');
			const document = await vscode.workspace.openTextDocument({ language, content });
			assert.deepStrictEqual(parseCells(document), [
				{ range: new vscode.Range(0, 0, 2, 3), type: CellType.Code },
				{ range: new vscode.Range(3, 0, 7, 22), type: CellType.Markdown }
			]);
		});

		const getCellTypeTests: [string, string, CellType][] = [
			['Get the cell type for a code cell', codeCell, CellType.Code],
			['Get the cell type for a markdown cell', commentedMarkdownCell, CellType.Markdown],
		];
		getCellTypeTests.forEach(([title, content, expectedType]) => {
			test(title, () => {
				const line = content.split('\n')[0];
				assert.strictEqual(parser?.getCellType(line), expectedType);
			});
		});

		const expectedMarkdownText = `%%markdown\n${markdownBody}\n\n`;
		const getCellTextTests: [string, string, CellType, string][] = [
			['Get the cell text for a code cell', codeCell, CellType.Code, codeCellBody],
			['Get the cell text for a commented markdown cell', commentedMarkdownCell, CellType.Markdown, expectedMarkdownText],
			['Get the cell text for a single-quoted markdown cell', singleQuotedMarkdownCell, CellType.Markdown, expectedMarkdownText],
			['Get the cell text for a double-quoted markdown cell', doubleQuotedMarkdownCell, CellType.Markdown, expectedMarkdownText],
		];
		getCellTextTests.forEach(([title, content, expectedType, expectedText]) => {
			test(title, async () => {
				const document = await vscode.workspace.openTextDocument({ language, content });
				const cell = singleCell(document, expectedType);
				assert.deepStrictEqual(parser?.getCellText(cell, document), expectedText);
			});
		});

		test('New cell', async () => {
			assert.strictEqual(parser?.newCell(), '\n# %%\n');
		});
	});

	suite('R Parser', () => {
		const language = 'r';
		const codeCellBody = '\n123\n456';
		const codeCell1 = `#+\n${codeCellBody}`;
		const codeCell2 = `# %%\n789\n\n012`;
		const codeCell3 = `# Header ----\n\n123\n456`;

		const parser = getParser(language);

		test('Has a parser', () => {
			assert.ok(parser);
		});

		const singleCellTests: [string, string, CellType][] = [
			['Parses a single code cell', codeCell1, CellType.Code],
		];
		singleCellTests.forEach(([title, content, expectedType]) => {
			test(title, async () => {
				const document = await vscode.workspace.openTextDocument({ language, content });
				assert.deepStrictEqual(parseCells(document), [singleCell(document, expectedType)]);
			});
		});

		test('Parses multiple cells', async () => {
			const content = [codeCell1, codeCell2].join('\n\n');
			const document = await vscode.workspace.openTextDocument({ language, content });
			assert.deepStrictEqual(parseCells(document), [
				{ range: new vscode.Range(0, 0, 4, 0), type: CellType.Code },
				{ range: new vscode.Range(5, 0, 8, 3), type: CellType.Code }
			]);
		});

		const getCellTypeTests: [string, string, CellType][] = [
			['Get the cell type for a code cell', codeCell1, CellType.Code],
		];
		getCellTypeTests.forEach(([title, content, expectedType]) => {
			test(title, () => {
				const line = content.split('\n')[0];
				assert.strictEqual(parser?.getCellType(line), expectedType);
			});
		});

		const getCellTextTests: [string, string, CellType, string][] = [
			['Get the cell text for a code cell', codeCell1, CellType.Code, codeCellBody],
		];
		getCellTextTests.forEach(([title, content, expectedType, expectedText]) => {
			test(title, async () => {
				const document = await vscode.workspace.openTextDocument({ language, content });
				const cell = singleCell(document, expectedType);
				assert.strictEqual(parser?.getCellText(cell, document), expectedText);
			});
		});

		test('Section headers end code cells', async () => {
			const content = [codeCell2, codeCell3].join('\n\n');
			const document = await vscode.workspace.openTextDocument({ language, content });
			assert.deepStrictEqual(parseCells(document), [
				{ range: new vscode.Range(0, 0, 4, 0), type: CellType.Code }
			]);
		});

		test('New cell', async () => {
			assert.strictEqual(parser?.newCell(), '\n# %%\n');
		});
	});
});

// WARNING: This does not check that the document does in fact contain a single cell.
function singleCell(document: vscode.TextDocument, cellType: CellType): Cell {
	const lastLine = document.lineAt(document.lineCount - 1);
	return {
		range: new vscode.Range(new vscode.Position(0, 0), lastLine.range.end),
		type: cellType,
	};
}
