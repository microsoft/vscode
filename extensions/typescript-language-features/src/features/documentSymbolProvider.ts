/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentSymbolProvider, SymbolInformation, SymbolKind, TextDocument, CancellationToken, Uri, Hierarchy, SymbolInformation2 } from 'vscode';

import * as Proto from '../protocol';
import * as PConst from '../protocol.const';
import { ITypeScriptServiceClient } from '../typescriptService';
import * as typeConverters from '../utils/typeConverters';

const getSymbolKind = (kind: string): SymbolKind => {
	switch (kind) {
		case PConst.Kind.module: return SymbolKind.Module;
		case PConst.Kind.class: return SymbolKind.Class;
		case PConst.Kind.enum: return SymbolKind.Enum;
		case PConst.Kind.interface: return SymbolKind.Interface;
		case PConst.Kind.memberFunction: return SymbolKind.Method;
		case PConst.Kind.memberVariable: return SymbolKind.Property;
		case PConst.Kind.memberGetAccessor: return SymbolKind.Property;
		case PConst.Kind.memberSetAccessor: return SymbolKind.Property;
		case PConst.Kind.variable: return SymbolKind.Variable;
		case PConst.Kind.const: return SymbolKind.Variable;
		case PConst.Kind.localVariable: return SymbolKind.Variable;
		case PConst.Kind.variable: return SymbolKind.Variable;
		case PConst.Kind.function: return SymbolKind.Function;
		case PConst.Kind.localFunction: return SymbolKind.Function;
	}
	return SymbolKind.Variable;
};

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
					const tree = response.body;
					if (tree.childItems) {
						const result = new Array<Hierarchy<SymbolInformation2>>();
						tree.childItems.forEach(item => TypeScriptDocumentSymbolProvider.convertNavTree(resource.uri, result, item));
						return result;
					}
				}
			} else {
				const response = await this.client.execute('navbar', args, token);
				if (response.body) {
					const result = new Array<SymbolInformation>();
					const foldingMap: ObjectMap<SymbolInformation> = Object.create(null);
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
		const realIndent = indent + item.indent;
		const key = `${realIndent}|${item.text}`;
		if (realIndent !== 0 && !foldingMap[key] && TypeScriptDocumentSymbolProvider.shouldInclueEntry(item)) {
			const result = new SymbolInformation(item.text,
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

	private static convertNavTree(resource: Uri, bucket: Hierarchy<SymbolInformation>[], item: Proto.NavigationTree): boolean {
		const symbolInfo = new SymbolInformation2(
			item.text,
			'', // todo@joh detail
			getSymbolKind(item.kind),
			typeConverters.Range.fromTextSpan(item.spans[0]),
			typeConverters.Location.fromTextSpan(resource, item.spans[0]),
		);

		const hierarchy = new Hierarchy(symbolInfo);
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
		return !!(item.text && item.text !== '<function>' && item.text !== '<class>');
	}
}
