/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { Button, IButtonOptions } from 'vs/base/browser/ui/button/button';
import { FindInput, IFindInputOptions } from 'vs/base/browser/ui/findinput/findInput';
import { HistoryInputBox, IMessage } from 'vs/base/browser/ui/inputbox/inputBox';
import { Widget } from 'vs/base/browser/ui/widget';
import { Action } from 'vs/base/common/actions';
import { Delayer } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import * as strings from 'vs/base/common/strings';
import { CONTEXT_FIND_WIDGET_NOT_VISIBLE } from 'vs/editor/contrib/find/findModel';
import * as nls from 'vs/nls';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ISearchConfigurationProperties } from 'vs/workbench/services/search/common/search';
import { attachFindInputBoxStyler, attachInputBoxStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ContextScopedFindInput, ContextScopedHistoryInputBox } from 'vs/platform/browser/contextScopedHistoryWidget';
import { appendKeyBindingLabel, isSearchViewFocused } from 'vs/workbench/contrib/search/browser/searchActions';
import * as Constants from 'vs/workbench/contrib/search/common/constants';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IAccessibilityService, AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';
import { Checkbox } from 'vs/base/browser/ui/checkbox/checkbox';

export interface ISearchWidgetOptions {
	value?: string;
	replaceValue?: string;
	isRegex?: boolean;
	isCaseSensitive?: boolean;
	isWholeWords?: boolean;
	searchHistory?: string[];
	replaceHistory?: string[];
	preserveCase?: boolean;
}

class ReplaceAllAction extends Action {

	private static fgInstance: ReplaceAllAction | null = null;
	static readonly ID: string = 'search.action.replaceAll';

	static get INSTANCE(): ReplaceAllAction {
		if (ReplaceAllAction.fgInstance === null) {
			ReplaceAllAction.fgInstance = new ReplaceAllAction();
		}
		return ReplaceAllAction.fgInstance;
	}

	private _searchWidget: SearchWidget;

	constructor() {
		super(ReplaceAllAction.ID, '', 'action-replace-all', false);
	}

	set searchWidget(searchWidget: SearchWidget) {
		this._searchWidget = searchWidget;
	}

	run(): Promise<any> {
		if (this._searchWidget) {
			return this._searchWidget.triggerReplaceAll();
		}
		return Promise.resolve(null);
	}
}

export class SearchWidget extends Widget {

	private static readonly REPLACE_ALL_DISABLED_LABEL = nls.localize('search.action.replaceAll.disabled.label', "Replace All (Submit Search to Enable)");
	private static readonly REPLACE_ALL_ENABLED_LABEL = (keyBindingService2: IKeybindingService): string => {
		const kb = keyBindingService2.lookupKeybinding(ReplaceAllAction.ID);
		return appendKeyBindingLabel(nls.localize('search.action.replaceAll.enabled.label', "Replace All"), kb, keyBindingService2);
	}

	domNode: HTMLElement;

	searchInput: FindInput;
	searchInputFocusTracker: dom.IFocusTracker;
	private searchInputBoxFocused: IContextKey<boolean>;

	private replaceContainer: HTMLElement;
	replaceInput: HistoryInputBox;
	private toggleReplaceButton: Button;
	private replaceAllAction: ReplaceAllAction;
	private replaceActive: IContextKey<boolean>;
	private replaceActionBar: ActionBar;
	replaceInputFocusTracker: dom.IFocusTracker;
	private replaceInputBoxFocused: IContextKey<boolean>;
	private _replaceHistoryDelayer: Delayer<void>;
	private _preserveCase: Checkbox;

	private ignoreGlobalFindBufferOnNextFocus = false;
	private previousGlobalFindBufferValue: string;

	private _onSearchSubmit = this._register(new Emitter<void>());
	readonly onSearchSubmit: Event<void> = this._onSearchSubmit.event;

	private _onSearchCancel = this._register(new Emitter<void>());
	readonly onSearchCancel: Event<void> = this._onSearchCancel.event;

	private _onReplaceToggled = this._register(new Emitter<void>());
	readonly onReplaceToggled: Event<void> = this._onReplaceToggled.event;

	private _onReplaceStateChange = this._register(new Emitter<boolean>());
	readonly onReplaceStateChange: Event<boolean> = this._onReplaceStateChange.event;

	private _onPreserveCaseChange = this._register(new Emitter<boolean>());
	readonly onPreserveCaseChange: Event<boolean> = this._onPreserveCaseChange.event;

