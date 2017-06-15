/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { Widget } from 'vs/base/browser/ui/widget';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import * as dom from 'vs/base/browser/dom';
import { FindInput } from 'vs/base/browser/ui/findinput/findInput';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { ITerminalService } from 'vs/workbench/parts/terminal/common/terminal';
import { registerThemingParticipant, ITheme } from 'vs/platform/theme/common/themeService';
import { inputBackground, inputActiveOptionBorder, inputForeground, inputBorder, inputValidationInfoBackground, inputValidationInfoBorder, inputValidationWarningBackground, inputValidationWarningBorder, inputValidationErrorBackground, inputValidationErrorBorder, editorWidgetBackground, widgetShadow } from 'vs/platform/theme/common/colorRegistry';

interface IButtonOpts {
	label: string;
	className: string;
	onTrigger: () => void;
	onKeyDown: (e: IKeyboardEvent) => void;
}

class SimpleButton extends Widget {

	private _opts: IButtonOpts;
	private _domNode: HTMLElement;

	constructor(opts: IButtonOpts) {
		super();
		this._opts = opts;

		this._domNode = document.createElement('div');
		this._domNode.title = this._opts.label;
		this._domNode.tabIndex = 0;
		this._domNode.className = 'button ' + this._opts.className;
		this._domNode.setAttribute('role', 'button');
		this._domNode.setAttribute('aria-label', this._opts.label);

		this.onclick(this._domNode, (e) => {
			this._opts.onTrigger();
			e.preventDefault();
		});
		this.onkeydown(this._domNode, (e) => {
			if (e.equals(KeyCode.Space) || e.equals(KeyCode.Enter)) {
				this._opts.onTrigger();
				e.preventDefault();
				return;
			}
			this._opts.onKeyDown(e);
		});
	}

	public get domNode(): HTMLElement {
		return this._domNode;
	}

	public isEnabled(): boolean {
		return (this._domNode.tabIndex >= 0);
	}

	public focus(): void {
		this._domNode.focus();
	}

	public setEnabled(enabled: boolean): void {
		dom.toggleClass(this._domNode, 'disabled', !enabled);
		this._domNode.setAttribute('aria-disabled', String(!enabled));
		this._domNode.tabIndex = enabled ? 0 : -1;
	}

	public toggleClass(className: string, shouldHaveIt: boolean): void {
		dom.toggleClass(this._domNode, className, shouldHaveIt);
	}
}

const NLS_FIND_INPUT_LABEL = nls.localize('label.find', "Find");
const NLS_FIND_INPUT_PLACEHOLDER = nls.localize('placeholder.find', "Find");
const NLS_PREVIOUS_MATCH_BTN_LABEL = nls.localize('label.previousMatchButton', "Previous match");
const NLS_NEXT_MATCH_BTN_LABEL = nls.localize('label.nextMatchButton', "Next match");
const NLS_CLOSE_BTN_LABEL = nls.localize('label.closeButton', "Close");

export class TerminalFindWidget extends Widget {
	private _findInput: FindInput;
	private _domNode: HTMLElement;
	private _isVisible: boolean;

	constructor(
		@IContextViewService private _contextViewService: IContextViewService,
		@ITerminalService private _terminalService: ITerminalService
	) {
		super();
		this._findInput = this._register(new FindInput(null, this._contextViewService, {
			width: 155,
			label: NLS_FIND_INPUT_LABEL,
			placeholder: NLS_FIND_INPUT_PLACEHOLDER,
		}));

		let find = (previous) => {
			let val = this._findInput.getValue();
			let instance = this._terminalService.getActiveInstance();
			if (instance !== null) {
				if (previous) {
					instance.findPrevious(val);
				} else {
					instance.findNext(val);
				}
			}
		};

		this._register(this._findInput.onKeyDown((e) => {
			if (e.equals(KeyCode.Enter)) {
				find(false);
				e.preventDefault();
				return;
			}

			if (e.equals(KeyMod.Shift | KeyCode.Enter)) {
				find(true);
				e.preventDefault();
				return;
			}
		}));

		let prevBtn = new SimpleButton({
			label: NLS_PREVIOUS_MATCH_BTN_LABEL,
			className: 'previous',
			onTrigger: () => {
				find(true);
			},
			onKeyDown: (e) => { }
		});

		let nextBtn = new SimpleButton({
			label: NLS_NEXT_MATCH_BTN_LABEL,
			className: 'next',
			onTrigger: () => {
				find(false);
			},
			onKeyDown: (e) => { }
		});

		let closeBtn = new SimpleButton({
			label: NLS_CLOSE_BTN_LABEL,
			className: 'close-fw',
			onTrigger: () => {
				this.hide();
			},
			onKeyDown: (e) => { }
		});

		this._domNode = document.createElement('div');
		this._domNode.className = 'find-part';
		this._domNode.appendChild(this._findInput.domNode);
		this._domNode.appendChild(prevBtn.domNode);
		this._domNode.appendChild(nextBtn.domNode);
		this._domNode.appendChild(closeBtn.domNode);

		this._register(dom.addDisposableListener(this._domNode, 'click', (event) => {
			event.stopPropagation();
		}));
	}

	public updateTheme(theme?: ITheme): void {
		let inputStyles = {
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

	public reveal(): void {
		if (this._isVisible) {
			this._findInput.select();
			return;
		}

		this._isVisible = true;

		setTimeout(() => {
			dom.addClass(this._domNode, 'visible');
			this._domNode.setAttribute('aria-hidden', 'false');
			dom.addClass(this._domNode, 'noanimation');
			setTimeout(() => {
				dom.removeClass(this._domNode, 'noanimation');
				this._findInput.select();
			}, 200);
		}, 0);
	}

	public hide(): void {
		if (this._isVisible) {
			this._isVisible = false;

			dom.removeClass(this._domNode, 'visible');
			this._domNode.setAttribute('aria-hidden', 'true');
		}
	}
}

// theming
registerThemingParticipant((theme, collector) => {
	const findWidgetBGColor = theme.getColor(editorWidgetBackground);
	if (findWidgetBGColor) {
		collector.addRule(`.monaco-workbench .panel.integrated-terminal .find-part { background-color: ${findWidgetBGColor} !important; }`);
	}

	let widgetShadowColor = theme.getColor(widgetShadow);
	if (widgetShadowColor) {
		collector.addRule(`.monaco-workbench .panel.integrated-terminal .find-part { box-shadow: 0 2px 8px ${widgetShadowColor}; }`);
	}
});