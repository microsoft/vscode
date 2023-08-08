/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { isMacintosh } from 'vs/base/common/platform';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { Command, EditorExtensionsRegistry, MultiCommand, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { AccessibilityHelpNLS } from 'vs/editor/common/standaloneStrings';
import { localize } from 'vs/nls';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewDelegate, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { CodeActionController } from 'vs/editor/contrib/codeAction/browser/codeActionController';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { AccessibilityVerbositySettingId, accessibilityHelpIsShown, accessibleViewIsShown } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IPickerQuickAccessItem } from 'vs/platform/quickinput/browser/pickerQuickAccess';
import { marked } from 'vs/base/common/marked/marked';


class AccessibleViewDisableHintAction extends Action2 {
	constructor() {
		super({
			id: 'editor.action.accessibleViewDisableHint',
			keybinding: {
				when: ContextKeyExpr.or(accessibleViewIsShown, accessibilityHelpIsShown),
				primary: KeyMod.Alt | KeyCode.F6,
				weight: KeybindingWeight.WorkbenchContrib
			},
			menu: [{
				id: MenuId.CommandPalette,
				group: '',
				order: 1
			}],
			title: localize('editor.action.accessibleViewDisableHint', "Disable Accessible View Hint")
		});
	}
	run(accessor: ServicesAccessor): void {
		accessor.get(IAccessibleViewService).disableHint();
	}
}
registerAction2(AccessibleViewDisableHintAction);

const enum DIMENSIONS {
	MAX_WIDTH = 600
}

export interface IAccessibleContentProvider {
	verbositySettingKey: AccessibilityVerbositySettingId;
	provideContent(): string;
	onClose(): void;
	onKeyDown?(e: IKeyboardEvent): void;
	previous?(): void;
	next?(): void;
	/**
	 * When the language is markdown, this is provided by default.
	 */
	getSymbols?(): IAccessibleViewSymbol[];
	options: IAccessibleViewOptions;
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
	ariaLabel: string;
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
	get editorWidget() { return this._editorWidget; }
	private _editorContainer: HTMLElement;
	private _currentProvider: IAccessibleContentProvider | undefined;

