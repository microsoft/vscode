/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AbstractGotoSymbolQuickAccessProvider_1;
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { pieceToQuery, prepareQuery, scoreFuzzy2 } from '../../../../base/common/fuzzyScorer.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { format, trim } from '../../../../base/common/strings.js';
import { Range } from '../../../common/core/range.js';
import { SymbolKinds, getAriaLabelForSymbol } from '../../../common/languages.js';
import { IOutlineModelService } from '../../documentSymbols/browser/outlineModel.js';
import { AbstractEditorNavigationQuickAccessProvider } from './editorNavigationQuickAccess.js';
import { localize } from '../../../../nls.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { findLast } from '../../../../base/common/arraysFind.js';
let AbstractGotoSymbolQuickAccessProvider = class AbstractGotoSymbolQuickAccessProvider extends AbstractEditorNavigationQuickAccessProvider {
    static { AbstractGotoSymbolQuickAccessProvider_1 = this; }
    static { this.PREFIX = '@'; }
    static { this.SCOPE_PREFIX = ':'; }
    static { this.PREFIX_BY_CATEGORY = `${this.PREFIX}${this.SCOPE_PREFIX}`; }
    constructor(_languageFeaturesService, _outlineModelService, options = Object.create(null)) {
        super(options);
        this._languageFeaturesService = _languageFeaturesService;
        this._outlineModelService = _outlineModelService;
        this.options = options;
        this.options.canAcceptInBackground = true;
    }
    provideWithoutTextEditor(picker) {
        this.provideLabelPick(picker, localize('cannotRunGotoSymbolWithoutEditor', "To go to a symbol, first open a text editor with symbol information."));
        return Disposable.None;
    }
    provideWithTextEditor(context, picker, token, runOptions) {
        const editor = context.editor;
        const model = this.getModel(editor);
        if (!model) {
            return Disposable.None;
        }
        // Provide symbols from model if available in registry
        if (this._languageFeaturesService.documentSymbolProvider.has(model)) {
            return this.doProvideWithEditorSymbols(context, model, picker, token, runOptions);
        }
        // Otherwise show an entry for a model without registry
        // But give a chance to resolve the symbols at a later
        // point if possible
        return this.doProvideWithoutEditorSymbols(context, model, picker, token);
    }
    doProvideWithoutEditorSymbols(context, model, picker, token) {
        const disposables = new DisposableStore();
        // Generic pick for not having any symbol information
        this.provideLabelPick(picker, localize('cannotRunGotoSymbolWithoutSymbolProvider', "The active text editor does not provide symbol information."));
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
            disposables.add(this.doProvideWithEditorSymbols(context, model, picker, token));
        })();
        return disposables;
    }
    provideLabelPick(picker, label) {
        picker.items = [{ label, index: 0, kind: 14 /* SymbolKind.String */ }];
        picker.ariaLabel = label;
    }
    async waitForLanguageSymbolRegistry(model, disposables) {
        if (this._languageFeaturesService.documentSymbolProvider.has(model)) {
            return true;
        }
        const symbolProviderRegistryPromise = new DeferredPromise();
        // Resolve promise when registry knows model
        const symbolProviderListener = disposables.add(this._languageFeaturesService.documentSymbolProvider.onDidChange(() => {
            if (this._languageFeaturesService.documentSymbolProvider.has(model)) {
                symbolProviderListener.dispose();
                symbolProviderRegistryPromise.complete(true);
            }
        }));
        // Resolve promise when we get disposed too
        disposables.add(toDisposable(() => symbolProviderRegistryPromise.complete(false)));
        return symbolProviderRegistryPromise.p;
    }
    doProvideWithEditorSymbols(context, model, picker, token, runOptions) {
        const editor = context.editor;
        const disposables = new DisposableStore();
        // Goto symbol once picked
        disposables.add(picker.onDidAccept(event => {
            const [item] = picker.selectedItems;
            if (item && item.range) {
                // When shift is held and attach is available, delegate to attach
                // (e.g. to add to chat context) instead of navigating
                if (picker.keyMods.shift && item.attach) {
                    item.attach(picker.keyMods, event);
                    return;
                }
                this.gotoLocation(context, { range: item.range.selection, keyMods: picker.keyMods, preserveFocus: event.inBackground });
                runOptions?.handleAccept?.(item, event.inBackground);
                if (!event.inBackground) {
                    picker.hide();
                }
            }
        }));
        // Goto symbol side by side if enabled
        disposables.add(picker.onDidTriggerItemButton(({ item }) => {
            if (item && item.range) {
                this.gotoLocation(context, { range: item.range.selection, keyMods: picker.keyMods, forceSideBySide: true });
                picker.hide();
            }
        }));
        // Resolve symbols from document once and reuse this
        // request for all filtering and typing then on
        const symbolsPromise = this.getDocumentSymbols(model, token);
        // Set initial picks and update on type
        const picksCts = disposables.add(new MutableDisposable());
        const updatePickerItems = async (positionToEnclose) => {
            // Cancel any previous ask for picks and busy
            picksCts?.value?.cancel();
            picker.busy = false;
            // Create new cancellation source for this run
            picksCts.value = new CancellationTokenSource();
            // Collect symbol picks
            picker.busy = true;
            try {
                const query = prepareQuery(picker.value.substr(AbstractGotoSymbolQuickAccessProvider_1.PREFIX.length).trim());
                const items = await this.doGetSymbolPicks(symbolsPromise, query, undefined, picksCts.value.token, model);
                if (token.isCancellationRequested) {
                    return;
                }
                if (items.length > 0) {
                    picker.items = items;
                    if (positionToEnclose && query.original.length === 0) {
                        const candidate = findLast(items, item => Boolean(item.type !== 'separator' && item.range && Range.containsPosition(item.range.decoration, positionToEnclose)));
                        if (candidate) {
                            picker.activeItems = [candidate];
                        }
                    }
                }
                else {
                    if (query.original.length > 0) {
                        this.provideLabelPick(picker, localize('noMatchingSymbolResults', "No matching editor symbols"));
                    }
                    else {
                        this.provideLabelPick(picker, localize('noSymbolResults', "No editor symbols"));
                    }
                }
            }
            finally {
                if (!token.isCancellationRequested) {
                    picker.busy = false;
                }
            }
        };
        disposables.add(picker.onDidChangeValue(() => updatePickerItems(undefined)));
        updatePickerItems(editor.getSelection()?.getPosition());
        // Reveal and decorate when active item changes
        disposables.add(picker.onDidChangeActive(() => {
            const [item] = picker.activeItems;
            if (item && item.range) {
                // Reveal
                editor.revealRangeInCenter(item.range.selection, 0 /* ScrollType.Smooth */);
                // Decorate
                this.addDecorations(editor, item.range.decoration);
            }
        }));
        return disposables;
    }
    async doGetSymbolPicks(symbolsPromise, query, options, token, model) {
        const symbols = await symbolsPromise;
        if (token.isCancellationRequested) {
            return [];
        }
        const filterBySymbolKind = query.original.indexOf(AbstractGotoSymbolQuickAccessProvider_1.SCOPE_PREFIX) === 0;
        const filterPos = filterBySymbolKind ? 1 : 0;
        // Split between symbol and container query
        let symbolQuery;
        let containerQuery;
        if (query.values && query.values.length > 1) {
            symbolQuery = pieceToQuery(query.values[0]); // symbol: only match on first part
            containerQuery = pieceToQuery(query.values.slice(1)); // container: match on all but first parts
        }
        else {
            symbolQuery = query;
        }
        // Convert to symbol picks and apply filtering
        let buttons;
        const openSideBySideDirection = this.options?.openSideBySideDirection?.();
        if (openSideBySideDirection) {
            buttons = [{
                    iconClass: openSideBySideDirection === 'right' ? ThemeIcon.asClassName(Codicon.splitHorizontal) : ThemeIcon.asClassName(Codicon.splitVertical),
                    tooltip: openSideBySideDirection === 'right' ? localize('openToSide', "Open to the Side") : localize('openToBottom', "Open to the Bottom")
                }];
        }
        const filteredSymbolPicks = [];
        for (let index = 0; index < symbols.length; index++) {
            const symbol = symbols[index];
            const symbolLabel = trim(symbol.name);
            const symbolLabelWithIcon = `$(${SymbolKinds.toIcon(symbol.kind).id}) ${symbolLabel}`;
            const symbolLabelIconOffset = symbolLabelWithIcon.length - symbolLabel.length;
            let containerLabel = symbol.containerName;
            if (options?.extraContainerLabel) {
                if (containerLabel) {
                    containerLabel = `${options.extraContainerLabel} • ${containerLabel}`;
                }
                else {
                    containerLabel = options.extraContainerLabel;
                }
            }
            let symbolScore = undefined;
            let symbolMatches = undefined;
            let containerScore = undefined;
            let containerMatches = undefined;
            if (query.original.length > filterPos) {
                // First: try to score on the entire query, it is possible that
                // the symbol matches perfectly (e.g. searching for "change log"
                // can be a match on a markdown symbol "change log"). In that
                // case we want to skip the container query altogether.
                let skipContainerQuery = false;
                if (symbolQuery !== query) {
                    [symbolScore, symbolMatches] = scoreFuzzy2(symbolLabelWithIcon, { ...query, values: undefined /* disable multi-query support */ }, filterPos, symbolLabelIconOffset);
                    if (typeof symbolScore === 'number') {
                        skipContainerQuery = true; // since we consumed the query, skip any container matching
                    }
                }
                // Otherwise: score on the symbol query and match on the container later
                if (typeof symbolScore !== 'number') {
                    [symbolScore, symbolMatches] = scoreFuzzy2(symbolLabelWithIcon, symbolQuery, filterPos, symbolLabelIconOffset);
                    if (typeof symbolScore !== 'number') {
                        continue;
                    }
                }
                // Score by container if specified
                if (!skipContainerQuery && containerQuery) {
                    if (containerLabel && containerQuery.original.length > 0) {
                        [containerScore, containerMatches] = scoreFuzzy2(containerLabel, containerQuery);
                    }
                    if (typeof containerScore !== 'number') {
                        continue;
                    }
                    if (typeof symbolScore === 'number') {
                        symbolScore += containerScore; // boost symbolScore by containerScore
                    }
                }
            }
            const deprecated = symbol.tags && symbol.tags.indexOf(1 /* SymbolTag.Deprecated */) >= 0;
            filteredSymbolPicks.push({
                index,
                kind: symbol.kind,
                score: symbolScore,
                label: symbolLabelWithIcon,
                ariaLabel: getAriaLabelForSymbol(symbol.name, symbol.kind),
                description: containerLabel,
                highlights: deprecated ? undefined : {
                    label: symbolMatches,
                    description: containerMatches
                },
                range: {
                    selection: Range.collapseToStart(symbol.selectionRange),
                    decoration: symbol.range
                },
                uri: model.uri,
                symbolName: symbolLabel,
                strikethrough: deprecated,
                buttons
            });
        }
        // Sort by score
        const sortedFilteredSymbolPicks = filteredSymbolPicks.sort((symbolA, symbolB) => filterBySymbolKind ?
            this.compareByKindAndScore(symbolA, symbolB) :
            this.compareByScore(symbolA, symbolB));
        // Add separator for types
        // - @  only total number of symbols
        // - @: grouped by symbol kind
        let symbolPicks = [];
        if (filterBySymbolKind) {
            let lastSymbolKind = undefined;
            let lastSeparator = undefined;
            let lastSymbolKindCounter = 0;
            function updateLastSeparatorLabel() {
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
        }
        else if (sortedFilteredSymbolPicks.length > 0) {
            symbolPicks = [
                { label: localize('symbols', "symbols ({0})", filteredSymbolPicks.length), type: 'separator' },
                ...sortedFilteredSymbolPicks
            ];
        }
        return symbolPicks;
    }
    compareByScore(symbolA, symbolB) {
        if (typeof symbolA.score !== 'number' && typeof symbolB.score === 'number') {
            return 1;
        }
        else if (typeof symbolA.score === 'number' && typeof symbolB.score !== 'number') {
            return -1;
        }
        if (typeof symbolA.score === 'number' && typeof symbolB.score === 'number') {
            if (symbolA.score > symbolB.score) {
                return -1;
            }
            else if (symbolA.score < symbolB.score) {
                return 1;
            }
        }
        if (symbolA.index < symbolB.index) {
            return -1;
        }
        else if (symbolA.index > symbolB.index) {
            return 1;
        }
        return 0;
    }
    compareByKindAndScore(symbolA, symbolB) {
        const kindA = NLS_SYMBOL_KIND_CACHE[symbolA.kind] || FALLBACK_NLS_SYMBOL_KIND;
        const kindB = NLS_SYMBOL_KIND_CACHE[symbolB.kind] || FALLBACK_NLS_SYMBOL_KIND;
        // Sort by type first if scoped search
        const result = kindA.localeCompare(kindB);
        if (result === 0) {
            return this.compareByScore(symbolA, symbolB);
        }
        return result;
    }
    async getDocumentSymbols(document, token) {
        const model = await this._outlineModelService.getOrCreate(document, token);
        return token.isCancellationRequested ? [] : model.asListOfDocumentSymbols();
    }
};
AbstractGotoSymbolQuickAccessProvider = AbstractGotoSymbolQuickAccessProvider_1 = __decorate([
    __param(0, ILanguageFeaturesService),
    __param(1, IOutlineModelService)
], AbstractGotoSymbolQuickAccessProvider);
export { AbstractGotoSymbolQuickAccessProvider };
// #region NLS Helpers
const FALLBACK_NLS_SYMBOL_KIND = localize('property', "properties ({0})");
const NLS_SYMBOL_KIND_CACHE = {
    [5 /* SymbolKind.Method */]: localize('method', "methods ({0})"),
    [11 /* SymbolKind.Function */]: localize('function', "functions ({0})"),
    [8 /* SymbolKind.Constructor */]: localize('_constructor', "constructors ({0})"),
    [12 /* SymbolKind.Variable */]: localize('variable', "variables ({0})"),
    [4 /* SymbolKind.Class */]: localize('class', "classes ({0})"),
    [22 /* SymbolKind.Struct */]: localize('struct', "structs ({0})"),
    [23 /* SymbolKind.Event */]: localize('event', "events ({0})"),
    [24 /* SymbolKind.Operator */]: localize('operator', "operators ({0})"),
    [10 /* SymbolKind.Interface */]: localize('interface', "interfaces ({0})"),
    [2 /* SymbolKind.Namespace */]: localize('namespace', "namespaces ({0})"),
    [3 /* SymbolKind.Package */]: localize('package', "packages ({0})"),
    [25 /* SymbolKind.TypeParameter */]: localize('typeParameter', "type parameters ({0})"),
    [1 /* SymbolKind.Module */]: localize('modules', "modules ({0})"),
    [6 /* SymbolKind.Property */]: localize('property', "properties ({0})"),
    [9 /* SymbolKind.Enum */]: localize('enum', "enumerations ({0})"),
    [21 /* SymbolKind.EnumMember */]: localize('enumMember', "enumeration members ({0})"),
    [14 /* SymbolKind.String */]: localize('string', "strings ({0})"),
    [0 /* SymbolKind.File */]: localize('file', "files ({0})"),
    [17 /* SymbolKind.Array */]: localize('array', "arrays ({0})"),
    [15 /* SymbolKind.Number */]: localize('number', "numbers ({0})"),
    [16 /* SymbolKind.Boolean */]: localize('boolean', "booleans ({0})"),
    [18 /* SymbolKind.Object */]: localize('object', "objects ({0})"),
    [19 /* SymbolKind.Key */]: localize('key', "keys ({0})"),
    [7 /* SymbolKind.Field */]: localize('field', "fields ({0})"),
    [13 /* SymbolKind.Constant */]: localize('constant', "constants ({0})")
};
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ290b1N5bWJvbFF1aWNrQWNjZXNzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvcXVpY2tBY2Nlc3MvYnJvd3Nlci9nb3RvU3ltYm9sUXVpY2tBY2Nlc3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNuRSxPQUFPLEVBQXFCLHVCQUF1QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVqRSxPQUFPLEVBQWtCLFlBQVksRUFBRSxZQUFZLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakgsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakksT0FBTyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNsRSxPQUFPLEVBQVUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFHOUQsT0FBTyxFQUE4QixXQUFXLEVBQWEscUJBQXFCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN6SCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNyRixPQUFPLEVBQUUsMkNBQTJDLEVBQXNFLE1BQU0sa0NBQWtDLENBQUM7QUFDbkssT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRTlDLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBRXhGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQXdCMUQsSUFBZSxxQ0FBcUMsR0FBcEQsTUFBZSxxQ0FBc0MsU0FBUSwyQ0FBMkM7O2FBRXZHLFdBQU0sR0FBRyxHQUFHLEFBQU4sQ0FBTzthQUNiLGlCQUFZLEdBQUcsR0FBRyxBQUFOLENBQU87YUFDbkIsdUJBQWtCLEdBQUcsR0FBRyxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxZQUFZLEVBQUUsQUFBdkMsQ0FBd0M7SUFJakUsWUFDNEMsd0JBQWtELEVBQ3RELG9CQUEwQyxFQUNqRixVQUFpRCxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztRQUVwRSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFKNEIsNkJBQXdCLEdBQXhCLHdCQUF3QixDQUEwQjtRQUN0RCx5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXNCO1FBS2pGLElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxPQUFPLENBQUMscUJBQXFCLEdBQUcsSUFBSSxDQUFDO0lBQzNDLENBQUM7SUFFUyx3QkFBd0IsQ0FBQyxNQUFxRTtRQUN2RyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxrQ0FBa0MsRUFBRSxzRUFBc0UsQ0FBQyxDQUFDLENBQUM7UUFFcEosT0FBTyxVQUFVLENBQUMsSUFBSSxDQUFDO0lBQ3hCLENBQUM7SUFFUyxxQkFBcUIsQ0FBQyxPQUFzQyxFQUFFLE1BQXFFLEVBQUUsS0FBd0IsRUFBRSxVQUEyQztRQUNuTixNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDO1FBQzlCLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDcEMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osT0FBTyxVQUFVLENBQUMsSUFBSSxDQUFDO1FBQ3hCLENBQUM7UUFFRCxzREFBc0Q7UUFDdEQsSUFBSSxJQUFJLENBQUMsd0JBQXdCLENBQUMsc0JBQXNCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDckUsT0FBTyxJQUFJLENBQUMsMEJBQTBCLENBQUMsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQ25GLENBQUM7UUFFRCx1REFBdUQ7UUFDdkQsc0RBQXNEO1FBQ3RELG9CQUFvQjtRQUNwQixPQUFPLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztJQUMxRSxDQUFDO0lBRU8sNkJBQTZCLENBQUMsT0FBc0MsRUFBRSxLQUFpQixFQUFFLE1BQXFFLEVBQUUsS0FBd0I7UUFDL0wsTUFBTSxXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUUxQyxxREFBcUQ7UUFDckQsSUFBSSxDQUFDLGdCQUFnQixDQUFDLE1BQU0sRUFBRSxRQUFRLENBQUMsMENBQTBDLEVBQUUsNkRBQTZELENBQUMsQ0FBQyxDQUFDO1FBRW5KLHlEQUF5RDtRQUN6RCw2REFBNkQ7UUFDN0QsdURBQXVEO1FBQ3ZELDhCQUE4QjtRQUM5QixtREFBbUQ7UUFDbkQsQ0FBQyxLQUFLLElBQUksRUFBRTtZQUNYLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLDZCQUE2QixDQUFDLEtBQUssRUFBRSxXQUFXLENBQUMsQ0FBQztZQUM1RSxJQUFJLENBQUMsTUFBTSxJQUFJLEtBQUssQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO2dCQUM5QyxPQUFPO1lBQ1IsQ0FBQztZQUVELFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDakYsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUVMLE9BQU8sV0FBVyxDQUFDO0lBQ3BCLENBQUM7SUFFTyxnQkFBZ0IsQ0FBQyxNQUFxRSxFQUFFLEtBQWE7UUFDNUcsTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsSUFBSSw0QkFBbUIsRUFBRSxDQUFDLENBQUM7UUFDOUQsTUFBTSxDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUM7SUFDMUIsQ0FBQztJQUVTLEtBQUssQ0FBQyw2QkFBNkIsQ0FBQyxLQUFpQixFQUFFLFdBQTRCO1FBQzVGLElBQUksSUFBSSxDQUFDLHdCQUF3QixDQUFDLHNCQUFzQixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3JFLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUVELE1BQU0sNkJBQTZCLEdBQUcsSUFBSSxlQUFlLEVBQVcsQ0FBQztRQUVyRSw0Q0FBNEM7UUFDNUMsTUFBTSxzQkFBc0IsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxzQkFBc0IsQ0FBQyxXQUFXLENBQUMsR0FBRyxFQUFFO1lBQ3BILElBQUksSUFBSSxDQUFDLHdCQUF3QixDQUFDLHNCQUFzQixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUNyRSxzQkFBc0IsQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFFakMsNkJBQTZCLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzlDLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosMkNBQTJDO1FBQzNDLFdBQVcsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLEdBQUcsRUFBRSxDQUFDLDZCQUE2QixDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFbkYsT0FBTyw2QkFBNkIsQ0FBQyxDQUFDLENBQUM7SUFDeEMsQ0FBQztJQUVPLDBCQUEwQixDQUFDLE9BQXNDLEVBQUUsS0FBaUIsRUFBRSxNQUFxRSxFQUFFLEtBQXdCLEVBQUUsVUFBMkM7UUFDek8sTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQztRQUM5QixNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBRTFDLDBCQUEwQjtRQUMxQixXQUFXLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDMUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLE1BQU0sQ0FBQyxhQUFhLENBQUM7WUFDcEMsSUFBSSxJQUFJLElBQUksSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUN4QixpRUFBaUU7Z0JBQ2pFLHNEQUFzRDtnQkFDdEQsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7b0JBQ3pDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQztvQkFDbkMsT0FBTztnQkFDUixDQUFDO2dCQUVELElBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxFQUFFLGFBQWEsRUFBRSxLQUFLLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQztnQkFFeEgsVUFBVSxFQUFFLFlBQVksRUFBRSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsWUFBWSxDQUFDLENBQUM7Z0JBRXJELElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUFFLENBQUM7b0JBQ3pCLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDZixDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixzQ0FBc0M7UUFDdEMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUU7WUFDMUQsSUFBSSxJQUFJLElBQUksSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUN4QixJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sRUFBRSxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsRUFBRSxPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sRUFBRSxlQUFlLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztnQkFFNUcsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2YsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixvREFBb0Q7UUFDcEQsK0NBQStDO1FBQy9DLE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFN0QsdUNBQXVDO1FBQ3ZDLE1BQU0sUUFBUSxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxpQkFBaUIsRUFBMkIsQ0FBQyxDQUFDO1FBQ25GLE1BQU0saUJBQWlCLEdBQUcsS0FBSyxFQUFFLGlCQUF1QyxFQUFFLEVBQUU7WUFFM0UsNkNBQTZDO1lBQzdDLFFBQVEsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLENBQUM7WUFDMUIsTUFBTSxDQUFDLElBQUksR0FBRyxLQUFLLENBQUM7WUFFcEIsOENBQThDO1lBQzlDLFFBQVEsQ0FBQyxLQUFLLEdBQUcsSUFBSSx1QkFBdUIsRUFBRSxDQUFDO1lBRS9DLHVCQUF1QjtZQUN2QixNQUFNLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztZQUNuQixJQUFJLENBQUM7Z0JBQ0osTUFBTSxLQUFLLEdBQUcsWUFBWSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLHVDQUFxQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO2dCQUM1RyxNQUFNLEtBQUssR0FBRyxNQUFNLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxjQUFjLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxRQUFRLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztnQkFDekcsSUFBSSxLQUFLLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztvQkFDbkMsT0FBTztnQkFDUixDQUFDO2dCQUVELElBQUksS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztvQkFDdEIsTUFBTSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7b0JBQ3JCLElBQUksaUJBQWlCLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7d0JBQ3RELE1BQU0sU0FBUyxHQUE2QixRQUFRLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssV0FBVyxJQUFJLElBQUksQ0FBQyxLQUFLLElBQUksS0FBSyxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUMxTCxJQUFJLFNBQVMsRUFBRSxDQUFDOzRCQUNmLE1BQU0sQ0FBQyxXQUFXLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQzt3QkFDbEMsQ0FBQztvQkFDRixDQUFDO2dCQUVGLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO3dCQUMvQixJQUFJLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyx5QkFBeUIsRUFBRSw0QkFBNEIsQ0FBQyxDQUFDLENBQUM7b0JBQ2xHLENBQUM7eUJBQU0sQ0FBQzt3QkFDUCxJQUFJLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDLENBQUM7b0JBQ2pGLENBQUM7Z0JBQ0YsQ0FBQztZQUNGLENBQUM7b0JBQVMsQ0FBQztnQkFDVixJQUFJLENBQUMsS0FBSyxDQUFDLHVCQUF1QixFQUFFLENBQUM7b0JBQ3BDLE1BQU0sQ0FBQyxJQUFJLEdBQUcsS0FBSyxDQUFDO2dCQUNyQixDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUMsQ0FBQztRQUNGLFdBQVcsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsRUFBRSxDQUFDLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM3RSxpQkFBaUIsQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQztRQUd4RCwrQ0FBK0M7UUFDL0MsV0FBVyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsR0FBRyxFQUFFO1lBQzdDLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxNQUFNLENBQUMsV0FBVyxDQUFDO1lBQ2xDLElBQUksSUFBSSxJQUFJLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFFeEIsU0FBUztnQkFDVCxNQUFNLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLDRCQUFvQixDQUFDO2dCQUVwRSxXQUFXO2dCQUNYLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDcEQsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixPQUFPLFdBQVcsQ0FBQztJQUNwQixDQUFDO0lBRVMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLGNBQXlDLEVBQUUsS0FBcUIsRUFBRSxPQUFxRCxFQUFFLEtBQXdCLEVBQUUsS0FBaUI7UUFDcE0sTUFBTSxPQUFPLEdBQUcsTUFBTSxjQUFjLENBQUM7UUFDckMsSUFBSSxLQUFLLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztZQUNuQyxPQUFPLEVBQUUsQ0FBQztRQUNYLENBQUM7UUFFRCxNQUFNLGtCQUFrQixHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLHVDQUFxQyxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUM1RyxNQUFNLFNBQVMsR0FBRyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFN0MsMkNBQTJDO1FBQzNDLElBQUksV0FBMkIsQ0FBQztRQUNoQyxJQUFJLGNBQTBDLENBQUM7UUFDL0MsSUFBSSxLQUFLLENBQUMsTUFBTSxJQUFJLEtBQUssQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQzdDLFdBQVcsR0FBRyxZQUFZLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUssbUNBQW1DO1lBQ3BGLGNBQWMsR0FBRyxZQUFZLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLDBDQUEwQztRQUNqRyxDQUFDO2FBQU0sQ0FBQztZQUNQLFdBQVcsR0FBRyxLQUFLLENBQUM7UUFDckIsQ0FBQztRQUVELDhDQUE4QztRQUU5QyxJQUFJLE9BQXdDLENBQUM7UUFDN0MsTUFBTSx1QkFBdUIsR0FBRyxJQUFJLENBQUMsT0FBTyxFQUFFLHVCQUF1QixFQUFFLEVBQUUsQ0FBQztRQUMxRSxJQUFJLHVCQUF1QixFQUFFLENBQUM7WUFDN0IsT0FBTyxHQUFHLENBQUM7b0JBQ1YsU0FBUyxFQUFFLHVCQUF1QixLQUFLLE9BQU8sQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQztvQkFDOUksT0FBTyxFQUFFLHVCQUF1QixLQUFLLE9BQU8sQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLFlBQVksRUFBRSxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsY0FBYyxFQUFFLG9CQUFvQixDQUFDO2lCQUMxSSxDQUFDLENBQUM7UUFDSixDQUFDO1FBRUQsTUFBTSxtQkFBbUIsR0FBK0IsRUFBRSxDQUFDO1FBQzNELEtBQUssSUFBSSxLQUFLLEdBQUcsQ0FBQyxFQUFFLEtBQUssR0FBRyxPQUFPLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUM7WUFDckQsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBRTlCLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDdEMsTUFBTSxtQkFBbUIsR0FBRyxLQUFLLFdBQVcsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsS0FBSyxXQUFXLEVBQUUsQ0FBQztZQUN0RixNQUFNLHFCQUFxQixHQUFHLG1CQUFtQixDQUFDLE1BQU0sR0FBRyxXQUFXLENBQUMsTUFBTSxDQUFDO1lBRTlFLElBQUksY0FBYyxHQUFHLE1BQU0sQ0FBQyxhQUFhLENBQUM7WUFDMUMsSUFBSSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsQ0FBQztnQkFDbEMsSUFBSSxjQUFjLEVBQUUsQ0FBQztvQkFDcEIsY0FBYyxHQUFHLEdBQUcsT0FBTyxDQUFDLG1CQUFtQixNQUFNLGNBQWMsRUFBRSxDQUFDO2dCQUN2RSxDQUFDO3FCQUFNLENBQUM7b0JBQ1AsY0FBYyxHQUFHLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQztnQkFDOUMsQ0FBQztZQUNGLENBQUM7WUFFRCxJQUFJLFdBQVcsR0FBdUIsU0FBUyxDQUFDO1lBQ2hELElBQUksYUFBYSxHQUF5QixTQUFTLENBQUM7WUFFcEQsSUFBSSxjQUFjLEdBQXVCLFNBQVMsQ0FBQztZQUNuRCxJQUFJLGdCQUFnQixHQUF5QixTQUFTLENBQUM7WUFFdkQsSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxTQUFTLEVBQUUsQ0FBQztnQkFFdkMsK0RBQStEO2dCQUMvRCxnRUFBZ0U7Z0JBQ2hFLDZEQUE2RDtnQkFDN0QsdURBQXVEO2dCQUN2RCxJQUFJLGtCQUFrQixHQUFHLEtBQUssQ0FBQztnQkFDL0IsSUFBSSxXQUFXLEtBQUssS0FBSyxFQUFFLENBQUM7b0JBQzNCLENBQUMsV0FBVyxFQUFFLGFBQWEsQ0FBQyxHQUFHLFdBQVcsQ0FBQyxtQkFBbUIsRUFBRSxFQUFFLEdBQUcsS0FBSyxFQUFFLE1BQU0sRUFBRSxTQUFTLENBQUMsaUNBQWlDLEVBQUUsRUFBRSxTQUFTLEVBQUUscUJBQXFCLENBQUMsQ0FBQztvQkFDckssSUFBSSxPQUFPLFdBQVcsS0FBSyxRQUFRLEVBQUUsQ0FBQzt3QkFDckMsa0JBQWtCLEdBQUcsSUFBSSxDQUFDLENBQUMsMkRBQTJEO29CQUN2RixDQUFDO2dCQUNGLENBQUM7Z0JBRUQsd0VBQXdFO2dCQUN4RSxJQUFJLE9BQU8sV0FBVyxLQUFLLFFBQVEsRUFBRSxDQUFDO29CQUNyQyxDQUFDLFdBQVcsRUFBRSxhQUFhLENBQUMsR0FBRyxXQUFXLENBQUMsbUJBQW1CLEVBQUUsV0FBVyxFQUFFLFNBQVMsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO29CQUMvRyxJQUFJLE9BQU8sV0FBVyxLQUFLLFFBQVEsRUFBRSxDQUFDO3dCQUNyQyxTQUFTO29CQUNWLENBQUM7Z0JBQ0YsQ0FBQztnQkFFRCxrQ0FBa0M7Z0JBQ2xDLElBQUksQ0FBQyxrQkFBa0IsSUFBSSxjQUFjLEVBQUUsQ0FBQztvQkFDM0MsSUFBSSxjQUFjLElBQUksY0FBYyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7d0JBQzFELENBQUMsY0FBYyxFQUFFLGdCQUFnQixDQUFDLEdBQUcsV0FBVyxDQUFDLGNBQWMsRUFBRSxjQUFjLENBQUMsQ0FBQztvQkFDbEYsQ0FBQztvQkFFRCxJQUFJLE9BQU8sY0FBYyxLQUFLLFFBQVEsRUFBRSxDQUFDO3dCQUN4QyxTQUFTO29CQUNWLENBQUM7b0JBRUQsSUFBSSxPQUFPLFdBQVcsS0FBSyxRQUFRLEVBQUUsQ0FBQzt3QkFDckMsV0FBVyxJQUFJLGNBQWMsQ0FBQyxDQUFDLHNDQUFzQztvQkFDdEUsQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQztZQUVELE1BQU0sVUFBVSxHQUFHLE1BQU0sQ0FBQyxJQUFJLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLDhCQUFzQixJQUFJLENBQUMsQ0FBQztZQUVqRixtQkFBbUIsQ0FBQyxJQUFJLENBQUM7Z0JBQ3hCLEtBQUs7Z0JBQ0wsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJO2dCQUNqQixLQUFLLEVBQUUsV0FBVztnQkFDbEIsS0FBSyxFQUFFLG1CQUFtQjtnQkFDMUIsU0FBUyxFQUFFLHFCQUFxQixDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQztnQkFDMUQsV0FBVyxFQUFFLGNBQWM7Z0JBQzNCLFVBQVUsRUFBRSxVQUFVLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7b0JBQ3BDLEtBQUssRUFBRSxhQUFhO29CQUNwQixXQUFXLEVBQUUsZ0JBQWdCO2lCQUM3QjtnQkFDRCxLQUFLLEVBQUU7b0JBQ04sU0FBUyxFQUFFLEtBQUssQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQztvQkFDdkQsVUFBVSxFQUFFLE1BQU0sQ0FBQyxLQUFLO2lCQUN4QjtnQkFDRCxHQUFHLEVBQUUsS0FBSyxDQUFDLEdBQUc7Z0JBQ2QsVUFBVSxFQUFFLFdBQVc7Z0JBQ3ZCLGFBQWEsRUFBRSxVQUFVO2dCQUN6QixPQUFPO2FBQ1AsQ0FBQyxDQUFDO1FBQ0osQ0FBQztRQUVELGdCQUFnQjtRQUNoQixNQUFNLHlCQUF5QixHQUFHLG1CQUFtQixDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sRUFBRSxPQUFPLEVBQUUsRUFBRSxDQUFDLGtCQUFrQixDQUFDLENBQUM7WUFDcEcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQzlDLElBQUksQ0FBQyxjQUFjLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUNyQyxDQUFDO1FBRUYsMEJBQTBCO1FBQzFCLG9DQUFvQztRQUNwQyw4QkFBOEI7UUFDOUIsSUFBSSxXQUFXLEdBQTBELEVBQUUsQ0FBQztRQUM1RSxJQUFJLGtCQUFrQixFQUFFLENBQUM7WUFDeEIsSUFBSSxjQUFjLEdBQTJCLFNBQVMsQ0FBQztZQUN2RCxJQUFJLGFBQWEsR0FBb0MsU0FBUyxDQUFDO1lBQy9ELElBQUkscUJBQXFCLEdBQUcsQ0FBQyxDQUFDO1lBRTlCLFNBQVMsd0JBQXdCO2dCQUNoQyxJQUFJLGFBQWEsSUFBSSxPQUFPLGNBQWMsS0FBSyxRQUFRLElBQUkscUJBQXFCLEdBQUcsQ0FBQyxFQUFFLENBQUM7b0JBQ3RGLGFBQWEsQ0FBQyxLQUFLLEdBQUcsTUFBTSxDQUFDLHFCQUFxQixDQUFDLGNBQWMsQ0FBQyxJQUFJLHdCQUF3QixFQUFFLHFCQUFxQixDQUFDLENBQUM7Z0JBQ3hILENBQUM7WUFDRixDQUFDO1lBRUQsS0FBSyxNQUFNLFVBQVUsSUFBSSx5QkFBeUIsRUFBRSxDQUFDO2dCQUVwRCxpQkFBaUI7Z0JBQ2pCLElBQUksY0FBYyxLQUFLLFVBQVUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztvQkFFeEMsaUVBQWlFO29CQUNqRSx3QkFBd0IsRUFBRSxDQUFDO29CQUUzQixjQUFjLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQztvQkFDakMscUJBQXFCLEdBQUcsQ0FBQyxDQUFDO29CQUUxQixpQ0FBaUM7b0JBQ2pDLGFBQWEsR0FBRyxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsQ0FBQztvQkFDdEMsV0FBVyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztnQkFDakMsQ0FBQztnQkFFRCwrQkFBK0I7cUJBQzFCLENBQUM7b0JBQ0wscUJBQXFCLEVBQUUsQ0FBQztnQkFDekIsQ0FBQztnQkFFRCxzQkFBc0I7Z0JBQ3RCLFdBQVcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDOUIsQ0FBQztZQUVELGlFQUFpRTtZQUNqRSx3QkFBd0IsRUFBRSxDQUFDO1FBQzVCLENBQUM7YUFBTSxJQUFJLHlCQUF5QixDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNqRCxXQUFXLEdBQUc7Z0JBQ2IsRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLFNBQVMsRUFBRSxlQUFlLEVBQUUsbUJBQW1CLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRTtnQkFDOUYsR0FBRyx5QkFBeUI7YUFDNUIsQ0FBQztRQUNILENBQUM7UUFFRCxPQUFPLFdBQVcsQ0FBQztJQUNwQixDQUFDO0lBRU8sY0FBYyxDQUFDLE9BQWlDLEVBQUUsT0FBaUM7UUFDMUYsSUFBSSxPQUFPLE9BQU8sQ0FBQyxLQUFLLEtBQUssUUFBUSxJQUFJLE9BQU8sT0FBTyxDQUFDLEtBQUssS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUM1RSxPQUFPLENBQUMsQ0FBQztRQUNWLENBQUM7YUFBTSxJQUFJLE9BQU8sT0FBTyxDQUFDLEtBQUssS0FBSyxRQUFRLElBQUksT0FBTyxPQUFPLENBQUMsS0FBSyxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ25GLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFDWCxDQUFDO1FBRUQsSUFBSSxPQUFPLE9BQU8sQ0FBQyxLQUFLLEtBQUssUUFBUSxJQUFJLE9BQU8sT0FBTyxDQUFDLEtBQUssS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUM1RSxJQUFJLE9BQU8sQ0FBQyxLQUFLLEdBQUcsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNuQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ1gsQ0FBQztpQkFBTSxJQUFJLE9BQU8sQ0FBQyxLQUFLLEdBQUcsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUMxQyxPQUFPLENBQUMsQ0FBQztZQUNWLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxPQUFPLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNuQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBQ1gsQ0FBQzthQUFNLElBQUksT0FBTyxDQUFDLEtBQUssR0FBRyxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDMUMsT0FBTyxDQUFDLENBQUM7UUFDVixDQUFDO1FBRUQsT0FBTyxDQUFDLENBQUM7SUFDVixDQUFDO0lBRU8scUJBQXFCLENBQUMsT0FBaUMsRUFBRSxPQUFpQztRQUNqRyxNQUFNLEtBQUssR0FBRyxxQkFBcUIsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksd0JBQXdCLENBQUM7UUFDOUUsTUFBTSxLQUFLLEdBQUcscUJBQXFCLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLHdCQUF3QixDQUFDO1FBRTlFLHNDQUFzQztRQUN0QyxNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzFDLElBQUksTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ2xCLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDOUMsQ0FBQztRQUVELE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztJQUVTLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxRQUFvQixFQUFFLEtBQXdCO1FBQ2hGLE1BQU0sS0FBSyxHQUFHLE1BQU0sSUFBSSxDQUFDLG9CQUFvQixDQUFDLFdBQVcsQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDM0UsT0FBTyxLQUFLLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLHVCQUF1QixFQUFFLENBQUM7SUFDN0UsQ0FBQzs7QUF0Wm9CLHFDQUFxQztJQVN4RCxXQUFBLHdCQUF3QixDQUFBO0lBQ3hCLFdBQUEsb0JBQW9CLENBQUE7R0FWRCxxQ0FBcUMsQ0F1WjFEOztBQUVELHNCQUFzQjtBQUV0QixNQUFNLHdCQUF3QixHQUFHLFFBQVEsQ0FBQyxVQUFVLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztBQUMxRSxNQUFNLHFCQUFxQixHQUErQjtJQUN6RCwyQkFBbUIsRUFBRSxRQUFRLENBQUMsUUFBUSxFQUFFLGVBQWUsQ0FBQztJQUN4RCw4QkFBcUIsRUFBRSxRQUFRLENBQUMsVUFBVSxFQUFFLGlCQUFpQixDQUFDO0lBQzlELGdDQUF3QixFQUFFLFFBQVEsQ0FBQyxjQUFjLEVBQUUsb0JBQW9CLENBQUM7SUFDeEUsOEJBQXFCLEVBQUUsUUFBUSxDQUFDLFVBQVUsRUFBRSxpQkFBaUIsQ0FBQztJQUM5RCwwQkFBa0IsRUFBRSxRQUFRLENBQUMsT0FBTyxFQUFFLGVBQWUsQ0FBQztJQUN0RCw0QkFBbUIsRUFBRSxRQUFRLENBQUMsUUFBUSxFQUFFLGVBQWUsQ0FBQztJQUN4RCwyQkFBa0IsRUFBRSxRQUFRLENBQUMsT0FBTyxFQUFFLGNBQWMsQ0FBQztJQUNyRCw4QkFBcUIsRUFBRSxRQUFRLENBQUMsVUFBVSxFQUFFLGlCQUFpQixDQUFDO0lBQzlELCtCQUFzQixFQUFFLFFBQVEsQ0FBQyxXQUFXLEVBQUUsa0JBQWtCLENBQUM7SUFDakUsOEJBQXNCLEVBQUUsUUFBUSxDQUFDLFdBQVcsRUFBRSxrQkFBa0IsQ0FBQztJQUNqRSw0QkFBb0IsRUFBRSxRQUFRLENBQUMsU0FBUyxFQUFFLGdCQUFnQixDQUFDO0lBQzNELG1DQUEwQixFQUFFLFFBQVEsQ0FBQyxlQUFlLEVBQUUsdUJBQXVCLENBQUM7SUFDOUUsMkJBQW1CLEVBQUUsUUFBUSxDQUFDLFNBQVMsRUFBRSxlQUFlLENBQUM7SUFDekQsNkJBQXFCLEVBQUUsUUFBUSxDQUFDLFVBQVUsRUFBRSxrQkFBa0IsQ0FBQztJQUMvRCx5QkFBaUIsRUFBRSxRQUFRLENBQUMsTUFBTSxFQUFFLG9CQUFvQixDQUFDO0lBQ3pELGdDQUF1QixFQUFFLFFBQVEsQ0FBQyxZQUFZLEVBQUUsMkJBQTJCLENBQUM7SUFDNUUsNEJBQW1CLEVBQUUsUUFBUSxDQUFDLFFBQVEsRUFBRSxlQUFlLENBQUM7SUFDeEQseUJBQWlCLEVBQUUsUUFBUSxDQUFDLE1BQU0sRUFBRSxhQUFhLENBQUM7SUFDbEQsMkJBQWtCLEVBQUUsUUFBUSxDQUFDLE9BQU8sRUFBRSxjQUFjLENBQUM7SUFDckQsNEJBQW1CLEVBQUUsUUFBUSxDQUFDLFFBQVEsRUFBRSxlQUFlLENBQUM7SUFDeEQsNkJBQW9CLEVBQUUsUUFBUSxDQUFDLFNBQVMsRUFBRSxnQkFBZ0IsQ0FBQztJQUMzRCw0QkFBbUIsRUFBRSxRQUFRLENBQUMsUUFBUSxFQUFFLGVBQWUsQ0FBQztJQUN4RCx5QkFBZ0IsRUFBRSxRQUFRLENBQUMsS0FBSyxFQUFFLFlBQVksQ0FBQztJQUMvQywwQkFBa0IsRUFBRSxRQUFRLENBQUMsT0FBTyxFQUFFLGNBQWMsQ0FBQztJQUNyRCw4QkFBcUIsRUFBRSxRQUFRLENBQUMsVUFBVSxFQUFFLGlCQUFpQixDQUFDO0NBQzlELENBQUM7QUFFRixZQUFZIn0=