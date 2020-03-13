/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IQuickPick, IQuickPickItem, IKeyMods, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { DisposableStore, toDisposable, IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { once } from 'vs/base/common/functional';
import { IEditor, ScrollType, IDiffEditor } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { IRange, Range } from 'vs/editor/common/core/range';
import { withNullAsUndefined } from 'vs/base/common/types';
import { AbstractEditorQuickAccessProvider } from 'vs/editor/contrib/quickAccess/quickAccess';
import { DocumentSymbol, SymbolKinds, SymbolTag, DocumentSymbolProviderRegistry, SymbolKind } from 'vs/editor/common/modes';
import { OutlineModel, OutlineElement } from 'vs/editor/contrib/documentSymbols/outlineModel';
import { values } from 'vs/base/common/collections';
import { trim, format } from 'vs/base/common/strings';
import { fuzzyScore, FuzzyScore, createMatches } from 'vs/base/common/filters';

interface IGotoSymbolQuickPickItem extends IQuickPickItem {
	kind: SymbolKind,
	index: number,
	score?: FuzzyScore;
	range?: { decoration: IRange, selection: IRange },
}

export abstract class AbstractGotoSymbolQuickAccessProvider extends AbstractEditorQuickAccessProvider {

	static PREFIX = '@';
	static SCOPE_PREFIX = ':';
	static PREFIX_BY_CATEGORY = `${AbstractGotoSymbolQuickAccessProvider.PREFIX}${AbstractGotoSymbolQuickAccessProvider.SCOPE_PREFIX}`;

	provide(picker: IQuickPick<IGotoSymbolQuickPickItem>, token: CancellationToken): IDisposable {
		const disposables = new DisposableStore();

		// Disable filtering & sorting, we control the results
		picker.matchOnLabel = picker.matchOnDescription = picker.matchOnDetail = picker.sortByLabel = false;

		// Provide based on current active editor
		let pickerDisposable = this.doProvide(picker, token);
		disposables.add(toDisposable(() => pickerDisposable.dispose()));

		// Re-create whenever the active editor changes
		disposables.add(this.onDidActiveTextEditorControlChange(() => {
			pickerDisposable.dispose();
			pickerDisposable = this.doProvide(picker, token);
		}));

		return disposables;
	}

	private doProvide(picker: IQuickPick<IGotoSymbolQuickPickItem>, token: CancellationToken): IDisposable {
		const activeTextEditorControl = this.activeTextEditorControl;

		// With text control
		if (activeTextEditorControl) {
			const model = this.getModel(activeTextEditorControl);
			if (model && DocumentSymbolProviderRegistry.has(model)) {
				return this.doProvideWithSymbols(activeTextEditorControl, model, picker, token);
			}
		}

		// Without text control
		return this.doProvideWithoutSymbols(picker);
	}

	private doProvideWithoutSymbols(picker: IQuickPick<IGotoSymbolQuickPickItem>): IDisposable {
		const label = localize('cannotRunGotoSymbol', "Open a text editor with symbol information first to go to a symbol.");
		picker.items = [{ label, index: 0, kind: SymbolKind.String }];
		picker.ariaLabel = label;

		return Disposable.None;
	}

	private doProvideWithSymbols(editor: IEditor, model: ITextModel, picker: IQuickPick<IGotoSymbolQuickPickItem>, token: CancellationToken): IDisposable {
		const disposables = new DisposableStore();

		// Restore any view state if this picker was closed
		// without actually going to a symbol
		const lastKnownEditorViewState = withNullAsUndefined(editor.saveViewState());
		once(token.onCancellationRequested)(() => {
			if (lastKnownEditorViewState) {
				editor.restoreViewState(lastKnownEditorViewState);
			}
		});

		// Goto symbol once picked
		disposables.add(picker.onDidAccept(() => {
			const [item] = picker.selectedItems;
			if (item && item.range) {
				this.gotoSymbol(editor, item.range.selection, picker.keyMods);

				picker.hide();
			}
		}));

		// Set initial picks and update on type
		let picksCts: CancellationTokenSource | undefined = undefined;
		const updatePickerItems = async () => {

			// Cancel any previous ask for picks and busy
			picksCts?.dispose(true);
			picker.busy = false;

			// Create new cancellation source for this run
			picksCts = new CancellationTokenSource(token);

			// Collect symbol picks
			picker.busy = true;
			try {
				const items = await this.getSymbolPicks(model, picker.value.substr(AbstractGotoSymbolQuickAccessProvider.PREFIX.length).trim(), picksCts.token);
				if (token.isCancellationRequested) {
					return;
				}

				picker.items = items;
			} finally {
				if (!token.isCancellationRequested) {
					picker.busy = false;
				}
			}
		};
		disposables.add(picker.onDidChangeValue(() => updatePickerItems()));
		updatePickerItems();

		// Reveal and decorate when active item changes
		disposables.add(picker.onDidChangeActive(() => {
			const [item] = picker.activeItems;
			if (item && item.range) {

				// Reveal
				editor.revealRangeInCenter(item.range.selection, ScrollType.Smooth);

				// Decorate
				this.addDecorations(editor, item.range.decoration);
			}
		}));

		// Clean up decorations on dispose
		disposables.add(toDisposable(() => this.clearDecorations(editor)));

		return disposables;
	}

	private async getSymbolPicks(model: ITextModel, filter: string, token: CancellationToken): Promise<Array<IGotoSymbolQuickPickItem | IQuickPickSeparator>> {

		// Resolve symbols from document
		const symbols = await this.getDocumentSymbols(model, true, token);
		if (token.isCancellationRequested) {
			return [];
		}

		// Normalize filter
		const filterBySymbolKind = filter.indexOf(AbstractGotoSymbolQuickAccessProvider.SCOPE_PREFIX) === 0;
		const filterLow = filter.toLowerCase();
		const filterPos = filterBySymbolKind ? 1 : 0;

		// Convert to symbol picks and apply filtering
		const filteredSymbolPicks: IGotoSymbolQuickPickItem[] = [];
		for (let index = 0; index < symbols.length; index++) {
			const symbol = symbols[index];

			const label = trim(symbol.name);
			const deprecated = symbol.tags && symbol.tags.indexOf(SymbolTag.Deprecated) >= 0;

			let score: FuzzyScore | undefined = undefined;
			let includeSymbol = true;
			if (filter.length > filterPos) {
				score = fuzzyScore(filter, filterLow, filterPos, label, label.toLowerCase(), 0, true);
				includeSymbol = !!score;
			}

			if (includeSymbol) {
				const labelWithIcon = `$(symbol-${SymbolKinds.toString(symbol.kind) || 'property'}) ${label}`;

				// Readjust matches to account for codicons
				const labelOffset = labelWithIcon.length - label.length;
				const matches = createMatches(score);
				if (matches) {
					for (const match of matches) {
						match.start += labelOffset;
						match.end += labelOffset;
					}
				}

				filteredSymbolPicks.push({
					index,
					kind: symbol.kind,
					score,
					label: labelWithIcon,
					ariaLabel: localize('symbolsAriaLabel', "{0}, symbols picker", label),
					description: symbol.containerName,
					highlights: deprecated ? undefined : { label: matches },
					range: {
						selection: Range.collapseToStart(symbol.selectionRange),
						decoration: symbol.range
					},
					italic: deprecated
				});
			}
		}

		// Sort by score
		const sortedFilteredSymbolPicks = filteredSymbolPicks.sort((symbolA, symbolB) => filterBySymbolKind ?
			this.compareByKindAndScore(symbolA, symbolB) :
			this.compareByScore(symbolA, symbolB)
		);

		// Add separator for types
		// - @  only total number of symbols
		// - @: grouped by symbol kind
		let symbolPicks: Array<IGotoSymbolQuickPickItem | IQuickPickSeparator> = [];
		if (filterBySymbolKind) {
			let lastSymbolKind: SymbolKind | undefined = undefined;
			let lastSeparator: IQuickPickSeparator | undefined = undefined;
			let lastSymbolKindCounter = 0;

			function updateLastSeparatorLabel(): void {
				if (lastSeparator && typeof lastSymbolKind === 'number' && lastSymbolKindCounter > 0) {
					lastSeparator.label = format(NLS_SYMBOL_KIND_CACHE[lastSymbolKind] || FALLBACK_NLS_SYMBOL_KIND, lastSymbolKindCounter);
				}
			}

			for (const symbolPick of sortedFilteredSymbolPicks) {

				// Found new kind
				if (lastSymbolKind !== symbolPick.kind) {

					// Update last separator with number of symbols we found for kind
					updateLastSeparatorLabel();

					lastSymbolKind = symbolPick.kind;
					lastSymbolKindCounter = 1;

					// Add new separator for new kind
					lastSeparator = { type: 'separator' };
					symbolPicks.push(lastSeparator);
				}

				// Existing kind, keep counting
				else {
					lastSymbolKindCounter++;
				}

				// Add to final result
				symbolPicks.push(symbolPick);
			}

			// Update last separator with number of symbols we found for kind
			updateLastSeparatorLabel();
		} else {
			symbolPicks = [
				{ label: localize('symbols', "symbols ({0})", filteredSymbolPicks.length), type: 'separator' },
				...sortedFilteredSymbolPicks
			];
		}

		return symbolPicks;
	}

	private compareByScore(symbolA: IGotoSymbolQuickPickItem, symbolB: IGotoSymbolQuickPickItem): number {
		if (!symbolA.score && symbolB.score) {
			return 1;
		} else if (symbolA.score && !symbolB.score) {
			return -1;
		}

		if (symbolA.score && symbolB.score) {
			if (symbolA.score[0] > symbolB.score[0]) {
				return -1;
			} else if (symbolA.score[0] < symbolB.score[0]) {
				return 1;
			}
		}

		if (symbolA.index < symbolB.index) {
			return -1;
		} else if (symbolA.index > symbolB.index) {
			return 1;
		}

		return 0;
	}

	private compareByKindAndScore(symbolA: IGotoSymbolQuickPickItem, symbolB: IGotoSymbolQuickPickItem): number {
		const kindA = NLS_SYMBOL_KIND_CACHE[symbolA.kind] || FALLBACK_NLS_SYMBOL_KIND;
		const kindB = NLS_SYMBOL_KIND_CACHE[symbolB.kind] || FALLBACK_NLS_SYMBOL_KIND;

		// Sort by type first if scoped search
		const result = kindA.localeCompare(kindB);
		if (result === 0) {
			return this.compareByScore(symbolA, symbolB);
		}

		return result;
	}

	private async getDocumentSymbols(document: ITextModel, flatten: boolean, token: CancellationToken): Promise<DocumentSymbol[]> {
		const model = await OutlineModel.create(document, token);
		if (token.isCancellationRequested) {
			return [];
		}

		const roots: DocumentSymbol[] = [];
		for (const child of values(model.children)) {
			if (child instanceof OutlineElement) {
				roots.push(child.symbol);
			} else {
				roots.push(...values(child.children).map(child => child.symbol));
			}
		}

		let flatEntries: DocumentSymbol[] = [];
		if (flatten) {
			this.flattenDocumentSymbols(flatEntries, roots, '');
		} else {
			flatEntries = roots;
		}

		return flatEntries.sort((symbolA, symbolB) => Range.compareRangesUsingStarts(symbolA.range, symbolB.range));
	}

	private flattenDocumentSymbols(bucket: DocumentSymbol[], entries: DocumentSymbol[], overrideContainerLabel: string): void {
		for (const entry of entries) {
			bucket.push({
				kind: entry.kind,
				tags: entry.tags,
				name: entry.name,
				detail: entry.detail,
				containerName: entry.containerName || overrideContainerLabel,
				range: entry.range,
				selectionRange: entry.selectionRange,
				children: undefined, // we flatten it...
			});

			// Recurse over children
			if (entry.children) {
				this.flattenDocumentSymbols(bucket, entry.children, entry.name);
			}
		}
	}

	private getModel(editor: IEditor | IDiffEditor): ITextModel | undefined {
		return isDiffEditor(editor) ?
			editor.getModel()?.modified :
			editor.getModel() as ITextModel;
	}

	protected gotoSymbol(editor: IEditor, range: IRange, keyMods: IKeyMods): void {
		editor.setSelection(range);
		editor.revealRangeInCenter(range, ScrollType.Smooth);
		editor.focus();
	}
}

// #region NLS Helpers

const FALLBACK_NLS_SYMBOL_KIND = localize('property', "properties ({0})");
const NLS_SYMBOL_KIND_CACHE: { [type: number]: string } = {
	[SymbolKind.Method]: localize('method', "methods ({0})"),
	[SymbolKind.Function]: localize('function', "functions ({0})"),
	[SymbolKind.Constructor]: localize('_constructor', "constructors ({0})"),
	[SymbolKind.Variable]: localize('variable', "variables ({0})"),
	[SymbolKind.Class]: localize('class', "classes ({0})"),
	[SymbolKind.Struct]: localize('struct', "structs ({0})"),
	[SymbolKind.Event]: localize('event', "events ({0})"),
	[SymbolKind.Operator]: localize('operator', "operators ({0})"),
	[SymbolKind.Interface]: localize('interface', "interfaces ({0})"),
	[SymbolKind.Namespace]: localize('namespace', "namespaces ({0})"),
	[SymbolKind.Package]: localize('package', "packages ({0})"),
	[SymbolKind.TypeParameter]: localize('typeParameter', "type parameters ({0})"),
	[SymbolKind.Module]: localize('modules', "modules ({0})"),
	[SymbolKind.Property]: localize('property', "properties ({0})"),
	[SymbolKind.Enum]: localize('enum', "enumerations ({0})"),
	[SymbolKind.EnumMember]: localize('enumMember', "enumeration members ({0})"),
	[SymbolKind.String]: localize('string', "strings ({0})"),
	[SymbolKind.File]: localize('file', "files ({0})"),
	[SymbolKind.Array]: localize('array', "arrays ({0})"),
	[SymbolKind.Number]: localize('number', "numbers ({0})"),
	[SymbolKind.Boolean]: localize('boolean', "booleans ({0})"),
	[SymbolKind.Object]: localize('object', "objects ({0})"),
	[SymbolKind.Key]: localize('key', "keys ({0})"),
	[SymbolKind.Field]: localize('field', "fields ({0})"),
	[SymbolKind.Constant]: localize('constant', "constants ({0})")
};

//#endregion