	constructor(
		@IOpenerService private readonly _openerService: IOpenerService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IModelService private readonly _modelService: IModelService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@ILayoutService private readonly _layoutService: ILayoutService
	) {
		super();
		this._accessiblityHelpIsShown = accessibilityHelpIsShown.bindTo(this._contextKeyService);
		this._accessibleViewIsShown = accessibleViewIsShown.bindTo(this._contextKeyService);
		this._editorContainer = document.createElement('div');
		this._editorContainer.classList.add('accessible-view');
		const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
			contributions: EditorExtensionsRegistry.getEditorContributions().filter(c => c.id !== CodeActionController.ID)
		};
		const editorOptions: IEditorConstructionOptions = {
			...getSimpleEditorOptions(this._configurationService),
			lineDecorationsWidth: 6,
			dragAndDrop: true,
			cursorWidth: 1,
			wrappingStrategy: 'advanced',
			wrappingIndent: 'none',
			padding: { top: 2, bottom: 2 },
			quickSuggestions: false,
			renderWhitespace: 'none',
			dropIntoEditor: { enabled: true },
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
			if (this._currentProvider && this._accessiblityHelpIsShown.get() && e.affectsConfiguration(this._currentProvider.verbositySettingKey)) {
				this.show(this._currentProvider);
			}
		}));
	}

	show(provider?: IAccessibleContentProvider, symbol?: IAccessibleViewSymbol): void {
		if (!provider) {
			provider = this._currentProvider;
		}
		if (!provider) {
			return;
		}
		if (provider.options.type === AccessibleViewType.Help) {
			this._accessiblityHelpIsShown.set(true);
		} else {
			this._accessibleViewIsShown.set(true);
		}
		const delegate: IContextViewDelegate = {
			getAnchor: () => { return { x: (window.innerWidth / 2) - ((Math.min(this._layoutService.dimension.width * 0.62 /* golden cut */, DIMENSIONS.MAX_WIDTH)) / 2), y: this._layoutService.offset.quickPickTop }; },
			render: (container) => {
				container.classList.add('accessible-view-container');
				return this._render(provider!, container);
			},
			onHide: () => {
				if (provider!.options.type === AccessibleViewType.Help) {
					this._accessiblityHelpIsShown.reset();
				} else {
					this._accessibleViewIsShown.reset();
				}
				this._currentProvider = undefined;
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
		this._instantiationService.createInstance(AccessibleViewSymbolQuickPick, this).show(this._currentProvider!);
	}

	getSymbols(): IAccessibleViewSymbol[] | undefined {
		if (!this._currentProvider) {
			return;
		}
		const tokens = this._currentProvider.options.language && this._currentProvider.options.language !== 'markdown' ? this._currentProvider.getSymbols?.() : marked.lexer(this._currentProvider.provideContent());
		if (!tokens) {
			return;
		}
		const symbols: IAccessibleViewSymbol[] = [];
		for (const token of tokens) {
			let label: string | undefined = undefined;
			if ('type' in token) {
				switch (token.type) {
					case 'heading':
					case 'paragraph':
					case 'code':
						label = token.text;
						break;
					case 'list':
						label = token.items?.map(i => i.text).join(', ');
						break;
				}
			} else {
				label = token.label;
			}
			if (label) {
				symbols.push({ info: label, label: localize('symbolLabel', "({0}) {1}", token.type, label), ariaLabel: localize('symbolLabelAria', "({0}) {1}", token.type, label) });
			}
		}
		return symbols;
	}

	showSymbol(provider: IAccessibleContentProvider, symbol: IAccessibleViewSymbol): void {
		const index = provider.provideContent().split('\n').findIndex(line => line.includes(symbol.info.split('\n')[0])) ?? -1;
		if (index >= 0) {
			this.show(provider);
			this._editorWidget.revealLine(index + 1);
			this._editorWidget.setSelection({ startLineNumber: index + 1, startColumn: 1, endLineNumber: index + 1, endColumn: 1 });
		}
	}

	disableHint(): void {
		if (!this._currentProvider) {
			return;
		}
		this._configurationService.updateValue(this._currentProvider?.verbositySettingKey, false);
		alert(localize('disableAccessibilityHelp', '{0} accessibility verbosity is now disabled', this._currentProvider.verbositySettingKey));
	}

	private _render(provider: IAccessibleContentProvider, container: HTMLElement, internal?: boolean): IDisposable {
		if (!internal) {
			this._currentProvider = provider;
		}
		const value = this._configurationService.getValue(provider.verbositySettingKey);
		const readMoreLink = provider.options.readMoreUrl ? localize("openDoc", "\nPress H now to open a browser window with more information related to accessibility.\n") : '';
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

		const fragment = message + provider.provideContent() + readMoreLink + disableHelpHint + localize('exit-tip', 'Exit this dialog via the Escape key.');

		this._getTextModel(URI.from({ path: `accessible-view-${provider.verbositySettingKey}`, scheme: 'accessible-view', fragment })).then((model) => {
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
			let ariaLabel = '';
			let helpHint = '';
			if (this._configurationService.getValue(provider.verbositySettingKey) && provider.options.type !== 'help') {
				const accessibilityHelpKeybinding = this._keybindingService.lookupKeybinding('editor.action.accessibilityHelp')?.getLabel();
				if (accessibilityHelpKeybinding) {
					helpHint = localize('ariaAccessibilityHelp', "Use {0} for accessibility help", accessibilityHelpKeybinding);
				}
			}
			if (helpHint) {
				ariaLabel = provider.options.ariaLabel ? localize('helpAriaKb', "{0}, {1}", provider.options.ariaLabel, helpHint) : localize('accessible-view', "Accessible View, {0}", helpHint);
			} else {
				ariaLabel = provider.options.ariaLabel ? provider.options.ariaLabel : localize('helpAriaNoKb', "Accessible View");
			}
			this._editorWidget.updateOptions({ ariaLabel });
			this._editorWidget.focus();
		});
		const disposableStore = new DisposableStore();
		disposableStore.add(this._editorWidget.onKeyUp((e) => {
			provider.onKeyDown?.(e);
		}));
		disposableStore.add(this._editorWidget.onKeyDown((e) => {
			if (e.keyCode === KeyCode.Escape) {
				e.stopPropagation();
				this._contextViewService.hideContextView();
				// Delay to allow the context view to hide #186514
				setTimeout(() => provider.onClose(), 100);
			} else if (e.keyCode === KeyCode.KeyH && provider.options.readMoreUrl) {
				const url: string = provider.options.readMoreUrl!;
				alert(AccessibilityHelpNLS.openingDocs);
				this._openerService.open(URI.parse(url));
				e.preventDefault();
				e.stopPropagation();
			}
		}));
		disposableStore.add(this._editorWidget.onDidBlurEditorText(() => this._contextViewService.hideContextView()));
		disposableStore.add(this._editorWidget.onDidContentSizeChange(() => this._layout()));
		disposableStore.add(this._layoutService.onDidLayout(() => this._layout()));
		return disposableStore;
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

	public showAccessibleViewHelp(): void {
		if (!this._currentProvider) {
			return;

		}
		const previousProvider = Object.assign({}, this._currentProvider);
		const accessibleViewHelpProvider = Object.assign({}, this._currentProvider);
		accessibleViewHelpProvider.options.type = AccessibleViewType.Help;
		accessibleViewHelpProvider.provideContent = () => this._getAccessibleViewHelpDialogContent(accessibleViewHelpProvider!);
		accessibleViewHelpProvider.onClose = () => this.show(previousProvider);
		this._accessiblityHelpIsShown.set(true);
		const delegate: IContextViewDelegate = {
			getAnchor: () => { return { x: (window.innerWidth / 2) - ((Math.min(this._layoutService.dimension.width * 0.62 /* golden cut */, DIMENSIONS.MAX_WIDTH)) / 2), y: this._layoutService.offset.quickPickTop }; },
			render: (container) => {
				container.classList.add('accessible-view-container');
				return this._render(accessibleViewHelpProvider, container, true);
			},
		};
		this._contextViewService.showContextView(delegate);
	}

	private _getAccessibleViewHelpDialogContent(provider: IAccessibleContentProvider): string {
		const navigationHint = this._getNavigationAriaHint(provider.verbositySettingKey);
		const goToSymbolHint = this._getGoToSymbolHint(provider);
		return [navigationHint, goToSymbolHint].filter(i => !!i).join('\n');
	}

	private _getNavigationAriaHint(verbositySettingKey: AccessibilityVerbositySettingId): string {
		let hint = '';
		const nextKeybinding = this._keybindingService.lookupKeybinding('editor.action.accessibleViewNext')?.getAriaLabel();
		const previousKeybinding = this._keybindingService.lookupKeybinding('editor.action.accessibleViewPrevious')?.getAriaLabel();
		if (this._configurationService.getValue(verbositySettingKey)) {
			hint = (nextKeybinding && previousKeybinding) ? localize('accessibleViewNextPreviousHint', "Show the next ({0}) or previous ({1}) item in the accessible view", nextKeybinding, previousKeybinding) : localize('chatAccessibleViewNextPreviousHintNoKb', "Show the next or previous item in the accessible view by configuring keybindings for Show Next / Previous in Accessible View");
		}
		return hint;
	}
	private _getDisableVerbosityHint(verbositySettingKey: AccessibilityVerbositySettingId): string {
		if (!this._configurationService.getValue(verbositySettingKey)) {
			return '';
		}
		const disableKeybinding = this._keybindingService.lookupKeybinding('editor.action.accessibleViewDisableHint', this._contextKeyService)?.getAriaLabel();
		return !!disableKeybinding ? localize('acessibleViewDisableHint', "Disable the hint to open the accessible view by pressing ({0}).", disableKeybinding) : localize('accessibleViewDisableHintNoKb', 'Add a keybinding for the command Disable Accessible View Hint to disable this hint."');
	}

	private _getGoToSymbolHint(provider: IAccessibleContentProvider): string {
		const goToSymbolKb = this._keybindingService.lookupKeybinding('editor.action.accessibleViewGoToSymbol')?.getAriaLabel();
		const hasSymbolProvider = provider.options.language === 'markdown' || provider.options.language === undefined || !!provider.getSymbols;
		let goToSymbolHint = '';
		if (hasSymbolProvider) {
			if (goToSymbolKb) {
				goToSymbolHint = localize('goToSymbolHint', 'Go to a symbol within the accessible view (({0}).', goToSymbolKb);
			} else {
				goToSymbolHint = localize('goToSymbolHintNoKb', 'To go to a symbol within the accessible view, configure a keybinding for the command Go To Symbol in Accessible View.', goToSymbolKb);
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
		const keybinding = this._keybindingService.lookupKeybinding(AccessibleViewAction.id)?.getAriaLabel();
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

class AccessibleViewNextAction extends Action2 {
	constructor() {
		super({
			id: 'editor.action.accessibleViewNext',
			precondition: accessibleViewIsShown,
			keybinding: {
				primary: KeyMod.Alt | KeyCode.BracketRight,
				weight: KeybindingWeight.WorkbenchContrib
			},
			menu: [{
				id: MenuId.CommandPalette,
				group: '',
				order: 1
			}],
			title: localize('editor.action.accessibleViewNext', "Show Next in Accessible View")
		});
	}
	run(accessor: ServicesAccessor): void {
		accessor.get(IAccessibleViewService).next();
	}
}
registerAction2(AccessibleViewNextAction);


class AccessibleViewGoToSymbolAction extends Action2 {
	constructor() {
		super({
			id: 'editor.action.accessibleViewGoToSymbol',
			precondition: accessibleViewIsShown,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyO,
				weight: KeybindingWeight.WorkbenchContrib + 10
			},
			menu: [{
				id: MenuId.CommandPalette,
				group: '',
				order: 1
			}],
			title: localize('editor.action.accessibleViewGoToSymbol', "Go To Symbol in Accessible View")
		});
	}
	run(accessor: ServicesAccessor): void {
		accessor.get(IAccessibleViewService).goToSymbol();
	}
}
registerAction2(AccessibleViewGoToSymbolAction);

class AccessibleViewPreviousAction extends Action2 {
	constructor() {
		super({
			id: 'editor.action.accessibleViewPrevious',
			precondition: accessibleViewIsShown,
			keybinding: {
				primary: KeyMod.Alt | KeyCode.BracketLeft,
				weight: KeybindingWeight.WorkbenchContrib
			},
			menu: [{
				id: MenuId.CommandPalette,
				group: '',
				order: 1
			}],
			title: localize('editor.action.accessibleViewPrevious', "Show Previous in Accessible View")
		});
	}
	run(accessor: ServicesAccessor): void {
		accessor.get(IAccessibleViewService).previous();
	}
}
registerAction2(AccessibleViewPreviousAction);

function registerCommand<T extends Command>(command: T): T {
	command.register();
	return command;
}

export const AccessibilityHelpAction = registerCommand(new MultiCommand({
	id: 'editor.action.accessibilityHelp',
	precondition: undefined,
	kbOpts: {
		primary: KeyMod.Alt | KeyCode.F1,
		weight: KeybindingWeight.WorkbenchContrib,
		linux: {
			primary: KeyMod.Alt | KeyMod.Shift | KeyCode.F1,
			secondary: [KeyMod.Alt | KeyCode.F1]
		}
	},
	menuOpts: [{
		menuId: MenuId.CommandPalette,
		group: '',
		title: localize('editor.action.accessibilityHelp', "Open Accessibility Help"),
		order: 1
	}],
}));


export const AccessibleViewAction = registerCommand(new MultiCommand({
	id: 'editor.action.accessibleView',
	precondition: undefined,
	kbOpts: {
		primary: KeyMod.Alt | KeyCode.F2,
		weight: KeybindingWeight.WorkbenchContrib,
		linux: {
			primary: KeyMod.Alt | KeyMod.Shift | KeyCode.F2,
			secondary: [KeyMod.Alt | KeyCode.F2]
		}
	},
	menuOpts: [{
		menuId: MenuId.CommandPalette,
		group: '',
		title: localize('editor.action.accessibleView', "Open Accessible View"),
		order: 1
	}],
}));


class AccessibleViewSymbolQuickPick {
	constructor(private _accessibleView: AccessibleView, @IQuickInputService private readonly _quickInputService: IQuickInputService) {

	}
	show(provider: IAccessibleContentProvider): void {
		const quickPick = this._quickInputService.createQuickPick<IAccessibleViewSymbol>();
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
}
