/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';

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
	private preloadScript = false;
	constructor(
		private _extensionPath: string,
		public document: vscode.NotebookDocument,
		editor: vscode.NotebookEditor,
		notebookJSON: any,
		private fillOutputs: boolean
	) {
		let cells = notebookJSON.cells.map(((raw_cell: any) => {
			let outputs = [];
			if (fillOutputs) {
				outputs = raw_cell.outputs;
			}

			if (!this.preloadScript) {
				let containHTML = this.containHTML(raw_cell);

				if (containHTML) {
					this.preloadScript = true;
					const scriptPathOnDisk = vscode.Uri.file(
						path.join(this._extensionPath, 'dist', 'ipywidgets.js')
					);

					let scriptUri = scriptPathOnDisk.with({ scheme: 'vscode-resource' });

					outputs.unshift(
						{
							'output_type': 'display_data',
							'data': {
								'text/html': [
									`<script src="${scriptUri}"></script>\n`,
								]
							}
						}
					);
				}
			}

			let managedCell = editor.createCell(
				raw_cell.source ? raw_cell.source.join('') : '',
				notebookJSON.metadata.language_info.name,
				raw_cell.cell_type,
				outputs
			);

			this.mapping.set(managedCell.handle, raw_cell);
			return managedCell;
		}));

		editor.document.languages = ['javascript'];
		editor.document.cells = cells;
	}

	execute(document: vscode.NotebookDocument, cell: vscode.NotebookCell | undefined) {
		if (cell) {
			let rawCell = this.mapping.get(cell.handle);

			if (!this.preloadScript) {
				let containHTML = this.containHTML(rawCell);
				if (containHTML) {
					this.preloadScript = true;
					const scriptPathOnDisk = vscode.Uri.file(
						path.join(this._extensionPath, 'dist', 'ipywidgets.js')
					);

					let scriptUri = scriptPathOnDisk.with({ scheme: 'vscode-resource' });

					rawCell.outputs.unshift(
						{
							'output_type': 'display_data',
							'data': {
								'text/html': [
									`<script src="${scriptUri}"></script>\n`,
								]
							}
						}
					);
				}
			}
			cell.outputs = rawCell.outputs;
		} else {
			if (!this.fillOutputs) {
				for (let i = 0; i < document.cells.length; i++) {
					let cell = document.cells[i];

					let rawCell = this.mapping.get(cell.handle);

					if (!this.preloadScript) {
						let containHTML = this.containHTML(rawCell);
						if (containHTML) {
							this.preloadScript = true;
							const scriptPathOnDisk = vscode.Uri.file(
								path.join(this._extensionPath, 'dist', 'ipywidgets.js')
							);

							let scriptUri = scriptPathOnDisk.with({ scheme: 'vscode-resource' });

							rawCell.outputs.unshift(
								{
									'output_type': 'display_data',
									'data': {
										'text/html': [
											`<script src="${scriptUri}"></script>\n`,
										]
									}
								}
							);
						}
					}
					cell.outputs = rawCell.outputs;
				}

				this.fillOutputs = true;
			}
		}
	}

	containHTML(rawCell: any) {
		return rawCell.outputs && rawCell.outputs.some((output: any) => {
			if (output.output_type === 'display_data' && output.data['text/html']) {
				return true;
			}

			return false;
		});
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
			let jupyterNotebook = new JupyterNotebook(this._extensionPath, editor.document, editor, JSON.parse(content.toString()), this.fillOutputs);
			this._notebooks.set(editor.document.uri.toString(), jupyterNotebook);
		} catch {

		}
	}

	async executeCell(document: vscode.NotebookDocument, cell: vscode.NotebookCell | undefined): Promise<void> {
		let jupyterNotebook = this._notebooks.get(document.uri.toString());

		if (jupyterNotebook) {
			jupyterNotebook.execute(document, cell);
		}
	}

	async save(document: vscode.NotebookDocument): Promise<boolean> {
		return true;
	}
}