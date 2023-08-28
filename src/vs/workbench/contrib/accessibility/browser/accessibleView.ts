/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventType, addDisposableListener } from 'vs/base/browser/dom';
import { IKeyboardEvent, StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { IAction } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { marked } from 'vs/base/common/marked/marked';
import { isMacintosh } from 'vs/base/common/platform';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { AccessibilityHelpNLS } from 'vs/editor/common/standaloneStrings';
import { CodeActionController } from 'vs/editor/contrib/codeAction/browser/codeActionController';
import { localize } from 'vs/nls';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { WorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewDelegate, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IPickerQuickAccessItem } from 'vs/platform/quickinput/browser/pickerQuickAccess';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { AccessibilityVerbositySettingId, accessibilityHelpIsShown, accessibleViewCurrentProviderId, accessibleViewGoToSymbolSupported, accessibleViewIsShown, accessibleViewSupportsNavigation, accessibleViewVerbosityEnabled } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { AccessibilityCommandId } from 'vs/workbench/contrib/accessibility/common/accessibilityCommands';
import { getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';

const enum DIMENSIONS {
	MAX_WIDTH = 600
}

export interface IAccessibleContentProvider {
	verbositySettingKey: AccessibilityVerbositySettingId;
	options: IAccessibleViewOptions;
	/**
	 * Note that a Codicon class should be provided for each action.
	 * If not, a default will be used.
	 */
	actions?: IAction[];
	provideContent(): string;
	onClose(): void;
	onKeyUp?(e: IKeyboardEvent): void;
	previous?(): void;
	next?(): void;
	/**
	 * When the language is markdown, this is provided by default.
	 */
	getSymbols?(): IAccessibleViewSymbol[];
}

export const IAccessibleViewService = createDecorator<IAccessibleViewService>('accessibleViewService');

export interface IAccessibleViewService {
	readonly _serviceBrand: undefined;
	show(provider: IAccessibleContentProvider): void;
	showAccessibleViewHelp(): void;
	next(): void;
	previous(): void;
	goToSymbol(): void;
	disableHint(): void;
	/**
	 * If the setting is enabled, provides the open accessible view hint as a localized string.
	 * @param verbositySettingKey The setting key for the verbosity of the feature
	 */
	getOpenAriaHint(verbositySettingKey: AccessibilityVerbositySettingId): string | null;
}

export const enum AccessibleViewType {
	Help = 'help',
	View = 'view'
}

export interface IAccessibleViewOptions {
	readMoreUrl?: string;
	/**
	 * Defaults to markdown
	 */
	language?: string;
	type: AccessibleViewType;
}

class AccessibleView extends Disposable {
	private _editorWidget: CodeEditorWidget;

	private _accessiblityHelpIsShown: IContextKey<boolean>;
	private _accessibleViewIsShown: IContextKey<boolean>;
	private _accessibleViewSupportsNavigation: IContextKey<boolean>;
	private _accessibleViewVerbosityEnabled: IContextKey<boolean>;
	private _accessibleViewGoToSymbolSupported: IContextKey<boolean>;
	private _accessibleViewCurrentProviderId: IContextKey<string>;

	get editorWidget() { return this._editorWidget; }
	private _editorContainer: HTMLElement;
	private _currentProvider: IAccessibleContentProvider | undefined;
	private readonly _toolbar: WorkbenchToolBar;
	private _currentContent: string | undefined;

	constructor(
		@IOpenerService private readonly _openerService: IOpenerService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IModelService private readonly _modelService: IModelService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@ILayoutService private readonly _layoutService: ILayoutService,
		@IMenuService private readonly _menuService: IMenuService
	) {
		super();

		this._accessiblityHelpIsShown = accessibilityHelpIsShown.bindTo(this._contextKeyService);
		this._accessibleViewIsShown = accessibleViewIsShown.bindTo(this._contextKeyService);
		this._accessibleViewSupportsNavigation = accessibleViewSupportsNavigation.bindTo(this._contextKeyService);
		this._accessibleViewVerbosityEnabled = accessibleViewVerbosityEnabled.bindTo(this._contextKeyService);
		this._accessibleViewGoToSymbolSupported = accessibleViewGoToSymbolSupported.bindTo(this._contextKeyService);
		this._accessibleViewCurrentProviderId = accessibleViewCurrentProviderId.bindTo(this._contextKeyService);

		this._editorContainer = document.createElement('div');
		this._editorContainer.classList.add('accessible-view');
		const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
			contributions: EditorExtensionsRegistry.getEditorContributions().filter(c => c.id !== CodeActionController.ID)
		};
		this._toolbar = this._register(_instantiationService.createInstance(WorkbenchToolBar, this._editorContainer, { orientation: ActionsOrientation.HORIZONTAL }));
		this._toolbar.context = { viewId: 'accessibleView' };
		const toolbarElt = this._toolbar.getElement();
		toolbarElt.tabIndex = 0;

		const editorOptions: IEditorConstructionOptions = {
			...getSimpleEditorOptions(this._configurationService),
			lineDecorationsWidth: 6,
			dragAndDrop: false,
			cursorWidth: 1,
			wrappingStrategy: 'advanced',
			wrappingIndent: 'none',
			padding: { top: 2, bottom: 2 },
			quickSuggestions: false,
			renderWhitespace: 'none',
			dropIntoEditor: { enabled: false },
			readOnly: true,
			fontFamily: 'var(--monaco-monospace-font)'
		};
		this._editorWidget = this._register(this._instantiationService.createInstance(CodeEditorWidget, this._editorContainer, editorOptions, codeEditorWidgetOptions));
		this._register(this._accessibilityService.onDidChangeScreenReaderOptimized(() => {
			if (this._currentProvider && this._accessiblityHelpIsShown.get()) {
				this.show(this._currentProvider);
			}
		}));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (this._currentProvider && e.affectsConfiguration(this._currentProvider.verbositySettingKey)) {
				if (this._accessiblityHelpIsShown.get()) {
					this.show(this._currentProvider);
				}
				this._accessibleViewVerbosityEnabled.set(this._configurationService.getValue(this._currentProvider.verbositySettingKey));
				this._updateToolbar(this._currentProvider.actions, this._currentProvider.options.type);
			}
		}));
		this._register(this._editorWidget.onDidDispose(() => this._resetContextKeys()));
	}

	private _resetContextKeys(): void {
		this._accessiblityHelpIsShown.reset();
		this._accessibleViewIsShown.reset();
		this._accessibleViewSupportsNavigation.reset();
		this._accessibleViewVerbosityEnabled.reset();
		this._accessibleViewGoToSymbolSupported.reset();
		this._accessibleViewCurrentProviderId.reset();
	}

	show(provider?: IAccessibleContentProvider, symbol?: IAccessibleViewSymbol, showAccessibleViewHelp?: boolean): void {
		provider = provider ?? this._currentProvider;
		if (!provider) {
			return;
		}
		const delegate: IContextViewDelegate = {
			getAnchor: () => { return { x: (window.innerWidth / 2) - ((Math.min(this._layoutService.dimension.width * 0.62 /* golden cut */, DIMENSIONS.MAX_WIDTH)) / 2), y: this._layoutService.offset.quickPickTop }; },
			render: (container) => {
				container.classList.add('accessible-view-container');
				return this._render(provider!, container, showAccessibleViewHelp);
			},
			onHide: () => {
				if (!showAccessibleViewHelp) {
					this._currentProvider = undefined;
					this._resetContextKeys();
				}
			}
		};
		this._contextViewService.showContextView(delegate);
		if (symbol && this._currentProvider) {
			this.showSymbol(this._currentProvider, symbol);
		}
	}

	previous(): void {
		if (!this._currentProvider) {
			return;
		}
		this._currentProvider.previous?.();
	}

	next(): void {
		if (!this._currentProvider) {
			return;
		}
		this._currentProvider.next?.();
	}

	goToSymbol(): void {
		if (!this._currentProvider) {
			return;
		}
		this._instantiationService.createInstance(AccessibleViewSymbolQuickPick, this).show(this._currentProvider);
	}

	getSymbols(): IAccessibleViewSymbol[] | undefined {
		if (!this._currentProvider || !this._currentContent) {
			return;
		}
		const tokens = this._currentProvider.options.language && this._currentProvider.options.language !== 'markdown' ? this._currentProvider.getSymbols?.() : marked.lexer(this._currentContent);
		if (!tokens) {
			return;
		}
		const symbols: IAccessibleViewSymbol[] = [];
		let firstListItem: string | undefined;
		for (const token of tokens) {
			let label: string | undefined = undefined;
			if ('type' in token) {
				switch (token.type) {
					case 'heading':
					case 'paragraph':
					case 'code':
						label = token.text;
						break;
					case 'list': {
						const firstItem = token.items?.[0];
						if (!firstItem) {
							break;
						}
						firstListItem = `- ${firstItem.text}`;
						label = token.items?.map(i => i.text).join(', ');
						break;
					}
				}
			} else {
				label = token.label;
			}
			if (label) {
				symbols.push({ info: label, label: localize('symbolLabel', "({0}) {1}", token.type, label), ariaLabel: localize('symbolLabelAria', "({0}) {1}", token.type, label), firstListItem });
				firstListItem = undefined;
			}
		}
		return symbols;
	}

	showSymbol(provider: IAccessibleContentProvider, symbol: IAccessibleViewSymbol): void {
		if (!this._currentContent) {
			return;
		}
		const index = this._currentContent.split('\n').findIndex(line => line.includes(symbol.info.split('\n')[0]) || (symbol.firstListItem && line.includes(symbol.firstListItem))) ?? -1;
		if (index >= 0) {
			this.show(provider);
			this._editorWidget.revealLine(index + 1);
			this._editorWidget.setSelection({ startLineNumber: index + 1, startColumn: 1, endLineNumber: index + 1, endColumn: 1 });
		}
		this._updateContextKeys(provider, true);
	}

	disableHint(): void {
		if (!this._currentProvider) {
			return;
		}
		this._configurationService.updateValue(this._currentProvider?.verbositySettingKey, false);
		alert(localize('disableAccessibilityHelp', '{0} accessibility verbosity is now disabled', this._currentProvider.verbositySettingKey));
	}

	private _updateContextKeys(provider: IAccessibleContentProvider, shown: boolean): void {
		if (provider.options.type === AccessibleViewType.Help) {
			this._accessiblityHelpIsShown.set(shown);
			this._accessibleViewIsShown.reset();
		} else {
			this._accessibleViewIsShown.set(shown);
			this._accessiblityHelpIsShown.reset();
		}
		if (provider.next && provider.previous) {
			this._accessibleViewSupportsNavigation.set(true);
		} else {
			this._accessibleViewSupportsNavigation.reset();
		}
		const verbosityEnabled: boolean = this._configurationService.getValue(provider.verbositySettingKey);
		this._accessibleViewVerbosityEnabled.set(verbosityEnabled);
		this._accessibleViewGoToSymbolSupported.set(this._goToSymbolsSupported() ? this.getSymbols()?.length! > 0 : false);
	}

	private _render(provider: IAccessibleContentProvider, container: HTMLElement, showAccessibleViewHelp?: boolean): IDisposable {
		if (!showAccessibleViewHelp) {
			// don't overwrite the current provider
			this._currentProvider = provider;
			this._accessibleViewCurrentProviderId.set(provider.verbositySettingKey.replaceAll('accessibility.verbosity.', ''));
		}
		const value = this._configurationService.getValue(provider.verbositySettingKey);
		const readMoreLink = provider.options.readMoreUrl ? localize("openDoc", "\n\nPress H now to open a browser window with more information related to accessibility.\n\n") : '';
		let disableHelpHint = '';
		if (provider.options.type === AccessibleViewType.Help && !!value) {
			disableHelpHint = this._getDisableVerbosityHint(provider.verbositySettingKey);
		}
		const accessibilitySupport = this._accessibilityService.isScreenReaderOptimized();
		let message = '';
		if (provider.options.type === AccessibleViewType.Help) {
			const turnOnMessage = (
				isMacintosh
					? AccessibilityHelpNLS.changeConfigToOnMac
					: AccessibilityHelpNLS.changeConfigToOnWinLinux
			);
			if (accessibilitySupport && provider.verbositySettingKey === AccessibilityVerbositySettingId.Editor) {
				message = AccessibilityHelpNLS.auto_on;
				message += '\n';
			} else if (!accessibilitySupport) {
				message = AccessibilityHelpNLS.auto_off + '\n' + turnOnMessage;
				message += '\n';
			}
		}

		this._currentContent = message + provider.provideContent() + readMoreLink + disableHelpHint + localize('exit-tip', '\nExit this dialog via the Escape key.');
		this._updateContextKeys(provider, true);

		this._getTextModel(URI.from({ path: `accessible-view-${provider.verbositySettingKey}`, scheme: 'accessible-view', fragment: this._currentContent })).then((model) => {
			if (!model) {
				return;
			}
			this._editorWidget.setModel(model);
			const domNode = this._editorWidget.getDomNode();
			if (!domNode) {
				return;
			}
			model.setLanguage(provider.options.language ?? 'markdown');
			container.appendChild(this._editorContainer);
			let actionsHint = '';
			const verbose = this._configurationService.getValue(provider.verbositySettingKey);
			const hasActions = this._accessibleViewSupportsNavigation.get() || this._accessibleViewVerbosityEnabled.get() || this._accessibleViewGoToSymbolSupported.get() || this._currentProvider?.actions;
			if (verbose && !showAccessibleViewHelp && hasActions) {
				actionsHint = localize('ariaAccessibleViewActions', "Use Shift+Tab to explore actions such as disabling this hint.");
			}
			let ariaLabel = provider.options.type === AccessibleViewType.Help ? localize('accessibility-help', "Accessibility Help") : localize('accessible-view', "Accessible View");
			if (actionsHint && provider.options.type === AccessibleViewType.View) {
				ariaLabel = localize('accessible-view-hint', "Accessible View, {0}", actionsHint);
			} else if (actionsHint) {
				ariaLabel = localize('accessibility-help-hint', "Accessibility Help, {0}", actionsHint);
			}
			this._editorWidget.updateOptions({ ariaLabel });
			this._editorWidget.focus();
		});
		this._updateToolbar(provider.actions, provider.options.type);

		const handleEscape = (e: KeyboardEvent | IKeyboardEvent): void => {
			e.stopPropagation();
			this._contextViewService.hideContextView();
			this._updateContextKeys(provider, false);
			// HACK: Delay to allow the context view to hide #186514
			setTimeout(() => provider.onClose(), 100);
		};
		const disposableStore = new DisposableStore();
		disposableStore.add(this._editorWidget.onKeyUp((e) => provider.onKeyUp?.(e)));
		disposableStore.add(this._editorWidget.onKeyDown((e) => {
			if (e.keyCode === KeyCode.Escape) {
				handleEscape(e);
			} else if (e.keyCode === KeyCode.KeyH && provider.options.readMoreUrl) {
				const url: string = provider.options.readMoreUrl!;
				alert(AccessibilityHelpNLS.openingDocs);
				this._openerService.open(URI.parse(url));
				e.preventDefault();
				e.stopPropagation();
			}
		}));
		disposableStore.add(addDisposableListener(this._toolbar.getElement(), EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const keyboardEvent = new StandardKeyboardEvent(e);
			if (keyboardEvent.equals(KeyCode.Escape)) {
				handleEscape(e);
			}
		}));
		disposableStore.add(this._editorWidget.onDidBlurEditorWidget(() => {
			if (document.activeElement !== this._toolbar.getElement()) {
				this._contextViewService.hideContextView();
			}
		}));
		disposableStore.add(this._editorWidget.onDidContentSizeChange(() => this._layout()));
		disposableStore.add(this._layoutService.onDidLayout(() => this._layout()));
		return disposableStore;
	}

	private _updateToolbar(providedActions?: IAction[], type?: AccessibleViewType): void {
		this._toolbar.setAriaLabel(type === AccessibleViewType.Help ? localize('accessibleHelpToolbar', 'Accessibility Help') : localize('accessibleViewToolbar', "Accessible View"));
		const menuActions: IAction[] = [];
		const toolbarMenu = this._register(this._menuService.createMenu(MenuId.AccessibleView, this._contextKeyService));
		createAndFillInActionBarActions(toolbarMenu, {}, menuActions);
		if (providedActions) {
			for (const providedAction of providedActions) {
				providedAction.class = providedAction.class || ThemeIcon.asClassName(Codicon.primitiveSquare);
				providedAction.checked = undefined;
			}
			this._toolbar.setActions([...providedActions, ...menuActions]);
		} else {
			this._toolbar.setActions(menuActions);
		}
	}

	private _layout(): void {
		const dimension = this._layoutService.dimension;
		const maxHeight = dimension.height && dimension.height * .4;
		const height = Math.min(maxHeight, this._editorWidget.getContentHeight());
		const width = Math.min(dimension.width * 0.62 /* golden cut */, DIMENSIONS.MAX_WIDTH);
		this._editorWidget.layout({ width, height });
	}

	private async _getTextModel(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing && !existing.isDisposed()) {
			return existing;
		}
		return this._modelService.createModel(resource.fragment, null, resource, false);
	}

	private _goToSymbolsSupported(): boolean {
		if (!this._currentProvider) {
			return false;
		}
		return this._currentProvider.options.type === AccessibleViewType.Help || this._currentProvider.options.language === 'markdown' || this._currentProvider.options.language === undefined || !!this._currentProvider.getSymbols;
	}

	public showAccessibleViewHelp(): void {
		if (!this._currentProvider) {
			return;

		}
		const currentProvider = Object.assign({}, this._currentProvider);
		currentProvider.options = Object.assign({}, currentProvider.options);
		const accessibleViewHelpProvider: IAccessibleContentProvider = {
			provideContent: () => this._getAccessibleViewHelpDialogContent(this._goToSymbolsSupported()),
			onClose: () => this.show(currentProvider),
			options: { type: AccessibleViewType.Help },
			verbositySettingKey: this._currentProvider.verbositySettingKey
		};
		this._contextViewService.hideContextView();
		// HACK: Delay to allow the context view to hide #186514
		setTimeout(() => this.show(accessibleViewHelpProvider, undefined, true), 100);
	}

	private _getAccessibleViewHelpDialogContent(providerHasSymbols?: boolean): string {
		const navigationHint = this._getNavigationHint();
		const goToSymbolHint = this._getGoToSymbolHint(providerHasSymbols);
		const toolbarHint = localize('toolbar', "Navigate to the toolbar (Shift+Tab))");

		let hint = localize('intro', "In the accessible view, you can:\n");
		if (navigationHint) {
			hint += ' - ' + navigationHint + '\n';
		}
		if (goToSymbolHint) {
			hint += ' - ' + goToSymbolHint + '\n';
		}
		if (toolbarHint) {
			hint += ' - ' + toolbarHint + '\n';
		}
		return hint;
	}

	private _getNavigationHint(): string {
		let hint = '';
		const nextKeybinding = this._keybindingService.lookupKeybinding(AccessibilityCommandId.ShowNext)?.getAriaLabel();
		const previousKeybinding = this._keybindingService.lookupKeybinding(AccessibilityCommandId.ShowPrevious)?.getAriaLabel();
		if (nextKeybinding && previousKeybinding) {
			hint = localize('accessibleViewNextPreviousHint', "Show the next ({0}) or previous ({1}) item", nextKeybinding, previousKeybinding);
		} else {
			hint = localize('chatAccessibleViewNextPreviousHintNoKb', "Show the next or previous item by configuring keybindings for the Show Next & Previous in Accessible View commands");
		}
		return hint;
	}
	private _getDisableVerbosityHint(verbositySettingKey: AccessibilityVerbositySettingId): string {
		if (!this._configurationService.getValue(verbositySettingKey)) {
			return '';
		}
		let hint = '';
		const disableKeybinding = this._keybindingService.lookupKeybinding(AccessibilityCommandId.DisableVerbosityHint, this._contextKeyService)?.getAriaLabel();
		if (disableKeybinding) {
			hint = localize('acessibleViewDisableHint', "Disable the aria label hint to open this ({0})", disableKeybinding);
		} else {
			hint = localize('accessibleViewDisableHintNoKb', "Add a keybinding for the command Disable Accessible View Hint to disable this hint");
		}
		return hint;
	}

	private _getGoToSymbolHint(providerHasSymbols?: boolean): string {
		const goToSymbolKb = this._keybindingService.lookupKeybinding(AccessibilityCommandId.GoToSymbol)?.getAriaLabel();
		let goToSymbolHint = '';
		if (providerHasSymbols) {
			if (goToSymbolKb) {
				goToSymbolHint = localize('goToSymbolHint', 'Go to a symbol ({0})', goToSymbolKb);
			} else {
				goToSymbolHint = localize('goToSymbolHintNoKb', 'To go to a symbol, configure a keybinding for the command Go To Symbol in Accessible View');
			}
		}
		return goToSymbolHint;
	}
}