	private _onReplaceValueChanged = this._register(new Emitter<void>());
	readonly onReplaceValueChanged: Event<void> = this._onReplaceValueChanged.event;

	private _onReplaceAll = this._register(new Emitter<void>());
	readonly onReplaceAll: Event<void> = this._onReplaceAll.event;

	private _onBlur = this._register(new Emitter<void>());
	readonly onBlur: Event<void> = this._onBlur.event;

	private _onDidHeightChange = this._register(new Emitter<void>());
	readonly onDidHeightChange: Event<void> = this._onDidHeightChange.event;

	constructor(
		container: HTMLElement,
		options: ISearchWidgetOptions,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IThemeService private readonly themeService: IThemeService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IKeybindingService private readonly keyBindingService: IKeybindingService,
		@IClipboardService private readonly clipboardServce: IClipboardService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService
	) {
		super();
		this.replaceActive = Constants.ReplaceActiveKey.bindTo(this.contextKeyService);
		this.searchInputBoxFocused = Constants.SearchInputBoxFocusedKey.bindTo(this.contextKeyService);
		this.replaceInputBoxFocused = Constants.ReplaceInputBoxFocusedKey.bindTo(this.contextKeyService);
		this._replaceHistoryDelayer = new Delayer<void>(500);
		this.render(container, options);

		this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('editor.accessibilitySupport')) {
				this.updateAccessibilitySupport();
			}
		});
		this.accessibilityService.onDidChangeAccessibilitySupport(() => this.updateAccessibilitySupport());
		this.updateAccessibilitySupport();
	}

	focus(select: boolean = true, focusReplace: boolean = false, suppressGlobalSearchBuffer = false): void {
		this.ignoreGlobalFindBufferOnNextFocus = suppressGlobalSearchBuffer;

		if (focusReplace && this.isReplaceShown()) {
			this.replaceInput.focus();
			if (select) {
				this.replaceInput.select();
			}
		} else {
			this.searchInput.focus();
			if (select) {
				this.searchInput.select();
			}
		}
	}

	setWidth(width: number) {
		this.searchInput.inputBox.layout();
		this.replaceInput.width = width - 28;
		this.replaceInput.layout();
	}

	clear() {
		this.searchInput.clear();
		this.replaceInput.value = '';
		this.setReplaceAllActionState(false);
	}

	isReplaceShown(): boolean {
		return !dom.hasClass(this.replaceContainer, 'disabled');
	}

	isReplaceActive(): boolean {
		return !!this.replaceActive.get();
	}

	getReplaceValue(): string {
		return this.replaceInput.value;
	}

	toggleReplace(show?: boolean): void {
		if (show === undefined || show !== this.isReplaceShown()) {
			this.onToggleReplaceButton();
		}
	}

	getSearchHistory(): string[] {
		return this.searchInput.inputBox.getHistory();
	}

	getReplaceHistory(): string[] {
		return this.replaceInput.getHistory();
	}

	clearHistory(): void {
		this.searchInput.inputBox.clearHistory();
	}

	showNextSearchTerm() {
		this.searchInput.inputBox.showNextValue();
	}

	showPreviousSearchTerm() {
		this.searchInput.inputBox.showPreviousValue();
	}

	showNextReplaceTerm() {
		this.replaceInput.showNextValue();
	}

	showPreviousReplaceTerm() {
		this.replaceInput.showPreviousValue();
	}

	searchInputHasFocus(): boolean {
		return !!this.searchInputBoxFocused.get();
	}

	replaceInputHasFocus(): boolean {
		return this.replaceInput.hasFocus();
	}

	focusReplaceAllAction(): void {
		this.replaceActionBar.focus(true);
	}

	focusRegexAction(): void {
		this.searchInput.focusOnRegex();
	}

	private render(container: HTMLElement, options: ISearchWidgetOptions): void {
		this.domNode = dom.append(container, dom.$('.search-widget'));
		this.domNode.style.position = 'relative';

		this.renderToggleReplaceButton(this.domNode);

		this.renderSearchInput(this.domNode, options);
		this.renderReplaceInput(this.domNode, options);
	}

	private isScreenReaderOptimized() {
		const detected = this.accessibilityService.getAccessibilitySupport() === AccessibilitySupport.Enabled;
		const config = this.configurationService.getValue<IEditorOptions>('editor').accessibilitySupport;
		return config === 'on' || (config === 'auto' && detected);
	}

	private updateAccessibilitySupport(): void {
		this.searchInput.setFocusInputOnOptionClick(!this.isScreenReaderOptimized());
	}

	private renderToggleReplaceButton(parent: HTMLElement): void {
		const opts: IButtonOptions = {
			buttonBackground: undefined,
			buttonBorder: undefined,
			buttonForeground: undefined,
			buttonHoverBackground: undefined
		};
		this.toggleReplaceButton = this._register(new Button(parent, opts));
		this.toggleReplaceButton.element.setAttribute('aria-expanded', 'false');
		this.toggleReplaceButton.element.classList.add('collapse');
		this.toggleReplaceButton.icon = 'toggle-replace-button';
		// TODO@joh need to dispose this listener eventually
		this.toggleReplaceButton.onDidClick(() => this.onToggleReplaceButton());
		this.toggleReplaceButton.element.title = nls.localize('search.replace.toggle.button.title', "Toggle Replace");
	}

	private renderSearchInput(parent: HTMLElement, options: ISearchWidgetOptions): void {
		const inputOptions: IFindInputOptions = {
			label: nls.localize('label.Search', 'Search: Type Search Term and press Enter to search or Escape to cancel'),
			validation: (value: string) => this.validateSearchInput(value),
			placeholder: nls.localize('search.placeHolder', "Search"),
			appendCaseSensitiveLabel: appendKeyBindingLabel('', this.keyBindingService.lookupKeybinding(Constants.ToggleCaseSensitiveCommandId), this.keyBindingService),
			appendWholeWordsLabel: appendKeyBindingLabel('', this.keyBindingService.lookupKeybinding(Constants.ToggleWholeWordCommandId), this.keyBindingService),
			appendRegexLabel: appendKeyBindingLabel('', this.keyBindingService.lookupKeybinding(Constants.ToggleRegexCommandId), this.keyBindingService),
			history: options.searchHistory,
			flexibleHeight: true
		};

		const searchInputContainer = dom.append(parent, dom.$('.search-container.input-box'));
		this.searchInput = this._register(new ContextScopedFindInput(searchInputContainer, this.contextViewService, inputOptions, this.contextKeyService, true));
		this._register(attachFindInputBoxStyler(this.searchInput, this.themeService));
		this.searchInput.onKeyDown((keyboardEvent: IKeyboardEvent) => this.onSearchInputKeyDown(keyboardEvent));
		this.searchInput.setValue(options.value || '');
		this.searchInput.setRegex(!!options.isRegex);
		this.searchInput.setCaseSensitive(!!options.isCaseSensitive);
		this.searchInput.setWholeWords(!!options.isWholeWords);
		this._register(this.onSearchSubmit(() => {
			this.searchInput.inputBox.addToHistory();
		}));
		this._register(this.searchInput.onCaseSensitiveKeyDown((keyboardEvent: IKeyboardEvent) => this.onCaseSensitiveKeyDown(keyboardEvent)));
		this._register(this.searchInput.onRegexKeyDown((keyboardEvent: IKeyboardEvent) => this.onRegexKeyDown(keyboardEvent)));
		this._register(this.searchInput.inputBox.onDidChange(() => this.onSearchInputChanged()));
		this._register(this.searchInput.inputBox.onDidHeightChange(() => this._onDidHeightChange.fire()));

		this._register(this.onReplaceValueChanged(() => {
			this._replaceHistoryDelayer.trigger(() => this.replaceInput.addToHistory());
		}));

		this.searchInputFocusTracker = this._register(dom.trackFocus(this.searchInput.inputBox.inputElement));
		this._register(this.searchInputFocusTracker.onDidFocus(() => {
			this.searchInputBoxFocused.set(true);

			const useGlobalFindBuffer = this.searchConfiguration.globalFindClipboard;
			if (!this.ignoreGlobalFindBufferOnNextFocus && useGlobalFindBuffer) {
				const globalBufferText = this.clipboardServce.readFindText();
				if (this.previousGlobalFindBufferValue !== globalBufferText) {
					this.searchInput.inputBox.addToHistory();
					this.searchInput.setValue(globalBufferText);
					this.searchInput.select();
				}

				this.previousGlobalFindBufferValue = globalBufferText;
			}

			this.ignoreGlobalFindBufferOnNextFocus = false;
		}));
		this._register(this.searchInputFocusTracker.onDidBlur(() => this.searchInputBoxFocused.set(false)));
	}

	private renderReplaceInput(parent: HTMLElement, options: ISearchWidgetOptions): void {
		this.replaceContainer = dom.append(parent, dom.$('.replace-container.disabled'));
		const replaceBox = dom.append(this.replaceContainer, dom.$('.replace-input'));

		this.replaceInput = this._register(new ContextScopedHistoryInputBox(replaceBox, this.contextViewService, {
			ariaLabel: nls.localize('label.Replace', 'Replace: Type replace term and press Enter to preview or Escape to cancel'),
			placeholder: nls.localize('search.replace.placeHolder', "Replace"),
			history: options.replaceHistory || [],
			flexibleHeight: true
		}, this.contextKeyService));

		this._preserveCase = this._register(new Checkbox({
			actionClassName: 'monaco-preserve-case',
			title: nls.localize('label.preserveCaseCheckbox', "Preserve Case"),
			isChecked: !!options.preserveCase,
		}));

		this._register(this._preserveCase.onChange(viaKeyboard => {
			if (!viaKeyboard) {
				this.replaceInput.focus();
				this._onPreserveCaseChange.fire(this._preserveCase.checked);
			}
		}));

		let controls = document.createElement('div');
		controls.className = 'controls';
		controls.style.display = 'block';
		controls.appendChild(this._preserveCase.domNode);
		replaceBox.appendChild(controls);

		this._register(attachInputBoxStyler(this.replaceInput, this.themeService));
		this.onkeydown(this.replaceInput.inputElement, (keyboardEvent) => this.onReplaceInputKeyDown(keyboardEvent));
		this.replaceInput.value = options.replaceValue || '';
		this._register(this.replaceInput.onDidChange(() => this._onReplaceValueChanged.fire()));
		this._register(this.replaceInput.onDidHeightChange(() => this._onDidHeightChange.fire()));

		this.replaceAllAction = ReplaceAllAction.INSTANCE;
		this.replaceAllAction.searchWidget = this;
		this.replaceAllAction.label = SearchWidget.REPLACE_ALL_DISABLED_LABEL;
		this.replaceActionBar = this._register(new ActionBar(this.replaceContainer));
		this.replaceActionBar.push([this.replaceAllAction], { icon: true, label: false });
		this.onkeydown(this.replaceActionBar.domNode, (keyboardEvent) => this.onReplaceActionbarKeyDown(keyboardEvent));

		this.replaceInputFocusTracker = this._register(dom.trackFocus(this.replaceInput.inputElement));
		this._register(this.replaceInputFocusTracker.onDidFocus(() => this.replaceInputBoxFocused.set(true)));
		this._register(this.replaceInputFocusTracker.onDidBlur(() => this.replaceInputBoxFocused.set(false)));
	}

	triggerReplaceAll(): Promise<any> {
		this._onReplaceAll.fire();
		return Promise.resolve(null);
	}

	private onToggleReplaceButton(): void {
		dom.toggleClass(this.replaceContainer, 'disabled');
		dom.toggleClass(this.toggleReplaceButton.element, 'collapse');
		dom.toggleClass(this.toggleReplaceButton.element, 'expand');
		this.toggleReplaceButton.element.setAttribute('aria-expanded', this.isReplaceShown() ? 'true' : 'false');
		this.updateReplaceActiveState();
		this._onReplaceToggled.fire();
	}

	setReplaceAllActionState(enabled: boolean): void {
		if (this.replaceAllAction.enabled !== enabled) {
			this.replaceAllAction.enabled = enabled;
			this.replaceAllAction.label = enabled ? SearchWidget.REPLACE_ALL_ENABLED_LABEL(this.keyBindingService) : SearchWidget.REPLACE_ALL_DISABLED_LABEL;
			this.updateReplaceActiveState();
		}
	}

	private updateReplaceActiveState(): void {
		const currentState = this.isReplaceActive();
		const newState = this.isReplaceShown() && this.replaceAllAction.enabled;
		if (currentState !== newState) {
			this.replaceActive.set(newState);
			this._onReplaceStateChange.fire(newState);
			this.replaceInput.layout();
		}
	}

	private validateSearchInput(value: string): IMessage | null {
		if (value.length === 0) {
			return null;
		}
		if (!this.searchInput.getRegex()) {
			return null;
		}
		try {
			// tslint:disable-next-line: no-unused-expression
			new RegExp(value);
		} catch (e) {
			return { content: e.message };
		}

		if (strings.regExpContainsBackreference(value)) {
			if (!this.searchConfiguration.usePCRE2) {
				return { content: nls.localize('regexp.backreferenceValidationFailure', "Backreferences are not supported") };
			}
		}

		return null;
	}

	private onSearchInputChanged(): void {
		this.searchInput.clearMessage();
		this.setReplaceAllActionState(false);
	}

	private onSearchInputKeyDown(keyboardEvent: IKeyboardEvent) {
		if (keyboardEvent.equals(KeyCode.Enter)) {
			this.submitSearch();
			keyboardEvent.preventDefault();
		}

		else if (keyboardEvent.equals(KeyCode.Escape)) {
			this._onSearchCancel.fire();
			keyboardEvent.preventDefault();
		}

		else if (keyboardEvent.equals(KeyCode.Tab)) {
			if (this.isReplaceShown()) {
				this.replaceInput.focus();
			} else {
				this.searchInput.focusOnCaseSensitive();
			}
			keyboardEvent.preventDefault();
		}

		else if (keyboardEvent.equals(KeyCode.UpArrow)) {
			const ta = this.searchInput.domNode.querySelector('textarea');
			const isMultiline = !!this.searchInput.getValue().match(/\n/);
			if (ta && isMultiline && ta.selectionStart > 0) {
				keyboardEvent.stopPropagation();
			}
		}

		else if (keyboardEvent.equals(KeyCode.DownArrow)) {
			const ta = this.searchInput.domNode.querySelector('textarea');
			const isMultiline = !!this.searchInput.getValue().match(/\n/);
			if (ta && isMultiline && ta.selectionEnd < ta.value.length) {
				keyboardEvent.stopPropagation();
			}
		}
	}

	private onCaseSensitiveKeyDown(keyboardEvent: IKeyboardEvent) {
		if (keyboardEvent.equals(KeyMod.Shift | KeyCode.Tab)) {
			if (this.isReplaceShown()) {
				this.replaceInput.focus();
				keyboardEvent.preventDefault();
			}
		}
	}

	private onRegexKeyDown(keyboardEvent: IKeyboardEvent) {
		if (keyboardEvent.equals(KeyCode.Tab)) {
			if (this.isReplaceActive()) {
				this.focusReplaceAllAction();
			} else {
				this._onBlur.fire();
			}
			keyboardEvent.preventDefault();
		}
	}

	private onReplaceInputKeyDown(keyboardEvent: IKeyboardEvent) {
		if (keyboardEvent.equals(KeyCode.Enter)) {
			this.submitSearch();
			keyboardEvent.preventDefault();
		}

		else if (keyboardEvent.equals(KeyCode.Tab)) {
			this.searchInput.focusOnCaseSensitive();
			keyboardEvent.preventDefault();
		}

		else if (keyboardEvent.equals(KeyMod.Shift | KeyCode.Tab)) {
			this.searchInput.focus();
			keyboardEvent.preventDefault();
		}

		else if (keyboardEvent.equals(KeyCode.UpArrow)) {
			const ta = this.searchInput.domNode.querySelector('textarea');
			if (ta && ta.selectionStart > 0) {
				keyboardEvent.stopPropagation();
			}
		}

		else if (keyboardEvent.equals(KeyCode.DownArrow)) {
			const ta = this.searchInput.domNode.querySelector('textarea');
			if (ta && ta.selectionEnd < ta.value.length) {
				keyboardEvent.stopPropagation();
			}
		}
	}

	private onReplaceActionbarKeyDown(keyboardEvent: IKeyboardEvent) {
		if (keyboardEvent.equals(KeyMod.Shift | KeyCode.Tab)) {
			this.focusRegexAction();
			keyboardEvent.preventDefault();
		}
	}

	private submitSearch(): void {
		this.searchInput.validate();
		if (!this.searchInput.inputBox.isInputValid()) {
			return;
		}

		const value = this.searchInput.getValue();
		const useGlobalFindBuffer = this.searchConfiguration.globalFindClipboard;
		if (value) {
			if (useGlobalFindBuffer) {
				this.clipboardServce.writeFindText(value);
			}

			this._onSearchSubmit.fire();
		}
	}

	dispose(): void {
		this.setReplaceAllActionState(false);
		super.dispose();
	}

	private get searchConfiguration(): ISearchConfigurationProperties {
		return this.configurationService.getValue<ISearchConfigurationProperties>('search');
	}
}

export function registerContributions() {
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: ReplaceAllAction.ID,
		weight: KeybindingWeight.WorkbenchContrib,
		when: ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.ReplaceActiveKey, CONTEXT_FIND_WIDGET_NOT_VISIBLE),
		primary: KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.Enter,
		handler: accessor => {
			if (isSearchViewFocused(accessor.get(IViewletService), accessor.get(IPanelService))) {
				ReplaceAllAction.INSTANCE.run();
			}
		}
	});
}
