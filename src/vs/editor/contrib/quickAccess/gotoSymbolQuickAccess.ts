/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IQuickPick, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { DisposableStore, IDisposable, Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IEditor, ScrollType } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { IRange, Range } from 'vs/editor/common/core/range';
import { AbstractEditorNavigationQuickAccessProvider, IEditorNavigationQuickAccessOptions } from 'vs/editor/contrib/quickAccess/editorNavigationQuickAccess';
import { DocumentSymbol, SymbolKinds, SymbolTag, DocumentSymbolProviderRegistry, SymbolKind } from 'vs/editor/common/modes';
import { OutlineModel, OutlineElement } from 'vs/editor/contrib/documentSymbols/outlineModel';
import { values } from 'vs/base/common/collections';
import { trim, format } from 'vs/base/common/strings';
import { fuzzyScore, FuzzyScore, createMatches } from 'vs/base/common/filters';
import { assign } from 'vs/base/common/objects';

export interface IGotoSymbolQuickPickItem extends IQuickPickItem {
	kind: SymbolKind,
	index: number,
	score?: FuzzyScore;
	range?: { decoration: IRange, selection: IRange }
}

export interface IGotoSymbolQuickAccessProviderOptions extends IEditorNavigationQuickAccessOptions {
	openSideBySideDirection: () => undefined | 'right' | 'down'
}

export abstract class AbstractGotoSymbolQuickAccessProvider extends AbstractEditorNavigationQuickAccessProvider {

	static PREFIX = '@';
	static SCOPE_PREFIX = ':';
	static PREFIX_BY_CATEGORY = `${AbstractGotoSymbolQuickAccessProvider.PREFIX}${AbstractGotoSymbolQuickAccessProvider.SCOPE_PREFIX}`;

	constructor(protected options?: IGotoSymbolQuickAccessProviderOptions) {
		super(assign(options, { canAcceptInBackground: true }));
	}

	protected provideWithoutTextEditor(picker: IQuickPick<IGotoSymbolQuickPickItem>): IDisposable {
		const label = localize('cannotRunGotoSymbolWithoutEditor', "Open a text editor first to go to a symbol.");

		picker.items = [{ label, index: 0, kind: SymbolKind.String }];
		picker.ariaLabel = label;

		return Disposable.None;
	}

	protected provideWithTextEditor(editor: IEditor, picker: IQuickPick<IGotoSymbolQuickPickItem>, token: CancellationToken): IDisposable {
		const model = this.getModel(editor);
		if (!model) {
			return Disposable.None;
		}

		// Provide symbols from model if available in registry
		if (DocumentSymbolProviderRegistry.has(model)) {
			return this.doProvideWithEditorSymbols(editor, model, picker, token);
		}

		// Otherwise show an entry for a model without registry
		// But give a chance to resolve the symbols at a later
		// point if possible
		return this.doProvideWithoutEditorSymbols(editor, model, picker, token);
	}

	private doProvideWithoutEditorSymbols(editor: IEditor, model: ITextModel, picker: IQuickPick<IGotoSymbolQuickPickItem>, token: CancellationToken): IDisposable {
		const disposables = new DisposableStore();

		// Generic pick for not having any symbol information
		const label = localize('cannotRunGotoSymbolWithoutSymbolProvider', "Open a text editor with symbol information first to go to a symbol.");
		picker.items = [{ label, index: 0, kind: SymbolKind.String }];
		picker.ariaLabel = label;

		// Wait for changes to the registry and see if eventually
		// we do get symbols. This can happen if the picker is opened
		// very early after the model has loaded but before the
		// language registry is ready.
		// https://github.com/microsoft/vscode/issues/70607
		(async () => {
			const result = await this.waitForLanguageSymbolRegistry(model, disposables);
			if (!result || token.isCancellationRequested) {
				return;
			}

			disposables.add(this.doProvideWithEditorSymbols(editor, model, picker, token));
		})();

		return disposables;
	}

	protected async waitForLanguageSymbolRegistry(model: ITextModel, disposables: DisposableStore): Promise<boolean> {
		if (DocumentSymbolProviderRegistry.has(model)) {
			return true;
		}

		let symbolProviderRegistryPromiseResolve: (res: boolean) => void;
		const symbolProviderRegistryPromise = new Promise<boolean>(resolve => symbolProviderRegistryPromiseResolve = resolve);

		// Resolve promise when registry knows model
		const symbolProviderListener = disposables.add(DocumentSymbolProviderRegistry.onDidChange(() => {
			if (DocumentSymbolProviderRegistry.has(model)) {
				symbolProviderListener.dispose();

				symbolProviderRegistryPromiseResolve(true);
			}
		}));

		// Resolve promise when we get disposed too
		disposables.add(toDisposable(() => symbolProviderRegistryPromiseResolve(false)));

		return symbolProviderRegistryPromise;
	}

