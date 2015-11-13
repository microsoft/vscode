/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import AbstractSupport from './abstractProvider';
import * as Protocol from '../protocol';
import {createRequest, toRange} from '../typeConvertion';
import {CancellationToken, Uri, Range, WorkspaceSymbolProvider, SymbolInformation, SymbolKind} from 'vscode';


export default class OmnisharpWorkspaceSymbolProvider extends AbstractSupport implements WorkspaceSymbolProvider {

	public provideWorkspaceSymbols(search: string, token: CancellationToken): Promise<SymbolInformation[]> {

		return this._server.makeRequest<Protocol.FindSymbolsResponse>(Protocol.FindSymbols, <Protocol.FindSymbolsRequest> {
			Filter: search,
			Filename: ''
		}, token).then(res => {
			if (res && Array.isArray(res.QuickFixes)) {
				return res.QuickFixes.map(OmnisharpWorkspaceSymbolProvider._asSymbolInformation);
			}
		});
	}

	private static _asSymbolInformation(symbolInfo: Protocol.SymbolLocation): SymbolInformation {

		return new SymbolInformation(symbolInfo.Text, OmnisharpWorkspaceSymbolProvider._toKind(symbolInfo),
			toRange(symbolInfo),
			Uri.file(symbolInfo.FileName));
	}

	private static _toKind(symbolInfo: Protocol.SymbolLocation): SymbolKind {
		switch (symbolInfo.Kind) {
			case 'Method':
				return SymbolKind.Method;
			case 'Field':
			case 'Property':
				return SymbolKind.Field;
		}
		return SymbolKind.Class;
	}
}
