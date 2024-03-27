/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventType, addDisposableListener, getActiveWindow, isActiveElement } from 'vs/base/browser/dom';
import { IKeyboardEvent, StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { IAction } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { Event } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { marked } from 'vs/base/common/marked/marked';
import { isMacintosh, isWindows } from 'vs/base/common/platform';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { Position } from 'vs/editor/common/core/position';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { AccessibilityHelpNLS } from 'vs/editor/common/standaloneStrings';
import { CodeActionController } from 'vs/editor/contrib/codeAction/browser/codeActionController';
import { localize } from 'vs/nls';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { WorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewDelegate, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ResultKind } from 'vs/platform/keybinding/common/keybindingResolver';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IPickerQuickAccessItem } from 'vs/platform/quickinput/browser/pickerQuickAccess';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { AccessibilityVerbositySettingId, AccessibilityWorkbenchSettingId, AccessibleViewProviderId, accessibilityHelpIsShown, accessibleViewContainsCodeBlocks, accessibleViewCurrentProviderId, accessibleViewGoToSymbolSupported, accessibleViewInCodeBlock, accessibleViewIsShown, accessibleViewOnLastLine, accessibleViewSupportsNavigation, accessibleViewVerbosityEnabled } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { AccessibilityCommandId } from 'vs/workbench/contrib/accessibility/common/accessibilityCommands';
import { IChatCodeBlockContextProviderService } from 'vs/workbench/contrib/chat/browser/chat';
import { ICodeBlockActionContext } from 'vs/workbench/contrib/chat/browser/codeBlockPart';
import { getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';

const enum DIMENSIONS {
	MAX_WIDTH = 600
}

export interface IAccessibleContentProvider {
	id: AccessibleViewProviderId;
	verbositySettingKey: AccessibilityVerbositySettingId;
	options: IAccessibleViewOptions;
	/**
	 * Note that a Codicon class should be provided for each action.
	 * If not, a default will be used.
	 */
	actions?: IAction[];
	provideContent(): string;
	onClose(): void;
	onKeyDown?(e: IKeyboardEvent): void;
	previous?(): void;
	next?(): void;
	/**
	 * When the language is markdown, this is provided by default.
	 */
	getSymbols?(): IAccessibleViewSymbol[];
	/**
	 * Note that this will only take effect if the provider has an ID.
	 */
	onDidRequestClearLastProvider?: Event<AccessibleViewProviderId>;
}

export const IAccessibleViewService = createDecorator<IAccessibleViewService>('accessibleViewService');

export interface IAccessibleViewService {
	readonly _serviceBrand: undefined;
	show(provider: IAccessibleContentProvider, position?: Position): void;
	showLastProvider(id: AccessibleViewProviderId): void;
	showAccessibleViewHelp(): void;
	next(): void;
	previous(): void;
	goToSymbol(): void;
	disableHint(): void;
	getPosition(id: AccessibleViewProviderId): Position | undefined;
	setPosition(position: Position, reveal?: boolean): void;
	getLastPosition(): Position | undefined;
	/**
	 * If the setting is enabled, provides the open accessible view hint as a localized string.
	 * @param verbositySettingKey The setting key for the verbosity of the feature
	 */
	getOpenAriaHint(verbositySettingKey: AccessibilityVerbositySettingId): string | null;
	getCodeBlockContext(): ICodeBlockActionContext | undefined;
}

export const enum AccessibleViewType {
	Help = 'help',
	View = 'view'
}

export const enum NavigationType {
	Previous = 'previous',
	Next = 'next'
}

export interface IAccessibleViewOptions {
	readMoreUrl?: string;
	/**
	 * Defaults to markdown
	 */
	language?: string;
	type: AccessibleViewType;
	/**
	 * By default, places the cursor on the top line of the accessible view.
	 * If set to 'initial-bottom', places the cursor on the bottom line of the accessible view and preserves it henceforth.
	 * If set to 'bottom', places the cursor on the bottom line of the accessible view.
	 */
	position?: 'bottom' | 'initial-bottom';
	/**
	 * @returns a string that will be used as the content of the help dialog
	 * instead of the one provided by default.
	 */
	customHelp?: () => string;
	/**
	 * If this provider might want to request to be shown again, provide an ID.
	 */
	id?: AccessibleViewProviderId;
}

interface ICodeBlock {
	startLine: number;
	endLine: number;
	code: string;
	languageId?: string;
}

export class AccessibleView extends Disposable {
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
	private _codeBlocks?: ICodeBlock[];

	get editorWidget() { return this._editorWidget; }
	private _container: HTMLElement;
	private _title: HTMLElement;
	private readonly _toolbar: WorkbenchToolBar;

	private _currentProvider: IAccessibleContentProvider | undefined;
	private _currentContent: string | undefined;

	private _lastProvider: IAccessibleContentProvider | undefined;

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
		@IChatCodeBlockContextProviderService private readonly _codeBlockContextProviderService: IChatCodeBlockContextProviderService
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
			wrappingStrategy: 'advanced',
			wrappingIndent: 'none',
			padding: { top: 2, bottom: 2 },
			quickSuggestions: false,
			renderWhitespace: 'none',
			dropIntoEditor: { enabled: false },
			readOnly: true,
			fontFamily: 'var(--monaco-monospace-font)'
		};
		this._editorWidget = this._register(this._instantiationService.createInstance(CodeEditorWidget, this._container, editorOptions, codeEditorWidgetOptions));
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

	private _resetContextKeys(): void {
		this._accessiblityHelpIsShown.reset();
		this._accessibleViewIsShown.reset();
		this._accessibleViewSupportsNavigation.reset();
		this._accessibleViewVerbosityEnabled.reset();
		this._accessibleViewGoToSymbolSupported.reset();
		this._accessibleViewCurrentProviderId.reset();
	}

	getPosition(id?: AccessibleViewProviderId): Position | undefined {
		if (!id || !this._lastProvider || this._lastProvider.id !== id) {
			return undefined;
		}
		return this._editorWidget.getPosition() || undefined;
	}

	setPosition(position: Position, reveal?: boolean): void {
		this._editorWidget.setPosition(position);
		if (reveal) {
			this._editorWidget.revealPosition(position);
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

	showLastProvider(id: AccessibleViewProviderId): void {
		if (!this._lastProvider || this._lastProvider.options.id !== id) {
			return;
		}
		this.show(this._lastProvider);
	}

	show(provider?: IAccessibleContentProvider, symbol?: IAccessibleViewSymbol, showAccessibleViewHelp?: boolean, position?: Position): void {
		provider = provider ?? this._currentProvider;
		if (!provider) {
			return;
		}
		const delegate: IContextViewDelegate = {
			getAnchor: () => { return { x: (getActiveWindow().innerWidth / 2) - ((Math.min(this._layoutService.activeContainerDimension.width * 0.62 /* golden cut */, DIMENSIONS.MAX_WIDTH)) / 2), y: this._layoutService.activeContainerOffset.quickPickTop }; },
			render: (container) => {
				container.classList.add('accessible-view-container');
				return this._render(provider, container, showAccessibleViewHelp);
			},
			onHide: () => {
				if (!showAccessibleViewHelp) {
					this._updateLastProvider();
					this._currentProvider = undefined;
					this._resetContextKeys();
				}
			}
		};
		this._contextViewService.showContextView(delegate);

		if (position) {
			// Context view takes time to show up, so we need to wait for it to show up before we can set the position
			setTimeout(() => {
				this._editorWidget.revealLine(position.lineNumber);
				this._editorWidget.setSelection({ startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: position.column });
			}, 10);
		}

		if (symbol && this._currentProvider) {
			this.showSymbol(this._currentProvider, symbol);
		}
		if (provider.onDidRequestClearLastProvider) {
			this._register(provider.onDidRequestClearLastProvider((id) => {
				if (this._lastProvider?.options.id === id) {
					this._lastProvider = undefined;
				}
			}));
		}
		if (provider.options.id) {
			// only cache a provider with an ID so that it will eventually be cleared.
			this._lastProvider = provider;
		}
		if (provider.id === AccessibleViewProviderId.Chat) {
			this._register(this._codeBlockContextProviderService.registerProvider({ getCodeBlockContext: () => this.getCodeBlockContext() }, 'accessibleView'));
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

	calculateCodeBlocks(markdown: string): void {
		if (this._currentProvider?.id !== AccessibleViewProviderId.Chat) {
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
			} else if (inBlock && line.startsWith('```')) {
				inBlock = false;
				const endLine = i;
				const code = lines.slice(startLine, endLine).join('\n');
				this._codeBlocks?.push({ startLine, endLine, code, languageId });
			}
		});
		this._accessibleViewContainsCodeBlocks.set(this._codeBlocks.length > 0);
	}

	getSymbols(): IAccessibleViewSymbol[] | undefined {
		if (!this._currentProvider || !this._currentContent) {
			return;
		}
		const symbols: IAccessibleViewSymbol[] = this._currentProvider.getSymbols?.() || [];
		if (symbols?.length) {
			return symbols;
		}
		if (this._currentProvider.options.language && this._currentProvider.options.language !== 'markdown') {
			// Symbols haven't been provided and we cannot parse this language
			return;
		}
		const markdownTokens: marked.TokensList | undefined = marked.lexer(this._currentContent);
		if (!markdownTokens) {
			return;
		}
		this._convertTokensToSymbols(markdownTokens, symbols);
		return symbols.length ? symbols : undefined;
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
						const firstItem = token.items?.[0];
						if (!firstItem) {
							break;
						}
						firstListItem = `- ${firstItem.text}`;
						label = token.items?.map(i => i.text).join(', ');
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

	showSymbol(provider: IAccessibleContentProvider, symbol: IAccessibleViewSymbol): void {
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
		this.show(provider, undefined, undefined, { lineNumber, column: 1 } as Position);
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
		this._currentProvider = provider;
		this._accessibleViewCurrentProviderId.set(provider.id);
		const value = this._configurationService.getValue(provider.verbositySettingKey);
		const readMoreLink = provider.options.readMoreUrl ? localize("openDoc", "\n\nOpen a browser window with more information related to accessibility (H).") : '';
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
		const verbose = this._configurationService.getValue(provider.verbositySettingKey);
		const exitThisDialogHint = verbose && !provider.options.position ? localize('exit', '\n\nExit this dialog (Escape).') : '';
		const newContent = message + provider.provideContent() + readMoreLink + disableHelpHint + exitThisDialogHint;
		this.calculateCodeBlocks(newContent);
		this._currentContent = newContent;
		this._updateContextKeys(provider, true);
		const widgetIsFocused = this._editorWidget.hasTextFocus() || this._editorWidget.hasWidgetFocus();
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
			container.appendChild(this._container);
			let actionsHint = '';
			const verbose = this._configurationService.getValue(provider.verbositySettingKey);
			const hasActions = this._accessibleViewSupportsNavigation.get() || this._accessibleViewVerbosityEnabled.get() || this._accessibleViewGoToSymbolSupported.get() || this._currentProvider?.actions;
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
		this._updateToolbar(provider.actions, provider.options.type);

		const hide = (e: KeyboardEvent | IKeyboardEvent): void => {
			provider.onClose();
			e.stopPropagation();
			this._contextViewService.hideContextView();
			this._updateContextKeys(provider, false);
			this._lastProvider = undefined;
			this._currentContent = undefined;
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
			provider.onKeyDown?.(e);
		}));
		disposableStore.add(addDisposableListener(this._toolbar.getElement(), EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const keyboardEvent = new StandardKeyboardEvent(e);
			if (keyboardEvent.equals(KeyCode.Escape)) {
				hide(e);
			}
		}));
		disposableStore.add(this._editorWidget.onDidBlurEditorWidget(() => {
			if (!isActiveElement(this._toolbar.getElement())) {
				this._contextViewService.hideContextView();
			}
		}));
		disposableStore.add(this._editorWidget.onDidContentSizeChange(() => this._layout()));
		disposableStore.add(this._layoutService.onDidLayoutActiveContainer(() => this._layout()));
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
		return this._currentProvider.options.type === AccessibleViewType.Help || this._currentProvider.options.language === 'markdown' || this._currentProvider.options.language === undefined || !!this._currentProvider.getSymbols?.();
	}

	private _updateLastProvider(): IAccessibleContentProvider | undefined {
		if (!this._currentProvider) {
			return;
		}
		const lastProvider = Object.assign({}, this._currentProvider);
		lastProvider.provideContent = this._currentProvider.provideContent.bind(lastProvider);
		lastProvider.options = Object.assign({}, this._currentProvider.options);
		lastProvider.verbositySettingKey = this._currentProvider.verbositySettingKey;
		return lastProvider;
	}

	public showAccessibleViewHelp(): void {
		const lastProvider = this._updateLastProvider();
		if (!lastProvider) {
			return;
		}

		const accessibleViewHelpProvider: IAccessibleContentProvider = {
			id: lastProvider.id,
			provideContent: () => lastProvider.options.customHelp ? lastProvider?.options.customHelp() : this._getAccessibleViewHelpDialogContent(this._goToSymbolsSupported()),
			onClose: () => this.show(lastProvider),
			options: { type: AccessibleViewType.Help },
			verbositySettingKey: lastProvider.verbositySettingKey
		};
		this._contextViewService.hideContextView();
		// HACK: Delay to allow the context view to hide #186514
		setTimeout(() => this.show(accessibleViewHelpProvider, undefined, true), 100);
	}

	private _getAccessibleViewHelpDialogContent(providerHasSymbols?: boolean): string {
		const navigationHint = this._getNavigationHint();
		const goToSymbolHint = this._getGoToSymbolHint(providerHasSymbols);
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
		if (this._currentProvider?.id !== AccessibleViewProviderId.Chat) {
			return;
		}
		let hint = '';
		const insertAtCursorKb = this._keybindingService.lookupKeybinding('workbench.action.chat.insertCodeBlock')?.getAriaLabel();
		const insertIntoNewFileKb = this._keybindingService.lookupKeybinding('workbench.action.chat.insertIntoNewFile')?.getAriaLabel();
		const runInTerminalKb = this._keybindingService.lookupKeybinding('workbench.action.chat.runInTerminal')?.getAriaLabel();

		if (insertAtCursorKb) {
			hint += localize('insertAtCursor', " - Insert the code block at the cursor ({0}).\n", insertAtCursorKb);
		} else {
			hint += localize('insertAtCursorNoKb', " - Insert the code block at the cursor by configuring a keybinding for the Chat: Insert Code Block command.\n");
		}
		if (insertIntoNewFileKb) {
			hint += localize('insertIntoNewFile', " - Insert the code block into a new file ({0}).\n", insertIntoNewFileKb);
		} else {
			hint += localize('insertIntoNewFileNoKb', " - Insert the code block into a new file by configuring a keybinding for the Chat: Insert into New File command.\n");
		}
		if (runInTerminalKb) {
			hint += localize('runInTerminal', " - Run the code block in the terminal ({0}).\n", runInTerminalKb);
		} else {
			hint += localize('runInTerminalNoKb', " - Run the coe block in the terminal by configuring a keybinding for the Chat: Insert into Terminal command.\n");
		}

		return hint;
	}

	private _getNavigationHint(): string {
		let hint = '';
		const nextKeybinding = this._keybindingService.lookupKeybinding(AccessibilityCommandId.ShowNext)?.getAriaLabel();
		const previousKeybinding = this._keybindingService.lookupKeybinding(AccessibilityCommandId.ShowPrevious)?.getAriaLabel();
		if (nextKeybinding && previousKeybinding) {
			hint = localize('accessibleViewNextPreviousHint', "Show the next ({0}) or previous ({1}) item.", nextKeybinding, previousKeybinding);
		} else {
			hint = localize('chatAccessibleViewNextPreviousHintNoKb', "Show the next or previous item by configuring keybindings for the Show Next & Previous in Accessible View commands.");
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
			hint = localize('acessibleViewDisableHint', "\n\nDisable accessibility verbosity for this feature ({0}).", disableKeybinding);
		} else {
			hint = localize('accessibleViewDisableHintNoKb', "\n\nAdd a keybinding for the command Disable Accessible View Hint, which disables accessibility verbosity for this feature.s");
		}
		return hint;
	}

	private _getGoToSymbolHint(providerHasSymbols?: boolean): string {
		const goToSymbolKb = this._keybindingService.lookupKeybinding(AccessibilityCommandId.GoToSymbol)?.getAriaLabel();
		let goToSymbolHint = '';
		if (providerHasSymbols) {
			if (goToSymbolKb) {
				goToSymbolHint = localize('goToSymbolHint', 'Go to a symbol ({0}).', goToSymbolKb);
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

	show(provider: IAccessibleContentProvider, position?: Position): void {
		if (!this._accessibleView) {
			this._accessibleView = this._register(this._instantiationService.createInstance(AccessibleView));
		}
		this._accessibleView.show(provider, undefined, undefined, position);
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
	setPosition(position: Position, reveal?: boolean): void {
		const editorWidget = this._accessibleView?.editorWidget;
		editorWidget?.setPosition(position);
		if (reveal) {
			editorWidget?.revealLine(position.lineNumber);
		}
	}
	getCodeBlockContext(): ICodeBlockActionContext | undefined {
		return this._accessibleView?.getCodeBlockContext();
	}
}

class AccessibleViewSymbolQuickPick {
	constructor(private _accessibleView: AccessibleView, @IQuickInputService private readonly _quickInputService: IQuickInputService) {

	}
	show(provider: IAccessibleContentProvider): void {
		const quickPick = this._quickInputService.createQuickPick<IAccessibleViewSymbol>();
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

export interface IAccessibleViewSymbol extends IPickerQuickAccessItem {
	markdownToParse?: string;
	firstListItem?: string;
	lineNumber?: number;
	endLineNumber?: number;
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
