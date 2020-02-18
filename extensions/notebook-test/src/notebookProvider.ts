/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';

declare var TextEncoder: any;

// const mjAPI = require('mathjax-node');
// mjAPI.config({
// 	MathJax: {
// 		// traditional MathJax configuration
// 	}
// });
// mjAPI.start();

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
	private displayOrders = [
		'application/vnd.*',
		'application/json',
		'application/javascript',
		'text/html',
		'image/svg+xml',
		'text/markdown',
		'image/svg+xml',
		'image/png',
		'image/jpeg',
		'text/plain'
	];

	constructor(
		private _extensionPath: string,
		editor: vscode.NotebookEditor,
		public notebookJSON: any,
		private fillOutputs: boolean
	) {
		let cells = notebookJSON.cells.map(((raw_cell: any) => {
			let outputs = [];
			if (fillOutputs) {
				outputs = raw_cell.outputs;

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
			}


			let managedCell = editor.createCell(
				raw_cell.source ? raw_cell.source.join('') : '',
				notebookJSON?.metadata?.language_info?.name ?? 'python',
				raw_cell.cell_type,
				outputs
			);

			this.mapping.set(managedCell.handle, raw_cell);
			return managedCell;
		}));

		editor.document.languages = ['python'];
		editor.document.cells = cells;
		editor.document.displayOrder = this.displayOrders;
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
	// async latexRenderer(value: string): Promise<vscode.MarkdownString> {
	// 	return new Promise((resolve, reject) => {
	// 		mjAPI.typeset({
	// 			math: value,
	// 			format: 'inline-TeX', // or "inline-TeX", "MathML"
	// 			svg: true
	// 		}, function (data: any) {
	// 			if (!data.errors) {
	// 				var encodedData = Buffer.from(data.svg).toString('base64');
	// 				resolve(new vscode.MarkdownString(`![value](data:image/svg+xml;base64,${encodedData})`));
	// 			} else {
	// 				reject();
	// 			}
	// 		});
	// 	});
	// }

	async resolveNotebook(editor: vscode.NotebookEditor): Promise<void> {

		try {
			let content = await vscode.workspace.fs.readFile(editor.document.uri);
			let json: any = {};
			try {
				json = JSON.parse(content.toString());
			} catch {
				json = {
					cells: [{
						cell_type: 'markdown',
						source: [
							'# header'
						]
					}]
				};
			}
			let jupyterNotebook = new JupyterNotebook(this._extensionPath, editor, json, this.fillOutputs);
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
		let cells: any[] = [];

		for (let i = 0; i < document.cells.length; i++) {
			let lines = document.cells[i].getContent().split(/\r|\n|\r\n/g);
			let source = lines.map((value, index) => {
				if (index !== lines.length - 1) {
					return value + '\n';
				} else {
					return value;
				}
			});

			if (document.cells[i].cell_type === 'markdown') {
				cells.push({
					source: source,
					metadata: {
						language_info: {
							name: document.cells[i].language ?? 'markdown'
						}
					},
					cell_type: document.cells[i].cell_type
				});
			} else {
				cells.push({
					source: source,
					metadata: {
						language_info: {
							name: document.cells[i].language ?? 'markdown'
						}
					},
					cell_type: document.cells[i].cell_type,
					outputs: []
				});
			}
		}

		let raw = this._notebooks.get(document.uri.toString());

		if (raw) {
			raw.notebookJSON.cells = cells;
			let content = JSON.stringify(raw.notebookJSON, null, 4);
			await vscode.workspace.fs.writeFile(document.uri, new TextEncoder().encode(content));
		} else {
			let content = JSON.stringify({ cells: cells }, null, 4);
			await vscode.workspace.fs.writeFile(document.uri, new TextEncoder().encode(content));
		}

		return true;
	}
}