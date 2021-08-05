/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { createRandomFile } from '../utils';

suite.only('ipynb NotebookSerializer', function () {
	test('Can open an ipynb notebook', async () => {
		console.log(`1`);
		assert.ok(vscode.workspace.workspaceFolders);
		const workspace = vscode.workspace.workspaceFolders[0];
		const uri = vscode.Uri.joinPath(workspace.uri, 'test.ipynb');
		console.log(`2`);
		console.log(uri.toString());
		const stat = await vscode.workspace.fs.stat(uri);
		console.log(`2a`);
		console.log('stat', stat);
		console.log('size:' + stat.size);
		const notebook = await vscode.workspace.openNotebookDocument(uri);
		console.log(`3`);
		await vscode.window.showNotebookDocument(notebook);
		console.log(`4`);

		const notebookEditor = vscode.window.activeNotebookEditor;
		assert.ok(notebookEditor);

		assert.strictEqual(notebookEditor.document.cellCount, 2);
		assert.strictEqual(notebookEditor.document.cellAt(0).kind, vscode.NotebookCellKind.Markup);
		assert.strictEqual(notebookEditor.document.cellAt(1).kind, vscode.NotebookCellKind.Code);
		assert.strictEqual(notebookEditor.document.cellAt(1).outputs.length, 1);
		console.log(`5`);
	});

	test('Can open an ipynb notebook - tmp empty', async () => {
		console.log(`1`);
		const randomFile = await createRandomFile('', undefined, '.ipynb');
		console.log(`2`);
		const notebook = await vscode.workspace.openNotebookDocument(randomFile);
		console.log(`3`);
		await vscode.window.showNotebookDocument(notebook);
		console.log(`4`);

		const notebookEditor = vscode.window.activeNotebookEditor;
		assert.ok(notebookEditor);

		assert.strictEqual(notebookEditor.document.cellCount, 1);
		assert.strictEqual(notebookEditor.document.cellAt(0).kind, vscode.NotebookCellKind.Code);
		console.log(`5`);
	});

	test('Can open an ipynb notebook - tmp contents', async () => {
		const contents = `
{
 "cells": [
  {
   "cell_type": "markdown",
   "source": [
    "## Header"
   ],
   "metadata": {}
  },
  {
   "cell_type": "code",
   "execution_count": 2,
   "source": [
    "print('hello 1')\n",
    "print('hello 2')"
   ],
   "outputs": [
    {
     "output_type": "stream",
     "name": "stdout",
     "text": [
      "hello 1\n",
      "hello 2\n"
     ]
    }
   ],
   "metadata": {}
  }
 ],
 "metadata": {
  "interpreter": {
   "hash": "815c6b7592bf74925ca002a1774bcf064bae9d6a27e7933fd9109275fb484258"
  },
  "kernelspec": {
   "name": "python3",
   "display_name": "Python 3.9.5 64-bit ('myvenv': venv)"
  },
  "language_info": {
   "codemirror_mode": {
    "name": "ipython",
    "version": 3
   },
   "file_extension": ".py",
   "mimetype": "text/x-python",
   "name": "python",
   "nbconvert_exporter": "python",
   "pygments_lexer": "ipython3",
   "version": "3.9.5"
  }
 },
 "nbformat": 4,
 "nbformat_minor": 4
} `;
		console.log(`1`);
		const randomFile = await createRandomFile(contents, undefined, '.ipynb');
		console.log(`2`);
		const notebook = await vscode.workspace.openNotebookDocument(randomFile);
		console.log(`3`);
		await vscode.window.showNotebookDocument(notebook);
		console.log(`4`);

		const notebookEditor = vscode.window.activeNotebookEditor;
		assert.ok(notebookEditor);

		assert.strictEqual(notebookEditor.document.cellCount, 1);
		assert.strictEqual(notebookEditor.document.cellAt(0).kind, vscode.NotebookCellKind.Code);
		console.log(`5`);
	});
});
