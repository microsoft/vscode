/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./simpleFindWidget';
import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { FindInput, IFindInputStyles } from 'vs/base/browser/ui/findinput/findInput';
import { Widget } from 'vs/base/browser/ui/widget';
import { Delayer } from 'vs/base/common/async';
import { KeyCode } from 'vs/base/common/keyCodes';
import { FindReplaceState } from 'vs/editor/contrib/find/browser/findState';
import { IMessage as InputBoxMessage } from 'vs/base/browser/ui/inputbox/inputBox';
import { SimpleButton, findPreviousMatchIcon, findNextMatchIcon, NLS_NO_RESULTS, NLS_MATCHES_LOCATION } from 'vs/editor/contrib/find/browser/findWidget';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { editorWidgetBackground, inputActiveOptionBorder, inputActiveOptionBackground, inputActiveOptionForeground, inputBackground, inputBorder, inputForeground, inputValidationErrorBackground, inputValidationErrorBorder, inputValidationErrorForeground, inputValidationInfoBackground, inputValidationInfoBorder, inputValidationInfoForeground, inputValidationWarningBackground, inputValidationWarningBorder, inputValidationWarningForeground, widgetShadow, editorWidgetForeground, errorForeground, toolbarHoverBackground, toolbarHoverOutline, contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { IColorTheme, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { ContextScopedFindInput } from 'vs/platform/history/browser/contextScopedHistoryWidget';
import { widgetClose } from 'vs/platform/theme/common/iconRegistry';
import * as strings from 'vs/base/common/strings';
import { TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { showHistoryKeybindingHint } from 'vs/platform/history/browser/historyWidgetKeybindingHint';
import { alert as alertFn } from 'vs/base/browser/ui/aria/aria';

const NLS_FIND_INPUT_LABEL = nls.localize('label.find', "Find");
const NLS_FIND_INPUT_PLACEHOLDER = nls.localize('placeholder.find', "Find (\u21C5 for history)");
const NLS_PREVIOUS_MATCH_BTN_LABEL = nls.localize('label.previousMatchButton', "Previous Match");
const NLS_NEXT_MATCH_BTN_LABEL = nls.localize('label.nextMatchButton', "Next Match");
const NLS_CLOSE_BTN_LABEL = nls.localize('label.closeButton', "Close");

interface IFindOptions {
	showCommonFindToggles?: boolean;
	checkImeCompletionState?: boolean;
	showResultCount?: boolean;
	appendCaseSensitiveLabel?: string;
	appendRegexLabel?: string;
	appendWholeWordsLabel?: string;
	type?: 'Terminal' | 'Webview';
}

const SIMPLE_FIND_WIDGET_INITIAL_WIDTH = 310;
const MATCHES_COUNT_WIDTH = 68;

export abstract class SimpleFindWidget extends Widget {
	private readonly _findInput: FindInput;
	private readonly _domNode: HTMLElement;
	private readonly _innerDomNode: HTMLElement;
	private readonly _focusTracker: dom.IFocusTracker;
	private readonly _findInputFocusTracker: dom.IFocusTracker;
	private readonly _updateHistoryDelayer: Delayer<void>;
	private readonly prevBtn: SimpleButton;
	private readonly nextBtn: SimpleButton;
	private _matchesCount: HTMLElement | undefined;

	private _isVisible: boolean = false;
	private _foundMatch: boolean = false;
	private _width: number = 0;

	constructor(
		state: FindReplaceState = new FindReplaceState(),
		options: IFindOptions,
		contextViewService: IContextViewService,
		contextKeyService: IContextKeyService,
		private readonly _keybindingService: IKeybindingService
	) {
		super();

		this._findInput = this._register(new ContextScopedFindInput(null, contextViewService, {
			label: NLS_FIND_INPUT_LABEL,
			placeholder: NLS_FIND_INPUT_PLACEHOLDER,
			validation: (value: string): InputBoxMessage | null => {
				if (value.length === 0 || !this._findInput.getRegex()) {
					return null;
				}
				try {
					new RegExp(value);
					return null;
				} catch (e) {
					this._foundMatch = false;
					this.updateButtons(this._foundMatch);
					return { content: e.message };
				}
			},
			showCommonFindToggles: options.showCommonFindToggles,
			appendCaseSensitiveLabel: options.appendCaseSensitiveLabel && options.type === 'Terminal' ? this._getKeybinding(TerminalCommandId.ToggleFindCaseSensitive) : undefined,
			appendRegexLabel: options.appendRegexLabel && options.type === 'Terminal' ? this._getKeybinding(TerminalCommandId.ToggleFindRegex) : undefined,
			appendWholeWordsLabel: options.appendWholeWordsLabel && options.type === 'Terminal' ? this._getKeybinding(TerminalCommandId.ToggleFindWholeWord) : undefined,
			showHistoryHint: () => showHistoryKeybindingHint(_keybindingService)
		}, contextKeyService));
		// Find History with update delayer
		this._updateHistoryDelayer = new Delayer<void>(500);

		this._register(this._findInput.onInput(async (e) => {
			if (!options.checkImeCompletionState || !this._findInput.isImeSessionInProgress) {
				this._foundMatch = this._onInputChanged();
				if (options.showResultCount) {
					await this.updateResultCount();
				}
				this.updateButtons(this._foundMatch);
				this.focusFindBox();
				this._delayedUpdateHistory();
			}
		}));

		this._findInput.setRegex(!!state.isRegex);
		this._findInput.setCaseSensitive(!!state.matchCase);
		this._findInput.setWholeWords(!!state.wholeWord);

		this._register(this._findInput.onDidOptionChange(() => {
			state.change({
				isRegex: this._findInput.getRegex(),
				wholeWord: this._findInput.getWholeWords(),
				matchCase: this._findInput.getCaseSensitive()
			}, true);
		}));

		this._register(state.onFindReplaceStateChange(() => {
			this._findInput.setRegex(state.isRegex);
			this._findInput.setWholeWords(state.wholeWord);
			this._findInput.setCaseSensitive(state.matchCase);
			this.findFirst();
		}));

		this.prevBtn = this._register(new SimpleButton({
			label: NLS_PREVIOUS_MATCH_BTN_LABEL,
			icon: findPreviousMatchIcon,
			onTrigger: () => {
				this.find(true);
			}
		}));

		this.nextBtn = this._register(new SimpleButton({
			label: NLS_NEXT_MATCH_BTN_LABEL,
			icon: findNextMatchIcon,
			onTrigger: () => {
				this.find(false);
			}
		}));

		const closeBtn = this._register(new SimpleButton({
			label: NLS_CLOSE_BTN_LABEL,
			icon: widgetClose,
			onTrigger: () => {
				this.hide();
			}
		}));

		this._innerDomNode = document.createElement('div');
		this._innerDomNode.classList.add('simple-find-part');
		this._innerDomNode.appendChild(this._findInput.domNode);
		this._innerDomNode.appendChild(this.prevBtn.domNode);
		this._innerDomNode.appendChild(this.nextBtn.domNode);
		this._innerDomNode.appendChild(closeBtn.domNode);

		// _domNode wraps _innerDomNode, ensuring that
		this._domNode = document.createElement('div');
		this._domNode.classList.add('simple-find-part-wrapper');
		this._domNode.appendChild(this._innerDomNode);

		this.onkeyup(this._innerDomNode, e => {
			if (e.equals(KeyCode.Escape)) {
				this.hide();
				e.preventDefault();
				return;
			}
		});

		this._focusTracker = this._register(dom.trackFocus(this._innerDomNode));
		this._register(this._focusTracker.onDidFocus(this._onFocusTrackerFocus.bind(this)));
		this._register(this._focusTracker.onDidBlur(this._onFocusTrackerBlur.bind(this)));

		this._findInputFocusTracker = this._register(dom.trackFocus(this._findInput.domNode));
		this._register(this._findInputFocusTracker.onDidFocus(this._onFindInputFocusTrackerFocus.bind(this)));
		this._register(this._findInputFocusTracker.onDidBlur(this._onFindInputFocusTrackerBlur.bind(this)));

		this._register(dom.addDisposableListener(this._innerDomNode, 'click', (event) => {
			event.stopPropagation();
		}));

		if (options?.showResultCount) {
			this._domNode.classList.add('result-count');
			this._matchesCount = document.createElement('div');
			this._matchesCount.className = 'matchesCount';
			this._findInput.domNode.insertAdjacentElement('afterend', this._matchesCount);
			this._register(this._findInput.onDidChange(() => {
				this.updateResultCount();
				this.updateButtons(this._foundMatch);
			}));
		}
	}

	protected abstract _onInputChanged(): boolean;
	protected abstract find(previous: boolean): void;
	protected abstract findFirst(): void;
	protected abstract _onFocusTrackerFocus(): void;
	protected abstract _onFocusTrackerBlur(): void;
	protected abstract _onFindInputFocusTrackerFocus(): void;
	protected abstract _onFindInputFocusTrackerBlur(): void;
	protected abstract _getResultCount(): Promise<{ resultIndex: number; resultCount: number } | undefined>;

	protected get inputValue() {
		return this._findInput.getValue();
	}

	public get focusTracker(): dom.IFocusTracker {
		return this._focusTracker;
	}

	public updateTheme(theme: IColorTheme): void {
		const inputStyles: IFindInputStyles = {
			inputActiveOptionBorder: theme.getColor(inputActiveOptionBorder),
			inputActiveOptionForeground: theme.getColor(inputActiveOptionForeground),
			inputActiveOptionBackground: theme.getColor(inputActiveOptionBackground),
			inputBackground: theme.getColor(inputBackground),
			inputForeground: theme.getColor(inputForeground),
			inputBorder: theme.getColor(inputBorder),
			inputValidationInfoBackground: theme.getColor(inputValidationInfoBackground),
			inputValidationInfoForeground: theme.getColor(inputValidationInfoForeground),
			inputValidationInfoBorder: theme.getColor(inputValidationInfoBorder),
			inputValidationWarningBackground: theme.getColor(inputValidationWarningBackground),
			inputValidationWarningForeground: theme.getColor(inputValidationWarningForeground),
			inputValidationWarningBorder: theme.getColor(inputValidationWarningBorder),
			inputValidationErrorBackground: theme.getColor(inputValidationErrorBackground),
			inputValidationErrorForeground: theme.getColor(inputValidationErrorForeground),
			inputValidationErrorBorder: theme.getColor(inputValidationErrorBorder)
		};
		this._findInput.style(inputStyles);
	}

	private _getKeybinding(actionId: string): string {
		const kb = this._keybindingService?.lookupKeybinding(actionId);
		if (!kb) {
			return '';
		}
		return ` (${kb.getLabel()})`;
	}

	override dispose() {
		super.dispose();

		if (this._domNode && this._domNode.parentElement) {
			this._domNode.parentElement.removeChild(this._domNode);
		}
	}

	public isVisible(): boolean {
		return this._isVisible;
	}

	public getDomNode() {
		return this._domNode;
	}

	public reveal(initialInput?: string): void {
		if (initialInput) {
			this._findInput.setValue(initialInput);
		}

		if (this._isVisible) {
			this._findInput.select();
			return;
		}

		this._isVisible = true;
		this.updateButtons(this._foundMatch);
		this.layout();

		setTimeout(() => {
			this._innerDomNode.classList.add('visible', 'visible-transition');
			this._innerDomNode.setAttribute('aria-hidden', 'false');
			this._findInput.select();
		}, 0);
	}

	public show(initialInput?: string): void {
		if (initialInput && !this._isVisible) {
			this._findInput.setValue(initialInput);
		}

		this._isVisible = true;
		this.layout();

		setTimeout(() => {
			this._innerDomNode.classList.add('visible', 'visible-transition');
			this._innerDomNode.setAttribute('aria-hidden', 'false');
		}, 0);
	}

	public hide(): void {
		if (this._isVisible) {
			this._innerDomNode.classList.remove('visible-transition');
			this._innerDomNode.setAttribute('aria-hidden', 'true');
			// Need to delay toggling visibility until after Transition, then visibility hidden - removes from tabIndex list
			setTimeout(() => {
				this._isVisible = false;
				this.updateButtons(this._foundMatch);
				this._innerDomNode.classList.remove('visible');
			}, 200);
		}
	}

	public layout(width: number = this._width): void {
		this._width = width;

		if (!this._isVisible) {
			return;
		}

		if (this._matchesCount) {
			let reducedFindWidget = false;
			if (SIMPLE_FIND_WIDGET_INITIAL_WIDTH + MATCHES_COUNT_WIDTH + 28 >= width) {
				reducedFindWidget = true;
			}
			this._innerDomNode.classList.toggle('reduced-find-widget', reducedFindWidget);
		}
	}

	protected _delayedUpdateHistory() {
		this._updateHistoryDelayer.trigger(this._updateHistory.bind(this));
	}

	protected _updateHistory() {
		this._findInput.inputBox.addToHistory();
	}

	protected _getRegexValue(): boolean {
		return this._findInput.getRegex();
	}

	protected _getWholeWordValue(): boolean {
		return this._findInput.getWholeWords();
	}

	protected _getCaseSensitiveValue(): boolean {
		return this._findInput.getCaseSensitive();
	}

	protected updateButtons(foundMatch: boolean) {
		const hasInput = this.inputValue.length > 0;
		this.prevBtn.setEnabled(this._isVisible && hasInput && foundMatch);
		this.nextBtn.setEnabled(this._isVisible && hasInput && foundMatch);
	}

	protected focusFindBox() {
		// Focus back onto the find box, which
		// requires focusing onto the next button first
		this.nextBtn.focus();
		this._findInput.inputBox.focus();
	}

	async updateResultCount(): Promise<void> {
		if (!this._matchesCount) {
			return;
		}

		const count = await this._getResultCount();
		this._matchesCount.innerText = '';
		let label = '';
		this._matchesCount.classList.toggle('no-results', false);
		if (count?.resultCount !== undefined && count?.resultCount === 0) {
			label = NLS_NO_RESULTS;
			if (!!this.inputValue) {
				this._matchesCount.classList.toggle('no-results', true);
			}
		} else if (count?.resultCount) {
			label = strings.format(NLS_MATCHES_LOCATION, count.resultIndex + 1, count?.resultCount);
		}
		alertFn(this._announceSearchResults(label, this.inputValue));
		this._matchesCount.appendChild(document.createTextNode(label));
		this._foundMatch = !!count && count.resultCount > 0;
	}

	private _announceSearchResults(label: string, searchString?: string): string {
		if (!searchString) {
			return nls.localize('ariaSearchNoInput', "Enter search input");
		}
		if (label === NLS_NO_RESULTS) {
			return searchString === ''
				? nls.localize('ariaSearchNoResultEmpty', "{0} found", label)
				: nls.localize('ariaSearchNoResult', "{0} found for '{1}'", label, searchString);
		}

		return nls.localize('ariaSearchNoResultWithLineNumNoCurrentMatch', "{0} found for '{1}'", label, searchString);
	}
}

// theming
registerThemingParticipant((theme, collector) => {
	const findWidgetBGColor = theme.getColor(editorWidgetBackground);
	if (findWidgetBGColor) {
		collector.addRule(`.monaco-workbench .simple-find-part { background-color: ${findWidgetBGColor} !important; }`);
	}

	const widgetForeground = theme.getColor(editorWidgetForeground);
	if (widgetForeground) {
		collector.addRule(`.monaco-workbench .simple-find-part { color: ${widgetForeground}; }`);
	}

	const widgetShadowColor = theme.getColor(widgetShadow);
	if (widgetShadowColor) {
		collector.addRule(`.monaco-workbench .simple-find-part { box-shadow: 0 0 8px 2px ${widgetShadowColor}; }`);
	}

	const hcBorder = theme.getColor(contrastBorder);
	if (hcBorder) {
		collector.addRule(`.monaco-workbench .simple-find-part { border: 1px solid ${hcBorder}; }`);
	}

	const error = theme.getColor(errorForeground);
	if (error) {
		collector.addRule(`.no-results.matchesCount { color: ${error}; }`);
	}

	const toolbarHoverBackgroundColor = theme.getColor(toolbarHoverBackground);
	if (toolbarHoverBackgroundColor) {
		collector.addRule(`
			div.simple-find-part-wrapper div.button:hover:not(.disabled) {
				background-color: ${toolbarHoverBackgroundColor};
			}
		`);
	}

	const toolbarHoverOutlineColor = theme.getColor(toolbarHoverOutline);
	if (toolbarHoverOutlineColor) {
		collector.addRule(`
			div.simple-find-part-wrapper div.button:hover:not(.disabled) {
					outline: 1px dashed ${toolbarHoverOutlineColor};
					outline-offset: -1px;
				}
			`);
	}
});
