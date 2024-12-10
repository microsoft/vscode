/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventType, addDisposableListener, getActiveWindow, isActiveElement } from '../../../../base/browser/dom.js';
import { IKeyboardEvent, StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { ActionsOrientation } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { IAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import * as marked from '../../../../base/common/marked/marked.js';
import { isMacintosh, isWindows } from '../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { IEditorConstructionOptions } from '../../../../editor/browser/config/editorConfiguration.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IPosition, Position } from '../../../../editor/common/core/position.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { AccessibilityHelpNLS } from '../../../../editor/common/standaloneStrings.js';
import { CodeActionController } from '../../../../editor/contrib/codeAction/browser/codeActionController.js';
import { localize } from '../../../../nls.js';
import { AccessibleViewProviderId, AccessibleViewType, AccessibleContentProvider, ExtensionContentProvider, IAccessibleViewService, IAccessibleViewSymbol } from '../../../../platform/accessibility/browser/accessibleView.js';
import { ACCESSIBLE_VIEW_SHOWN_STORAGE_PREFIX, IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { getFlatActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextViewDelegate, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ResultKind } from '../../../../platform/keybinding/common/keybindingResolver.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IQuickInputService, IQuickPick, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { AccessibilityVerbositySettingId, AccessibilityWorkbenchSettingId, accessibilityHelpIsShown, accessibleViewContainsCodeBlocks, accessibleViewCurrentProviderId, accessibleViewGoToSymbolSupported, accessibleViewHasAssignedKeybindings, accessibleViewHasUnassignedKeybindings, accessibleViewInCodeBlock, accessibleViewIsShown, accessibleViewOnLastLine, accessibleViewSupportsNavigation, accessibleViewVerbosityEnabled } from './accessibilityConfiguration.js';
import { resolveContentAndKeybindingItems } from './accessibleViewKeybindingResolver.js';
import { AccessibilityCommandId } from '../common/accessibilityCommands.js';
import { IChatCodeBlockContextProviderService } from '../../chat/browser/chat.js';
import { ICodeBlockActionContext } from '../../chat/browser/codeBlockPart.js';
import { getSimpleEditorOptions } from '../../codeEditor/browser/simpleEditorOptions.js';
import { Schemas } from '../../../../base/common/network.js';
import { ITextModelContentProvider, ITextModelService } from '../../../../editor/common/services/resolverService.js';

const enum DIMENSIONS {
	MAX_WIDTH = 600
}

export type AccesibleViewContentProvider = AccessibleContentProvider | ExtensionContentProvider;

interface ICodeBlock {
	startLine: number;
	endLine: number;
	code: string;
	languageId?: string;
}

export class AccessibleView extends Disposable implements ITextModelContentProvider {
	private _editorWidget: CodeEditorWidget;

	private _accessiblityHelpIsShown: IContextKey<boolean>;
	private _onLastLine: IContextKey<boolean>;
	private _accessibleViewIsShown: IContextKey<boolean>;
	private _accessibleViewSupportsNavigation: IContextKey<boolean>;
	private _accessibleViewVerbosityEnabled: IContextKey<boolean>;
	private _accessibleViewGoToSymbolSupported: IContextKey<boolean>;
	private _accessibleViewCurrentProviderId: IContextKey<string>;
	private _accessibleViewInCodeBlock: IContextKey<boolean>;
	private _accessibleViewContainsCodeBlocks: IContextKey<boolean>;
	private _hasUnassignedKeybindings: IContextKey<boolean>;
	private _hasAssignedKeybindings: IContextKey<boolean>;

	private _codeBlocks?: ICodeBlock[];
	private _inQuickPick: boolean = false;

	get editorWidget() { return this._editorWidget; }
	private _container: HTMLElement;
	private _title: HTMLElement;
	private readonly _toolbar: WorkbenchToolBar;

	private _currentProvider: AccesibleViewContentProvider | undefined;
	private _currentContent: string | undefined;

	private _lastProvider: AccesibleViewContentProvider | undefined;

	private _viewContainer: HTMLElement | undefined;


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
		@IMenuService private readonly _menuService: IMenuService,
		@ICommandService private readonly _commandService: ICommandService,
		@IChatCodeBlockContextProviderService private readonly _codeBlockContextProviderService: IChatCodeBlockContextProviderService,
		@IStorageService private readonly _storageService: IStorageService,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService
	) {
		super();

		this._accessiblityHelpIsShown = accessibilityHelpIsShown.bindTo(this._contextKeyService);
		this._accessibleViewIsShown = accessibleViewIsShown.bindTo(this._contextKeyService);
		this._accessibleViewSupportsNavigation = accessibleViewSupportsNavigation.bindTo(this._contextKeyService);
		this._accessibleViewVerbosityEnabled = accessibleViewVerbosityEnabled.bindTo(this._contextKeyService);
		this._accessibleViewGoToSymbolSupported = accessibleViewGoToSymbolSupported.bindTo(this._contextKeyService);
		this._accessibleViewCurrentProviderId = accessibleViewCurrentProviderId.bindTo(this._contextKeyService);
		this._accessibleViewInCodeBlock = accessibleViewInCodeBlock.bindTo(this._contextKeyService);
		this._accessibleViewContainsCodeBlocks = accessibleViewContainsCodeBlocks.bindTo(this._contextKeyService);
		this._onLastLine = accessibleViewOnLastLine.bindTo(this._contextKeyService);
		this._hasUnassignedKeybindings = accessibleViewHasUnassignedKeybindings.bindTo(this._contextKeyService);
		this._hasAssignedKeybindings = accessibleViewHasAssignedKeybindings.bindTo(this._contextKeyService);

		this._container = document.createElement('div');
		this._container.classList.add('accessible-view');
		if (this._configurationService.getValue(AccessibilityWorkbenchSettingId.HideAccessibleView)) {
			this._container.classList.add('hide');
		}
		const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
			contributions: EditorExtensionsRegistry.getEditorContributions().filter(c => c.id !== CodeActionController.ID)
		};
		const titleBar = document.createElement('div');
		titleBar.classList.add('accessible-view-title-bar');
		this._title = document.createElement('div');
		this._title.classList.add('accessible-view-title');
		titleBar.appendChild(this._title);
		const actionBar = document.createElement('div');
		actionBar.classList.add('accessible-view-action-bar');
		titleBar.appendChild(actionBar);
		this._container.appendChild(titleBar);
		this._toolbar = this._register(_instantiationService.createInstance(WorkbenchToolBar, actionBar, { orientation: ActionsOrientation.HORIZONTAL }));
		this._toolbar.context = { viewId: 'accessibleView' };
		const toolbarElt = this._toolbar.getElement();
		toolbarElt.tabIndex = 0;

		const editorOptions: IEditorConstructionOptions = {
			...getSimpleEditorOptions(this._configurationService),
			lineDecorationsWidth: 6,
			dragAndDrop: false,
			cursorWidth: 1,
			wordWrap: 'off',
			wrappingStrategy: 'advanced',
			wrappingIndent: 'none',
			padding: { top: 2, bottom: 2 },
			quickSuggestions: false,
			renderWhitespace: 'none',
			dropIntoEditor: { enabled: false },
			readOnly: true,
			fontFamily: 'var(--monaco-monospace-font)'
		};
		this.textModelResolverService.registerTextModelContentProvider(Schemas.accessibleView, this);

		this._editorWidget = this._register(this._instantiationService.createInstance(CodeEditorWidget, this._container, editorOptions, codeEditorWidgetOptions));
		this._register(this._accessibilityService.onDidChangeScreenReaderOptimized(() => {
			if (this._currentProvider && this._accessiblityHelpIsShown.get()) {
				this.show(this._currentProvider);
			}
		}));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (this._currentProvider instanceof AccessibleContentProvider && e.affectsConfiguration(this._currentProvider.verbositySettingKey)) {
				if (this._accessiblityHelpIsShown.get()) {
					this.show(this._currentProvider);
				}
				this._accessibleViewVerbosityEnabled.set(this._configurationService.getValue(this._currentProvider.verbositySettingKey));
				this._updateToolbar(this._currentProvider.actions, this._currentProvider.options.type);
			}
			if (e.affectsConfiguration(AccessibilityWorkbenchSettingId.HideAccessibleView)) {
				this._container.classList.toggle('hide', this._configurationService.getValue(AccessibilityWorkbenchSettingId.HideAccessibleView));
			}
		}));
		this._register(this._editorWidget.onDidDispose(() => this._resetContextKeys()));
		this._register(this._editorWidget.onDidChangeCursorPosition(() => {
			this._onLastLine.set(this._editorWidget.getPosition()?.lineNumber === this._editorWidget.getModel()?.getLineCount());
		}));
		this._register(this._editorWidget.onDidChangeCursorPosition(() => {
			const cursorPosition = this._editorWidget.getPosition()?.lineNumber;
			if (this._codeBlocks && cursorPosition !== undefined) {
				const inCodeBlock = this._codeBlocks.find(c => c.startLine <= cursorPosition && c.endLine >= cursorPosition) !== undefined;
				this._accessibleViewInCodeBlock.set(inCodeBlock);
			}
		}));
	}
	provideTextContent(resource: URI): Promise<ITextModel | null> | null {
		return this._getTextModel(resource);
	}

	private _resetContextKeys(): void {
		this._accessiblityHelpIsShown.reset();
		this._accessibleViewIsShown.reset();
		this._accessibleViewSupportsNavigation.reset();
		this._accessibleViewVerbosityEnabled.reset();
		this._accessibleViewGoToSymbolSupported.reset();
		this._accessibleViewCurrentProviderId.reset();
		this._hasAssignedKeybindings.reset();
		this._hasUnassignedKeybindings.reset();
	}

	getPosition(id?: AccessibleViewProviderId): Position | undefined {
		if (!id || !this._lastProvider || this._lastProvider.id !== id) {
			return undefined;
		}
		return this._editorWidget.getPosition() || undefined;
	}

	setPosition(position: Position, reveal?: boolean, select?: boolean): void {
		this._editorWidget.setPosition(position);
		if (reveal) {
			this._editorWidget.revealPosition(position);
		}
		if (select) {
			const lineLength = this._editorWidget.getModel()?.getLineLength(position.lineNumber) ?? 0;
			if (lineLength) {
				this._editorWidget.setSelection({ startLineNumber: position.lineNumber, startColumn: 1, endLineNumber: position.lineNumber, endColumn: lineLength + 1 });
			}
		}
	}

	getCodeBlockContext(): ICodeBlockActionContext | undefined {
		const position = this._editorWidget.getPosition();
		if (!this._codeBlocks?.length || !position) {
			return;
		}
		const codeBlockIndex = this._codeBlocks?.findIndex(c => c.startLine <= position?.lineNumber && c.endLine >= position?.lineNumber);
		const codeBlock = codeBlockIndex !== undefined && codeBlockIndex > -1 ? this._codeBlocks[codeBlockIndex] : undefined;
		if (!codeBlock || codeBlockIndex === undefined) {
			return;
		}
		return { code: codeBlock.code, languageId: codeBlock.languageId, codeBlockIndex, element: undefined };
	}

	navigateToCodeBlock(type: 'next' | 'previous'): void {
		const position = this._editorWidget.getPosition();
		if (!this._codeBlocks?.length || !position) {
			return;
		}
		let codeBlock;
		const codeBlocks = this._codeBlocks.slice();
		if (type === 'previous') {
			codeBlock = codeBlocks.reverse().find(c => c.endLine < position.lineNumber);
		} else {
			codeBlock = codeBlocks.find(c => c.startLine > position.lineNumber);
		}
		if (!codeBlock) {
			return;
		}
		this.setPosition(new Position(codeBlock.startLine, 1), true);
	}

	showLastProvider(id: AccessibleViewProviderId): void {
		if (!this._lastProvider || this._lastProvider.options.id !== id) {
			return;
		}
		this.show(this._lastProvider);
	}

	show(provider?: AccesibleViewContentProvider, symbol?: IAccessibleViewSymbol, showAccessibleViewHelp?: boolean, position?: IPosition): void {
		provider = provider ?? this._currentProvider;
		if (!provider) {
			return;
		}
		provider.onOpen?.();
		const delegate: IContextViewDelegate = {
			getAnchor: () => { return { x: (getActiveWindow().innerWidth / 2) - ((Math.min(this._layoutService.activeContainerDimension.width * 0.62 /* golden cut */, DIMENSIONS.MAX_WIDTH)) / 2), y: this._layoutService.activeContainerOffset.quickPickTop }; },
			render: (container) => {
				this._viewContainer = container;
				this._viewContainer.classList.add('accessible-view-container');
				return this._render(provider, container, showAccessibleViewHelp);
			},
			onHide: () => {
				if (!showAccessibleViewHelp) {
					this._updateLastProvider();
					this._currentProvider?.dispose();
					this._currentProvider = undefined;
					this._resetContextKeys();
				}
			}
		};
		this._contextViewService.showContextView(delegate);

		if (position) {
			// Context view takes time to show up, so we need to wait for it to show up before we can set the position
			queueMicrotask(() => {
				this._editorWidget.revealLine(position.lineNumber);
				this._editorWidget.setSelection({ startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: position.column });
			});
		}

		if (symbol && this._currentProvider) {
			this.showSymbol(this._currentProvider, symbol);
		}
		if (provider instanceof AccessibleContentProvider && provider.onDidRequestClearLastProvider) {
			this._register(provider.onDidRequestClearLastProvider((id: string) => {
				if (this._lastProvider?.options.id === id) {
					this._lastProvider = undefined;
				}
			}));
		}
		if (provider.options.id) {
			// only cache a provider with an ID so that it will eventually be cleared.
			this._lastProvider = provider;
		}
		if (provider.id === AccessibleViewProviderId.PanelChat || provider.id === AccessibleViewProviderId.QuickChat) {
			this._register(this._codeBlockContextProviderService.registerProvider({ getCodeBlockContext: () => this.getCodeBlockContext() }, 'accessibleView'));
		}
		if (provider instanceof ExtensionContentProvider) {
			this._storageService.store(`${ACCESSIBLE_VIEW_SHOWN_STORAGE_PREFIX}${provider.id}`, true, StorageScope.APPLICATION, StorageTarget.USER);
		}
		if (provider.onDidChangeContent) {
			this._register(provider.onDidChangeContent(() => {
				if (this._viewContainer) { this._render(provider, this._viewContainer, showAccessibleViewHelp); }
			}));
		}
	}

	previous(): void {
		const newContent = this._currentProvider?.providePreviousContent?.();
		if (!this._currentProvider || !this._viewContainer || !newContent) {
			return;
		}
		this._render(this._currentProvider, this._viewContainer, undefined, newContent);
	}

	next(): void {
		const newContent = this._currentProvider?.provideNextContent?.();
		if (!this._currentProvider || !this._viewContainer || !newContent) {
			return;
		}
		this._render(this._currentProvider, this._viewContainer, undefined, newContent);
	}

	private _verbosityEnabled(): boolean {
		if (!this._currentProvider) {
			return false;
		}
		return this._currentProvider instanceof AccessibleContentProvider ? this._configurationService.getValue(this._currentProvider.verbositySettingKey) === true : this._storageService.getBoolean(`${ACCESSIBLE_VIEW_SHOWN_STORAGE_PREFIX}${this._currentProvider.id}`, StorageScope.APPLICATION, false);
	}

	goToSymbol(): void {
		if (!this._currentProvider) {
			return;
		}
		this._instantiationService.createInstance(AccessibleViewSymbolQuickPick, this).show(this._currentProvider);
	}

	calculateCodeBlocks(markdown?: string): void {
		if (!markdown) {
			return;
		}
		if (this._currentProvider?.id !== AccessibleViewProviderId.PanelChat && this._currentProvider?.id !== AccessibleViewProviderId.QuickChat) {
			return;
		}
		if (this._currentProvider.options.language && this._currentProvider.options.language !== 'markdown') {
			// Symbols haven't been provided and we cannot parse this language
			return;
		}
		const lines = markdown.split('\n');
		this._codeBlocks = [];
		let inBlock = false;
		let startLine = 0;

		let languageId: string | undefined;
		lines.forEach((line, i) => {
			if (!inBlock && line.startsWith('```')) {
				inBlock = true;
				startLine = i + 1;
				languageId = line.substring(3).trim();
			} else if (inBlock && line.endsWith('```')) {
				inBlock = false;
				const endLine = i;
				const code = lines.slice(startLine, endLine).join('\n');
				this._codeBlocks?.push({ startLine, endLine, code, languageId });
			}
		});
		this._accessibleViewContainsCodeBlocks.set(this._codeBlocks.length > 0);
	}

	getSymbols(): IAccessibleViewSymbol[] | undefined {
		const provider = this._currentProvider instanceof AccessibleContentProvider ? this._currentProvider : undefined;
		if (!this._currentContent || !provider) {
			return;
		}
		const symbols: IAccessibleViewSymbol[] = provider.getSymbols?.() || [];
		if (symbols?.length) {
			return symbols;
		}
		if (provider.options.language && provider.options.language !== 'markdown') {
			// Symbols haven't been provided and we cannot parse this language
			return;
		}
		const markdownTokens: marked.TokensList | undefined = marked.marked.lexer(this._currentContent);
		if (!markdownTokens) {
			return;
		}
		this._convertTokensToSymbols(markdownTokens, symbols);
		return symbols.length ? symbols : undefined;
	}

	openHelpLink(): void {
		if (!this._currentProvider?.options.readMoreUrl) {
			return;
		}
		this._openerService.open(URI.parse(this._currentProvider.options.readMoreUrl));
	}

	configureKeybindings(unassigned: boolean): void {
		this._inQuickPick = true;
		const provider = this._updateLastProvider();
		const items = unassigned ? provider?.options?.configureKeybindingItems : provider?.options?.configuredKeybindingItems;
		if (!items) {
			return;
		}
		const disposables = this._register(new DisposableStore());
		const quickPick: IQuickPick<IQuickPickItem> = disposables.add(this._quickInputService.createQuickPick());
		quickPick.items = items;
		quickPick.title = localize('keybindings', 'Configure keybindings');
		quickPick.placeholder = localize('selectKeybinding', 'Select a command ID to configure a keybinding for it');
		quickPick.show();
		disposables.add(quickPick.onDidAccept(async () => {
			const item = quickPick.selectedItems[0];
			if (item) {
				await this._commandService.executeCommand('workbench.action.openGlobalKeybindings', item.id);
			}
			quickPick.dispose();
		}));
		disposables.add(quickPick.onDidHide(() => {
			if (!quickPick.selectedItems.length && provider) {
				this.show(provider);
			}
			disposables.dispose();
			this._inQuickPick = false;
		}));
	}

	private _convertTokensToSymbols(tokens: marked.TokensList, symbols: IAccessibleViewSymbol[]): void {
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
						const firstItem = (token as marked.Tokens.List).items[0];
						if (!firstItem) {
							break;
						}
						firstListItem = `- ${firstItem.text}`;
						label = (token as marked.Tokens.List).items.map(i => i.text).join(', ');
						break;
					}
				}
			}
			if (label) {
				symbols.push({ markdownToParse: label, label: localize('symbolLabel', "({0}) {1}", token.type, label), ariaLabel: localize('symbolLabelAria', "({0}) {1}", token.type, label), firstListItem });
				firstListItem = undefined;
			}
		}
	}

	showSymbol(provider: AccesibleViewContentProvider, symbol: IAccessibleViewSymbol): void {
		if (!this._currentContent) {
			return;
		}
		let lineNumber: number | undefined = symbol.lineNumber;
		const markdownToParse = symbol.markdownToParse;
		if (lineNumber === undefined && markdownToParse === undefined) {
			// No symbols provided and we cannot parse this language
			return;
		}

		if (lineNumber === undefined && markdownToParse) {
			// Note that this scales poorly, thus isn't used for worst case scenarios like the terminal, for which a line number will always be provided.
			// Parse the markdown to find the line number
			const index = this._currentContent.split('\n').findIndex(line => line.includes(markdownToParse.split('\n')[0]) || (symbol.firstListItem && line.includes(symbol.firstListItem))) ?? -1;
			if (index >= 0) {
				lineNumber = index + 1;
			}
		}
		if (lineNumber === undefined) {
			return;
		}
		this.show(provider, undefined, undefined, { lineNumber, column: 1 });
		this._updateContextKeys(provider, true);
	}

	disableHint(): void {
		if (!(this._currentProvider instanceof AccessibleContentProvider)) {
			return;
		}
		this._configurationService.updateValue(this._currentProvider?.verbositySettingKey, false);
		alert(localize('disableAccessibilityHelp', '{0} accessibility verbosity is now disabled', this._currentProvider.verbositySettingKey));
	}

	private _updateContextKeys(provider: AccesibleViewContentProvider, shown: boolean): void {
		if (provider.options.type === AccessibleViewType.Help) {
			this._accessiblityHelpIsShown.set(shown);
			this._accessibleViewIsShown.reset();
		} else {
			this._accessibleViewIsShown.set(shown);
			this._accessiblityHelpIsShown.reset();
		}
		this._accessibleViewSupportsNavigation.set(provider.provideNextContent !== undefined || provider.providePreviousContent !== undefined);
		this._accessibleViewVerbosityEnabled.set(this._verbosityEnabled());
		this._accessibleViewGoToSymbolSupported.set(this._goToSymbolsSupported() ? this.getSymbols()?.length! > 0 : false);
	}

	private _updateContent(provider: AccesibleViewContentProvider, updatedContent?: string): void {
		let content = updatedContent ?? provider.provideContent();
		if (provider.options.type === AccessibleViewType.View) {
			this._currentContent = content;
			this._hasUnassignedKeybindings.reset();
			this._hasAssignedKeybindings.reset();
			return;
		}
		const readMoreLinkHint = this._readMoreHint(provider);
		const disableHelpHint = this._disableVerbosityHint(provider);
		const screenReaderModeHint = this._screenReaderModeHint(provider);
		const exitThisDialogHint = this._exitDialogHint(provider);
		let configureKbHint = '';
		let configureAssignedKbHint = '';
		const resolvedContent = resolveContentAndKeybindingItems(this._keybindingService, screenReaderModeHint + content + readMoreLinkHint + disableHelpHint + exitThisDialogHint);
		if (resolvedContent) {
			content = resolvedContent.content.value;
			if (resolvedContent.configureKeybindingItems) {
				provider.options.configureKeybindingItems = resolvedContent.configureKeybindingItems;
				this._hasUnassignedKeybindings.set(true);
				configureKbHint = this._configureUnassignedKbHint();
			} else {
				this._hasAssignedKeybindings.reset();
			}
			if (resolvedContent.configuredKeybindingItems) {
				provider.options.configuredKeybindingItems = resolvedContent.configuredKeybindingItems;
				this._hasAssignedKeybindings.set(true);
				configureAssignedKbHint = this._configureAssignedKbHint();
			} else {
				this._hasAssignedKeybindings.reset();
			}
		}
		this._currentContent = content + configureKbHint + configureAssignedKbHint;
	}

	private _render(provider: AccesibleViewContentProvider, container: HTMLElement, showAccessibleViewHelp?: boolean, updatedContent?: string): IDisposable {
		this._currentProvider = provider;
		this._accessibleViewCurrentProviderId.set(provider.id);
		const verbose = this._verbosityEnabled();
		this._updateContent(provider, updatedContent);
		this.calculateCodeBlocks(this._currentContent);
		this._updateContextKeys(provider, true);
		const widgetIsFocused = this._editorWidget.hasTextFocus() || this._editorWidget.hasWidgetFocus();
		this._getTextModel(URI.from({ path: `accessible-view-${provider.id}`, scheme: Schemas.accessibleView, fragment: this._currentContent })).then((model) => {
			if (!model) {
				return;
			}
			this._editorWidget.setModel(model);
			const domNode = this._editorWidget.getDomNode();
			if (!domNode) {
				return;
			}
			model.setLanguage(provider.options.language ?? 'markdown');
			container.appendChild(this._container);
			let actionsHint = '';
			const hasActions = this._accessibleViewSupportsNavigation.get() || this._accessibleViewVerbosityEnabled.get() || this._accessibleViewGoToSymbolSupported.get() || provider.actions?.length;
			if (verbose && !showAccessibleViewHelp && hasActions) {
				actionsHint = provider.options.position ? localize('ariaAccessibleViewActionsBottom', 'Explore actions such as disabling this hint (Shift+Tab), use Escape to exit this dialog.') : localize('ariaAccessibleViewActions', 'Explore actions such as disabling this hint (Shift+Tab).');
			}
			let ariaLabel = provider.options.type === AccessibleViewType.Help ? localize('accessibility-help', "Accessibility Help") : localize('accessible-view', "Accessible View");
			this._title.textContent = ariaLabel;
			if (actionsHint && provider.options.type === AccessibleViewType.View) {
				ariaLabel = localize('accessible-view-hint', "Accessible View, {0}", actionsHint);
			} else if (actionsHint) {
				ariaLabel = localize('accessibility-help-hint', "Accessibility Help, {0}", actionsHint);
			}
			if (isWindows && widgetIsFocused) {
				// prevent the screen reader on windows from reading
				// the aria label again when it's refocused
				ariaLabel = '';
			}
			this._editorWidget.updateOptions({ ariaLabel });
			this._editorWidget.focus();
			if (this._currentProvider?.options.position) {
				const position = this._editorWidget.getPosition();
				const isDefaultPosition = position?.lineNumber === 1 && position.column === 1;
				if (this._currentProvider.options.position === 'bottom' || this._currentProvider.options.position === 'initial-bottom' && isDefaultPosition) {
					const lastLine = this.editorWidget.getModel()?.getLineCount();
					const position = lastLine !== undefined && lastLine > 0 ? new Position(lastLine, 1) : undefined;
					if (position) {
						this._editorWidget.setPosition(position);
						this._editorWidget.revealLine(position.lineNumber);
					}
				}
			}
		});
		this._updateToolbar(this._currentProvider.actions, provider.options.type);

		const hide = (e?: KeyboardEvent | IKeyboardEvent): void => {
			if (!this._inQuickPick) {
				provider.onClose();
			}
			e?.stopPropagation();
			this._contextViewService.hideContextView();
			this._updateContextKeys(provider, false);
			this._lastProvider = undefined;
			this._currentContent = undefined;
			this._currentProvider?.dispose();
			this._currentProvider = undefined;
		};
		const disposableStore = new DisposableStore();
		disposableStore.add(this._editorWidget.onKeyDown((e) => {
			if (e.keyCode === KeyCode.Enter) {
				this._commandService.executeCommand('editor.action.openLink');
			} else if (e.keyCode === KeyCode.Escape || shouldHide(e.browserEvent, this._keybindingService, this._configurationService)) {
				hide(e);
			} else if (e.keyCode === KeyCode.KeyH && provider.options.readMoreUrl) {
				const url: string = provider.options.readMoreUrl;
				alert(AccessibilityHelpNLS.openingDocs);
				this._openerService.open(URI.parse(url));
				e.preventDefault();
				e.stopPropagation();
			}
			if (provider instanceof AccessibleContentProvider) {
				provider.onKeyDown?.(e);
			}
		}));
		disposableStore.add(addDisposableListener(this._toolbar.getElement(), EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const keyboardEvent = new StandardKeyboardEvent(e);
			if (keyboardEvent.equals(KeyCode.Escape)) {
				hide(e);
			}
		}));
		disposableStore.add(this._editorWidget.onDidBlurEditorWidget(() => {
			if (!isActiveElement(this._toolbar.getElement())) {
				hide();
			}
		}));
		disposableStore.add(this._editorWidget.onDidContentSizeChange(() => this._layout()));
		disposableStore.add(this._layoutService.onDidLayoutActiveContainer(() => this._layout()));
		return disposableStore;
	}

	private _updateToolbar(providedActions?: IAction[], type?: AccessibleViewType): void {
		this._toolbar.setAriaLabel(type === AccessibleViewType.Help ? localize('accessibleHelpToolbar', 'Accessibility Help') : localize('accessibleViewToolbar', "Accessible View"));
		const toolbarMenu = this._register(this._menuService.createMenu(MenuId.AccessibleView, this._contextKeyService));
		const menuActions = getFlatActionBarActions(toolbarMenu.getActions({}));
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
		const dimension = this._layoutService.activeContainerDimension;
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
		return this._currentProvider.options.type === AccessibleViewType.Help || this._currentProvider.options.language === 'markdown' || this._currentProvider.options.language === undefined || (this._currentProvider instanceof AccessibleContentProvider && !!this._currentProvider.getSymbols?.());
	}

	private _updateLastProvider(): AccesibleViewContentProvider | undefined {
		const provider = this._currentProvider;
		if (!provider) {
			return;
		}
		const lastProvider = provider instanceof AccessibleContentProvider ? new AccessibleContentProvider(
			provider.id,
			provider.options,
			provider.provideContent.bind(provider),
			provider.onClose.bind(provider),
			provider.verbositySettingKey,
			provider.onOpen?.bind(provider),
			provider.actions,
			provider.provideNextContent?.bind(provider),
			provider.providePreviousContent?.bind(provider),
			provider.onDidChangeContent?.bind(provider),
			provider.onKeyDown?.bind(provider),
			provider.getSymbols?.bind(provider),
		) : new ExtensionContentProvider(
			provider.id,
			provider.options,
			provider.provideContent.bind(provider),
			provider.onClose.bind(provider),
			provider.onOpen?.bind(provider),
			provider.provideNextContent?.bind(provider),
			provider.providePreviousContent?.bind(provider),
			provider.actions,
			provider.onDidChangeContent?.bind(provider),
		);
		return lastProvider;
	}

	public showAccessibleViewHelp(): void {
		const lastProvider = this._updateLastProvider();
		if (!lastProvider) {
			return;
		}
		let accessibleViewHelpProvider;
		if (lastProvider instanceof AccessibleContentProvider) {
			accessibleViewHelpProvider = new AccessibleContentProvider(
				lastProvider.id,
				{ type: AccessibleViewType.Help },
				() => lastProvider.options.customHelp ? lastProvider?.options.customHelp() : this._accessibleViewHelpDialogContent(this._goToSymbolsSupported()),
				() => {
					this._contextViewService.hideContextView();
					// HACK: Delay to allow the context view to hide #207638
					queueMicrotask(() => this.show(lastProvider));
				},
				lastProvider.verbositySettingKey
			);
		} else {
			accessibleViewHelpProvider = new ExtensionContentProvider(
				lastProvider.id,
				{ type: AccessibleViewType.Help },
				() => lastProvider.options.customHelp ? lastProvider?.options.customHelp() : this._accessibleViewHelpDialogContent(this._goToSymbolsSupported()),
				() => {
					this._contextViewService.hideContextView();
					// HACK: Delay to allow the context view to hide #207638
					queueMicrotask(() => this.show(lastProvider));
				},
			);
		}
		this._contextViewService.hideContextView();
		// HACK: Delay to allow the context view to hide #186514
		if (accessibleViewHelpProvider) {
			queueMicrotask(() => this.show(accessibleViewHelpProvider, undefined, true));
		}
	}

	private _accessibleViewHelpDialogContent(providerHasSymbols?: boolean): string {
		const navigationHint = this._navigationHint();
		const goToSymbolHint = this._goToSymbolHint(providerHasSymbols);
		const toolbarHint = localize('toolbar', "Navigate to the toolbar (Shift+Tab).");
		const chatHints = this._getChatHints();

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
		if (chatHints) {
			hint += chatHints;
		}
		return hint;
	}

	private _getChatHints(): string | undefined {
		if (this._currentProvider?.id !== AccessibleViewProviderId.PanelChat && this._currentProvider?.id !== AccessibleViewProviderId.QuickChat) {
			return;
		}
		return [localize('insertAtCursor', " - Insert the code block at the cursor{0}.", '<keybinding:workbench.action.chat.insertCodeBlock>'),
		localize('insertIntoNewFile', " - Insert the code block into a new file{0}.", '<keybinding:workbench.action.chat.insertIntoNewFile>'),
		localize('runInTerminal', " - Run the code block in the terminal{0}.\n", '<keybinding:workbench.action.chat.runInTerminal>')].join('\n');
	}

	private _navigationHint(): string {
		return localize('accessibleViewNextPreviousHint', "Show the next item{0} or previous item{1}.", `<keybinding:${AccessibilityCommandId.ShowNext}`, `<keybinding:${AccessibilityCommandId.ShowPrevious}>`);
	}

	private _disableVerbosityHint(provider: AccesibleViewContentProvider): string {
		if (provider.options.type === AccessibleViewType.Help && this._verbosityEnabled()) {
			return localize('acessibleViewDisableHint', "\nDisable accessibility verbosity for this feature{0}.", `<keybinding:${AccessibilityCommandId.DisableVerbosityHint}>`);
		}
		return '';
	}

	private _goToSymbolHint(providerHasSymbols?: boolean): string | undefined {
		if (!providerHasSymbols) {
			return;
		}
		return localize('goToSymbolHint', 'Go to a symbol{0}.', `<keybinding:${AccessibilityCommandId.GoToSymbol}>`);
	}

	private _configureUnassignedKbHint(): string {
		const configureKb = this._keybindingService.lookupKeybinding(AccessibilityCommandId.AccessibilityHelpConfigureKeybindings)?.getAriaLabel();
		const keybindingToConfigureQuickPick = configureKb ? '(' + configureKb + ')' : 'by assigning a keybinding to the command Accessibility Help Configure Unassigned Keybindings.';
		return localize('configureKb', '\nConfigure keybindings for commands that lack them {0}.', keybindingToConfigureQuickPick);
	}

	private _configureAssignedKbHint(): string {
		const configureKb = this._keybindingService.lookupKeybinding(AccessibilityCommandId.AccessibilityHelpConfigureAssignedKeybindings)?.getAriaLabel();
		const keybindingToConfigureQuickPick = configureKb ? '(' + configureKb + ')' : 'by assigning a keybinding to the command Accessibility Help Configure Assigned Keybindings.';
		return localize('configureKbAssigned', '\nConfigure keybindings for commands that already have assignments {0}.', keybindingToConfigureQuickPick);
	}

	private _screenReaderModeHint(provider: AccesibleViewContentProvider): string {
		const accessibilitySupport = this._accessibilityService.isScreenReaderOptimized();
		let screenReaderModeHint = '';
		const turnOnMessage = (
			isMacintosh
				? AccessibilityHelpNLS.changeConfigToOnMac
				: AccessibilityHelpNLS.changeConfigToOnWinLinux
		);
		if (accessibilitySupport && provider.id === AccessibleViewProviderId.Editor) {
			screenReaderModeHint = AccessibilityHelpNLS.auto_on;
			screenReaderModeHint += '\n';
		} else if (!accessibilitySupport) {
			screenReaderModeHint = AccessibilityHelpNLS.auto_off + '\n' + turnOnMessage;
			screenReaderModeHint += '\n';
		}
		return screenReaderModeHint;
	}

	private _exitDialogHint(provider: AccesibleViewContentProvider): string {
		return this._verbosityEnabled() && !provider.options.position ? localize('exit', '\nExit this dialog (Escape).') : '';
	}

	private _readMoreHint(provider: AccesibleViewContentProvider): string {
		return provider.options.readMoreUrl ? localize("openDoc", "\nOpen a browser window with more information related to accessibility{0}.", `<keybinding:${AccessibilityCommandId.AccessibilityHelpOpenHelpLink}>`) : '';
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

	show(provider: AccesibleViewContentProvider, position?: Position): void {
		if (!this._accessibleView) {
			this._accessibleView = this._register(this._instantiationService.createInstance(AccessibleView));
		}
		this._accessibleView.show(provider, undefined, undefined, position);
	}
	configureKeybindings(unassigned: boolean): void {
		this._accessibleView?.configureKeybindings(unassigned);
	}
	openHelpLink(): void {
		this._accessibleView?.openHelpLink();
	}
	showLastProvider(id: AccessibleViewProviderId): void {
		this._accessibleView?.showLastProvider(id);
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
	getPosition(id: AccessibleViewProviderId): Position | undefined {
		return this._accessibleView?.getPosition(id) ?? undefined;
	}
	getLastPosition(): Position | undefined {
		const lastLine = this._accessibleView?.editorWidget.getModel()?.getLineCount();
		return lastLine !== undefined && lastLine > 0 ? new Position(lastLine, 1) : undefined;
	}
	setPosition(position: Position, reveal?: boolean, select?: boolean): void {
		this._accessibleView?.setPosition(position, reveal, select);
	}
	getCodeBlockContext(): ICodeBlockActionContext | undefined {
		return this._accessibleView?.getCodeBlockContext();
	}
	navigateToCodeBlock(type: 'next' | 'previous'): void {
		this._accessibleView?.navigateToCodeBlock(type);
	}
}

class AccessibleViewSymbolQuickPick {
	constructor(private _accessibleView: AccessibleView, @IQuickInputService private readonly _quickInputService: IQuickInputService) {

	}
	show(provider: AccesibleViewContentProvider): void {
		const disposables = new DisposableStore();
		const quickPick = disposables.add(this._quickInputService.createQuickPick<IAccessibleViewSymbol>());
		quickPick.placeholder = localize('accessibleViewSymbolQuickPickPlaceholder', "Type to search symbols");
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
		disposables.add(quickPick.onDidAccept(() => {
			this._accessibleView.showSymbol(provider, quickPick.selectedItems[0]);
			quickPick.hide();
		}));
		disposables.add(quickPick.onDidHide(() => {
			if (quickPick.selectedItems.length === 0) {
				// this was escaped, so refocus the accessible view
				this._accessibleView.show(provider);
			}
			disposables.dispose();
		}));
	}
}


function shouldHide(event: KeyboardEvent, keybindingService: IKeybindingService, configurationService: IConfigurationService): boolean {
	if (!configurationService.getValue(AccessibilityWorkbenchSettingId.AccessibleViewCloseOnKeyPress)) {
		return false;
	}
	const standardKeyboardEvent = new StandardKeyboardEvent(event);
	const resolveResult = keybindingService.softDispatch(standardKeyboardEvent, standardKeyboardEvent.target);

	const isValidChord = resolveResult.kind === ResultKind.MoreChordsNeeded;
	if (keybindingService.inChordMode || isValidChord) {
		return false;
	}
	return shouldHandleKey(event) && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
}

function shouldHandleKey(event: KeyboardEvent): boolean {
	return !!event.code.match(/^(Key[A-Z]|Digit[0-9]|Equal|Comma|Period|Slash|Quote|Backquote|Backslash|Minus|Semicolon|Space|Enter)$/);
}
