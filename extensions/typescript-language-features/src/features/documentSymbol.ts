/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import * as Proto from '../protocol';
import * as PConst from '../protocol.const';
import { ITypeScriptServiceClient } from '../typescriptService';
import * as typeConverters from '../utils/typeConverters';
import API from '../utils/api';

const getSymbolKind = (kind: string): vscode.SymbolKind => {
	switch (kind) {
		case PConst.Kind.module: return vscode.SymbolKind.Module;
		case PConst.Kind.class: return vscode.SymbolKind.Class;
		case PConst.Kind.enum: return vscode.SymbolKind.Enum;
		case PConst.Kind.interface: return vscode.SymbolKind.Interface;
		case PConst.Kind.memberFunction: return vscode.SymbolKind.Method;
		case PConst.Kind.memberVariable: return vscode.SymbolKind.Property;
		case PConst.Kind.memberGetAccessor: return vscode.SymbolKind.Property;
		case PConst.Kind.memberSetAccessor: return vscode.SymbolKind.Property;
		case PConst.Kind.variable: return vscode.SymbolKind.Variable;
		case PConst.Kind.const: return vscode.SymbolKind.Variable;
		case PConst.Kind.localVariable: return vscode.SymbolKind.Variable;
		case PConst.Kind.variable: return vscode.SymbolKind.Variable;
		case PConst.Kind.function: return vscode.SymbolKind.Function;
		case PConst.Kind.localFunction: return vscode.SymbolKind.Function;
	}
	return vscode.SymbolKind.Variable;
};

class TypeScriptDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
	public constructor(
		private readonly client: ITypeScriptServiceClient) { }

	public async provideDocumentSymbols(resource: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.DocumentSymbol[] | vscode.SymbolInformation[]> {
		const filepath = this.client.toPath(resource.uri);
		if (!filepath) {
			return [];
		}
		const args: Proto.FileRequestArgs = {
			file: filepath
		};

		try {
			if (this.client.apiVersion.gte(API.v206)) {
				const response = await this.client.execute('navtree', args, token);
				if (response.body) {
					// The root represents the file. Ignore this when showing in the UI
					const tree = response.body;
					if (tree.childItems) {
						const result = new Array<vscode.DocumentSymbol>();
						tree.childItems.forEach(item => TypeScriptDocumentSymbolProvider.convertNavTree(resource.uri, result, item));
						return result;
					}
				}
			} else {
				const response = await this.client.execute('navbar', args, token);
				if (response.body) {
					const result = new Array<vscode.SymbolInformation>();
					const foldingMap: ObjectMap<vscode.SymbolInformation> = Object.create(null);
					response.body.forEach(item => TypeScriptDocumentSymbolProvider.convertNavBar(resource.uri, 0, foldingMap, result as vscode.SymbolInformation[], item));
					return result;
				}
			}
			return [];
		} catch (e) {
			return [];
		}
	}

	private static convertNavBar(resource: vscode.Uri, indent: number, foldingMap: ObjectMap<vscode.SymbolInformation>, bucket: vscode.SymbolInformation[], item: Proto.NavigationBarItem, containerLabel?: string): void {
		const realIndent = indent + item.indent;
		const key = `${realIndent}|${item.text}`;
		if (realIndent !== 0 && !foldingMap[key] && TypeScriptDocumentSymbolProvider.shouldInclueEntry(item)) {
			const result = new vscode.SymbolInformation(item.text,
				getSymbolKind(item.kind),
				containerLabel ? containerLabel : '',
				typeConverters.Location.fromTextSpan(resource, item.spans[0]));
			foldingMap[key] = result;
			bucket.push(result);
		}
		if (item.childItems && item.childItems.length > 0) {
			for (const child of item.childItems) {
				TypeScriptDocumentSymbolProvider.convertNavBar(resource, realIndent + 1, foldingMap, bucket, child, item.text);
			}
		}
	}

	private static convertNavTree(resource: vscode.Uri, bucket: vscode.DocumentSymbol[], item: Proto.NavigationTree): boolean {
		const symbolInfo = new vscode.DocumentSymbol(
			item.text,
			'',
			getSymbolKind(item.kind),
			typeConverters.Range.fromTextSpan(item.spans[0]),
			typeConverters.Range.fromTextSpan(item.spans[0]),
		);

		let shouldInclude = TypeScriptDocumentSymbolProvider.shouldInclueEntry(item);

		if (item.childItems) {
			for (const child of item.childItems) {
				const includedChild = TypeScriptDocumentSymbolProvider.convertNavTree(resource, symbolInfo.children, child);
				shouldInclude = shouldInclude || includedChild;
			}
		}

		if (shouldInclude) {
			bucket.push(symbolInfo);
		}
		return shouldInclude;
	}

	private static shouldInclueEntry(item: Proto.NavigationTree | Proto.NavigationBarItem): boolean {
		if (item.kind === PConst.Kind.alias) {
			return false;
		}
		return !!(item.text && item.text !== '<function>' && item.text !== '<class>');
	}
}


export function register(
	selector: vscode.DocumentSelector,
	client: ITypeScriptServiceClient,
) {
	return vscode.languages.registerDocumentSymbolProvider(selector,
		new TypeScriptDocumentSymbolProvider(client));
}
