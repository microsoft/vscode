/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import * as Proto from '../protocol';
import * as PConst from '../protocol.const';
import { ITypeScriptServiceClient } from '../typescriptService';
import * as typeConverters from '../utils/typeConverters';

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

	public async provideDocumentSymbols(resource: vscode.TextDocument, token: vscode.CancellationToken): Promise<any> { // todo@joh `any[]` temporary hack to make typescript happy...
		const filepath = this.client.normalizePath(resource.uri);
		if (!filepath) {
			return [];
		}
		const args: Proto.FileRequestArgs = {
			file: filepath
		};

		try {
			if (this.client.apiVersion.has206Features()) {
				const response = await this.client.execute('navtree', args, token);
				if (response.body) {
					// The root represents the file. Ignore this when showing in the UI
					const tree = response.body;
					if (tree.childItems) {
						const result = new Array<vscode.Hierarchy<vscode.SymbolInformation2>>();
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

	private static convertNavTree(resource: vscode.Uri, bucket: vscode.Hierarchy<vscode.SymbolInformation>[], item: Proto.NavigationTree): boolean {
		const symbolInfo = new vscode.SymbolInformation2(
			item.text,
			'', // todo@joh detail
			getSymbolKind(item.kind),
			typeConverters.Range.fromTextSpan(item.spans[0]),
			typeConverters.Location.fromTextSpan(resource, item.spans[0]),
		);

		const hierarchy = new vscode.Hierarchy(symbolInfo);
		let shouldInclude = TypeScriptDocumentSymbolProvider.shouldInclueEntry(item);

		if (item.childItems) {
			for (const child of item.childItems) {
				const includedChild = TypeScriptDocumentSymbolProvider.convertNavTree(resource, hierarchy.children, child);
				shouldInclude = shouldInclude || includedChild;
			}
		}

		if (shouldInclude) {
			bucket.push(hierarchy);
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
