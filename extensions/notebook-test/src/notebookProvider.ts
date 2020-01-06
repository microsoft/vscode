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
						'%matplotlib inline\n',
						'from matplotlib import pyplot as plt\n',
						'import pandas as pd\n',
						'\n',
						's = pd.Series([1,2,3], index=[\'a\',\'b\',\'c\'])\n',
						'\n',
						's.plot.bar(figsize=(20,10))\n',
						'plt.xlabel(\'Foo\')\n',
						'plt.ylabel(\'Bar\')\n',
						'plt.title(\'Hello World\');\n'
					],
					'code',
					[
						{
							'data': {
								'image/png': [
									'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\n'
								],
								'text/plain': [
									'<Figure size 1440x720 with 1 Axes>'
								]
							},
							'metadata': {
								'needs_background': 'light'
							},
							'output_type': 'display_data'
						}
					],
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