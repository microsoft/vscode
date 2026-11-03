/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IKeyMods, IQuickPickSeparator, IQuickInputService, IQuickPick, IQuickPickItem, ItemActivation } from '../../../../../platform/quickinput/common/quickInput.js';
import { IEditorService, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { IRange } from '../../../../../editor/common/core/range.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IQuickAccessRegistry, Extensions as QuickaccessExtensions, IQuickAccessProviderRunOptions } from '../../../../../platform/quickinput/common/quickAccess.js';
import { AbstractGotoSymbolQuickAccessProvider, IGotoSymbolQuickPickItem } from '../../../../../editor/contrib/quickAccess/browser/gotoSymbolQuickAccess.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IWorkbenchEditorConfiguration } from '../../../../common/editor.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { DisposableStore, IDisposable, toDisposable, Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { registerAction2, Action2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { KeyMod, KeyCode } from '../../../../../base/common/keyCodes.js';
import { prepareQuery, IPreparedQuery } from '../../../../../base/common/fuzzyScorer.js';
import { DocumentSymbol, SymbolKind } from '../../../../../editor/common/languages.js';
import { fuzzyScore } from '../../../../../base/common/filters.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IQuickAccessTextEditorContext } from '../../../../../editor/contrib/quickAccess/browser/editorNavigationQuickAccess.js';
import { IOutline, IOutlineService, OutlineTarget } from '../../../../services/outline/browser/outline.js';
import { isCompositeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ITextEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IOutlineModelService } from '../../../../../editor/contrib/documentSymbols/browser/outlineModel.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { accessibilityHelpIsShown, accessibleViewIsShown } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { matchesFuzzyIconAware, parseLabelWithIcons } from '../../../../../base/common/iconLabels.js';
import { isAncestorOfActiveElement } from '../../../../../base/browser/dom.js';
import { ChatOutline, IChatWidget, IChatWidgetService } from '../../../chat/browser/chat.js';
import { ISymbolVariableEntry } from '../../../chat/common/attachments/chatVariableEntries.js';
import { isRequestVM } from '../../../chat/common/model/chatViewModel.js';

/**
 * A single navigable entry backing the "no text editor" symbol picks (chat
 * outline or editor-pane outline). Provides the label to render and how to
 * reveal/preview the underlying element.
 */
interface INavigablePickEntry {
	readonly label: string;
	readonly description?: string;
	readonly ariaLabel?: string;
	readonly iconClasses?: string[];
	reveal(): void;
	preview(): IDisposable;
}

export class GotoSymbolQuickAccessProvider extends AbstractGotoSymbolQuickAccessProvider {

	protected readonly onDidActiveTextEditorControlChange: Event<void>;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IOutlineService private readonly outlineService: IOutlineService,
		@IOutlineModelService outlineModelService: IOutlineModelService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) {
		super(languageFeaturesService, outlineModelService, {
			openSideBySideDirection: () => this.configuration.openSideBySideDirection
		});
		this.onDidActiveTextEditorControlChange = this.editorService.onDidActiveEditorChange;
	}

	//#region DocumentSymbols (text editor required)

	private get configuration() {
		const editorConfig = this.configurationService.getValue<IWorkbenchEditorConfiguration>().workbench?.editor;

		return {
			openEditorPinned: !editorConfig?.enablePreviewFromQuickOpen || !editorConfig?.enablePreview,
			openSideBySideDirection: editorConfig?.openSideBySideDirection
		};
	}

	protected get activeTextEditorControl() {

		// TODO: this distinction should go away by adopting `IOutlineService`
		// for all editors (either text based ones or not). Currently text based
		// editors are not yet using the new outline service infrastructure but the
		// "classical" document symbols approach.
		if (isCompositeEditor(this.editorService.activeEditorPane?.getControl())) {
			return undefined;
		}

		return this.editorService.activeTextEditorControl;
	}

	protected override gotoLocation(context: IQuickAccessTextEditorContext, options: { range: IRange; keyMods: IKeyMods; forceSideBySide?: boolean; preserveFocus?: boolean }): void {

		// Check for sideBySide use
		if ((options.keyMods.alt || (this.configuration.openEditorPinned && options.keyMods.ctrlCmd) || options.forceSideBySide) && this.editorService.activeEditor) {
			context.restoreViewState?.(); // since we open to the side, restore view state in this editor

			const editorOptions: ITextEditorOptions = {
				selection: options.range,
				pinned: options.keyMods.ctrlCmd || this.configuration.openEditorPinned,
				preserveFocus: options.preserveFocus
			};

			this.editorService.openEditor(this.editorService.activeEditor, editorOptions, SIDE_GROUP);
		}

		// Otherwise let parent handle it
		else {
			super.gotoLocation(context, options);
		}
	}

	//#endregion

	//#region public methods to use this picker from other pickers

	private static readonly SYMBOL_PICKS_TIMEOUT = 8000;

	async getSymbolPicks(model: ITextModel, filter: string, options: { extraContainerLabel?: string }, disposables: DisposableStore, token: CancellationToken): Promise<Array<IGotoSymbolQuickPickItem | IQuickPickSeparator>> {

		// If the registry does not know the model, we wait for as long as
		// the registry knows it. This helps in cases where a language
		// registry was not activated yet for providing any symbols.
		// To not wait forever, we eventually timeout though.
		const result = await Promise.race([
			this.waitForLanguageSymbolRegistry(model, disposables),
			timeout(GotoSymbolQuickAccessProvider.SYMBOL_PICKS_TIMEOUT)
		]);

		if (!result || token.isCancellationRequested) {
			return [];
		}

		return this.doGetSymbolPicks(this.getDocumentSymbols(model, token), prepareQuery(filter), options, token, model);
	}

	protected override async doGetSymbolPicks(symbolsPromise: Promise<DocumentSymbol[]>, query: IPreparedQuery, options: { extraContainerLabel?: string } | undefined, token: CancellationToken, model: ITextModel): Promise<Array<IGotoSymbolQuickPickItem | IQuickPickSeparator>> {
		const picks = await super.doGetSymbolPicks(symbolsPromise, query, options, token, model);
		const modelUri = model.uri;
		for (const pick of picks) {
			const symbolPick = pick as IGotoSymbolQuickPickItem;
			if (symbolPick.range && !symbolPick.attach) {
				symbolPick.attach = () => {
					const widget = this.chatWidgetService.lastFocusedWidget;
					if (!widget) {
						return;
					}
					const entry: ISymbolVariableEntry = {
						kind: 'symbol',
						id: JSON.stringify({ uri: modelUri.toString(), range: symbolPick.range!.decoration }),
						name: symbolPick.symbolName ?? symbolPick.label,
						value: { uri: modelUri, range: symbolPick.range!.decoration },
						symbolKind: symbolPick.kind,
					};
					widget.attachmentModel.addContext(entry);
				};
			}
		}
		return picks;
	}

	//#endregion

	override provide(picker: IQuickPick<IQuickPickItem, { useSeparators: true }>, token: CancellationToken, runOptions?: IQuickAccessProviderRunOptions): IDisposable {
		// A focused chat is the navigable resource, even when a regular file
		// editor is also open side by side. The base `provide()` would otherwise
		// route to the active text editor's symbols whenever one exists, so the
		// chat case must be handled here before that decision is made.
		const chatWidget = this.getActiveChatWidget();
		if (chatWidget) {
			picker.canAcceptInBackground = !!this.options?.canAcceptInBackground;
			picker.matchOnLabel = picker.matchOnDescription = picker.matchOnDetail = picker.sortByLabel = false;
			return this.doGetChatWidgetPicks(picker as IQuickPick<IGotoSymbolQuickPickItem, { useSeparators: true }>, chatWidget);
		}

		return super.provide(picker, token, runOptions);
	}

	protected override provideWithoutTextEditor(picker: IQuickPick<IGotoSymbolQuickPickItem, { useSeparators: true }>): IDisposable {
		if (this.canPickWithOutlineService()) {
			return this.doGetOutlinePicks(picker);
		}

		return super.provideWithoutTextEditor(picker);
	}

	private canPickWithOutlineService(): boolean {
		return this.editorService.activeEditorPane ? this.outlineService.canCreateOutline(this.editorService.activeEditorPane) : false;
	}

	private getActiveChatWidget(): IChatWidget | undefined {
		// Treat the chat as the navigable resource only when it actually has DOM
		// focus. This is checked before the quick input steals focus (the picker
		// is shown after `provide()` runs), works across windows via the focused
		// document, and avoids hijacking Go to Symbol when a non-chat surface is
		// focused. Only offer the chat when it has requests to navigate to.
		const widget = this.chatWidgetService.lastFocusedWidget;
		if (!widget || !isAncestorOfActiveElement(widget.domNode)) {
			return undefined;
		}
		return widget.viewModel?.getItems().some(isRequestVM) ? widget : undefined;
	}

	private doGetChatWidgetPicks(picker: IQuickPick<IGotoSymbolQuickPickItem, { useSeparators: true }>, widget: IChatWidget): IDisposable {
		const disposables = new DisposableStore();
		const outline = disposables.add(new ChatOutline(widget, OutlineTarget.QuickPick));
		this.installNavigablePicks(picker, disposables, this.outlineToNavigableEntries(outline));
		return disposables;
	}

	private doGetOutlinePicks(picker: IQuickPick<IGotoSymbolQuickPickItem, { useSeparators: true }>): IDisposable {
		const pane = this.editorService.activeEditorPane;
		if (!pane) {
			return Disposable.None;
		}
		const cts = new CancellationTokenSource();

		const disposables = new DisposableStore();
		disposables.add(toDisposable(() => cts.dispose(true)));

		picker.busy = true;

		this.outlineService.createOutline(pane, OutlineTarget.QuickPick, cts.token).then(outline => {

			if (!outline) {
				return;
			}
			if (cts.token.isCancellationRequested) {
				outline.dispose();
				return;
			}

			disposables.add(outline);

			const viewState = outline.captureViewState();
			disposables.add(toDisposable(() => {
				if (picker.selectedItems.length === 0) {
					viewState.dispose();
				}
			}));

			this.installNavigablePicks(picker, disposables, this.outlineToNavigableEntries(outline));

		}).catch(err => {
			onUnexpectedError(err);
			picker.hide();
		}).finally(() => {
			picker.busy = false;
		});

		return disposables;
	}

	private outlineToNavigableEntries<E>(outline: IOutline<E>): INavigablePickEntry[] {
		return outline.config.quickPickDataSource.getQuickPickElements().map(element => ({
			label: element.label,
			description: element.description,
			ariaLabel: element.ariaLabel,
			iconClasses: element.iconClasses,
			reveal: () => outline.reveal(element.element, {}, false, false),
			preview: () => outline.preview(element.element)
		}));
	}

	private installNavigablePicks(picker: IQuickPick<IGotoSymbolQuickPickItem, { useSeparators: true }>, disposables: DisposableStore, entries: readonly INavigablePickEntry[]): void {
		const items: IGotoSymbolQuickPickItem[] = entries.map((entry, index) => {
			return {
				kind: SymbolKind.File,
				index,
				score: 0,
				label: entry.label,
				description: entry.description,
				ariaLabel: entry.ariaLabel,
				iconClasses: entry.iconClasses
			};
		});

		disposables.add(picker.onDidAccept(() => {
			picker.hide();
			const [item] = picker.selectedItems;
			if (item) {
				entries[item.index]?.reveal();
			}
		}));

		const updatePickerItems = () => {
			const filteredItems = items.filter(item => {
				if (picker.value === '@') {
					// default, no filtering, scoring...
					item.score = 0;
					item.highlights = undefined;
					return true;
				}

				const trimmedQuery = picker.value.substring(AbstractGotoSymbolQuickAccessProvider.PREFIX.length).trim();
				const parsedLabel = parseLabelWithIcons(item.label);
				const score = fuzzyScore(trimmedQuery, trimmedQuery.toLowerCase(), 0,
					parsedLabel.text, parsedLabel.text.toLowerCase(), 0,
					{ firstMatchCanBeWeak: true, boostFullMatch: true });

				if (!score) {
					return false;
				}

				item.score = score[1];
				item.highlights = { label: matchesFuzzyIconAware(trimmedQuery, parsedLabel) ?? undefined };
				return true;
			});

			if (filteredItems.length === 0) {
				const label = localize('empty', 'No matching entries');
				picker.items = [{ label, index: -1, kind: SymbolKind.String }];
				picker.ariaLabel = label;
			} else {
				picker.items = filteredItems;
			}
		};
		updatePickerItems();
		disposables.add(picker.onDidChangeValue(updatePickerItems));

		const previewDisposable = new MutableDisposable();
		disposables.add(previewDisposable);

		disposables.add(picker.onDidChangeActive(() => {
			const [item] = picker.activeItems;
			if (item) {
				previewDisposable.value = entries[item.index]?.preview();
			} else {
				previewDisposable.clear();
			}
		}));
	}
}

class GotoSymbolAction extends Action2 {

	static readonly ID = 'workbench.action.gotoSymbol';

	constructor() {
		super({
			id: GotoSymbolAction.ID,
			title: {
				...localize2('gotoSymbol', "Go to Symbol in Editor..."),
				mnemonicTitle: localize({ key: 'miGotoSymbolInEditor', comment: ['&& denotes a mnemonic'] }, "Go to &&Symbol in Editor..."),
			},
			f1: true,
			keybinding: {
				when: ContextKeyExpr.and(accessibleViewIsShown.negate(), accessibilityHelpIsShown.negate()),
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyO
			},
			menu: [{
				id: MenuId.MenubarGoMenu,
				group: '4_symbol_nav',
				order: 1
			}]
		});
	}

	run(accessor: ServicesAccessor) {
		accessor.get(IQuickInputService).quickAccess.show(GotoSymbolQuickAccessProvider.PREFIX, { itemActivation: ItemActivation.NONE });
	}
}

registerAction2(GotoSymbolAction);

Registry.as<IQuickAccessRegistry>(QuickaccessExtensions.Quickaccess).registerQuickAccessProvider({
	ctor: GotoSymbolQuickAccessProvider,
	prefix: AbstractGotoSymbolQuickAccessProvider.PREFIX,
	contextKey: 'inFileSymbolsPicker',
	placeholder: localize('gotoSymbolQuickAccessPlaceholder', "Type the name of a symbol to go to."),
	helpEntries: [
		{
			description: localize('gotoSymbolQuickAccess', "Go to Symbol in Editor"),
			prefix: AbstractGotoSymbolQuickAccessProvider.PREFIX,
			commandId: GotoSymbolAction.ID,
			commandCenterOrder: 40
		},
		{
			description: localize('gotoSymbolByCategoryQuickAccess', "Go to Symbol in Editor by Category"),
			prefix: AbstractGotoSymbolQuickAccessProvider.PREFIX_BY_CATEGORY
		}
	]
});
