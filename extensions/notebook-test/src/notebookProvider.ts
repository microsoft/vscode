/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class Cell {
	public outputs: vscode.CellOutput[] = [];

	constructor(
		public source: string[],
		public cell_type: 'markdown' | 'code',
		private _outputs: vscode.CellOutput[]
	) {

	}

	containHTML() {
		return this._outputs && this._outputs.some(output => {
			if (output.output_type === 'display_data' && output.data['text/html']) {
				return true;
			}

			return false;
		});
	}

	insertDependencies(dependency: vscode.CellOutput) {
		this._outputs.unshift(dependency);
	}

	fillInOutputs() {
		if (this._outputs && this.outputs.length !== this._outputs.length) {
			this.outputs = this._outputs;
		}
	}

	outputsFullFilled() {
		return this._outputs && this.outputs.length === this._outputs.length;
	}

	clearOutputs() {
		this.outputs = [];
	}
}

export class JupyterNotebook {
	public mapping: Map<number, any> = new Map();
	constructor(
		public document: vscode.NotebookDocument,
		editor: vscode.NotebookEditor,
		notebookJSON: any
	) {
		let cells = notebookJSON.cells.map(((raw_cell: any) => {
			let managedCell = editor.createCell(
				raw_cell.source ? raw_cell.source.join('') : '',
				notebookJSON.metadata.language_info.name,
				raw_cell.cell_type,
				[]
			);

			this.mapping.set(managedCell.handle, raw_cell);
			return managedCell;
		}));

		editor.document.cells = cells;
	}

	execute(cell: vscode.NotebookCell | undefined) {
		if (cell) {
			let rawCell = this.mapping.get(cell.handle);

			cell.outputs = rawCell.outputs;
		}
	}
}

export class NotebookProvider implements vscode.NotebookProvider {
	private _onDidChangeNotebook = new vscode.EventEmitter<{ resource: vscode.Uri; notebook: vscode.NotebookDocument; }>();
	onDidChangeNotebook: vscode.Event<{ resource: vscode.Uri; notebook: vscode.NotebookDocument; }> = this._onDidChangeNotebook.event;
	private _notebooks: Map<string, JupyterNotebook> = new Map();

	constructor(private _extensionPath: string, private fillOutputs: boolean) {
	}

	async resolveNotebook(editor: vscode.NotebookEditor): Promise<void> {

		try {
			let content = await vscode.workspace.fs.readFile(editor.document.uri);
			let jupyterNotebook = new JupyterNotebook(editor.document, editor, JSON.parse(content.toString()));
			this._notebooks.set(editor.document.uri.toString(), jupyterNotebook);
		} catch {

		}
	}

	async executeCell(document: vscode.NotebookDocument, cell: vscode.NotebookCell | undefined): Promise<void> {
		let jupyterNotebook = this._notebooks.get(document.uri.toString());

		if (jupyterNotebook) {
			jupyterNotebook.execute(cell);
		}
	}

	// async resolveNotebook2(resource: vscode.Uri): Promise<vscode.NotebookDocument | undefined> {
	// 	if (this._notebooks.has(resource.fsPath)) {
	// 		let notebook = this._notebooks.get(resource.fsPath);

	// 		if (!this.fillOutputs) {
	// 			notebook?.cells.forEach(cell => {
	// 				cell.clearOutputs();
	// 			});
	// 		}

	// 		return notebook;
	// 	}

	// 	let content = await vscode.workspace.fs.readFile(resource);
	// 	try {
	// 		let notebookJSON = JSON.parse(content.toString());

	// 		let notebook = new JupyterNotebook(
	// 			notebookJSON.metadata,
	// 			notebookJSON.cells.map((rawCell: any) => {
	// 				return new Cell(
	// 					rawCell.source,
	// 					rawCell.cell_type,
	// 					rawCell.outputs
	// 				);
	// 			})
	// 		);

	// 		if (this.fillOutputs) {
	// 			let preloadScript = false;

	// 			notebook!.cells.forEach(cell => {
	// 				if (cell.outputsFullFilled()) {
	// 					return;
	// 				}

	// 				if (!preloadScript) {
	// 					let containHTML = cell.containHTML();
	// 					if (containHTML) {
	// 						preloadScript = true;
	// 						const scriptPathOnDisk = vscode.Uri.file(
	// 							path.join(this._extensionPath, 'dist', 'ipywidgets.js')
	// 						);

	// 						let scriptUri = scriptPathOnDisk.with({ scheme: 'vscode-resource' });

	// 						cell.insertDependencies(
	// 							{
	// 								'output_type': 'display_data',
	// 								'data': {
	// 									'text/html': [
	// 										`<script src="${scriptUri}"></script>\n`,
	// 									]
	// 								}
	// 							}
	// 						);

	// 						cell.fillInOutputs();
	// 					} else {
	// 						cell.fillInOutputs();
	// 					}
	// 				} else {
	// 					cell.fillInOutputs();
	// 				}
	// 			});
	// 		}

	// 		this._notebooks.set(resource.fsPath, notebook);

	// 		return Promise.resolve(notebook);
	// 	} catch {
	// 		return Promise.resolve(undefined);
	// 	}
	// }

	async executeNotebook(resource: vscode.Uri): Promise<void> {
		if (this.fillOutputs) {
			return;
		}

		// if (this._notebooks.has(resource.fsPath)) {
		// 	let notebook = this._notebooks.get(resource.fsPath);
		// 	let preloadScript = false;
		// 	notebook!.cells.forEach(cell => {
		// 		if (cell.outputsFullFilled()) {
		// 			return;
		// 		}

		// 		if (!preloadScript) {
		// 			let containHTML = cell.containHTML();
		// 			if (containHTML) {
		// 				preloadScript = true;
		// 				const scriptPathOnDisk = vscode.Uri.file(
		// 					path.join(this._extensionPath, 'dist', 'ipywidgets.js')
		// 				);

		// 				let scriptUri = scriptPathOnDisk.with({ scheme: 'vscode-resource' });

		// 				cell.insertDependencies(
		// 					{
		// 						'output_type': 'display_data',
		// 						'data': {
		// 							'text/html': [
		// 								`<script src="${scriptUri}"></script>\n`,
		// 							]
		// 						}
		// 					}
		// 				);

		// 				cell.fillInOutputs();
		// 			} else {
		// 				cell.fillInOutputs();
		// 			}
		// 		} else {
		// 			cell.fillInOutputs();
		// 		}
		// 	});
		// 	this._onDidChangeNotebook.fire({ resource, notebook: notebook! });
		// }

		return;
	}
}