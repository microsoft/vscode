/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DocumentSelector } from '../configuration/documentSelector';
import { CachedResponse } from '../tsServer/cachedResponse';
import { parseKindModifier } from '../tsServer/protocol/modifiers';
import type * as Proto from '../tsServer/protocol/protocol';
import * as PConst from '../tsServer/protocol/protocol.const';
import * as typeConverters from '../typeConverters';
import { ITypeScriptServiceClient } from '../typescriptService';

const getSymbolKind = (kind: string): vscode.SymbolKind => {
	switch (kind) {
		case PConst.Kind.module: return vscode.SymbolKind.Module;
		case PConst.Kind.class: return vscode.SymbolKind.Class;
		case PConst.Kind.enum: return vscode.SymbolKind.Enum;
		case PConst.Kind.interface: return vscode.SymbolKind.Interface;
		case PConst.Kind.method: return vscode.SymbolKind.Method;
		case PConst.Kind.memberVariable: return vscode.SymbolKind.Property;
		case PConst.Kind.memberGetAccessor: return vscode.SymbolKind.Property;
		case PConst.Kind.memberSetAccessor: return vscode.SymbolKind.Property;
		case PConst.Kind.variable: return vscode.SymbolKind.Variable;
		case PConst.Kind.const: return vscode.SymbolKind.Variable;
		case PConst.Kind.localVariable: return vscode.SymbolKind.Variable;
		case PConst.Kind.function: return vscode.SymbolKind.Function;
		case PConst.Kind.localFunction: return vscode.SymbolKind.Function;
		case PConst.Kind.constructSignature: return vscode.SymbolKind.Constructor;
		case PConst.Kind.constructorImplementation: return vscode.SymbolKind.Constructor;
	}
	return vscode.SymbolKind.Variable;
};

class TypeScriptDocumentSymbolProvider implements vscode.DocumentSymbolProvider {

