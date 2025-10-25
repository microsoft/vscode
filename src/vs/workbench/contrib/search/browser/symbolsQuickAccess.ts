/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IPickerQuickAccessItem, PickerQuickAccessProvider, TriggerAction } from '../../../../platform/quickinput/browser/pickerQuickAccess.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ThrottledDelayer } from '../../../../base/common/async.js';
import { getWorkspaceSymbols, IWorkspaceSymbol, IWorkspaceSymbolProvider } from '../common/search.js';
import { SymbolKinds, SymbolTag, SymbolKind } from '../../../../editor/common/languages.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { Schemas } from '../../../../base/common/network.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IEditorService, SIDE_GROUP, ACTIVE_GROUP } from '../../../services/editor/common/editorService.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkbenchEditorConfiguration } from '../../../common/editor.js';
import { IKeyMods, IQuickPickItemWithResource } from '../../../../platform/quickinput/common/quickInput.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { getSelectionSearchString } from '../../../../editor/contrib/find/browser/findController.js';
import { prepareQuery, IPreparedQuery, scoreFuzzy2, pieceToQuery } from '../../../../base/common/fuzzyScorer.js';
import { IMatch } from '../../../../base/common/filters.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';

export interface ISymbolQuickPickItem extends IPickerQuickAccessItem, IQuickPickItemWithResource {
	score?: number;
	symbol?: IWorkspaceSymbol;
}

export class SymbolsQuickAccessProvider extends PickerQuickAccessProvider<ISymbolQuickPickItem> {

	static PREFIX = '#';

	private static readonly TYPING_SEARCH_DELAY = 200; // this delay accommodates for the user typing a word and then stops typing to start searching

	private static TREAT_AS_GLOBAL_SYMBOL_TYPES = new Set<SymbolKind>([
		SymbolKind.Class,
		SymbolKind.Enum,
		SymbolKind.File,
		SymbolKind.Interface,
		SymbolKind.Namespace,
		SymbolKind.Package,
		SymbolKind.Module
	]);

	private delayer = this._register(new ThrottledDelayer<ISymbolQuickPickItem[]>(SymbolsQuickAccessProvider.TYPING_SEARCH_DELAY));

	get defaultFilterValue(): string | undefined {

		// Prefer the word under the cursor in the active editor as default filter
		const editor = this.codeEditorService.getFocusedCodeEditor();
		if (editor) {
			return getSelectionSearchString(editor) ?? undefined;
		}

		return undefined;
	}

	constructor(
		@ILabelService private readonly labelService: ILabelService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService
	) {
		super(SymbolsQuickAccessProvider.PREFIX, {
			canAcceptInBackground: true,
			noResultsPick: {
				label: localize('noSymbolResults', "No matching workspace symbols")
			}
		});
	}

	private get configuration() {
		const editorConfig = this.configurationService.getValue<IWorkbenchEditorConfiguration>().workbench?.editor;

		return {
			openEditorPinned: !editorConfig?.enablePreviewFromQuickOpen || !editorConfig?.enablePreview,
			openSideBySideDirection: editorConfig?.openSideBySideDirection
		};
	}

	protected _getPicks(filter: string, disposables: DisposableStore, token: CancellationToken): Promise<Array<ISymbolQuickPickItem>> {
		return this.getSymbolPicks(filter, undefined, token);
	}

	async getSymbolPicks(filter: string, options: { skipLocal?: boolean; skipSorting?: boolean; delay?: number } | undefined, token: CancellationToken): Promise<Array<ISymbolQuickPickItem>> {
		return this.delayer.trigger(async () => {
			if (token.isCancellationRequested) {
				return [];
			}

			return this.doGetSymbolPicks(prepareQuery(filter), options, token);
		}, options?.delay);
	}

