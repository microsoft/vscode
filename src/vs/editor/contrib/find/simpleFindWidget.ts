/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./simpleFindWidget';
import * as nls from 'vs/nls';
import { Widget } from 'vs/base/browser/ui/widget';
import { Delayer } from 'vs/base/common/async';
import { HistoryNavigator } from 'vs/base/common/history';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import * as dom from 'vs/base/browser/dom';
import { FindInput } from 'vs/base/browser/ui/findinput/findInput';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { registerThemingParticipant, ITheme } from 'vs/platform/theme/common/themeService';
import { inputBackground, inputActiveOptionBorder, inputForeground, inputBorder, inputValidationInfoBackground, inputValidationInfoBorder, inputValidationWarningBackground, inputValidationWarningBorder, inputValidationErrorBackground, inputValidationErrorBorder, editorWidgetBackground, widgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { SimpleButton } from './findWidget';

const NLS_FIND_INPUT_LABEL = nls.localize('label.find', "Find");
const NLS_FIND_INPUT_PLACEHOLDER = nls.localize('placeholder.find', "Find");
const NLS_PREVIOUS_MATCH_BTN_LABEL = nls.localize('label.previousMatchButton', "Previous match");
const NLS_NEXT_MATCH_BTN_LABEL = nls.localize('label.nextMatchButton', "Next match");
const NLS_CLOSE_BTN_LABEL = nls.localize('label.closeButton', "Close");

export abstract class SimpleFindWidget extends Widget {
	private _findInput: FindInput;
	private _domNode: HTMLElement;
	private _innerDomNode: HTMLElement;
	private _isVisible: boolean;
	private _focusTracker: dom.IFocusTracker;
	private _findInputFocusTracker: dom.IFocusTracker;
	private _findHistory: HistoryNavigator<string>;
	private _updateHistoryDelayer: Delayer<void>;

	constructor(
		@IContextViewService private readonly _contextViewService: IContextViewService
	) {
		super();

		this._findInput = this._register(new FindInput(null, this._contextViewService, {
			label: NLS_FIND_INPUT_LABEL,
			placeholder: NLS_FIND_INPUT_PLACEHOLDER,
		}));

		// Find History with update delayer
		this._findHistory = new HistoryNavigator<string>();
		this._updateHistoryDelayer = new Delayer<void>(500);

		this.oninput(this._findInput.domNode, (e) => {
			this.onInputChanged();
			this._delayedUpdateHistory();
		});

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
			},
			onKeyDown: (e) => { }
		});

		const nextBtn = new SimpleButton({
			label: NLS_NEXT_MATCH_BTN_LABEL,
			className: 'next',
			onTrigger: () => {
				this.find(false);
			},
			onKeyDown: (e) => { }
		});

		const closeBtn = new SimpleButton({
			label: NLS_CLOSE_BTN_LABEL,
			className: 'close-fw',
			onTrigger: () => {
				this.hide();
			},
			onKeyDown: (e) => { }
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

	public updateTheme(theme: ITheme): void {
		const inputStyles = {
			inputActiveOptionBorder: theme.getColor(inputActiveOptionBorder),
			inputBackground: theme.getColor(inputBackground),
			inputForeground: theme.getColor(inputForeground),
			inputBorder: theme.getColor(inputBorder),
			inputValidationInfoBackground: theme.getColor(inputValidationInfoBackground),
			inputValidationInfoBorder: theme.getColor(inputValidationInfoBorder),
			inputValidationWarningBackground: theme.getColor(inputValidationWarningBackground),
			inputValidationWarningBorder: theme.getColor(inputValidationWarningBorder),
			inputValidationErrorBackground: theme.getColor(inputValidationErrorBackground),
			inputValidationErrorBorder: theme.getColor(inputValidationErrorBorder)
		};
		this._findInput.style(inputStyles);
	}

	public getDomNode(): HTMLElement {
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
		if (this.inputValue) {
			this._findHistory.add(this._findInput.getValue());
		}
	}

	public showNextFindTerm() {
		let next = this._findHistory.next();
		if (next) {
			this._findInput.setValue(next);
		}
	}

	public showPreviousFindTerm() {
		let previous = this._findHistory.previous();
		if (previous) {
			this._findInput.setValue(previous);
		}
	}
}

// theming
registerThemingParticipant((theme, collector) => {
	const findWidgetBGColor = theme.getColor(editorWidgetBackground);
	if (findWidgetBGColor) {
		collector.addRule(`.monaco-workbench .simple-find-part { background-color: ${findWidgetBGColor} !important; }`);
	}

	let widgetShadowColor = theme.getColor(widgetShadow);
	if (widgetShadowColor) {
		collector.addRule(`.monaco-workbench .simple-find-part { box-shadow: 0 2px 8px ${widgetShadowColor}; }`);
	}
});