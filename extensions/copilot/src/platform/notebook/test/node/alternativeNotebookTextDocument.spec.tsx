/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeEach, describe, expect, test } from 'vitest';
import type { NotebookDocument, NotebookDocumentContentChange, TextDocumentChangeEvent } from 'vscode';
import { ExtHostNotebookDocumentData } from '../../../../util/common/test/shims/notebookDocument';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { NotebookCellData, NotebookCellKind, NotebookData, NotebookRange, Range } from '../../../../vscodeTypes';
import { createAlternativeNotebookDocument, createAlternativeNotebookDocumentSnapshot, IAlternativeNotebookDocument, IAlternativeNotebookDocumentSnapshot, toAltNotebookCellChangeEdit, toAltNotebookChangeEdit } from '../../common/alternativeNotebookTextDocument';

describe('Alternative Notebook (text) Content', () => {
	const disposables = new DisposableStore();

	afterAll(() => {
		disposables.clear();
	});

	function createNotebook(cells: NotebookCellData[], withMarkdownCells: boolean = false) {
		const notebook = ExtHostNotebookDocumentData.fromNotebookData(URI.file('notebook.ipynb'), new NotebookData(cells), 'jupyter-notebook');
		const altDocSnapshot = createAlternativeNotebookDocumentSnapshot(notebook.document, !withMarkdownCells);
		const altDoc = createAlternativeNotebookDocument(notebook.document, !withMarkdownCells);

		expect(altDocSnapshot.getText()).toBe(altDoc.getText());
		return { notebookData: notebook, notebook: notebook.document, altDocSnapshot, altDoc };
	}
	[true, false].forEach(withMarkdownCells => {
		describe(`Alt Content ${withMarkdownCells ? 'with' : 'without'} Markdown Cells`, () => {
			test(`Generate Alt Content`, async () => {
				const cells = [
					new NotebookCellData(NotebookCellKind.Code, 'print("Hello World")', 'python'),
				];
				const { altDocSnapshot } = createNotebook(cells, withMarkdownCells);
				expect(altDocSnapshot.getText()).toMatchSnapshot();
			});
			test(`No Content`, async () => {
				const { altDocSnapshot } = createNotebook([], withMarkdownCells);
				expect(altDocSnapshot.getText()).toMatchSnapshot();
			});
			test(`No Content without code cells`, async () => {
				const cells = [
					new NotebookCellData(NotebookCellKind.Markup, '# This is a sample notebook', 'markdown'),
				];
				const { altDocSnapshot } = createNotebook(cells, withMarkdownCells);
				expect(altDocSnapshot.getText()).toMatchSnapshot();
			});
			test(`With Markdown Cells`, async () => {
				const cells = [
					new NotebookCellData(NotebookCellKind.Markup, '# This is a sample notebook', 'markdown'),
					new NotebookCellData(NotebookCellKind.Markup, '## Header', 'markdown'),
					new NotebookCellData(NotebookCellKind.Code, 'print("Hello World")', 'python'),
					new NotebookCellData(NotebookCellKind.Markup, 'Comments', 'markdown'),
					new NotebookCellData(NotebookCellKind.Code, 'print("Foo Bar")', 'python'),
				];
				const { altDocSnapshot } = createNotebook(cells, withMarkdownCells);
				expect(altDocSnapshot.getText()).toMatchSnapshot();
			});
			test(`EOLs`, async () => {
				const cells = [
					new NotebookCellData(NotebookCellKind.Code, 'import sys\nimport os', 'python'),
					new NotebookCellData(NotebookCellKind.Code, 'import pandas\r\nimport requests', 'python'),
					new NotebookCellData(NotebookCellKind.Code, 'print("Hello World")\r\nprint("Foo Bar")\r\nprint("Bar Baz")', 'python'),
					new NotebookCellData(NotebookCellKind.Code, 'print(sys.executable)\nprint(sys.version)', 'python'),
				];
				const { altDocSnapshot } = createNotebook(cells, withMarkdownCells);

				expect(altDocSnapshot.getText()).toMatchSnapshot();

				expect(altDocSnapshot.getText()).not.toContain('\r\n'); // Ensure no CRLF, only LF
				expect(altDocSnapshot.getText()).toContain('\n'); // Ensure no CRLF, only LF
			});
		});
	});
	describe('Position Mapping', () => {
		test(`All cells have same EOL`, async () => {
			const cells = [
				new NotebookCellData(NotebookCellKind.Code, 'import sys\nimport os', 'python'),
				new NotebookCellData(NotebookCellKind.Code, 'import pandas\nimport requests', 'python'),
				new NotebookCellData(NotebookCellKind.Code, 'print("Hello World")\nprint("Foo Bar")\nprint("Bar Baz")', 'python'),
				new NotebookCellData(NotebookCellKind.Code, 'print(sys.executable)\nprint(sys.version)', 'python'),
			];
			const { notebook, altDocSnapshot } = createNotebook(cells);

			expect(altDocSnapshot.getText(new OffsetRange(53, 53))).toBe('');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(53, 53))).toEqual([[notebook.cellAt(0), new Range(0, 0, 0, 0)]]);
			expect(altDocSnapshot.fromAltRange(new Range(1, 0, 1, 0))).toEqual([[notebook.cellAt(0), new Range(0, 0, 0, 0)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(0), [new Range(0, 0, 0, 0)])).toEqual([new OffsetRange(53, 53)]);

			expect(altDocSnapshot.getText(new OffsetRange(53, 59))).toBe('import');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(53, 59))).toEqual([[notebook.cellAt(0), new Range(0, 0, 0, 6)]]);
			expect(altDocSnapshot.fromAltRange(new Range(1, 0, 1, 6))).toEqual([[notebook.cellAt(0), new Range(0, 0, 0, 6)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(0), [new Range(0, 0, 0, 6)])).toEqual([new OffsetRange(53, 59)]);

			expect(altDocSnapshot.getText(new OffsetRange(53, 64))).toBe('import sys\n');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(53, 64))).toEqual([[notebook.cellAt(0), new Range(0, 0, 1, 0)]]);
			expect(altDocSnapshot.fromAltRange(new Range(1, 0, 2, 0))).toEqual([[notebook.cellAt(0), new Range(0, 0, 1, 0)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(0), [new Range(0, 0, 1, 0)])).toEqual([new OffsetRange(53, 64)]);

			expect(altDocSnapshot.getText(new OffsetRange(53, 73))).toBe('import sys\nimport os');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(53, 73))).toEqual([[notebook.cellAt(0), new Range(0, 0, 1, 9)]]);
			expect(altDocSnapshot.fromAltRange(new Range(1, 0, 2, 9))).toEqual([[notebook.cellAt(0), new Range(0, 0, 1, 9)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(0), [new Range(0, 0, 1, 9)])).toEqual([new OffsetRange(53, 73)]);

			expect(altDocSnapshot.getText(new OffsetRange(53, 74))).toBe('import sys\nimport os\n');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(53, 74))).toEqual([[notebook.cellAt(0), new Range(0, 0, 1, 9)]]);
			expect(altDocSnapshot.fromAltRange(new Range(1, 0, 3, 0))).toEqual([[notebook.cellAt(0), new Range(0, 0, 1, 9)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(0), [new Range(0, 0, 1, 9)])).toEqual([new OffsetRange(53, 73)]);

			// Translating alt text range across cells will only return contents of one cell.
			expect(altDocSnapshot.getText(new OffsetRange(53, 140))).toBe('import sys\nimport os\n#%% vscode.cell [id=#VSC-bdb3864a] [language=python]\nimport pandas');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(53, 140))).toEqual([[notebook.cellAt(0), new Range(0, 0, 1, 9)], [notebook.cellAt(1), new Range(0, 0, 0, 13)]]);
			expect(altDocSnapshot.fromAltRange(new Range(1, 0, 4, 13))).toEqual([[notebook.cellAt(0), new Range(0, 0, 1, 9)], [notebook.cellAt(1), new Range(0, 0, 0, 13)]]);

			expect(altDocSnapshot.getText(new OffsetRange(71, 73))).toBe('os');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(71, 73))).toEqual([[notebook.cellAt(0), new Range(1, 7, 1, 9)]]);
			expect(altDocSnapshot.fromAltRange(new Range(2, 7, 2, 9))).toEqual([[notebook.cellAt(0), new Range(1, 7, 1, 9)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(0), [new Range(1, 7, 1, 9)])).toEqual([new OffsetRange(71, 73)]);

			expect(altDocSnapshot.getText(new OffsetRange(127, 127))).toBe('');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(127, 127))).toEqual([[notebook.cellAt(1), new Range(0, 0, 0, 0)]]);
			expect(altDocSnapshot.fromAltRange(new Range(4, 0, 4, 0))).toEqual([[notebook.cellAt(1), new Range(0, 0, 0, 0)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(1), [new Range(0, 0, 0, 0)])).toEqual([new OffsetRange(127, 127)]);

			expect(altDocSnapshot.getText(new OffsetRange(127, 133))).toBe('import');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(127, 133))).toEqual([[notebook.cellAt(1), new Range(0, 0, 0, 6)]]);
			expect(altDocSnapshot.fromAltRange(new Range(4, 0, 4, 6))).toEqual([[notebook.cellAt(1), new Range(0, 0, 0, 6)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(1), [new Range(0, 0, 0, 6)])).toEqual([new OffsetRange(127, 133)]);

			expect(altDocSnapshot.getText(new OffsetRange(134, 258))).toBe('pandas\nimport requests\n#%% vscode.cell [id=#VSC-8862d4f3] [language=python]\nprint("Hello World")\nprint("Foo Bar")\nprint("Bar');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(134, 258))).toEqual([
				[notebook.cellAt(1), new Range(0, 7, 1, 15)],
				[notebook.cellAt(2), new Range(0, 0, 2, 10)],
			]);
			expect(altDocSnapshot.fromAltRange(new Range(4, 7, 9, 10))).toEqual([
				[notebook.cellAt(1), new Range(0, 7, 1, 15)],
				[notebook.cellAt(2), new Range(0, 0, 2, 10)],
			]);

			expect(altDocSnapshot.getText(new OffsetRange(134, 156))).toBe('pandas\nimport requests');
			expect(notebook.cellAt(1).document.getText(new Range(0, 7, 1, 15))).toBe('pandas\nimport requests');
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(1), [new Range(0, 7, 1, 15)])).toEqual([new OffsetRange(134, 156)]);
			expect(altDocSnapshot.getText(new OffsetRange(210, 258))).toBe('print("Hello World")\nprint("Foo Bar")\nprint("Bar');
			expect(notebook.cellAt(2).document.getText(new Range(0, 0, 2, 10))).toBe('print("Hello World")\nprint("Foo Bar")\nprint("Bar');
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(2), [new Range(0, 0, 2, 10)])).toEqual([new OffsetRange(210, 258)]);

			expect(altDocSnapshot.getText(new OffsetRange(210, 265))).toBe('print("Hello World")\nprint("Foo Bar")\nprint("Bar Baz")\n');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(210, 265))).toEqual([[notebook.cellAt(2), new Range(0, 0, 2, 16)]]);
			expect(altDocSnapshot.fromAltRange(new Range(7, 0, 10, 0))).toEqual([[notebook.cellAt(2), new Range(0, 0, 2, 16)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(2), [new Range(0, 0, 2, 16)])).toEqual([new OffsetRange(210, 264)]);

			expect(altDocSnapshot.getText(new OffsetRange(318, 358))).toBe('print(sys.executable)\nprint(sys.version)');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(318, 358))).toEqual([[notebook.cellAt(3), new Range(0, 0, 1, 18)]]);
			expect(altDocSnapshot.fromAltRange(new Range(11, 0, 12, 18))).toEqual([[notebook.cellAt(3), new Range(0, 0, 1, 18)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(3), [new Range(0, 0, 1, 18)])).toEqual([new OffsetRange(318, 358)]);

			expect(altDocSnapshot.getText(new OffsetRange(60, 349))).toBe('sys\nimport os\n#%% vscode.cell [id=#VSC-bdb3864a] [language=python]\nimport pandas\nimport requests\n#%% vscode.cell [id=#VSC-8862d4f3] [language=python]\nprint("Hello World")\nprint("Foo Bar")\nprint("Bar Baz")\n#%% vscode.cell [id=#VSC-e07487cb] [language=python]\nprint(sys.executable)\nprint(sys');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(60, 349))).toEqual([
				[notebook.cellAt(0), new Range(0, 7, 1, 9)],
				[notebook.cellAt(1), new Range(0, 0, 1, 15)],
				[notebook.cellAt(2), new Range(0, 0, 2, 16)],
				[notebook.cellAt(3), new Range(0, 0, 1, 9)]
			]);
			expect(altDocSnapshot.fromAltRange(new Range(1, 7, 12, 9))).toEqual([
				[notebook.cellAt(0), new Range(0, 7, 1, 9)],
				[notebook.cellAt(1), new Range(0, 0, 1, 15)],
				[notebook.cellAt(2), new Range(0, 0, 2, 16)],
				[notebook.cellAt(3), new Range(0, 0, 1, 9)]
			]);
		});
		test(`All cells have same EOL (with MD cells excluded)`, async () => {
			const cells = [
				new NotebookCellData(NotebookCellKind.Markup, '# This is a sample notebook', 'markdown'),
				new NotebookCellData(NotebookCellKind.Markup, '## Header', 'markdown'),
				new NotebookCellData(NotebookCellKind.Code, 'import sys\nimport os', 'python'),
				new NotebookCellData(NotebookCellKind.Markup, 'Comments', 'markdown'),
				new NotebookCellData(NotebookCellKind.Code, 'import pandas\nimport requests', 'python'),
				new NotebookCellData(NotebookCellKind.Code, 'print("Hello World")\nprint("Foo Bar")\nprint("Bar Baz")', 'python'),
				new NotebookCellData(NotebookCellKind.Code, 'print(sys.executable)\nprint(sys.version)', 'python'),
			];
			const { notebook, altDocSnapshot } = createNotebook(cells);

			expect(altDocSnapshot.getText(new OffsetRange(53, 53))).toBe('');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(53, 53))).toEqual([[notebook.cellAt(2), new Range(0, 0, 0, 0)]]);
			expect(altDocSnapshot.fromAltRange(new Range(1, 0, 1, 0))).toEqual([[notebook.cellAt(2), new Range(0, 0, 0, 0)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(2), [new Range(0, 0, 0, 0)])).toEqual([new OffsetRange(53, 53)]);

			expect(altDocSnapshot.getText(new OffsetRange(53, 59))).toBe('import');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(53, 59))).toEqual([[notebook.cellAt(2), new Range(0, 0, 0, 6)]]);
			expect(altDocSnapshot.fromAltRange(new Range(1, 0, 1, 6))).toEqual([[notebook.cellAt(2), new Range(0, 0, 0, 6)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(2), [new Range(0, 0, 0, 6)])).toEqual([new OffsetRange(53, 59)]);

			expect(altDocSnapshot.getText(new OffsetRange(53, 64))).toBe('import sys\n');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(53, 64))).toEqual([[notebook.cellAt(2), new Range(0, 0, 1, 0)]]);
			expect(altDocSnapshot.fromAltRange(new Range(1, 0, 2, 0))).toEqual([[notebook.cellAt(2), new Range(0, 0, 1, 0)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(2), [new Range(0, 0, 1, 0)])).toEqual([new OffsetRange(53, 64)]);

			expect(altDocSnapshot.getText(new OffsetRange(53, 73))).toBe('import sys\nimport os');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(53, 73))).toEqual([[notebook.cellAt(2), new Range(0, 0, 1, 9)]]);
			expect(altDocSnapshot.fromAltRange(new Range(1, 0, 2, 9))).toEqual([[notebook.cellAt(2), new Range(0, 0, 1, 9)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(2), [new Range(0, 0, 1, 9)])).toEqual([new OffsetRange(53, 73)]);

			expect(altDocSnapshot.getText(new OffsetRange(53, 74))).toBe('import sys\nimport os\n');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(53, 74))).toEqual([[notebook.cellAt(2), new Range(0, 0, 1, 9)]]);
			expect(altDocSnapshot.fromAltRange(new Range(1, 0, 3, 0))).toEqual([[notebook.cellAt(2), new Range(0, 0, 1, 9)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(2), [new Range(0, 0, 1, 9)])).toEqual([new OffsetRange(53, 73)]);

			// Translating alt text range across cells will only return contents of one cell.
			expect(altDocSnapshot.getText(new OffsetRange(53, 140))).toBe('import sys\nimport os\n#%% vscode.cell [id=#VSC-53ab90bb] [language=python]\nimport pandas');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(53, 140))).toEqual([[notebook.cellAt(2), new Range(0, 0, 1, 9)], [notebook.cellAt(4), new Range(0, 0, 0, 13)]]);
			expect(altDocSnapshot.fromAltRange(new Range(1, 0, 4, 13))).toEqual([[notebook.cellAt(2), new Range(0, 0, 1, 9)], [notebook.cellAt(4), new Range(0, 0, 0, 13)]]);

			expect(altDocSnapshot.getText(new OffsetRange(71, 73))).toBe('os');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(71, 73))).toEqual([[notebook.cellAt(2), new Range(1, 7, 1, 9)]]);
			expect(altDocSnapshot.fromAltRange(new Range(2, 7, 2, 9))).toEqual([[notebook.cellAt(2), new Range(1, 7, 1, 9)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(2), [new Range(1, 7, 1, 9)])).toEqual([new OffsetRange(71, 73)]);

			expect(altDocSnapshot.getText(new OffsetRange(127, 127))).toBe('');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(127, 127))).toEqual([[notebook.cellAt(4), new Range(0, 0, 0, 0)]]);
			expect(altDocSnapshot.fromAltRange(new Range(4, 0, 4, 0))).toEqual([[notebook.cellAt(4), new Range(0, 0, 0, 0)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(4), [new Range(0, 0, 0, 0)])).toEqual([new OffsetRange(127, 127)]);

			expect(altDocSnapshot.getText(new OffsetRange(127, 133))).toBe('import');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(127, 133))).toEqual([[notebook.cellAt(4), new Range(0, 0, 0, 6)]]);
			expect(altDocSnapshot.fromAltRange(new Range(4, 0, 4, 6))).toEqual([[notebook.cellAt(4), new Range(0, 0, 0, 6)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(4), [new Range(0, 0, 0, 6)])).toEqual([new OffsetRange(127, 133)]);

			expect(altDocSnapshot.getText(new OffsetRange(134, 258))).toBe('pandas\nimport requests\n#%% vscode.cell [id=#VSC-749a8f95] [language=python]\nprint("Hello World")\nprint("Foo Bar")\nprint("Bar');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(134, 258))).toEqual([
				[notebook.cellAt(4), new Range(0, 7, 1, 15)],
				[notebook.cellAt(5), new Range(0, 0, 2, 10)],
			]);
			expect(altDocSnapshot.fromAltRange(new Range(4, 7, 9, 10))).toEqual([
				[notebook.cellAt(4), new Range(0, 7, 1, 15)],
				[notebook.cellAt(5), new Range(0, 0, 2, 10)],
			]);

			expect(altDocSnapshot.getText(new OffsetRange(134, 156))).toBe('pandas\nimport requests');
			expect(notebook.cellAt(4).document.getText(new Range(0, 7, 1, 15))).toBe('pandas\nimport requests');
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(4), [new Range(0, 7, 1, 15)])).toEqual([new OffsetRange(134, 156)]);
			expect(altDocSnapshot.getText(new OffsetRange(210, 258))).toBe('print("Hello World")\nprint("Foo Bar")\nprint("Bar');
			expect(notebook.cellAt(5).document.getText(new Range(0, 0, 2, 10))).toBe('print("Hello World")\nprint("Foo Bar")\nprint("Bar');
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(5), [new Range(0, 0, 2, 10)])).toEqual([new OffsetRange(210, 258)]);

			expect(altDocSnapshot.getText(new OffsetRange(210, 265))).toBe('print("Hello World")\nprint("Foo Bar")\nprint("Bar Baz")\n');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(210, 265))).toEqual([[notebook.cellAt(5), new Range(0, 0, 2, 16)]]);
			expect(altDocSnapshot.fromAltRange(new Range(7, 0, 10, 0))).toEqual([[notebook.cellAt(5), new Range(0, 0, 2, 16)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(5), [new Range(0, 0, 2, 16)])).toEqual([new OffsetRange(210, 264)]);

			expect(altDocSnapshot.getText(new OffsetRange(318, 358))).toBe('print(sys.executable)\nprint(sys.version)');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(318, 358))).toEqual([[notebook.cellAt(6), new Range(0, 0, 1, 18)]]);
			expect(altDocSnapshot.fromAltRange(new Range(11, 0, 12, 18))).toEqual([[notebook.cellAt(6), new Range(0, 0, 1, 18)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(6), [new Range(0, 0, 1, 18)])).toEqual([new OffsetRange(318, 358)]);

			expect(altDocSnapshot.getText(new OffsetRange(60, 349))).toBe('sys\nimport os\n#%% vscode.cell [id=#VSC-53ab90bb] [language=python]\nimport pandas\nimport requests\n#%% vscode.cell [id=#VSC-749a8f95] [language=python]\nprint("Hello World")\nprint("Foo Bar")\nprint("Bar Baz")\n#%% vscode.cell [id=#VSC-d2139a72] [language=python]\nprint(sys.executable)\nprint(sys');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(60, 349))).toEqual([
				[notebook.cellAt(2), new Range(0, 7, 1, 9)],
				[notebook.cellAt(4), new Range(0, 0, 1, 15)],
				[notebook.cellAt(5), new Range(0, 0, 2, 16)],
				[notebook.cellAt(6), new Range(0, 0, 1, 9)]
			]);
			expect(altDocSnapshot.fromAltRange(new Range(1, 7, 12, 9))).toEqual([
				[notebook.cellAt(2), new Range(0, 7, 1, 9)],
				[notebook.cellAt(4), new Range(0, 0, 1, 15)],
				[notebook.cellAt(5), new Range(0, 0, 2, 16)],
				[notebook.cellAt(6), new Range(0, 0, 1, 9)]
			]);
		});
		test(`All cells have same EOL (with MD cells included)`, async () => {
			const cells = [
				new NotebookCellData(NotebookCellKind.Markup, '# This is a sample notebook', 'markdown'),
				new NotebookCellData(NotebookCellKind.Markup, '## Header\n### Sub Heading', 'markdown'),
				new NotebookCellData(NotebookCellKind.Code, 'import sys\nimport os', 'python'),
				new NotebookCellData(NotebookCellKind.Markup, 'Comments', 'markdown'),
				new NotebookCellData(NotebookCellKind.Code, 'import pandas\nimport requests', 'python'),
				new NotebookCellData(NotebookCellKind.Code, 'print("Hello World")\nprint("Foo Bar")\nprint("Bar Baz")', 'python'),
				new NotebookCellData(NotebookCellKind.Code, 'print(sys.executable)\nprint(sys.version)', 'python'),
			];
			const { notebook, altDocSnapshot } = createNotebook(cells, true);

			expect(altDocSnapshot.getText(new OffsetRange(59, 59))).toBe('');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(59, 59))).toEqual([[notebook.cellAt(0), new Range(0, 0, 0, 0)]]);
			expect(altDocSnapshot.fromAltRange(new Range(2, 0, 2, 0))).toEqual([[notebook.cellAt(0), new Range(0, 0, 0, 0)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(0), [new Range(0, 0, 0, 0)])).toEqual([new OffsetRange(59, 59)]);

			expect(altDocSnapshot.getText(new OffsetRange(59, 65))).toBe('# This');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(59, 65))).toEqual([[notebook.cellAt(0), new Range(0, 0, 0, 6)]]);
			expect(altDocSnapshot.fromAltRange(new Range(2, 0, 2, 6))).toEqual([[notebook.cellAt(0), new Range(0, 0, 0, 6)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(0), [new Range(0, 0, 0, 6)])).toEqual([new OffsetRange(59, 65)]);

			expect(altDocSnapshot.getText(new OffsetRange(233, 244))).toBe('import sys\n');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(233, 244))).toEqual([[notebook.cellAt(2), new Range(0, 0, 1, 0)]]);
			expect(altDocSnapshot.fromAltRange(new Range(10, 0, 11, 0))).toEqual([[notebook.cellAt(2), new Range(0, 0, 1, 0)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(2), [new Range(0, 0, 1, 0)])).toEqual([new OffsetRange(233, 244)]);

			expect(altDocSnapshot.getText(new OffsetRange(233, 253))).toBe('import sys\nimport os');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(233, 253))).toEqual([[notebook.cellAt(2), new Range(0, 0, 1, 9)]]);
			expect(altDocSnapshot.fromAltRange(new Range(10, 0, 11, 9))).toEqual([[notebook.cellAt(2), new Range(0, 0, 1, 9)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(2), [new Range(0, 0, 1, 9)])).toEqual([new OffsetRange(233, 253)]);

			expect(altDocSnapshot.getText(new OffsetRange(233, 254))).toBe('import sys\nimport os\n');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(233, 254))).toEqual([[notebook.cellAt(2), new Range(0, 0, 1, 9)]]);
			expect(altDocSnapshot.fromAltRange(new Range(10, 0, 12, 0))).toEqual([[notebook.cellAt(2), new Range(0, 0, 1, 9)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(2), [new Range(0, 0, 1, 9)])).toEqual([new OffsetRange(233, 253)]);

			// Translating alt text range across cells will only return contents of one cell.
			expect(altDocSnapshot.getText(new OffsetRange(53, 254))).toBe(']\n"""\n# This is a sample notebook\n"""\n#%% vscode.cell [id=#VSC-bdb3864a] [language=markdown]\n"""\n## Header\n### Sub Heading\n"""\n#%% vscode.cell [id=#VSC-8862d4f3] [language=python]\nimport sys\nimport os\n');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(53, 254))).toEqual([
				[notebook.cellAt(0), new Range(0, 0, 0, 27)],
				[notebook.cellAt(1), new Range(0, 0, 1, 15)],
				[notebook.cellAt(2), new Range(0, 0, 1, 9)]
			]);
			expect(altDocSnapshot.fromAltRange(new Range(1, 0, 11, 13))).toEqual([
				[notebook.cellAt(0), new Range(0, 0, 0, 27)],
				[notebook.cellAt(1), new Range(0, 0, 1, 15)],
				[notebook.cellAt(2), new Range(0, 0, 1, 9)]
			]);

			expect(altDocSnapshot.getText(new OffsetRange(251, 253))).toBe('os');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(251, 253))).toEqual([[notebook.cellAt(2), new Range(1, 7, 1, 9)]]);
			expect(altDocSnapshot.fromAltRange(new Range(11, 7, 11, 9))).toEqual([[notebook.cellAt(2), new Range(1, 7, 1, 9)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(2), [new Range(1, 7, 1, 9)])).toEqual([new OffsetRange(251, 253)]);

			expect(altDocSnapshot.getText(new OffsetRange(379, 379))).toBe('');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(379, 379))).toEqual([[notebook.cellAt(4), new Range(0, 0, 0, 0)]]);
			expect(altDocSnapshot.fromAltRange(new Range(17, 0, 17, 0))).toEqual([[notebook.cellAt(4), new Range(0, 0, 0, 0)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(4), [new Range(0, 0, 0, 0)])).toEqual([new OffsetRange(379, 379)]);

			expect(altDocSnapshot.getText(new OffsetRange(379, 385))).toBe('import');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(379, 385))).toEqual([[notebook.cellAt(4), new Range(0, 0, 0, 6)]]);
			expect(altDocSnapshot.fromAltRange(new Range(17, 0, 17, 6))).toEqual([[notebook.cellAt(4), new Range(0, 0, 0, 6)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(4), [new Range(0, 0, 0, 6)])).toEqual([new OffsetRange(379, 385)]);

			expect(altDocSnapshot.getText(new OffsetRange(386, 510))).toBe('pandas\nimport requests\n#%% vscode.cell [id=#VSC-749a8f95] [language=python]\nprint("Hello World")\nprint("Foo Bar")\nprint("Bar');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(386, 510))).toEqual([
				[notebook.cellAt(4), new Range(0, 7, 1, 15)],
				[notebook.cellAt(5), new Range(0, 0, 2, 10)],
			]);
			expect(altDocSnapshot.fromAltRange(new Range(17, 7, 22, 10))).toEqual([
				[notebook.cellAt(4), new Range(0, 7, 1, 15)],
				[notebook.cellAt(5), new Range(0, 0, 2, 10)],
			]);

			expect(altDocSnapshot.getText(new OffsetRange(386, 408))).toBe('pandas\nimport requests');
			expect(notebook.cellAt(4).document.getText(new Range(0, 7, 1, 15))).toBe('pandas\nimport requests');
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(4), [new Range(0, 7, 1, 15)])).toEqual([new OffsetRange(386, 408)]);
			expect(altDocSnapshot.getText(new OffsetRange(462, 510))).toBe('print("Hello World")\nprint("Foo Bar")\nprint("Bar');
			expect(notebook.cellAt(5).document.getText(new Range(0, 0, 2, 10))).toBe('print("Hello World")\nprint("Foo Bar")\nprint("Bar');
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(5), [new Range(0, 0, 2, 10)])).toEqual([new OffsetRange(462, 510)]);

			expect(altDocSnapshot.getText(new OffsetRange(462, 517))).toBe('print("Hello World")\nprint("Foo Bar")\nprint("Bar Baz")\n');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(462, 517))).toEqual([[notebook.cellAt(5), new Range(0, 0, 2, 16)]]);
			expect(altDocSnapshot.fromAltRange(new Range(20, 0, 23, 0))).toEqual([[notebook.cellAt(5), new Range(0, 0, 2, 16)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(5), [new Range(0, 0, 2, 16)])).toEqual([new OffsetRange(462, 516)]);

			expect(altDocSnapshot.getText(new OffsetRange(570, 610))).toBe('print(sys.executable)\nprint(sys.version)');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(570, 610))).toEqual([[notebook.cellAt(6), new Range(0, 0, 1, 18)]]);
			expect(altDocSnapshot.fromAltRange(new Range(24, 0, 25, 18))).toEqual([[notebook.cellAt(6), new Range(0, 0, 1, 18)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(6), [new Range(0, 0, 1, 18)])).toEqual([new OffsetRange(570, 610)]);

			expect(altDocSnapshot.getText(new OffsetRange(240, 601))).toBe('sys\nimport os\n#%% vscode.cell [id=#VSC-e07487cb] [language=markdown]\n"""\nComments\n"""\n#%% vscode.cell [id=#VSC-53ab90bb] [language=python]\nimport pandas\nimport requests\n#%% vscode.cell [id=#VSC-749a8f95] [language=python]\nprint("Hello World")\nprint("Foo Bar")\nprint("Bar Baz")\n#%% vscode.cell [id=#VSC-d2139a72] [language=python]\nprint(sys.executable)\nprint(sys');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(240, 601))).toEqual([
				[notebook.cellAt(2), new Range(0, 7, 1, 9)],
				[notebook.cellAt(3), new Range(0, 0, 0, 8)],
				[notebook.cellAt(4), new Range(0, 0, 1, 15)],
				[notebook.cellAt(5), new Range(0, 0, 2, 16)],
				[notebook.cellAt(6), new Range(0, 0, 1, 9)]
			]);
			expect(altDocSnapshot.fromAltRange(new Range(10, 7, 25, 9))).toEqual([
				[notebook.cellAt(2), new Range(0, 7, 1, 9)],
				[notebook.cellAt(3), new Range(0, 0, 0, 8)],
				[notebook.cellAt(4), new Range(0, 0, 1, 15)],
				[notebook.cellAt(5), new Range(0, 0, 2, 16)],
				[notebook.cellAt(6), new Range(0, 0, 1, 9)]
			]);

			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(106, 177))).toEqual([[notebook.cellAt(1), new Range(0, 0, 1, 15)]]);
			expect(altDocSnapshot.fromAltRange(new Range(24, 0, 25, 18))).toEqual([[notebook.cellAt(6), new Range(0, 0, 1, 18)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(6), [new Range(0, 0, 1, 18)])).toEqual([new OffsetRange(570, 610)]);

		});
		test(`All Cells have different EOLs`, async () => {
			const cells = [
				new NotebookCellData(NotebookCellKind.Code, 'import sys\nimport os', 'python'),
				new NotebookCellData(NotebookCellKind.Code, 'import pandas\r\nimport requests', 'python'),
				new NotebookCellData(NotebookCellKind.Code, 'print("Hello World")\r\nprint("Foo Bar")\r\nprint("Bar Baz")', 'python'),
				new NotebookCellData(NotebookCellKind.Code, 'print(sys.executable)\nprint(sys.version)', 'python'),
			];
			const { notebook, altDocSnapshot } = createNotebook(cells);


			expect(altDocSnapshot.getText(new OffsetRange(53, 59))).toBe('import');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(53, 59))).toEqual([[notebook.cellAt(0), new Range(0, 0, 0, 6)]]);
			expect(altDocSnapshot.fromAltRange(new Range(1, 0, 1, 6))).toEqual([[notebook.cellAt(0), new Range(0, 0, 0, 6)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(0), [new Range(0, 0, 0, 6)])).toEqual([new OffsetRange(53, 59)]);

			expect(altDocSnapshot.getText(new OffsetRange(53, 64))).toBe('import sys\n');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(53, 64))).toEqual([[notebook.cellAt(0), new Range(0, 0, 1, 0)]]);
			expect(altDocSnapshot.fromAltRange(new Range(1, 0, 2, 0))).toEqual([[notebook.cellAt(0), new Range(0, 0, 1, 0)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(0), [new Range(0, 0, 1, 0)])).toEqual([new OffsetRange(53, 64)]);

			expect(altDocSnapshot.getText(new OffsetRange(53, 74))).toBe('import sys\nimport os\n');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(53, 74))).toEqual([[notebook.cellAt(0), new Range(0, 0, 1, 9)]]);
			expect(altDocSnapshot.fromAltRange(new Range(1, 0, 2, 9))).toEqual([[notebook.cellAt(0), new Range(0, 0, 1, 9)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(0), [new Range(0, 0, 1, 9)])).toEqual([new OffsetRange(53, 73)]);

			// Translating alt text range across cells will only return contents of one cell.
			expect(altDocSnapshot.getText(new OffsetRange(53, 140))).toBe('import sys\nimport os\n#%% vscode.cell [id=#VSC-bdb3864a] [language=python]\nimport pandas');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(53, 140))).toEqual([[notebook.cellAt(0), new Range(0, 0, 1, 9)], [notebook.cellAt(1), new Range(0, 0, 0, 13)]]);
			expect(altDocSnapshot.fromAltRange(new Range(0, 0, 4, 13))).toEqual([[notebook.cellAt(0), new Range(0, 0, 1, 9)], [notebook.cellAt(1), new Range(0, 0, 0, 13)]]);

			expect(altDocSnapshot.getText(new OffsetRange(71, 73))).toBe('os');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(71, 73))).toEqual([[notebook.cellAt(0), new Range(1, 7, 1, 9)]]);
			expect(altDocSnapshot.fromAltRange(new Range(2, 7, 2, 9))).toEqual([[notebook.cellAt(0), new Range(1, 7, 1, 9)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(0), [new Range(1, 7, 1, 9)])).toEqual([new OffsetRange(71, 73)]);

			expect(altDocSnapshot.getText(new OffsetRange(134, 258))).toBe('pandas\nimport requests\n#%% vscode.cell [id=#VSC-8862d4f3] [language=python]\nprint("Hello World")\nprint("Foo Bar")\nprint("Bar');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(134, 258))).toEqual([
				[notebook.cellAt(1), new Range(0, 7, 1, 15)],
				[notebook.cellAt(2), new Range(0, 0, 2, 10)],
			]);
			expect(altDocSnapshot.fromAltRange(new Range(4, 7, 9, 10))).toEqual([
				[notebook.cellAt(1), new Range(0, 7, 1, 15)],
				[notebook.cellAt(2), new Range(0, 0, 2, 10)],
			]);

			expect(altDocSnapshot.getText(new OffsetRange(134, 156))).toBe('pandas\nimport requests');
			expect(notebook.cellAt(1).document.getText(new Range(0, 7, 1, 15))).toBe('pandas\r\nimport requests');
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(1), [new Range(0, 7, 1, 15)])).toEqual([new OffsetRange(134, 156)]);
			expect(altDocSnapshot.getText(new OffsetRange(210, 258))).toBe('print("Hello World")\nprint("Foo Bar")\nprint("Bar');
			expect(notebook.cellAt(2).document.getText(new Range(0, 0, 2, 10))).toBe('print("Hello World")\r\nprint("Foo Bar")\r\nprint("Bar');
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(2), [new Range(0, 0, 2, 10)])).toEqual([new OffsetRange(210, 258)]);

			expect(altDocSnapshot.getText(new OffsetRange(210, 265))).toBe('print("Hello World")\nprint("Foo Bar")\nprint("Bar Baz")\n');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(210, 265))).toEqual([[notebook.cellAt(2), new Range(0, 0, 2, 16)]]);
			expect(altDocSnapshot.fromAltRange(new Range(7, 0, 9, 16))).toEqual([[notebook.cellAt(2), new Range(0, 0, 2, 16)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(2), [new Range(0, 0, 2, 16)])).toEqual([new OffsetRange(210, 264)]);

			expect(altDocSnapshot.getText(new OffsetRange(318, 358))).toBe('print(sys.executable)\nprint(sys.version)');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(318, 358))).toEqual([[notebook.cellAt(3), new Range(0, 0, 1, 18)]]);
			expect(altDocSnapshot.fromAltRange(new Range(11, 0, 12, 18))).toEqual([[notebook.cellAt(3), new Range(0, 0, 1, 18)]]);
			expect(altDocSnapshot.toAltOffsetRange(notebook.cellAt(3), [new Range(0, 0, 1, 18)])).toEqual([new OffsetRange(318, 358)]);

			expect(altDocSnapshot.getText(new OffsetRange(60, 349))).toBe('sys\nimport os\n#%% vscode.cell [id=#VSC-bdb3864a] [language=python]\nimport pandas\nimport requests\n#%% vscode.cell [id=#VSC-8862d4f3] [language=python]\nprint("Hello World")\nprint("Foo Bar")\nprint("Bar Baz")\n#%% vscode.cell [id=#VSC-e07487cb] [language=python]\nprint(sys.executable)\nprint(sys');
			expect(altDocSnapshot.fromAltOffsetRange(new OffsetRange(60, 349))).toEqual([
				[notebook.cellAt(0), new Range(0, 7, 1, 9)],
				[notebook.cellAt(1), new Range(0, 0, 1, 15)],
				[notebook.cellAt(2), new Range(0, 0, 2, 16)],
				[notebook.cellAt(3), new Range(0, 0, 1, 9)]
			]);
			expect(altDocSnapshot.fromAltRange(new Range(1, 7, 12, 9))).toEqual([
				[notebook.cellAt(0), new Range(0, 7, 1, 9)],
				[notebook.cellAt(1), new Range(0, 0, 1, 15)],
				[notebook.cellAt(2), new Range(0, 0, 2, 16)],
				[notebook.cellAt(3), new Range(0, 0, 1, 9)]
			]);

		});
	});
	describe('Cell Content Changes', () => {
		describe('Cell with 1 line', () => {
			const cells = [
				new NotebookCellData(NotebookCellKind.Code, 'print("Hello World")', 'python'),
			];
			let altDocSnapshot: IAlternativeNotebookDocumentSnapshot;
			let altDoc: IAlternativeNotebookDocument;
			let notebook: NotebookDocument;
			beforeEach(() => {
				({ altDocSnapshot, altDoc, notebook } = createNotebook(cells));
			});
			function getUpdatedAltText(e: TextDocumentChangeEvent): string {
				const newDoc = altDocSnapshot.withCellChanges(e.document, e.contentChanges);
				const edit = toAltNotebookCellChangeEdit(altDocSnapshot, e.document, e.contentChanges);
				const updatedAltText = newDoc.getText();
				altDoc.applyCellChanges(e.document, e.contentChanges);

				// Verify the alt text is updated correctly
				expect(updatedAltText).toBe(edit!.apply(altDocSnapshot.getText()));
				expect(updatedAltText).toBe(altDoc.getText());

				return updatedAltText;
			}
			test(`replace line`, async () => {
				expect(getUpdatedAltText({
					document: notebook.cellAt(0).document,
					reason: undefined,
					detailedReason: {
						source: 'cursor',
						metadata: {}
					},
					contentChanges: [{
						range: new Range(0, 0, 0, 20),
						rangeOffset: 0,
						rangeLength: 20,
						text: '# Top level imports',
					}]
				})).toMatchSnapshot();
			});
			test(`replace text with smaller text`, async () => {
				expect(getUpdatedAltText({
					document: notebook.cellAt(0).document,
					reason: undefined,
					detailedReason: {
						source: 'cursor',
						metadata: {}
					},
					contentChanges: [{
						range: new Range(0, 7, 0, 18),
						rangeOffset: 7,
						rangeLength: 11,
						text: 'Foo Bar',
					}]
				})).toMatchSnapshot();
			});
			test(`replace text with larger text`, async () => {
				expect(getUpdatedAltText({
					document: notebook.cellAt(0).document,
					reason: undefined,
					detailedReason: {
						source: 'cursor',
						metadata: {}
					},
					contentChanges: [{
						range: new Range(0, 7, 0, 18),
						rangeOffset: 7,
						rangeLength: 11,
						text: 'This is a longer piece of text',
					}]
				})).toMatchSnapshot();
			});
			test(`replace while inserting a few lines`, async () => {
				expect(getUpdatedAltText({
					document: notebook.cellAt(0).document,
					reason: undefined,
					detailedReason: {
						source: 'cursor',
						metadata: {}
					},
					contentChanges: [{
						range: new Range(0, 7, 0, 20),
						rangeOffset: 7,
						rangeLength: 13,
						text: 'Foo Bar")\nprint("Another line")\nprint("Yet another line")',
					}]
				})).toMatchSnapshot();
			});
			test(`insert a few lines`, async () => {
				expect(getUpdatedAltText({
					document: notebook.cellAt(0).document,
					reason: undefined,
					detailedReason: {
						source: 'cursor',
						metadata: {}
					},
					contentChanges: [{
						range: new Range(0, 20, 0, 20),
						rangeOffset: 20,
						rangeLength: 0,
						text: '\nprint("Another line")\nprint("Yet another line")',
					}]
				})).toMatchSnapshot();
			});
		});
		describe('Cell with multiple line (crlf)', () => {
			const cells = [
				new NotebookCellData(NotebookCellKind.Code, 'print("Hello World")\r\nprint("Foo Bar")\r\nprint("Bar Baz")\r\nprint("Something Else")', 'python'),
			];
			let altDocSnapshot: IAlternativeNotebookDocumentSnapshot;
			let altDoc: IAlternativeNotebookDocument;
			let notebook: NotebookDocument;
			beforeEach(() => {
				({ altDocSnapshot, altDoc, notebook } = createNotebook(cells));
			});
			function getUpdatedAltText(e: TextDocumentChangeEvent): string {
				const newDoc = altDocSnapshot.withCellChanges(e.document, e.contentChanges);
				const edit = toAltNotebookCellChangeEdit(altDocSnapshot, e.document, e.contentChanges);
				const updatedAltText = newDoc.getText();
				altDoc.applyCellChanges(e.document, e.contentChanges);

				// Verify the alt text is updated correctly
				expect(updatedAltText).toBe(edit!.apply(altDocSnapshot.getText()));
				expect(updatedAltText).toBe(altDoc.getText());
				return updatedAltText;
			}
			test(`replace line`, async () => {
				expect(getUpdatedAltText({
					document: notebook.cellAt(0).document,
					reason: undefined,
					detailedReason: {
						source: 'cursor',
						metadata: {}
					},
					contentChanges: [{
						range: new Range(0, 0, 0, 20),
						rangeOffset: 0,
						rangeLength: 20,
						text: '# Top level imports',
					}]
				})).toMatchSnapshot();
			});
			test(`replace multiple lines`, async () => {
				expect(getUpdatedAltText({
					document: notebook.cellAt(0).document,
					reason: undefined,
					detailedReason: {
						source: 'cursor',
						metadata: {}
					},
					contentChanges: [{
						range: new Range(1, 7, 1, 14),
						rangeOffset: 29,
						rangeLength: 7,
						text: 'Say Something',
					}, {
						range: new Range(0, 0, 0, 20),
						rangeOffset: 0,
						rangeLength: 20,
						text: '# Top level print statements',
					}]
				})).toMatchSnapshot();
			});
			test(`replace text with smaller text`, async () => {
				expect(getUpdatedAltText({
					document: notebook.cellAt(0).document,
					reason: undefined,
					detailedReason: {
						source: 'cursor',
						metadata: {}
					},
					contentChanges: [{
						range: new Range(0, 7, 0, 18),
						rangeOffset: 7,
						rangeLength: 11,
						text: 'Foo Bar',
					}]
				})).toMatchSnapshot();
			});
			test(`replace text with larger text`, async () => {
				expect(getUpdatedAltText({
					document: notebook.cellAt(0).document,
					reason: undefined,
					detailedReason: {
						source: 'cursor',
						metadata: {}
					},
					contentChanges: [{
						range: new Range(0, 7, 0, 18),
						rangeOffset: 7,
						rangeLength: 11,
						text: 'This is a longer piece of text',
					}]
				})).toMatchSnapshot();
			});
			test(`replace while inserting a few lines`, async () => {
				expect(getUpdatedAltText({
					document: notebook.cellAt(0).document,
					reason: undefined,
					detailedReason: {
						source: 'cursor',
						metadata: {}
					},
					contentChanges: [{
						range: new Range(0, 7, 0, 20),
						rangeOffset: 7,
						rangeLength: 13,
						text: 'Foo Bar")\r\nprint("Another line")\r\nprint("Yet another line")',
					}]
				})).toMatchSnapshot();
			});
			test(`insert a few lines`, async () => {
				expect(getUpdatedAltText({
					document: notebook.cellAt(0).document,
					reason: undefined,
					detailedReason: {
						source: 'cursor',
						metadata: {}
					},
					contentChanges: [{
						range: new Range(0, 20, 0, 20),
						rangeOffset: 20,
						rangeLength: 0,
						text: '\nprint("Another line")\nprint("Yet another line")',
					}]
				})).toMatchSnapshot();
			});
			test(`remove a line`, async () => {
				expect(getUpdatedAltText({
					document: notebook.cellAt(0).document,
					reason: undefined,
					detailedReason: {
						source: 'cursor',
						metadata: {}
					},
					contentChanges: [{
						range: new Range(0, 20, 1, 16),
						rangeOffset: 20,
						rangeLength: 18,
						text: '',
					}]
				})).toMatchSnapshot();
			});
			test(`remove two lines`, async () => {
				expect(getUpdatedAltText({
					document: notebook.cellAt(0).document,
					reason: undefined,
					detailedReason: {
						source: 'cursor',
						metadata: {}
					},
					contentChanges: [{
						range: new Range(0, 20, 2, 16),
						rangeOffset: 20,
						rangeLength: 36,
						text: '',
					}]
				})).toMatchSnapshot();
			});
			test(`merge two lines`, async () => {
				expect(getUpdatedAltText({
					document: notebook.cellAt(0).document,
					reason: undefined,
					detailedReason: {
						source: 'cursor',
						metadata: {}
					},
					contentChanges: [{
						range: new Range(0, 20, 1, 0),
						rangeOffset: 20,
						rangeLength: 2,
						text: '',
					}]
				})).toMatchSnapshot();
			});
		});
		describe('Cell with multiple line (lf)', () => {
			const cells = [
				new NotebookCellData(NotebookCellKind.Code, 'print("Hello World")\nprint("Foo Bar")\nprint("Bar Baz")\nprint("Something Else")', 'python'),
			];
			let altDocSnapshot: IAlternativeNotebookDocumentSnapshot;
			let altDoc: IAlternativeNotebookDocument;
			let notebook: NotebookDocument;
			beforeEach(() => {
				({ altDocSnapshot, altDoc, notebook } = createNotebook(cells));
			});
			function getUpdatedAltText(e: TextDocumentChangeEvent): string {
				const newDoc = altDocSnapshot.withCellChanges(e.document, e.contentChanges);
				const edit = toAltNotebookCellChangeEdit(altDocSnapshot, e.document, e.contentChanges);
				altDoc.applyCellChanges(e.document, e.contentChanges);

				const updatedAltText = newDoc.getText();

				// Verify the alt text is updated correctly
				expect(updatedAltText).toBe(edit!.apply(altDocSnapshot.getText()));

				return updatedAltText;
			}
			test(`replace line`, async () => {
				expect(getUpdatedAltText({
					document: notebook.cellAt(0).document,
					reason: undefined,
					detailedReason: {
						source: 'cursor',
						metadata: {}
					},
					contentChanges: [{
						range: new Range(0, 0, 0, 20),
						rangeOffset: 0,
						rangeLength: 20,
						text: '# Top level imports',
					}]
				})).toMatchSnapshot();
			});
			test(`replace multiple lines`, async () => {
				expect(getUpdatedAltText({
					document: notebook.cellAt(0).document,
					reason: undefined,
					detailedReason: {
						source: 'cursor',
						metadata: {}
					},
					contentChanges: [{
						range: new Range(1, 7, 1, 14),
						rangeOffset: 28,
						rangeLength: 7,
						text: 'Say Something',
					}, {
						range: new Range(0, 0, 0, 20),
						rangeOffset: 0,
						rangeLength: 20,
						text: '# Top level print statements',
					}]
				})).toMatchSnapshot();
			});
			test(`replace text with smaller text`, async () => {
				expect(getUpdatedAltText({
					document: notebook.cellAt(0).document,
					reason: undefined,
					detailedReason: {
						source: 'cursor',
						metadata: {}
					},
					contentChanges: [{
						range: new Range(0, 7, 0, 18),
						rangeOffset: 7,
						rangeLength: 11,
						text: 'Foo Bar',
					}]
				})).toMatchSnapshot();
			});
			test(`replace text with larger text`, async () => {
				expect(getUpdatedAltText({
					document: notebook.cellAt(0).document,
					reason: undefined,
					detailedReason: {
						source: 'cursor',
						metadata: {}
					},
					contentChanges: [{
						range: new Range(0, 7, 0, 18),
						rangeOffset: 7,
						rangeLength: 11,
						text: 'This is a longer piece of text',
					}]
				})).toMatchSnapshot();
			});
			test(`replace while inserting a few lines`, async () => {
				expect(getUpdatedAltText({
					document: notebook.cellAt(0).document,
					reason: undefined,
					detailedReason: {
						source: 'cursor',
						metadata: {}
					},
					contentChanges: [{
						range: new Range(0, 7, 0, 20),
						rangeOffset: 7,
						rangeLength: 13,
						text: 'Foo Bar")\nprint("Another line")\nprint("Yet another line")',
					}]
				})).toMatchSnapshot();
			});
			test(`insert a few lines`, async () => {
				expect(getUpdatedAltText({
					document: notebook.cellAt(0).document,
					reason: undefined,
					detailedReason: {
						source: 'cursor',
						metadata: {}
					},
					contentChanges: [{
						range: new Range(0, 20, 0, 20),
						rangeOffset: 20,
						rangeLength: 0,
						text: '\nprint("Another line")\nprint("Yet another line")',
					}]
				})).toMatchSnapshot();
			});
			test(`remove a line`, async () => {
				expect(getUpdatedAltText({
					document: notebook.cellAt(0).document,
					reason: undefined,
					detailedReason: {
						source: 'cursor',
						metadata: {}
					},
					contentChanges: [{
						range: new Range(0, 20, 1, 16),
						rangeOffset: 20,
						rangeLength: 17,
						text: '',
					}]
				})).toMatchSnapshot();
			});
			test(`remove two lines`, async () => {
				expect(getUpdatedAltText({
					document: notebook.cellAt(0).document,
					reason: undefined,
					detailedReason: {
						source: 'cursor',
						metadata: {}
					},
					contentChanges: [{
						range: new Range(0, 20, 2, 16),
						rangeOffset: 20,
						rangeLength: 34,
						text: '',
					}]
				})).toMatchSnapshot();
			});
			test(`merge two lines`, async () => {
				expect(getUpdatedAltText({
					document: notebook.cellAt(0).document,
					reason: undefined,
					detailedReason: {
						source: 'cursor',
						metadata: {}
					},
					contentChanges: [{
						range: new Range(0, 20, 1, 0),
						rangeOffset: 20,
						rangeLength: 1,
						text: '',
					}]
				})).toMatchSnapshot();
			});
		});
		describe('Cells with multiple line (lf)', () => {
			const cells = [
				new NotebookCellData(NotebookCellKind.Code, 'print("Foo Bar")', 'python'),
				new NotebookCellData(NotebookCellKind.Code, 'print("Bar Baz")', 'python'),
				new NotebookCellData(NotebookCellKind.Code, 'print("Hello World")\nprint("Foo Bar2")\nprint("Bar Baz2")\nprint("Something Else")', 'python'),
			];
			let altDocSnapshot: IAlternativeNotebookDocumentSnapshot;
			let altDoc: IAlternativeNotebookDocument;
			let notebook: NotebookDocument;
			beforeEach(() => {
				({ altDocSnapshot, altDoc, notebook } = createNotebook(cells));
			});
			function getUpdatedAltText(e: TextDocumentChangeEvent): string {
				const newDoc = altDocSnapshot.withCellChanges(e.document, e.contentChanges);
				const edit = toAltNotebookCellChangeEdit(altDocSnapshot, e.document, e.contentChanges);
				const updatedAltText = newDoc.getText();
				altDoc.applyCellChanges(e.document, e.contentChanges);

				// Verify the alt text is updated correctly
				expect(updatedAltText).toBe(edit!.apply(altDocSnapshot.getText()));
				expect(updatedAltText).toBe(altDoc.getText());

				return updatedAltText;
			}
			test(`replace text in last cell`, async () => {
				expect(getUpdatedAltText({
					document: notebook.cellAt(2).document,
					reason: undefined,
					detailedReason: {
						source: 'cursor',
						metadata: {}
					},
					contentChanges: [{
						range: new Range(0, 7, 0, 18),
						rangeOffset: 7,
						rangeLength: 11,
						text: 'Bye bye World',
					}]
				})).toMatchSnapshot();
			});
			// test(`replace multiple lines`, async () => {
			// 	expect(getUpdatedAltText({
			// 		document: notebook.cellAt(0).document,
			// 		reason: undefined,
			// 		detailedReason: {
			// 			source: 'cursor',
			// 			metadata: {}
			// 		},
			// 		contentChanges: [{
			// 			range: new Range(1, 7, 1, 14),
			// 			rangeOffset: 28,
			// 			rangeLength: 7,
			// 			text: 'Say Something',
			// 		}, {
			// 			range: new Range(0, 0, 0, 20),
			// 			rangeOffset: 0,
			// 			rangeLength: 20,
			// 			text: '# Top level print statements',
			// 		}]
			// 	})).toMatchSnapshot();
			// });
			// test(`replace text with smaller text`, async () => {
			// 	expect(getUpdatedAltText({
			// 		document: notebook.cellAt(0).document,
			// 		reason: undefined,
			// 		detailedReason: {
			// 			source: 'cursor',
			// 			metadata: {}
			// 		},
			// 		contentChanges: [{
			// 			range: new Range(0, 7, 0, 18),
			// 			rangeOffset: 7,
			// 			rangeLength: 11,
			// 			text: 'Foo Bar',
			// 		}]
			// 	})).toMatchSnapshot();
			// });
			// test(`replace text with larger text`, async () => {
			// 	expect(getUpdatedAltText({
			// 		document: notebook.cellAt(0).document,
			// 		reason: undefined,
			// 		detailedReason: {
			// 			source: 'cursor',
			// 			metadata: {}
			// 		},
			// 		contentChanges: [{
			// 			range: new Range(0, 7, 0, 18),
			// 			rangeOffset: 7,
			// 			rangeLength: 11,
			// 			text: 'This is a longer piece of text',
			// 		}]
			// 	})).toMatchSnapshot();
			// });
			// test(`replace while inserting a few lines`, async () => {
			// 	expect(getUpdatedAltText({
			// 		document: notebook.cellAt(0).document,
			// 		reason: undefined,
			// 		detailedReason: {
			// 			source: 'cursor',
			// 			metadata: {}
			// 		},
			// 		contentChanges: [{
			// 			range: new Range(0, 7, 0, 20),
			// 			rangeOffset: 7,
			// 			rangeLength: 13,
			// 			text: 'Foo Bar")\nprint("Another line")\nprint("Yet another line")',
			// 		}]
			// 	})).toMatchSnapshot();
			// });
			// test(`insert a few lines`, async () => {
			// 	expect(getUpdatedAltText({
			// 		document: notebook.cellAt(0).document,
			// 		reason: undefined,
			// 		detailedReason: {
			// 			source: 'cursor',
			// 			metadata: {}
			// 		},
			// 		contentChanges: [{
			// 			range: new Range(0, 20, 0, 20),
			// 			rangeOffset: 20,
			// 			rangeLength: 0,
			// 			text: '\nprint("Another line")\nprint("Yet another line")',
			// 		}]
			// 	})).toMatchSnapshot();
			// });
			// test(`remove a line`, async () => {
			// 	expect(getUpdatedAltText({
			// 		document: notebook.cellAt(0).document,
			// 		reason: undefined,
			// 		detailedReason: {
			// 			source: 'cursor',
			// 			metadata: {}
			// 		},
			// 		contentChanges: [{
			// 			range: new Range(0, 20, 1, 16),
			// 			rangeOffset: 20,
			// 			rangeLength: 17,
			// 			text: '',
			// 		}]
			// 	})).toMatchSnapshot();
			// });
			// test(`remove two lines`, async () => {
			// 	expect(getUpdatedAltText({
			// 		document: notebook.cellAt(0).document,
			// 		reason: undefined,
			// 		detailedReason: {
			// 			source: 'cursor',
			// 			metadata: {}
			// 		},
			// 		contentChanges: [{
			// 			range: new Range(0, 20, 2, 16),
			// 			rangeOffset: 20,
			// 			rangeLength: 34,
			// 			text: '',
			// 		}]
			// 	})).toMatchSnapshot();
			// });
			// test(`merge two lines`, async () => {
			// 	expect(getUpdatedAltText({
			// 		document: notebook.cellAt(0).document,
			// 		reason: undefined,
			// 		detailedReason: {
			// 			source: 'cursor',
			// 			metadata: {}
			// 		},
			// 		contentChanges: [{
			// 			range: new Range(0, 20, 1, 0),
			// 			rangeOffset: 20,
			// 			rangeLength: 1,
			// 			text: '',
			// 		}]
			// 	})).toMatchSnapshot();
			// });
		});
	});
	describe('Cell Add/Delete', () => {
		describe('Cell with 1 line', () => {
			const cells = [
				new NotebookCellData(NotebookCellKind.Code, 'print("Hello World")', 'python'),
			];
			let altDocSnapshot: IAlternativeNotebookDocumentSnapshot;
			let altDoc: IAlternativeNotebookDocument;
			let notebook: NotebookDocument;
			beforeEach(() => {
				({ altDocSnapshot, altDoc, notebook } = createNotebook(cells));
			});
			function getUpdatedAltText(e: NotebookDocumentContentChange[]): string {
				const originalText = altDocSnapshot.getText();
				const newDoc = altDocSnapshot.withNotebookChanges(e);
				const edit = toAltNotebookChangeEdit(altDocSnapshot, e);
				const updatedAltText = newDoc.getText();
				altDoc.applyNotebookChanges(e);
				if (edit) {
					// Verify the edit is generated correctly
					expect(edit.apply(originalText)).toBe(updatedAltText);
				}
				expect(altDoc.getText()).toBe(updatedAltText);
				return updatedAltText;
			}
			test(`remove cell`, async () => {
				expect(getUpdatedAltText([{
					addedCells: [],
					range: new NotebookRange(0, 1),
					removedCells: [notebook.cellAt(0)],
				}])).toMatchSnapshot();
			});
			test(`insert cell below`, async () => {
				const { notebook } = createNotebook(cells.concat([
					new NotebookCellData(NotebookCellKind.Code, 'print("Foo Bar")', 'python'),
				]));
				expect(getUpdatedAltText([{
					addedCells: [notebook.cellAt(1)],
					range: new NotebookRange(1, 1),
					removedCells: [],
				}])).toMatchSnapshot();
			});
			test(`insert a code cell and markdown cell`, async () => {
				const { notebook } = createNotebook(cells.concat([
					new NotebookCellData(NotebookCellKind.Code, 'print("Foo Bar")', 'python'),
					new NotebookCellData(NotebookCellKind.Markup, '# Foo Bar', 'markdown'),
				]));
				expect(getUpdatedAltText([{
					addedCells: [notebook.cellAt(1)],
					range: new NotebookRange(1, 1),
					removedCells: [],
				}])).toMatchSnapshot();
			});
			test(`insert a markdown cell`, async () => {
				const { notebook } = createNotebook(cells.concat([
					new NotebookCellData(NotebookCellKind.Markup, '# Foo Bar', 'markdown'),
				]));
				expect(getUpdatedAltText([{
					addedCells: [notebook.cellAt(1)],
					range: new NotebookRange(1, 1),
					removedCells: [],
				}])).toMatchSnapshot();
			});
			test(`insert cell above`, async () => {
				const { notebook } = createNotebook(cells.concat([
					new NotebookCellData(NotebookCellKind.Code, 'print("Foo Bar")', 'python'),
				]));
				expect(getUpdatedAltText([{
					addedCells: [notebook.cellAt(1)],
					range: new NotebookRange(0, 0),
					removedCells: [],
				}])).toMatchSnapshot();
			});
			test(`insert cells above`, async () => {
				const { notebook } = createNotebook(cells.concat([
					new NotebookCellData(NotebookCellKind.Code, 'print("Foo Bar")', 'python'),
					new NotebookCellData(NotebookCellKind.Code, 'print("Bar Baz")', 'python'),
				]));
				expect(getUpdatedAltText([{
					addedCells: [notebook.cellAt(1), notebook.cellAt(2)],
					range: new NotebookRange(0, 0),
					removedCells: [],
				}])).toMatchSnapshot();
			});
			test(`insert cells`, async () => {
				const { notebook } = createNotebook(cells.concat([
					new NotebookCellData(NotebookCellKind.Code, 'print("Foo Bar")', 'python'),
					new NotebookCellData(NotebookCellKind.Code, 'print("Bar Baz")', 'python'),
				]));
				expect(getUpdatedAltText([{
					addedCells: [notebook.cellAt(1), notebook.cellAt(2)],
					range: new NotebookRange(1, 1),
					removedCells: [],
				}])).toMatchSnapshot();
			});
			test(`remove and insert cell`, async () => {
				const { notebook } = createNotebook(cells.concat([
					new NotebookCellData(NotebookCellKind.Code, 'print("Foo Bar")', 'python'),
				]));
				expect(getUpdatedAltText([{
					addedCells: [notebook.cellAt(1)],
					range: new NotebookRange(0, 1),
					removedCells: [notebook.cellAt(0)],
				}])).toMatchSnapshot();
			});
			test(`remove and insert cells`, async () => {
				const { notebook } = createNotebook(cells.concat([
					new NotebookCellData(NotebookCellKind.Code, 'print("Foo Bar")', 'python'),
					new NotebookCellData(NotebookCellKind.Code, 'print("Bar Baz")', 'python'),
				]));
				expect(getUpdatedAltText([{
					addedCells: [notebook.cellAt(1), notebook.cellAt(2)],
					range: new NotebookRange(0, 1),
					removedCells: [notebook.cellAt(0)],
				}])).toMatchSnapshot();
			});
		});
		describe('Cell with multiple line (crlf)', () => {
			const cells = [
				new NotebookCellData(NotebookCellKind.Code, 'print("Hello World")', 'python'),
				new NotebookCellData(NotebookCellKind.Code, 'print("Hello World")\r\nprint("Foo Bar")\r\nprint("Bar Baz")\r\nprint("Something Else")', 'python'),
			];
			let altDocSnapshot: IAlternativeNotebookDocumentSnapshot;
			let altDoc: IAlternativeNotebookDocument;
			let notebook: NotebookDocument;
			beforeEach(() => {
				({ altDocSnapshot, altDoc, notebook } = createNotebook(cells));
			});
			function getUpdatedAltText(e: NotebookDocumentContentChange[]): string {
				const originalText = altDocSnapshot.getText();
				const newDoc = altDocSnapshot.withNotebookChanges(e);
				const edit = toAltNotebookChangeEdit(altDocSnapshot, e);
				altDoc.applyNotebookChanges(e);
				const updatedAltText = newDoc.getText();
				if (edit) {
					// Verify the edit is generated correctly
					expect(edit.apply(originalText)).toBe(updatedAltText);
				}
				expect(altDoc.getText()).toBe(updatedAltText);
				return updatedAltText;
			}
			test(`remove first cell`, async () => {
				expect(getUpdatedAltText([{
					addedCells: [],
					range: new NotebookRange(0, 1),
					removedCells: [notebook.cellAt(0)],
				}])).toMatchSnapshot();
			});
			test(`insert cell below`, async () => {
				const { notebook } = createNotebook(cells.concat([
					new NotebookCellData(NotebookCellKind.Code, 'print("Foo Bar")', 'python'),
				]));
				expect(getUpdatedAltText([{
					addedCells: [notebook.cellAt(2)],
					range: new NotebookRange(2, 2),
					removedCells: [],
				}])).toMatchSnapshot();
			});
			test(`insert cell middle`, async () => {
				const { notebook } = createNotebook(cells.concat([
					new NotebookCellData(NotebookCellKind.Code, 'print("Foo Bar")', 'python'),
				]));
				expect(getUpdatedAltText([{
					addedCells: [notebook.cellAt(2)],
					range: new NotebookRange(1, 1),
					removedCells: [],
				}])).toMatchSnapshot();
			});
			test(`insert cells middle`, async () => {
				const { notebook } = createNotebook(cells.concat([
					new NotebookCellData(NotebookCellKind.Code, 'print("Foo Bar")', 'python'),
					new NotebookCellData(NotebookCellKind.Code, '# Another Cell', 'python'),
				]));
				expect(getUpdatedAltText([{
					addedCells: [notebook.cellAt(2), notebook.cellAt(3)],
					range: new NotebookRange(1, 1),
					removedCells: [],
				}])).toMatchSnapshot();
			});
			test(`insert cell above`, async () => {
				const { notebook } = createNotebook(cells.concat([
					new NotebookCellData(NotebookCellKind.Code, 'print("Foo Bar")', 'python'),
				]));
				expect(getUpdatedAltText([{
					addedCells: [notebook.cellAt(1)],
					range: new NotebookRange(0, 0),
					removedCells: [],
				}])).toMatchSnapshot();
			});
			test(`insert cells above`, async () => {
				const { notebook } = createNotebook(cells.concat([
					new NotebookCellData(NotebookCellKind.Code, 'print("Foo Bar")', 'python'),
					new NotebookCellData(NotebookCellKind.Code, 'print("Bar Baz")', 'python'),
				]));
				expect(getUpdatedAltText([{
					addedCells: [notebook.cellAt(1), notebook.cellAt(2)],
					range: new NotebookRange(0, 0),
					removedCells: [],
				}])).toMatchSnapshot();
			});
			test(`insert cells`, async () => {
				const { notebook } = createNotebook(cells.concat([
					new NotebookCellData(NotebookCellKind.Code, 'print("Foo Bar")', 'python'),
					new NotebookCellData(NotebookCellKind.Code, 'print("Bar Baz")', 'python'),
				]));
				expect(getUpdatedAltText([{
					addedCells: [notebook.cellAt(1), notebook.cellAt(2)],
					range: new NotebookRange(1, 1),
					removedCells: [],
				}])).toMatchSnapshot();
			});
			test(`remove and insert cell`, async () => {
				const { notebook } = createNotebook(cells.concat([
					new NotebookCellData(NotebookCellKind.Code, 'print("Foo Bar")', 'python'),
				]));
				expect(getUpdatedAltText([{
					addedCells: [notebook.cellAt(1)],
					range: new NotebookRange(0, 1),
					removedCells: [notebook.cellAt(0)],
				}])).toMatchSnapshot();
			});
			test(`remove and insert cells`, async () => {
				const { notebook } = createNotebook(cells.concat([
					new NotebookCellData(NotebookCellKind.Code, 'print("Foo Bar")', 'python'),
					new NotebookCellData(NotebookCellKind.Code, 'print("Bar Baz")', 'python'),
				]));
				expect(getUpdatedAltText([{
					addedCells: [notebook.cellAt(1), notebook.cellAt(2)],
					range: new NotebookRange(0, 1),
					removedCells: [notebook.cellAt(0)],
				}])).toMatchSnapshot();
			});
		});
	});
});
