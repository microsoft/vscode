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
	private _notebook: JupyterNotebook;
	private _notebooks: Map<vscode.Uri, JupyterNotebook> = new Map();

	constructor() {
		this._notebook = new JupyterNotebook(
			{
				language_info: {
					file_extension: 'ipynb'
				}
			},
			[
				new Cell([
					'# header\n',
					'body\n'
				],
					'markdown',
					[]
				),
				new Cell([
					'print(a)',
				],
					'code',
					[
						{
							'output_type': 'stream',
							'name': 'stdout',
							'text': 'hi, stdout\n'
						}
					]
				),
				new Cell(
					[
						'import time, sys\n',
						'for i in range(8):\n',
						'    print(i)\n',
						'    time.sleep(0.5)'
					],
					'code',
					[
						{
							'name': 'stdout',
							'text': '0\n',
							'output_type': 'stream'
						},
						{
							'name': 'stdout',
							'text': '1\n',
							'output_type': 'stream'
						},
						{
							'name': 'stdout',
							'text': '2\n',
							'output_type': 'stream'
						},
						{
							'name': 'stdout',
							'text': '3\n',
							'output_type': 'stream'
						},
						{
							'name': 'stdout',
							'text': '4\n',
							'output_type': 'stream'
						},
						{
							'name': 'stdout',
							'text': '5\n',
							'output_type': 'stream'
						},
						{
							'name': 'stdout',
							'text': '6\n',
							'output_type': 'stream'
						},
						{
							'name': 'stdout',
							'text': '7\n',
							'output_type': 'stream'
						}
					]
				),
				new Cell(
					[
						'print(a + 4)'
					],
					'code',
					[
						{
							'output_type': 'error',
							'ename': 'NameError',
							'evalue': 'name \'a\' is not defined',
							'traceback': [
								'\u001b[0;31m---------------------------------------------------------------------------\u001b[0m',
								'\u001b[0;31mNameError\u001b[0m                                 Traceback (most recent call last)',
								'\u001b[0;32m<ipython-input-1-f270cadddfe4>\u001b[0m in \u001b[0;36m<module>\u001b[0;34m\u001b[0m\n\u001b[0;32m----> 1\u001b[0;31m \u001b[0mprint\u001b[0m\u001b[0;34m(\u001b[0m\u001b[0ma\u001b[0m \u001b[0;34m+\u001b[0m \u001b[0;36m4\u001b[0m\u001b[0;34m)\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\u001b[0m',
								'\u001b[0;31mNameError\u001b[0m: name \'a\' is not defined'
							]
						}
					]
				)
			]
		);
	}

	async resolveNotebook(resource: vscode.Uri): Promise<vscode.INotebook | undefined> {
		if (this._notebooks.has(resource)) {
			return this._notebooks.get(resource);
		}

		this._notebooks.set(resource, this._notebook);

		return Promise.resolve(this._notebook);
	}

	async executeNotebook(resource: vscode.Uri): Promise<void> {
		this._notebook.cells.forEach(cell => cell.fillInOutputs());

		this._onDidChangeNotebook.fire({ resource, notebook: this._notebook });
		return;
	}
}