	private doProvideWithEditorSymbols(editor: IEditor, model: ITextModel, picker: IQuickPick<IGotoSymbolQuickPickItem>, token: CancellationToken): IDisposable {
		const disposables = new DisposableStore();

		// Goto symbol once picked
		disposables.add(picker.onDidAccept(event => {
			const [item] = picker.selectedItems;
			if (item && item.range) {
				this.gotoLocation(editor, { range: item.range.selection, keyMods: picker.keyMods, preserveFocus: event.inBackground });

				if (!event.inBackground) {
					picker.hide();
				}
			}
		}));

		// Goto symbol side by side if enabled
		disposables.add(picker.onDidTriggerItemButton(({ item }) => {
			if (item && item.range) {
				this.gotoLocation(editor, { range: item.range.selection, keyMods: picker.keyMods, forceSideBySide: true });

				picker.hide();
			}
		}));

		// Resolve symbols from document once and reuse this
		// request for all filtering and typing then on
		const symbolsPromise = this.getDocumentSymbols(model, true, token);

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
				const items = await this.doGetSymbolPicks(symbolsPromise, picker.value.substr(AbstractGotoSymbolQuickAccessProvider.PREFIX.length).trim(), picksCts.token);
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
		// However, ignore the very first event so that
		// opening the picker is not immediately revealing
		// and decorating the first entry.
		let ignoreFirstActiveEvent = true;
		disposables.add(picker.onDidChangeActive(() => {
			const [item] = picker.activeItems;
			if (item && item.range) {
				if (ignoreFirstActiveEvent) {
					ignoreFirstActiveEvent = false;
					return;
				}

				// Reveal
				editor.revealRangeInCenter(item.range.selection, ScrollType.Smooth);

				// Decorate
				this.addDecorations(editor, item.range.decoration);
			}
		}));

		return disposables;
	}

	protected async doGetSymbolPicks(symbolsPromise: Promise<DocumentSymbol[]>, filter: string, token: CancellationToken): Promise<Array<IGotoSymbolQuickPickItem | IQuickPickSeparator>> {
		const symbols = await symbolsPromise;
		if (token.isCancellationRequested) {
			return [];
		}

		// Normalize filter
		const filterBySymbolKind = filter.indexOf(AbstractGotoSymbolQuickAccessProvider.SCOPE_PREFIX) === 0;
		const filterPos = filterBySymbolKind ? 1 : 0;
		const [symbolFilter, containerFilter] = filter.split(' ') as [string, string | undefined];
		const symbolFilterLow = symbolFilter.toLowerCase();
		const containerFilterLow = containerFilter?.toLowerCase();

		// Convert to symbol picks and apply filtering
		const filteredSymbolPicks: IGotoSymbolQuickPickItem[] = [];
		for (let index = 0; index < symbols.length; index++) {
			const symbol = symbols[index];

			const symbolLabel = trim(symbol.name);
			const containerLabel = symbol.containerName;

			let symbolScore: FuzzyScore | undefined = undefined;
			let containerScore: FuzzyScore | undefined = undefined;

			let includeSymbol = true;
			if (filter.length > filterPos) {

				// Score by symbol
				symbolScore = fuzzyScore(symbolFilter, symbolFilterLow, filterPos, symbolLabel, symbolLabel.toLowerCase(), 0, true);
				includeSymbol = !!symbolScore;

				// Score by container if specified
				if (includeSymbol && containerFilter && containerFilterLow) {
					if (containerLabel) {
						containerScore = fuzzyScore(containerFilter, containerFilterLow, filterPos, containerLabel, containerLabel.toLowerCase(), 0, true);
					}

					includeSymbol = !!containerScore;
				}
			}

			if (includeSymbol) {
				const symbolLabelWithIcon = `$(symbol-${SymbolKinds.toString(symbol.kind) || 'property'}) ${symbolLabel}`;
				const deprecated = symbol.tags && symbol.tags.indexOf(SymbolTag.Deprecated) >= 0;

				filteredSymbolPicks.push({
					index,
					kind: symbol.kind,
					score: symbolScore,
					label: symbolLabelWithIcon,
					ariaLabel: localize('symbolsAriaLabel', "{0}, symbols picker", symbolLabel),
					description: containerLabel,
					highlights: deprecated ? undefined : {
						label: createMatches(symbolScore, symbolLabelWithIcon.length - symbolLabel.length /* Readjust matches to account for codicons in label */),
						description: createMatches(containerScore)
					},
					range: {
						selection: Range.collapseToStart(symbol.selectionRange),
						decoration: symbol.range
					},
					strikethrough: deprecated,
					buttons: (() => {
						const openSideBySideDirection = this.options?.openSideBySideDirection();
						if (!openSideBySideDirection) {
							return undefined;
						}

						return [
							{
								iconClass: openSideBySideDirection === 'right' ? 'codicon-split-horizontal' : 'codicon-split-vertical',
								tooltip: openSideBySideDirection === 'right' ? localize('openToSide', "Open to the Side") : localize('openToBottom', "Open to the Bottom")
							}
						];
					})()
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

	protected async getDocumentSymbols(document: ITextModel, flatten: boolean, token: CancellationToken): Promise<DocumentSymbol[]> {
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
