/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ExtHostNotebookShape, IMainContext, MainThreadNotebookShape, MainContext } from 'vs/workbench/api/common/extHost.protocol';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { Disposable as VSCodeDisposable } from './extHostTypes';
import { INotebook } from 'vs/editor/common/modes';
import { URI } from 'vs/base/common/uri';
import { DisposableStore } from 'vs/base/common/lifecycle';

export class ExtHostCell implements vscode.ICell {
	private static _handlePool: number = 0;
	readonly handle = ExtHostCell._handlePool++;

	source: string[];
	cell_type: 'markdown' | 'code';
	outputs: any[];

	constructor(
		raw_cell: vscode.ICell
	) {
		this.source = raw_cell.source;
		this.cell_type = raw_cell.cell_type;
		this.outputs = raw_cell.outputs;
	}
}

export class ExtHostNotebook implements vscode.INotebook {
	private static _handlePool: number = 0;
	readonly handle = ExtHostNotebook._handlePool++;
	public cells: ExtHostCell[];
	public cellMapping: Map<vscode.ICell, ExtHostCell> = new Map();

	constructor(
		public metadata: vscode.IMetadata,
		private raw_cells: vscode.ICell[]
	) {
		this.cells = raw_cells.map(cell => {
			let extHostCell = new ExtHostCell(cell);
			this.cellMapping.set(cell, extHostCell);
			return extHostCell;
		});
	}

	updateCells(newCells: vscode.ICell[]) {
		newCells.forEach(cell => {
			let extHostCell = this.cellMapping.get(cell);

			if (extHostCell) {
				extHostCell.outputs = cell.outputs;
			}
		});

		// trigger update
	}
}

export class ExtHostNotebookController implements ExtHostNotebookShape {
	private readonly _proxy: MainThreadNotebookShape;
	private readonly _notebookProviders = new Map<string, { readonly provider: vscode.NotebookProvider, readonly extension: IExtensionDescription }>();
	private readonly _notebookCache = new Map<string, ExtHostNotebook>();
	private readonly _localStore = new DisposableStore();

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadNotebook);
	}

	public registerNotebookProvider(
		extension: IExtensionDescription,
		viewType: string,
		provider: vscode.NotebookProvider,
	): vscode.Disposable {

		if (this._notebookProviders.has(viewType)) {
			throw new Error(`Notebook provider for '${viewType}' already registered`);
		}

		this._notebookProviders.set(viewType, { extension, provider });
		this._proxy.$registerNotebookProvider({ id: extension.identifier, location: extension.extensionLocation }, viewType);

		if (provider.onDidChangeNotebook) {
			this._localStore.add(provider.onDidChangeNotebook!((e) => {
				let resource = e.resource;
				let notebook = e.notebook;

				let cachedNotebook = this._notebookCache.get(resource.toString());

				if (cachedNotebook) {
					cachedNotebook.updateCells(notebook.cells);

					this._proxy.$updateNotebook(viewType, resource, cachedNotebook);
				}
			}));
		}

		return new VSCodeDisposable(() => {
			this._notebookProviders.delete(viewType);
			this._proxy.$unregisterNotebookProvider(viewType);
		});
	}

	async $resolveNotebook(viewType: string, uri: URI): Promise<INotebook | undefined> {
		let provider = this._notebookProviders.get(viewType);

		if (provider) {
			let notebook = await provider.provider.resolveNotebook(uri);
			if (notebook) {
				let extHostNotebook = new ExtHostNotebook(notebook.metadata, notebook.cells);
				this._notebookCache.set(uri.toString(), extHostNotebook);
				return extHostNotebook;
			}
		}

		return Promise.resolve(undefined);
	}

	async $executeNotebook(viewType: string, uri: URI): Promise<void> {
		let provider = this._notebookProviders.get(viewType);

		if (provider) {
			return provider.provider.executeNotebook(uri);
		}
	}
}
