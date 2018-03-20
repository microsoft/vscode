/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentSymbolProvider, SymbolInformation, SymbolKind, TextDocument, Location, CancellationToken, Uri } from 'vscode';

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
		private client: ITypeScriptServiceClient) { }

	public async provideDocumentSymbols(resource: TextDocument, token: CancellationToken): Promise<SymbolInformation[]> {
		const filepath = this.client.normalizePath(resource.uri);
		if (!filepath) {
			return [];
		}
		const args: Proto.FileRequestArgs = {
			file: filepath
		};

		try {
			const result: SymbolInformation[] = [];
			if (this.client.apiVersion.has206Features()) {
				const response = await this.client.execute('navtree', args, token);
				if (response.body) {
					// The root represents the file. Ignore this when showing in the UI
					let tree = response.body;
					if (tree.childItems) {
						tree.childItems.forEach(item => TypeScriptDocumentSymbolProvider.convertNavTree(resource.uri, result, item));
					}
				}
			} else {
				const response = await this.client.execute('navbar', args, token);
				if (response.body) {
					let foldingMap: ObjectMap<SymbolInformation> = Object.create(null);
					response.body.forEach(item => TypeScriptDocumentSymbolProvider.convertNavBar(resource.uri, 0, foldingMap, result, item));
				}
			}
			return result;
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
				new Location(resource, typeConverters.Range.fromTextSpan(item.spans[0])));
			foldingMap[key] = result;
			bucket.push(result);
		}
		if (item.childItems && item.childItems.length > 0) {
			for (const child of item.childItems) {
				TypeScriptDocumentSymbolProvider.convertNavBar(resource, realIndent + 1, foldingMap, bucket, child, item.text);
			}
		}
	}

	private static convertNavTree(resource: Uri, bucket: SymbolInformation[], item: Proto.NavigationTree, containerLabel?: string): void {
		const result = new SymbolInformation(item.text,
			outlineTypeTable[item.kind as string] || SymbolKind.Variable,
			containerLabel ? containerLabel : '',
			new Location(resource, typeConverters.Range.fromTextSpan(item.spans[0]))
		);
		if (item.childItems && item.childItems.length > 0) {
			for (const child of item.childItems) {
				TypeScriptDocumentSymbolProvider.convertNavTree(resource, bucket, child, result.name);
			}
		}

		if (TypeScriptDocumentSymbolProvider.shouldInclueEntry(result.name)) {
			bucket.push(result);
		}
	}

	private static shouldInclueEntry(name: string): boolean {
		return !!(name && name !== '<function>' && name !== '<class>');
	}
}