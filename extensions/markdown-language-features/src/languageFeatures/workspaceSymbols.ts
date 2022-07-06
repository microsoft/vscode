/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from '../util/dispose';
import { MdWorkspaceInfoCache } from '../util/workspaceCache';
import { IMdWorkspace } from '../workspace';
import { MdDocumentSymbolProvider } from './documentSymbols';

export class MdWorkspaceSymbolProvider extends Disposable implements vscode.WorkspaceSymbolProvider {

	private readonly _cache: MdWorkspaceInfoCache<vscode.SymbolInformation[]>;

	public constructor(
		symbolProvider: MdDocumentSymbolProvider,
		workspace: IMdWorkspace,
	) {
		super();

		this._cache = this._register(new MdWorkspaceInfoCache(workspace, doc => symbolProvider.provideDocumentSymbolInformation(doc)));
	}

	public async provideWorkspaceSymbols(query: string): Promise<vscode.SymbolInformation[]> {
		const allSymbols = (await this._cache.values()).flat();
		return allSymbols.filter(symbolInformation => symbolInformation.name.toLowerCase().indexOf(query.toLowerCase()) !== -1);
	}
}

export function registerWorkspaceSymbolSupport(
	workspace: IMdWorkspace,
	symbolProvider: MdDocumentSymbolProvider,
): vscode.Disposable {
	return vscode.languages.registerWorkspaceSymbolProvider(new MdWorkspaceSymbolProvider(symbolProvider, workspace));
}