	private readonly _classLineHeightDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ lineHeight: 100 });
	private readonly _interfaceLineHeightDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ lineHeight: 100 });
	private readonly _functionLineHeightDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ lineHeight: 70 });
	private readonly _methodLineHeightDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ lineHeight: 30 });

	private readonly _classFontSizeDecorationType1: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ fontSize: 80, fontWeight: 'bold', fontFamily: 'Arial' });
	private readonly _interfaceFontSizeDecorationType1: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ fontSize: 80, fontWeight: 'bold', fontFamily: 'Times New Roman' });
	private readonly _functionFontSizeDecorationType1: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ fontSize: 50, fontWeight: 'italic', fontFamily: 'Courier New' });
	private readonly _methodFontSizeDecorationType1: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ fontSize: 20, fontWeight: 'italic', fontFamily: 'Georgia' });

	private readonly _classFontSizeDecorationType2: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ fontSize: 60, fontWeight: 'italic', fontFamily: 'Georgia' });
	private readonly _interfaceFontSizeDecorationType2: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ fontSize: 60, fontWeight: 'italic', fontFamily: 'Arial' });
	private readonly _functionFontSizeDecorationType2: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ fontSize: 40, fontWeight: 'bold', fontFamily: 'Times New Roman' });
	private readonly _methodFontSizeDecorationType2: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ fontSize: 10, fontWeight: 'bold', fontFamily: 'Courier New' });

	public constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly cachedResponse: CachedResponse<Proto.NavTreeResponse>,
	) { }

	public async provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.DocumentSymbol[] | undefined> {
		const file = this.client.toOpenTsFilePath(document);
		if (!file) {
			return undefined;
		}

		const args: Proto.FileRequestArgs = { file };
		const response = await this.cachedResponse.execute(document, () => this.client.execute('navtree', args, token));
		if (response.type !== 'response' || !response.body?.childItems) {
			return undefined;
		}

		// The root represents the file. Ignore this when showing in the UI
		const result: vscode.DocumentSymbol[] = [];
		for (const item of response.body.childItems) {
			TypeScriptDocumentSymbolProvider.convertNavTree(document.uri, result, item);
		}

		const activeTextEditor = vscode.window.activeTextEditor;
		if (activeTextEditor) {
			const classRanges: vscode.Range[] = [];
			const classRangesFonts1: vscode.Range[] = [];
			const classRangesFonts2: vscode.Range[] = [];
			this._getRanges(activeTextEditor, result, vscode.SymbolKind.Class, classRanges, classRangesFonts1, classRangesFonts2);

			const interfaceRanges: vscode.Range[] = [];
			const interfaceRangesFonts1: vscode.Range[] = [];
			const interfaceRangesFonts2: vscode.Range[] = [];
			this._getRanges(activeTextEditor, result, vscode.SymbolKind.Interface, interfaceRanges, interfaceRangesFonts1, interfaceRangesFonts2);

			const functionRanges: vscode.Range[] = [];
			const functionRangesFonts1: vscode.Range[] = [];
			const functionRangesFonts2: vscode.Range[] = [];
			this._getRanges(activeTextEditor, result, vscode.SymbolKind.Function, functionRanges, functionRangesFonts1, functionRangesFonts2);

			const methodRanges: vscode.Range[] = [];
			const methodRangesFonts1: vscode.Range[] = [];
			const methodRangesFonts2: vscode.Range[] = [];
			this._getRanges(activeTextEditor, result, vscode.SymbolKind.Method, methodRanges, methodRangesFonts1, methodRangesFonts2);

			activeTextEditor.setDecorations(this._classLineHeightDecorationType, classRanges);
			activeTextEditor.setDecorations(this._interfaceLineHeightDecorationType, interfaceRanges);
			activeTextEditor.setDecorations(this._functionLineHeightDecorationType, functionRanges);
			activeTextEditor.setDecorations(this._methodLineHeightDecorationType, methodRanges);

			activeTextEditor.setDecorations(this._classFontSizeDecorationType1, classRangesFonts1);
			activeTextEditor.setDecorations(this._interfaceFontSizeDecorationType1, interfaceRangesFonts1);
			activeTextEditor.setDecorations(this._functionFontSizeDecorationType1, functionRangesFonts1);
			activeTextEditor.setDecorations(this._methodFontSizeDecorationType1, methodRangesFonts1);

			activeTextEditor.setDecorations(this._classFontSizeDecorationType2, classRangesFonts2);
			activeTextEditor.setDecorations(this._interfaceFontSizeDecorationType2, interfaceRangesFonts2);
			activeTextEditor.setDecorations(this._functionFontSizeDecorationType2, functionRangesFonts2);
			activeTextEditor.setDecorations(this._methodFontSizeDecorationType2, methodRangesFonts2);
		}
		return result;
	}

	private _getRanges(activeTextEditor: vscode.TextEditor, symbols: vscode.DocumentSymbol[], kind: vscode.SymbolKind, rangesForLineHeight: vscode.Range[], rangesForFontSize1: vscode.Range[], rangesForFontSize2: vscode.Range[]) {
		for (const symbol of symbols) {
			if (symbol.kind === kind) {
				rangesForLineHeight.push(new vscode.Range(symbol.range.start.line, 0, symbol.range.start.line, 0));
				rangesForFontSize1.push(activeTextEditor.document.validateRange(new vscode.Range(symbol.range.start.line, 0, symbol.range.start.line, 15)));
				rangesForFontSize2.push(activeTextEditor.document.validateRange(new vscode.Range(symbol.range.start.line, 10, symbol.range.start.line, Infinity)));
			}
			this._getRanges(activeTextEditor, symbol.children, kind, rangesForLineHeight, rangesForFontSize1, rangesForFontSize2);
		}
	}

	private static convertNavTree(
		resource: vscode.Uri,
		output: vscode.DocumentSymbol[],
		item: Proto.NavigationTree,
	): boolean {
		let shouldInclude = TypeScriptDocumentSymbolProvider.shouldInclueEntry(item);
		if (!shouldInclude && !item.childItems?.length) {
			return false;
		}

		const children = new Set(item.childItems || []);
		for (const span of item.spans) {
			const range = typeConverters.Range.fromTextSpan(span);
			const symbolInfo = TypeScriptDocumentSymbolProvider.convertSymbol(item, range);

			for (const child of children) {
				if (child.spans.some(span => !!range.intersection(typeConverters.Range.fromTextSpan(span)))) {
					const includedChild = TypeScriptDocumentSymbolProvider.convertNavTree(resource, symbolInfo.children, child);
					shouldInclude = shouldInclude || includedChild;
					children.delete(child);
				}
			}

			if (shouldInclude) {
				output.push(symbolInfo);
			}
		}

		return shouldInclude;
	}

	private static convertSymbol(item: Proto.NavigationTree, range: vscode.Range): vscode.DocumentSymbol {
		const selectionRange = item.nameSpan ? typeConverters.Range.fromTextSpan(item.nameSpan) : range;
		let label = item.text;

		switch (item.kind) {
			case PConst.Kind.memberGetAccessor: label = `(get) ${label}`; break;
			case PConst.Kind.memberSetAccessor: label = `(set) ${label}`; break;
		}

		const symbolInfo = new vscode.DocumentSymbol(
			label,
			'',
			getSymbolKind(item.kind),
			range,
			range.contains(selectionRange) ? selectionRange : range);


		const kindModifiers = parseKindModifier(item.kindModifiers);
		if (kindModifiers.has(PConst.KindModifiers.deprecated)) {
			symbolInfo.tags = [vscode.SymbolTag.Deprecated];
		}

		return symbolInfo;
	}

	private static shouldInclueEntry(item: Proto.NavigationTree | Proto.NavigationBarItem): boolean {
		if (item.kind === PConst.Kind.alias) {
			return false;
		}
		return !!(item.text && item.text !== '<function>' && item.text !== '<class>');
	}
}

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient,
	cachedResponse: CachedResponse<Proto.NavTreeResponse>,
) {
	return vscode.languages.registerDocumentSymbolProvider(selector.syntax,
		new TypeScriptDocumentSymbolProvider(client, cachedResponse), { label: 'TypeScript' });
}
