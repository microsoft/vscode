/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { workspace, Uri, WorkspaceSymbolProvider, SymbolInformation, SymbolKind, Range, CancellationToken } from 'vscode';

import * as Proto  from '../protocol';
import { ITypescriptServiceClient } from '../typescriptService';

let _kindMapping: { [kind: string]: SymbolKind } = Object.create(null);
_kindMapping['method'] = SymbolKind.Method;
_kindMapping['enum'] = SymbolKind.Enum;
_kindMapping['function'] = SymbolKind.Function;
_kindMapping['class'] = SymbolKind.Class;
_kindMapping['interface'] = SymbolKind.Interface;
_kindMapping['var'] = SymbolKind.Variable;

export default class TypeScriptWorkspaceSymbolProvider implements WorkspaceSymbolProvider {

	private client: ITypescriptServiceClient;
	private modeId: string;

	public constructor(client: ITypescriptServiceClient, modeId: string) {
		this.client = client;
		this.modeId = modeId;
	}

	public provideWorkspaceSymbols(search: string, token :CancellationToken): Promise<SymbolInformation[]> {
		// typescript wants to have a resource even when asking
		// general questions so we check all open documents for
		// one that is typescript'ish
		let uri: Uri;
		let documents = workspace.textDocuments;
		for (let document of documents) {
			if (document.languageId === this.modeId) {
				uri = document.uri;
				break;
			}
		}

		if (!uri) {
			return Promise.resolve<SymbolInformation[]>([]);
		}

		let args:Proto.NavtoRequestArgs = {
			file: this.client.asAbsolutePath(uri),
			searchValue: search
		};
		if (!args.file) {
			return Promise.resolve<SymbolInformation[]>([]);
		}
		return this.client.execute('navto', args, token).then((response):SymbolInformation[] => {
			let data = response.body;
			if (data) {
				let result: SymbolInformation[] = [];
				for (let item of data) {
					if (!item.containerName && item.kind === 'alias') {
						continue;
					}
					let range = new Range(item.start.line - 1, item.start.offset - 1, item.end.line - 1, item.end.offset - 1);
					let label = item.name;
					if (item.kind === 'method' || item.kind === 'function') {
						label += '()';
					}
					result.push(new SymbolInformation(label, _kindMapping[item.kind], range,
						this.client.asUrl(item.file), item.containerName));
				}
				return result;
			} else {
				return [];
			}

		}, (err) => {
			return [];
		});
	}
}