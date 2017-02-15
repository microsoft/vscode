/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { DocumentSymbolProvider, SymbolInformation, SymbolKind, TextDocument, Range, Location, CancellationToken, Uri } from 'vscode';

import * as Proto from '../protocol';
import * as PConst from '../protocol.const';
import { ITypescriptServiceClient } from '../typescriptService';

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

function textSpan2Range(value: Proto.TextSpan): Range {
	return new Range(value.start.line - 1, value.start.offset - 1, value.end.line - 1, value.end.offset - 1);
}

export default class TypeScriptDocumentSymbolProvider implements DocumentSymbolProvider {
	public constructor(
		private client: ITypescriptServiceClient) { }

	public provideDocumentSymbols(resource: TextDocument, token: CancellationToken): Promise<SymbolInformation[]> {
		const filepath = this.client.normalizePath(resource.uri);
		if (!filepath) {
			return Promise.resolve<SymbolInformation[]>([]);
		}
		const args: Proto.FileRequestArgs = {
			file: filepath
		};

		if (this.client.apiVersion.has206Features()) {
			return this.client.execute('navtree', args, token).then((response) => {
				const result: SymbolInformation[] = [];
				if (response.body) {
					// The root represents the file. Ignore this when showing in the UI
					let tree = response.body;
					if (tree.childItems) {
						tree.childItems.forEach(item => TypeScriptDocumentSymbolProvider.convertNavTree(resource.uri, result, item));
					}
				}
				return result;
			}, (err) => {
				this.client.error(`'navtree' request failed with error.`, err);
				return [];
			});
		} else {
			return this.client.execute('navbar', args, token).then((response) => {
				const result: SymbolInformation[] = [];
				if (response.body) {
					let foldingMap: ObjectMap<SymbolInformation> = Object.create(null);
					response.body.forEach(item => TypeScriptDocumentSymbolProvider.convertNavBar(resource.uri, 0, foldingMap, result, item));
				}
				return result;
			}, (err) => {
				this.client.error(`'navbar' request failed with error.`, err);
				return [];
			});
		}

	}

	private static convertNavBar(resource: Uri, indent: number, foldingMap: ObjectMap<SymbolInformation>, bucket: SymbolInformation[], item: Proto.NavigationBarItem, containerLabel?: string): void {
		let realIndent = indent + item.indent;
		let key = `${realIndent}|${item.text}`;
		if (realIndent !== 0 && !foldingMap[key] && TypeScriptDocumentSymbolProvider.shouldInclueEntry(item.text)) {
			let result = new SymbolInformation(item.text,
				outlineTypeTable[item.kind] || SymbolKind.Variable,
				containerLabel ? containerLabel : '',
				new Location(resource, textSpan2Range(item.spans[0])));
			foldingMap[key] = result;
			bucket.push(result);
		}
		if (item.childItems && item.childItems.length > 0) {
			for (let child of item.childItems) {
				TypeScriptDocumentSymbolProvider.convertNavBar(resource, realIndent + 1, foldingMap, bucket, child, item.text);
			}
		}
	}

	private static convertNavTree(resource: Uri, bucket: SymbolInformation[], item: Proto.NavigationTree, containerLabel?: string): void {
		const result = new SymbolInformation(item.text,
			outlineTypeTable[item.kind] || SymbolKind.Variable,
			containerLabel ? containerLabel : '',
			new Location(resource, textSpan2Range(item.spans[0]))
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