/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';

export class Cell implements vscode.ICell {
	public outputs: vscode.IOutput[] = [];

	constructor(
		public source: string[],
		public cell_type: 'markdown' | 'code',
		private _outputs: vscode.IOutput[]
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

	insertDependencies(dependency: vscode.IOutput) {
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

export class JupyterNotebook implements vscode.INotebook {
	constructor(
		public metadata: vscode.IMetadata,
		public cells: Cell[]
	) {

	}
}

export class NotebookProvider implements vscode.NotebookProvider {
	private _onDidChangeNotebook = new vscode.EventEmitter<{ resource: vscode.Uri; notebook: vscode.INotebook; }>();
	onDidChangeNotebook: vscode.Event<{ resource: vscode.Uri; notebook: vscode.INotebook; }> = this._onDidChangeNotebook.event;
	private _notebooks: Map<string, JupyterNotebook> = new Map();

	constructor(private _extensionPath: string, private fillOutputs: boolean) {
	}

	async resolveNotebook(resource: vscode.Uri): Promise<vscode.INotebook | undefined> {
		if (this._notebooks.has(resource.fsPath)) {
			let notebook = this._notebooks.get(resource.fsPath);

			if (!this.fillOutputs) {
				notebook?.cells.forEach(cell => {
					cell.clearOutputs();
				});
			}

			return notebook;
		}

		let content = await vscode.workspace.fs.readFile(resource);
		try {
			let notebookJSON = JSON.parse(content.toString());

			let notebook = new JupyterNotebook(
				notebookJSON.metadata,
				notebookJSON.cells.map((rawCell: any) => {
					return new Cell(
						rawCell.source,
						rawCell.cell_type,
						rawCell.outputs
					);
				})
			);

			if (this.fillOutputs) {
				let preloadScript = false;

				notebook!.cells.forEach(cell => {
					if (cell.outputsFullFilled()) {
						return;
					}

					if (!preloadScript) {
						let containHTML = cell.containHTML();
						if (containHTML) {
							preloadScript = true;
							const scriptPathOnDisk = vscode.Uri.file(
								path.join(this._extensionPath, 'dist', 'ipywidgets.js')
							);

							let scriptUri = scriptPathOnDisk.with({ scheme: 'vscode-resource' });

							cell.insertDependencies(
								{
									'output_type': 'display_data',
									'data': {
										'text/html': [
											`<script src="${scriptUri}"></script>\n`,
										]
									}
								}
							);

							cell.fillInOutputs();
						} else {
							cell.fillInOutputs();
						}
					} else {
						cell.fillInOutputs();
					}
				});
			}

			this._notebooks.set(resource.fsPath, notebook);

			return Promise.resolve(notebook);
		} catch {
			return Promise.resolve(undefined);
		}
	}

	async executeNotebook(resource: vscode.Uri): Promise<void> {
		if (this._notebooks.has(resource.fsPath)) {
			let notebook = this._notebooks.get(resource.fsPath);
			let preloadScript = false;
			notebook!.cells.forEach(cell => {
				if (cell.outputsFullFilled()) {
					return;
				}

				if (!preloadScript) {
					let containHTML = cell.containHTML();
					if (containHTML) {
						preloadScript = true;
						const scriptPathOnDisk = vscode.Uri.file(
							path.join(this._extensionPath, 'dist', 'ipywidgets.js')
						);

						let scriptUri = scriptPathOnDisk.with({ scheme: 'vscode-resource' });

						cell.insertDependencies(
							{
								'output_type': 'display_data',
								'data': {
									'text/html': [
										`<script src="${scriptUri}"></script>\n`,
									]
								}
							}
						);

						cell.fillInOutputs();
					} else {
						cell.fillInOutputs();
					}
				} else {
					cell.fillInOutputs();
				}
			});
			this._onDidChangeNotebook.fire({ resource, notebook: notebook! });
		}

		return;
	}
}