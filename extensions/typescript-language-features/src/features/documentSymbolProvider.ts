/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentSymbolProvider, SymbolInformation, SymbolKind, TextDocument, CancellationToken, Uri, Hierarchy, SymbolInformation2 } from 'vscode';

import * as Proto from '../protocol';
import * as PConst from '../protocol.const';
import { ITypeScriptServiceClient } from '../typescriptService';
import * as typeConverters from '../utils/typeConverters';

const outlineTypeTable: { [kind: string]: SymbolKind } = Object.create(null);
outlineTypeTable[PConst.Kind.module] = SymbolKind.Module;
outlineTypeTable[PConst.Kind.class] = SymbolKind.Class;
outlineTypeTable[PConst.Kind.enum] = SymbolKind.Enum;
outlineTypeTable[PConst.Kind.interface] = SymbolKind.Interface;
outlineTypeTable[PConst.Kind.memberFunction] = SymbolKind.Method;
outlineTypeTable[PConst.Kind.memberVariable] = SymbolKind.Property;
outlineTypeTable[PConst.Kind.memberGetAccessor] = SymbolKind.Property;
outlineTypeTable[PConst.Kind.memberSetAccessor] = SymbolKind.Property;
outlineTypeTable[PConst.Kind.variable] = SymbolKind.Variable;
outlineTypeTable[PConst.Kind.const] = SymbolKind.Variable;
outlineTypeTable[PConst.Kind.localVariable] = SymbolKind.Variable;
outlineTypeTable[PConst.Kind.variable] = SymbolKind.Variable;
outlineTypeTable[PConst.Kind.function] = SymbolKind.Function;
outlineTypeTable[PConst.Kind.localFunction] = SymbolKind.Function;


export default class TypeScriptDocumentSymbolProvider implements DocumentSymbolProvider {
	public constructor(
		private readonly client: ITypeScriptServiceClient) { }

	public async provideDocumentSymbols(resource: TextDocument, token: CancellationToken): Promise<any> { // todo@joh `any[]` temporary hack to make typescript happy...
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
					let tree = response.body;
					if (tree.childItems) {
						let result = new Array<Hierarchy<SymbolInformation2>>();
						tree.childItems.forEach(item => TypeScriptDocumentSymbolProvider.convertNavTree(resource.uri, result, item));
						return result;
					}
				}
			} else {
				const response = await this.client.execute('navbar', args, token);
				if (response.body) {
					let result = new Array<SymbolInformation>();
					let foldingMap: ObjectMap<SymbolInformation> = Object.create(null);
					response.body.forEach(item => TypeScriptDocumentSymbolProvider.convertNavBar(resource.uri, 0, foldingMap, result as SymbolInformation[], item));
					return result;
				}
			}
			return [];
		} catch (e) {
			return [];
		}
	}

	private static convertNavBar(resource: Uri, indent: number, foldingMap: ObjectMap<SymbolInformation>, bucket: SymbolInformation[], item: Proto.NavigationBarItem, containerLabel?: string): void {
		let realIndent = indent + item.indent;
		let key = `${realIndent}|${item.text}`;
		if (realIndent !== 0 && !foldingMap[key] && TypeScriptDocumentSymbolProvider.shouldInclueEntry(item.text)) {
			let result = new SymbolInformation(item.text,
				outlineTypeTable[item.kind as string] || SymbolKind.Variable,
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

	private static convertNavTree(resource: Uri, bucket: Hierarchy<SymbolInformation>[], item: Proto.NavigationTree): void {
		if (!TypeScriptDocumentSymbolProvider.shouldInclueEntry(item.text)) {
			return;
		}
		const symbolInfo = new SymbolInformation2(
			item.text,
			'', // todo@joh detail
			outlineTypeTable[item.kind as string] || SymbolKind.Variable,
			typeConverters.Range.fromTextSpan(item.spans[0]),
			typeConverters.Location.fromTextSpan(resource, item.spans[0]),
		);
		const hierarchy = new Hierarchy(symbolInfo);
		if (item.childItems && item.childItems.length > 0) {
			for (const child of item.childItems) {
				TypeScriptDocumentSymbolProvider.convertNavTree(resource, hierarchy.children, child);
			}
		}
		bucket.push(hierarchy);

	}

	private static shouldInclueEntry(name: string): boolean {
		return !!(name && name !== '<function>' && name !== '<class>');
	}
}