export class AccessibleViewService extends Disposable implements IAccessibleViewService {
	declare readonly _serviceBrand: undefined;
	private _accessibleView: AccessibleView | undefined;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService
	) {
		super();
	}

	show(provider: IAccessibleContentProvider): void {
		if (!this._accessibleView) {
			this._accessibleView = this._register(this._instantiationService.createInstance(AccessibleView));
		}
		this._accessibleView.show(provider);

	}
	next(): void {
		this._accessibleView?.next();
	}
	previous(): void {
		this._accessibleView?.previous();
	}
	goToSymbol(): void {
		this._accessibleView?.goToSymbol();
	}
	getOpenAriaHint(verbositySettingKey: AccessibilityVerbositySettingId): string | null {
		if (!this._configurationService.getValue(verbositySettingKey)) {
			return null;
		}
		const keybinding = this._keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibleView)?.getAriaLabel();
		let hint = null;
		if (keybinding) {
			hint = localize('acessibleViewHint', "Inspect this in the accessible view with {0}", keybinding);
		} else {
			hint = localize('acessibleViewHintNoKbEither', "Inspect this in the accessible view via the command Open Accessible View which is currently not triggerable via keybinding.");
		}
		return hint;
	}
	disableHint(): void {
		this._accessibleView?.disableHint();
	}
	showAccessibleViewHelp(): void {
		this._accessibleView?.showAccessibleViewHelp();
	}
}


class AccessibleViewSymbolQuickPick {
	constructor(private _accessibleView: AccessibleView, @IQuickInputService private readonly _quickInputService: IQuickInputService) {

	}
	show(provider: IAccessibleContentProvider): void {
		const quickPick = this._quickInputService.createQuickPick<IAccessibleViewSymbol>();
		quickPick.title = localize('accessibleViewSymbolQuickPickTitle', "Go to Symbol Accessible View");
		const picks = [];
		const symbols = this._accessibleView.getSymbols();
		if (!symbols) {
			return;
		}
		for (const symbol of symbols) {
			picks.push({
				label: symbol.label,
				ariaLabel: symbol.ariaLabel
			});
		}
		quickPick.canSelectMany = false;
		quickPick.items = symbols;
		quickPick.show();
		quickPick.onDidAccept(() => {
			this._accessibleView.showSymbol(provider, quickPick.selectedItems[0]);
			quickPick.hide();
		});
		quickPick.onDidHide(() => {
			if (quickPick.selectedItems.length === 0) {
				// this was escaped, so refocus the accessible view
				this._accessibleView.show(provider);
			}
		});
	}
}

interface IAccessibleViewSymbol extends IPickerQuickAccessItem {
	info: string;
	firstListItem?: string;
}
