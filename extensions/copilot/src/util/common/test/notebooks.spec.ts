/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri, NotebookCellData, NotebookCellKind, NotebookData } from '../../../vscodeTypes';
import { assert, describe, it } from 'vitest';
import { ExtHostNotebookDocumentData } from './shims/notebookDocument';
import { URI } from '../../vs/base/common/uri';
import { findCell, findNotebook, getNotebookAndCellFromUri, getNotebookCellOutput } from '../notebooks';


describe('Notebook Common', () => {
	it('Does not find notebook', async () => {
		const notebooks = createSampleNotebooks();

		assert.isUndefined(findNotebook(Uri.file('foo.ipynb'), notebooks));
	});

	it('Finds a notebook', async () => {
		const notebooks = createSampleNotebooks();

		assert.isObject(findNotebook(Uri.file('one.ipynb'), notebooks));
	});

	it('Finds a notebook', async () => {
		const notebooks = createSampleNotebooks();
		for (const notebook of notebooks) {
			for (const cell of notebook.getCells()) {
				const info = getNotebookAndCellFromUri(cell.document.uri, notebooks);
				assert.equal(info[0], notebook);
				assert.equal(info[1], cell);

				assert.equal(findCell(cell.document.uri, notebook), cell);

				assert.equal(findNotebook(cell.document.uri, notebooks), notebook);

				assert.isUndefined(getNotebookCellOutput(cell.document.uri, notebooks));
			}
		}
	});

	function createSampleNotebooks() {
		return [
			ExtHostNotebookDocumentData.fromNotebookData(URI.file('one.ipynb'), new NotebookData(createCells([['markdown', '# Hello'], ['markdown', '# Foo Bar'], ['code', 'print(1234)']])), 'jupyter-notebook').document,
			ExtHostNotebookDocumentData.fromNotebookData(URI.file('two.ipynb'), new NotebookData(createCells([['markdown', '# Title'], ['code', 'import sys'], ['code', 'sys.executable']])), 'jupyter-notebook').document,
			ExtHostNotebookDocumentData.fromNotebookData(URI.file('three.ipynb').with({ scheme: 'ssh' }), new NotebookData(createCells([['markdown', '# Title'], ['code', 'import sys'], ['code', 'sys.executable']])), 'jupyter-notebook').document,
		];
	}
	function createCells(cells: [kind: 'code' | 'markdown', code: string][]) {
		return cells.map(([kind, code]) => {
			return new NotebookCellData(kind === 'markdown' ? NotebookCellKind.Markup : NotebookCellKind.Code, code, kind === 'markdown' ? 'markdown' : 'python');
		});
	}
});