	private async doGetSymbolPicks(query: IPreparedQuery, options: { skipLocal?: boolean; skipSorting?: boolean } | undefined, token: CancellationToken): Promise<Array<ISymbolQuickPickItem>> {

		// Split between symbol and container query
		let symbolQuery: IPreparedQuery;
		let containerQuery: IPreparedQuery | undefined;
		if (query.values && query.values.length > 1) {
			symbolQuery = pieceToQuery(query.values[0]); 		  // symbol: only match on first part
			containerQuery = pieceToQuery(query.values.slice(1)); // container: match on all but first parts
		} else {
			symbolQuery = query;
		}

		// Run the workspace symbol query
		const workspaceSymbols = await getWorkspaceSymbols(symbolQuery.original, token);
		if (token.isCancellationRequested) {
			return [];
		}

		const symbolPicks: Array<ISymbolQuickPickItem> = [];

		// Convert to symbol picks and apply filtering
		const openSideBySideDirection = this.configuration.openSideBySideDirection;
		for (const { symbol, provider } of workspaceSymbols) {

			// Depending on the workspace symbols filter setting, skip over symbols that:
			// - do not have a container
			// - and are not treated explicitly as global symbols (e.g. classes)
			if (options?.skipLocal && !SymbolsQuickAccessProvider.TREAT_AS_GLOBAL_SYMBOL_TYPES.has(symbol.kind) && !!symbol.containerName) {
				continue;
			}

			const symbolLabel = symbol.name;

			// Score by symbol label if searching
			let symbolScore: number | undefined = undefined;
			let symbolMatches: IMatch[] | undefined = undefined;
			let skipContainerQuery = false;
			if (symbolQuery.original.length > 0) {

				// First: try to score on the entire query, it is possible that
				// the symbol matches perfectly (e.g. searching for "change log"
				// can be a match on a markdown symbol "change log"). In that
				// case we want to skip the container query altogether.
				if (symbolQuery !== query) {
					[symbolScore, symbolMatches] = scoreFuzzy2(symbolLabel, { ...query, values: undefined /* disable multi-query support */ }, 0, 0);
					if (typeof symbolScore === 'number') {
						skipContainerQuery = true; // since we consumed the query, skip any container matching
					}
				}

				// Otherwise: score on the symbol query and match on the container later
				if (typeof symbolScore !== 'number') {
					[symbolScore, symbolMatches] = scoreFuzzy2(symbolLabel, symbolQuery, 0, 0);
					if (typeof symbolScore !== 'number') {
						continue;
					}
				}
			}

			const symbolUri = symbol.location.uri;
			let containerLabel: string | undefined = undefined;
			if (symbolUri) {
				const containerPath = this.labelService.getUriLabel(symbolUri, { relative: true });
				if (symbol.containerName) {
					containerLabel = `${symbol.containerName} • ${containerPath}`;
				} else {
					containerLabel = containerPath;
				}
			}

			// Score by container if specified and searching
			let containerScore: number | undefined = undefined;
			let containerMatches: IMatch[] | undefined = undefined;
			if (!skipContainerQuery && containerQuery && containerQuery.original.length > 0) {
				if (containerLabel) {
					[containerScore, containerMatches] = scoreFuzzy2(containerLabel, containerQuery);
				}

				if (typeof containerScore !== 'number') {
					continue;
				}

				if (typeof symbolScore === 'number') {
					symbolScore += containerScore; // boost symbolScore by containerScore
				}
			}

			const deprecated = symbol.tags ? symbol.tags.indexOf(SymbolTag.Deprecated) >= 0 : false;

			symbolPicks.push({
				symbol,
				resource: symbolUri,
				score: symbolScore,
				iconClass: ThemeIcon.asClassName(SymbolKinds.toIcon(symbol.kind)),
				label: symbolLabel,
				ariaLabel: symbolLabel,
				highlights: deprecated ? undefined : {
					label: symbolMatches,
					description: containerMatches
				},
				description: containerLabel,
				strikethrough: deprecated,
				buttons: [
					{
						iconClass: openSideBySideDirection === 'right' ? ThemeIcon.asClassName(Codicon.splitHorizontal) : ThemeIcon.asClassName(Codicon.splitVertical),
						tooltip: openSideBySideDirection === 'right' ? localize('openToSide', "Open to the Side") : localize('openToBottom', "Open to the Bottom")
					}
				],
				trigger: (buttonIndex, keyMods) => {
					this.openSymbol(provider, symbol, token, { keyMods, forceOpenSideBySide: true });

					return TriggerAction.CLOSE_PICKER;
				},
				accept: async (keyMods, event) => this.openSymbol(provider, symbol, token, { keyMods, preserveFocus: event.inBackground, forcePinned: event.inBackground }),
			});

		}

		// Sort picks (unless disabled)
		if (!options?.skipSorting) {
			symbolPicks.sort((symbolA, symbolB) => this.compareSymbols(symbolA, symbolB));
		}

		return symbolPicks;
	}

	private async openSymbol(provider: IWorkspaceSymbolProvider, symbol: IWorkspaceSymbol, token: CancellationToken, options: { keyMods: IKeyMods; forceOpenSideBySide?: boolean; preserveFocus?: boolean; forcePinned?: boolean }): Promise<void> {

		// Resolve actual symbol to open for providers that can resolve
		let symbolToOpen = symbol;
		if (typeof provider.resolveWorkspaceSymbol === 'function') {
			symbolToOpen = await provider.resolveWorkspaceSymbol(symbol, token) || symbol;

			if (token.isCancellationRequested) {
				return;
			}
		}

		// Open HTTP(s) links with opener service
		if (symbolToOpen.location.uri.scheme === Schemas.http || symbolToOpen.location.uri.scheme === Schemas.https) {
			await this.openerService.open(symbolToOpen.location.uri, { fromUserGesture: true, allowContributedOpeners: true });
		}

		// Otherwise open as editor
		else {
			await this.editorService.openEditor({
				resource: symbolToOpen.location.uri,
				options: {
					preserveFocus: options?.preserveFocus,
					pinned: options.keyMods.ctrlCmd || options.forcePinned || this.configuration.openEditorPinned,
					selection: symbolToOpen.location.range ? Range.collapseToStart(symbolToOpen.location.range) : undefined
				}
			}, options.keyMods.alt || (this.configuration.openEditorPinned && options.keyMods.ctrlCmd) || options?.forceOpenSideBySide ? SIDE_GROUP : ACTIVE_GROUP);
		}
	}

	private compareSymbols(symbolA: ISymbolQuickPickItem, symbolB: ISymbolQuickPickItem): number {

		// By score
		if (typeof symbolA.score === 'number' && typeof symbolB.score === 'number') {
			if (symbolA.score > symbolB.score) {
				return -1;
			}

			if (symbolA.score < symbolB.score) {
				return 1;
			}
		}

		// By name
		if (symbolA.symbol && symbolB.symbol) {
			const symbolAName = symbolA.symbol.name.toLowerCase();
			const symbolBName = symbolB.symbol.name.toLowerCase();
			const res = symbolAName.localeCompare(symbolBName);
			if (res !== 0) {
				return res;
			}
		}

		// By kind
		if (symbolA.symbol && symbolB.symbol) {
			const symbolAKind = SymbolKinds.toIcon(symbolA.symbol.kind).id;
			const symbolBKind = SymbolKinds.toIcon(symbolB.symbol.kind).id;
			return symbolAKind.localeCompare(symbolBKind);
		}

		return 0;
	}
}
