/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class Cell implements vscode.ICell {
	public outputs: any[] = [];

	constructor(
		public source: string[],
		public cell_type: 'markdown' | 'code',
		private _outputs: any[]
	) {

	}

	fillInOutputs() {
		this.outputs = this._outputs;
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

	constructor() {
	}

	async resolveNotebook(resource: vscode.Uri): Promise<vscode.INotebook | undefined> {
		if (this._notebooks.has(resource.fsPath)) {
			return this._notebooks.get(resource.fsPath);
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

			this._notebooks.set(resource.fsPath, notebook);

			return Promise.resolve(notebook);
		} catch {
			return Promise.resolve(undefined);
		}
	}

	async executeNotebook(resource: vscode.Uri): Promise<void> {
		if (this._notebooks.has(resource.fsPath)) {
			let notebook = this._notebooks.get(resource.fsPath);
			notebook!.cells.forEach(cell => cell.fillInOutputs());
			this._onDidChangeNotebook.fire({ resource, notebook: notebook! });
		}

		return;
	}
}