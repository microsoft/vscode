/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';

function wait(ms: number): Promise<void> {
	return new Promise(r => setTimeout(r, ms));
}

async function createNotebook(name: string) {
	const workspacePath = vscode.workspace.workspaceFolders![0].uri.fsPath;
	const notebookPath = path.join(workspacePath, name);
	child_process.execSync('echo \'\' > ' + notebookPath);
	await wait(500);
	await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(notebookPath));
}

export function randomTestActivate(context: vscode.ExtensionContext): any {
	context.subscriptions.push(vscode.commands.registerCommand('notebook-random-tests.createNotebook', async () => {
		await createNotebook('random_smoketest.random-nb');
	}));

	context.subscriptions.push(vscode.notebook.registerNotebookContentProvider('notebookRandomTest', {
		openNotebook: async (resource: vscode.Uri) => {
			const defaultData = <vscode.NotebookData>{
				languages: ['typescript'],
				metadata: new vscode.NotebookDocumentMetadata(),
				cells: [
					{
						source: 'code()',
						language: 'typescript',
						cellKind: vscode.NotebookCellKind.Code,
						outputs: [],
						metadata: new vscode.NotebookCellMetadata().with({ custom: { testCellMetadata: 123 } })
					},
					{
						source: 'Markdown Cell',
						language: 'markdown',
						cellKind: vscode.NotebookCellKind.Markdown,
						outputs: [],
						metadata: new vscode.NotebookCellMetadata().with({ custom: { testCellMetadata: 123 } })
					}
				]
			};

			if (resource.fsPath.replace(/\\/g, '/').includes('/test.random-nb')) {
				return defaultData;
			}

			const content = await vscode.workspace.fs.readFile(resource);
			try {
				const data: vscode.NotebookData = JSON.parse(content.toString());
				return data;
			} catch {
				return defaultData;
			}
		},
		resolveNotebook: async (_document: vscode.NotebookDocument) => {
			return;
		},
		saveNotebook: async (document: vscode.NotebookDocument, _cancellation: vscode.CancellationToken) => {
			const notebookData: vscode.NotebookData = {
				metadata: document.metadata,
				cells: document.cells.map(docCell => (<vscode.NotebookCellData>{
					source: docCell.document.getText(),
					language: docCell.language,
					cellKind: docCell.cellKind,
					outputs: docCell.outputs,
					metadata: docCell.metadata
				}))
			};

			await vscode.workspace.fs.writeFile(document.uri, Buffer.from(JSON.stringify(notebookData, undefined, '  ')));
		},
		saveNotebookAs: async (_targetResource: vscode.Uri, _document: vscode.NotebookDocument, _cancellation: vscode.CancellationToken) => {
			return;
		},
		backupNotebook: async (_document: vscode.NotebookDocument, _context: vscode.NotebookDocumentBackupContext, _cancellation: vscode.CancellationToken) => {
			return {
				id: '1',
				delete: () => { }
			};
		}
	}));

	context.subscriptions.push(vscode.notebook.registerNotebookKernelProvider({ filenamePattern: '*.random-nb' }, {
		provideKernels(_document: vscode.NotebookDocument, _token: vscode.CancellationToken) {
			return [new TestKernel()];
		}
	}));
}

class TestKernel {
	readonly label = 'notebookRandomTest';
	async executeAllCells(document: vscode.NotebookDocument) {
		for (let i = 0; i < document.cells.length; i++) {
			const edit = new vscode.WorkspaceEdit();
			edit.appendNotebookCellOutput(document.uri, i, [new vscode.NotebookCellOutput([getRandomOutput()])]);
			vscode.workspace.applyEdit(edit);
		}
	}

	async cancelAllCellsExecution() { }

	async executeCell(document: vscode.NotebookDocument, cell: vscode.NotebookCell | undefined) {
		if (!cell) {
			cell = document.cells[0];
		}

		const edit = new vscode.WorkspaceEdit();
		edit.appendNotebookCellOutput(document.uri, cell.index, [new vscode.NotebookCellOutput([getRandomOutput()])]);
		vscode.workspace.applyEdit(edit);
		return;
	}

	async cancelCellExecution() { }
}

function getRandomOutput(): vscode.NotebookCellOutputItem {
	const r = Math.random() > 0.5;
	return r ?
		new vscode.NotebookCellOutputItem('text/html', ['<div>html output</div>\n<img src="https://upload.wikimedia.org/wikipedia/en/4/4d/Microsoft_logo_%281980%29.png" />']) :
		new vscode.NotebookCellOutputItem('text/plain', ['text output']);
}
