/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./simpleFindWidget';
import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { FindInput } from 'vs/base/browser/ui/findinput/findInput';
import { Widget } from 'vs/base/browser/ui/widget';
import { Delayer } from 'vs/base/common/async';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { FindReplaceState } from 'vs/editor/contrib/find/findState';
import { SimpleButton } from 'vs/editor/contrib/find/findWidget';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { editorWidgetBackground, inputActiveOptionBorder, inputBackground, inputBorder, inputForeground, inputValidationErrorBackground, inputValidationErrorBorder, inputValidationErrorForeground, inputValidationInfoBackground, inputValidationInfoBorder, inputValidationInfoForeground, inputValidationWarningBackground, inputValidationWarningBorder, inputValidationWarningForeground, widgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { ITheme, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { ContextScopedFindInput } from 'vs/platform/widget/browser/contextScopedHistoryWidget';

const NLS_FIND_INPUT_LABEL = nls.localize('label.find', "Find");
const NLS_FIND_INPUT_PLACEHOLDER = nls.localize('placeholder.find', "Find");
const NLS_PREVIOUS_MATCH_BTN_LABEL = nls.localize('label.previousMatchButton', "Previous match");
const NLS_NEXT_MATCH_BTN_LABEL = nls.localize('label.nextMatchButton', "Next match");
const NLS_CLOSE_BTN_LABEL = nls.localize('label.closeButton', "Close");

export abstract class SimpleFindWidget extends Widget {
	private _findInput: FindInput;
	private _domNode?: HTMLElement;
	private _innerDomNode: HTMLElement;
	private _isVisible: boolean = false;
	private _focusTracker: dom.IFocusTracker;
	private _findInputFocusTracker: dom.IFocusTracker;
	private _updateHistoryDelayer: Delayer<void>;

	constructor(
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IContextKeyService contextKeyService: IContextKeyService,
		private readonly _state: FindReplaceState = new FindReplaceState(),
		showOptionButtons?: boolean
	) {
		super();

		this._findInput = this._register(new ContextScopedFindInput(null, this._contextViewService, {
			label: NLS_FIND_INPUT_LABEL,
			placeholder: NLS_FIND_INPUT_PLACEHOLDER,
		}, contextKeyService, showOptionButtons));

		// Find History with update delayer
		this._updateHistoryDelayer = new Delayer<void>(500);

		this.oninput(this._findInput.domNode, (e) => {
			this.onInputChanged();
			this._delayedUpdateHistory();
		});

		this._findInput.setRegex(!!this._state.isRegex);
		this._findInput.setCaseSensitive(!!this._state.matchCase);
		this._findInput.setWholeWords(!!this._state.wholeWord);

		this._register(this._findInput.onDidOptionChange(() => {
			this._state.change({
				isRegex: this._findInput.getRegex(),
				wholeWord: this._findInput.getWholeWords(),
				matchCase: this._findInput.getCaseSensitive()
			}, true);
		}));

		this._register(this._state.onFindReplaceStateChange(() => {
			this._findInput.setRegex(this._state.isRegex);
			this._findInput.setWholeWords(this._state.wholeWord);
			this._findInput.setCaseSensitive(this._state.matchCase);
		}));

		this._register(this._findInput.onKeyDown((e) => {
			if (e.equals(KeyCode.Enter)) {
				this.find(false);
				e.preventDefault();
				return;
			}

			if (e.equals(KeyMod.Shift | KeyCode.Enter)) {
				this.find(true);
				e.preventDefault();
				return;
			}
		}));

		const prevBtn = new SimpleButton({
			label: NLS_PREVIOUS_MATCH_BTN_LABEL,
			className: 'previous',
			onTrigger: () => {
				this.find(true);
			}
		});

		const nextBtn = new SimpleButton({
			label: NLS_NEXT_MATCH_BTN_LABEL,
			className: 'next',
			onTrigger: () => {
				this.find(false);
			}
		});

		const closeBtn = new SimpleButton({
			label: NLS_CLOSE_BTN_LABEL,
			className: 'close-fw',
			onTrigger: () => {
				this.hide();
			}
		});

		this._innerDomNode = document.createElement('div');
		this._innerDomNode.classList.add('simple-find-part');
		this._innerDomNode.appendChild(this._findInput.domNode);
		this._innerDomNode.appendChild(prevBtn.domNode);
		this._innerDomNode.appendChild(nextBtn.domNode);
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
		this._register(this._focusTracker.onDidFocus(this.onFocusTrackerFocus.bind(this)));
		this._register(this._focusTracker.onDidBlur(this.onFocusTrackerBlur.bind(this)));

		this._findInputFocusTracker = this._register(dom.trackFocus(this._findInput.domNode));
		this._register(this._findInputFocusTracker.onDidFocus(this.onFindInputFocusTrackerFocus.bind(this)));
		this._register(this._findInputFocusTracker.onDidBlur(this.onFindInputFocusTrackerBlur.bind(this)));

		this._register(dom.addDisposableListener(this._innerDomNode, 'click', (event) => {
			event.stopPropagation();
		}));
	}

	protected abstract onInputChanged(): void;
	protected abstract find(previous: boolean): void;
	protected abstract onFocusTrackerFocus(): void;
	protected abstract onFocusTrackerBlur(): void;
	protected abstract onFindInputFocusTrackerFocus(): void;
	protected abstract onFindInputFocusTrackerBlur(): void;

	protected get inputValue() {
		return this._findInput.getValue();
	}

	public get focusTracker(): dom.IFocusTracker {
		return this._focusTracker;
	}

	public updateTheme(theme: ITheme): void {
		const inputStyles = {
			inputActiveOptionBorder: theme.getColor(inputActiveOptionBorder),
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

	dispose() {
		super.dispose();

		if (this._domNode && this._domNode.parentElement) {
			this._domNode.parentElement.removeChild(this._domNode);
			this._domNode = undefined;
		}
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

		setTimeout(() => {
			dom.addClass(this._innerDomNode, 'visible');
			this._innerDomNode.setAttribute('aria-hidden', 'false');
			setTimeout(() => {
				this._findInput.select();
			}, 200);
		}, 0);
	}

	public show(initialInput?: string): void {
		if (initialInput && !this._isVisible) {
			this._findInput.setValue(initialInput);
		}

		this._isVisible = true;

		setTimeout(() => {
			dom.addClass(this._innerDomNode, 'visible');
			this._innerDomNode.setAttribute('aria-hidden', 'false');
		}, 0);
	}

	public hide(): void {
		if (this._isVisible) {
			this._isVisible = false;

			dom.removeClass(this._innerDomNode, 'visible');
			this._innerDomNode.setAttribute('aria-hidden', 'true');
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
}

// theming
registerThemingParticipant((theme, collector) => {
	const findWidgetBGColor = theme.getColor(editorWidgetBackground);
	if (findWidgetBGColor) {
		collector.addRule(`.monaco-workbench .simple-find-part { background-color: ${findWidgetBGColor} !important; }`);
	}

	const widgetShadowColor = theme.getColor(widgetShadow);
	if (widgetShadowColor) {
		collector.addRule(`.monaco-workbench .simple-find-part { box-shadow: 0 2px 8px ${widgetShadowColor}; }`);
	}
});