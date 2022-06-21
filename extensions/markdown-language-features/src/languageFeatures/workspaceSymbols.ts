/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from '../util/dispose';
import { MdWorkspaceContents } from '../workspaceContents';
import { MdDocumentSymbolProvider } from './documentSymbols';
import { MdWorkspaceInfoCache } from '../util/workspaceCache';

export class MdWorkspaceSymbolProvider extends Disposable implements vscode.WorkspaceSymbolProvider {

	private readonly _cache: MdWorkspaceInfoCache<vscode.SymbolInformation[]>;

	public constructor(
		symbolProvider: MdDocumentSymbolProvider,
		workspaceContents: MdWorkspaceContents,
	) {
		super();

		this._cache = this._register(new MdWorkspaceInfoCache(workspaceContents, doc => symbolProvider.provideDocumentSymbolInformation(doc)));
	}

	public async provideWorkspaceSymbols(query: string): Promise<vscode.SymbolInformation[]> {
		const allSymbols = (await this._cache.values()).flat();
		return allSymbols.filter(symbolInformation => symbolInformation.name.toLowerCase().indexOf(query.toLowerCase()) !== -1);
	}
}

export function registerWorkspaceSymbolSupport(
	workspaceContents: MdWorkspaceContents,
	symbolProvider: MdDocumentSymbolProvider,
): vscode.Disposable {
	return vscode.languages.registerWorkspaceSymbolProvider(new MdWorkspaceSymbolProvider(symbolProvider, workspaceContents));
}
