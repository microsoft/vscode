/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentSymbol, Position, Range, Selection, TextEditor, ThemeIcon, l10n } from 'vscode';
import { Codicon } from '../../../util/vs/base/common/codicons';
import { CancellationError } from '../../../util/vs/base/common/errors';
import { SymbolKind } from '../../../util/vs/workbench/api/common/extHostTypes/symbolInformation';
import { IDialogService } from '../../dialog/common/dialogService';
import { TextDocumentSnapshot } from '../../editing/common/textDocumentSnapshot';
import { ILanguageFeaturesService } from '../../languages/common/languageFeaturesService';
import { IParserService, treeSitterOffsetRangeToVSCodeRange, vscodeToTreeSitterOffsetRange } from '../../parser/node/parserService';
import { IScopeSelector } from '../common/scopeSelection';

export interface IScope {
	range: Range;
	kind: 'code' | SymbolKind;
	name: string;
}

export class ScopeSelectorImpl implements IScopeSelector {
	declare _serviceBrand: undefined;

	constructor(@IParserService private readonly parserService: IParserService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IDialogService private readonly dialogService: IDialogService) { }

	private async findEnclosingBlocks(document: TextDocumentSnapshot, range: Selection): Promise<IScope[] | undefined> {
		const treeSitterAST = this.parserService.getTreeSitterAST(document);
		if (treeSitterAST === undefined) {
			return undefined;
		}
		const treeSitterOffsetRange = vscodeToTreeSitterOffsetRange(range, document);
		const fineScopes = await treeSitterAST.getFineScopes(treeSitterOffsetRange);
		return fineScopes?.map((scope) => {
			const range = treeSitterOffsetRangeToVSCodeRange(document, scope);
			return { kind: 'code', name: document.lineAt(range.start).text.trim(), range };
		});
	}

	private findEnclosingSymbols(rootSymbols: DocumentSymbol[], position: Position): DocumentSymbol[] | undefined {
		for (const symbol of rootSymbols) {
			if (symbol.range.contains(position)) {
				const enclosingChild = this.findEnclosingSymbols(symbol.children, position);
				if (enclosingChild) {
					return [symbol, ...enclosingChild];
				} else {
					return [symbol];
				}
			}
		}
		return undefined;
	}

	async selectEnclosingScope(editor: TextEditor, options?: { reason?: string; includeBlocks?: boolean }): Promise<Selection | undefined> {
		const result: DocumentSymbol[] = await this.languageFeaturesService.getDocumentSymbols(editor.document.uri);

		if (!result) {
			return undefined;
		}

		// check that the returned result is a DocumentSymbol[] and not a SymbolInformation[]
		if (result.length > 0 && !result[0].hasOwnProperty('children')) {
			return undefined;
		}

		const initialSelection = editor.selection;
		if (!initialSelection.isEmpty) {
			return undefined;
		}

		let enclosingSymbols: IScope[] | undefined = this.findEnclosingSymbols(result, editor.selection.active);
		if (options?.includeBlocks) {
			// Add fine block scopes
			enclosingSymbols?.push(...(await this.findEnclosingBlocks(TextDocumentSnapshot.create(editor.document), editor.selection) ?? []));
		}

		// If the cursor is in a position where there are no enclosing symbols or blocks, list all document symbols as options
		if (!enclosingSymbols) {
			enclosingSymbols = result;
		}

		if (enclosingSymbols?.length === 1) {
			const symbol = enclosingSymbols[0];
			editor.selection = new Selection(symbol.range.start, symbol.range.end);
		} else if (enclosingSymbols && enclosingSymbols.length > 1 || !enclosingSymbols && result.length > 1) {
			const quickPickItems = enclosingSymbols
				.sort((a, b) => b.range.start.line - a.range.start.line) // Sort the enclosing selections by start position
				.map(symbol => ({ label: `$(${symbol.kind === 'code' ? 'code' : SymbolKinds.toIcon(symbol.kind).id}) ${symbol.name}`, description: `:${symbol.range.start.line + 1}-${symbol.range.end.line + 1}`, symbol }));
			const pickedItem = await this.dialogService.showQuickPick(quickPickItems, {
				placeHolder: options?.reason ?? l10n.t('Select an enclosing range'),
				onDidSelectItem(item) {
					const symbol = (item as any).symbol;
					if (symbol) {
						editor.selection = new Selection(symbol.range.start, symbol.range.end);
						editor.revealRange(symbol.range);
					}
				},
			});
			if (!pickedItem) {
				editor.selection = initialSelection;
				throw new CancellationError();
			}
		}
		return editor.selection;
	}
}

export namespace SymbolKinds {

	const byKind = new Map<SymbolKind, ThemeIcon>();
	byKind.set(SymbolKind.File, Codicon.symbolFile);
	byKind.set(SymbolKind.Module, Codicon.symbolModule);
	byKind.set(SymbolKind.Namespace, Codicon.symbolNamespace);
	byKind.set(SymbolKind.Package, Codicon.symbolPackage);
	byKind.set(SymbolKind.Class, Codicon.symbolClass);
	byKind.set(SymbolKind.Method, Codicon.symbolMethod);
	byKind.set(SymbolKind.Property, Codicon.symbolProperty);
	byKind.set(SymbolKind.Field, Codicon.symbolField);
	byKind.set(SymbolKind.Constructor, Codicon.symbolConstructor);
	byKind.set(SymbolKind.Enum, Codicon.symbolEnum);
	byKind.set(SymbolKind.Interface, Codicon.symbolInterface);
	byKind.set(SymbolKind.Function, Codicon.symbolFunction);
	byKind.set(SymbolKind.Variable, Codicon.symbolVariable);
	byKind.set(SymbolKind.Constant, Codicon.symbolConstant);
	byKind.set(SymbolKind.String, Codicon.symbolString);
	byKind.set(SymbolKind.Number, Codicon.symbolNumber);
	byKind.set(SymbolKind.Boolean, Codicon.symbolBoolean);
	byKind.set(SymbolKind.Array, Codicon.symbolArray);
	byKind.set(SymbolKind.Object, Codicon.symbolObject);
	byKind.set(SymbolKind.Key, Codicon.symbolKey);
	byKind.set(SymbolKind.Null, Codicon.symbolNull);
	byKind.set(SymbolKind.EnumMember, Codicon.symbolEnumMember);
	byKind.set(SymbolKind.Struct, Codicon.symbolStruct);
	byKind.set(SymbolKind.Event, Codicon.symbolEvent);
	byKind.set(SymbolKind.Operator, Codicon.symbolOperator);
	byKind.set(SymbolKind.TypeParameter, Codicon.symbolTypeParameter);

	export function toIcon(kind: SymbolKind): ThemeIcon {
		let icon = byKind.get(kind);
		if (!icon) {
			console.info('No codicon found for SymbolKind ' + kind);
			icon = Codicon.symbolProperty;
		}
		return icon;
	}
}
