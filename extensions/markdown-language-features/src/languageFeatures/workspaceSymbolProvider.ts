/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from '../util/dispose';
import { MdWorkspaceContents } from '../workspaceContents';
import { MdDocumentSymbolProvider } from './documentSymbolProvider';
import { MdWorkspaceCache } from './workspaceCache';

export class MdWorkspaceSymbolProvider extends Disposable implements vscode.WorkspaceSymbolProvider {

	private readonly _cache: MdWorkspaceCache<vscode.SymbolInformation[]>;

	public constructor(
		symbolProvider: MdDocumentSymbolProvider,
		workspaceContents: MdWorkspaceContents,
	) {
		super();

		this._cache = this._register(new MdWorkspaceCache(workspaceContents, doc => symbolProvider.provideDocumentSymbolInformation(doc)));
	}

	public async provideWorkspaceSymbols(query: string): Promise<vscode.SymbolInformation[]> {
		const allSymbols = (await this._cache.getAll()).flat();
		return allSymbols.filter(symbolInformation => symbolInformation.name.toLowerCase().indexOf(query.toLowerCase()) !== -1);
	}
}
