/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./findInput';

import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import {IMessage as InputBoxMessage, IInputValidator, InputBox} from 'vs/base/browser/ui/inputbox/inputBox';
import {Checkbox} from 'vs/base/browser/ui/checkbox/checkbox';
import {IContextViewProvider} from 'vs/base/browser/ui/contextview/contextview';
import {Widget} from 'vs/base/browser/ui/widget';
import Event, {Emitter} from 'vs/base/common/event';
import {IKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import {IMouseEvent} from 'vs/base/browser/mouseEvent';
import {CommonKeybindings} from 'vs/base/common/keyCodes';

export interface IFindInputOptions {
	placeholder?:string;
	width?:number;
	validation?:IInputValidator;
	label:string;

	appendCaseSensitiveLabel?: string;
	appendWholeWordsLabel?: string;
	appendRegexLabel?: string;
}

export interface IMatchCountState {
	count: string;
	isVisible: boolean;
	title: string;
}

const NLS_REGEX_CHECKBOX_LABEL = nls.localize('regexDescription', "Use Regular Expression");
const NLS_WHOLE_WORD_CHECKBOX_LABEL = nls.localize('wordsDescription', "Match Whole Word");
const NLS_CASE_SENSITIVE_CHECKBOX_LABEL = nls.localize('caseDescription', "Match Case");
const NLS_DEFAULT_LABEL = nls.localize('defaultLabel', "input");

export class FindInput extends Widget {

	static OPTION_CHANGE:string = 'optionChange';

	private contextViewProvider: IContextViewProvider;
	private width:number;
	private placeholder:string;
	private validation:IInputValidator;
	private label:string;

	private regex:Checkbox;
	private wholeWords:Checkbox;
	private caseSensitive:Checkbox;
	private matchCount: MatchCount;
	public domNode: HTMLElement;
	public inputBox:InputBox;

	private _onDidOptionChange = this._register(new Emitter<boolean>());
	public onDidOptionChange: Event<boolean /* via keyboard */> = this._onDidOptionChange.event;

	private _onKeyDown = this._register(new Emitter<IKeyboardEvent>());
	public onKeyDown: Event<IKeyboardEvent> = this._onKeyDown.event;

	private _onInput = this._register(new Emitter<void>());
	public onInput: Event<void> = this._onInput.event;

	private _onKeyUp = this._register(new Emitter<IKeyboardEvent>());
	public onKeyUp: Event<IKeyboardEvent> = this._onKeyUp.event;

	private _onCaseSensitiveKeyDown = this._register(new Emitter<IKeyboardEvent>());
	public onCaseSensitiveKeyDown: Event<IKeyboardEvent> = this._onCaseSensitiveKeyDown.event;

	constructor(parent:HTMLElement, contextViewProvider: IContextViewProvider, options?:IFindInputOptions) {
		super();
		this.contextViewProvider = contextViewProvider;
		this.width = options.width || 100;
		this.placeholder = options.placeholder || '';
		this.validation = options.validation;
		this.label = options.label || NLS_DEFAULT_LABEL;

		this.regex = null;
		this.wholeWords = null;
		this.caseSensitive = null;
		this.domNode = null;
		this.inputBox = null;

		this.buildDomNode(options.appendCaseSensitiveLabel || '', options.appendWholeWordsLabel || '', options.appendRegexLabel || '');

		if(Boolean(parent)) {
			parent.appendChild(this.domNode);
		}

		this.onkeydown(this.inputBox.inputElement, (e) => this._onKeyDown.fire(e));
		this.onkeyup(this.inputBox.inputElement, (e) => this._onKeyUp.fire(e));
		this.oninput(this.inputBox.inputElement, (e) => this._onInput.fire());
	}

	public enable(): void {
		dom.removeClass(this.domNode, 'disabled');
		this.inputBox.enable();
		this.regex.enable();
		this.wholeWords.enable();
		this.caseSensitive.enable();
	}

	public disable(): void {
		dom.addClass(this.domNode, 'disabled');
		this.inputBox.disable();
		this.regex.disable();
		this.wholeWords.disable();
		this.caseSensitive.disable();
	}

	public setEnabled(enabled:boolean): void {
		if (enabled) {
			this.enable();
		} else {
			this.disable();
		}
	}

	public clear(): void {
		this.clearValidation();
		this.setValue('');
		this.focus();
	}

	public setWidth(newWidth:number): void {
		this.width = newWidth;
		this.domNode.style.width = this.width + 'px';
		this.contextViewProvider.layout();
		this.setInputWidth();
	}

	public getValue(): string {
		return this.inputBox.value;
	}

	public setValue(value:string): void {
		if (this.inputBox.value !== value) {
			this.inputBox.value = value;
		}
	}

	public setMatchCountState(state:IMatchCountState): void {
		this.matchCount.setState(state);
		this.setInputWidth();
	}

	public select(): void {
		this.inputBox.select();
	}

	public focus(): void {
		this.inputBox.focus();
	}

	public getCaseSensitive():boolean {
		return this.caseSensitive.checked;
	}

	public setCaseSensitive(value:boolean): void {
		this.caseSensitive.checked = value;
		this.setInputWidth();
	}

	public getWholeWords():boolean {
		return this.wholeWords.checked;
	}

	public setWholeWords(value:boolean): void {
		this.wholeWords.checked = value;
		this.setInputWidth();
	}

	public getRegex():boolean {
		return this.regex.checked;
	}

	public setRegex(value:boolean): void {
		this.regex.checked = value;
		this.setInputWidth();
	}

	public focusOnCaseSensitive(): void {
		this.caseSensitive.focus();
	}

	private setInputWidth(): void {
		let w = this.width - this.matchCount.width() - this.caseSensitive.width() - this.wholeWords.width() - this.regex.width();
		this.inputBox.width = w;
	}

	private buildDomNode(appendCaseSensitiveLabel:string, appendWholeWordsLabel: string, appendRegexLabel: string): void {
		this.domNode = document.createElement('div');
		this.domNode.style.width = this.width + 'px';
		dom.addClass(this.domNode, 'monaco-findInput');

		this.inputBox = this._register(new InputBox(this.domNode, this.contextViewProvider, {
			placeholder: this.placeholder || '',
			ariaLabel: this.label || '',
			validationOptions: {
				validation: this.validation || null,
				showMessage: true
			}
		}));

		this.regex = this._register(new Checkbox({
			actionClassName: 'regex',
			title: NLS_REGEX_CHECKBOX_LABEL + appendRegexLabel,
			isChecked: false,
			onChange: (viaKeyboard) => {
				this._onDidOptionChange.fire(viaKeyboard);
				if (!viaKeyboard) {
					this.inputBox.focus();
				}
				this.setInputWidth();
				this.validate();
			}
		}));
		this.wholeWords = this._register(new Checkbox({
			actionClassName: 'whole-word',
			title: NLS_WHOLE_WORD_CHECKBOX_LABEL + appendWholeWordsLabel,
			isChecked: false,
			onChange: (viaKeyboard) => {
				this._onDidOptionChange.fire(viaKeyboard);
				if (!viaKeyboard) {
					this.inputBox.focus();
				}
				this.setInputWidth();
				this.validate();
			}
		}));
		this.caseSensitive = this._register(new Checkbox({
			actionClassName: 'case-sensitive',
			title: NLS_CASE_SENSITIVE_CHECKBOX_LABEL + appendCaseSensitiveLabel,
			isChecked: false,
			onChange: (viaKeyboard) => {
				this._onDidOptionChange.fire(viaKeyboard);
				if (!viaKeyboard) {
					this.inputBox.focus();
				}
				this.setInputWidth();
				this.validate();
			},
			onKeyDown: (e) => {
				this._onCaseSensitiveKeyDown.fire(e);
			}
		}));
		this.matchCount = this._register(new MatchCount({
			onClick: (e) => {
				this.inputBox.focus();
				e.preventDefault();
			}
		}));

		// Arrow-Key support to navigate between options
		let indexes = [this.caseSensitive.domNode, this.wholeWords.domNode, this.regex.domNode];
		this.onkeydown(this.domNode, (event: IKeyboardEvent) => {
			if (event.equals(CommonKeybindings.LEFT_ARROW) || event.equals(CommonKeybindings.RIGHT_ARROW) || event.equals(CommonKeybindings.ESCAPE)) {
				let index = indexes.indexOf(<HTMLElement>document.activeElement);
				if (index >= 0) {
					let newIndex: number;
					if (event.equals(CommonKeybindings.RIGHT_ARROW)) {
						newIndex = (index + 1) % indexes.length;
					} else if (event.equals(CommonKeybindings.LEFT_ARROW)) {
						if (index === 0) {
							newIndex = indexes.length - 1;
						} else {
							newIndex = index - 1;
						}
					}

					if (event.equals(CommonKeybindings.ESCAPE)) {
						indexes[index].blur();
					} else if (newIndex >= 0) {
						indexes[newIndex].focus();
					}

					dom.EventHelper.stop(event, true);
				}
			}
		});

		this.setInputWidth();

		let controls = document.createElement('div');
		controls.className = 'controls';
		controls.appendChild(this.matchCount.domNode);
		controls.appendChild(this.caseSensitive.domNode);
		controls.appendChild(this.wholeWords.domNode);
		controls.appendChild(this.regex.domNode);

		this.domNode.appendChild(controls);
	}

	public validate(): void {
		this.inputBox.validate();
	}

	public showMessage(message: InputBoxMessage): void {
		this.inputBox.showMessage(message);
	}

	public clearMessage(): void {
		this.inputBox.hideMessage();
	}

	private clearValidation(): void {
		this.inputBox.hideMessage();
	}

	public dispose(): void {
		super.dispose();
	}
}

interface IMatchCountOpts {
	onClick: (e:IMouseEvent) => void;
}

class MatchCount extends Widget {

	public domNode: HTMLElement;
	private isVisible: boolean;

	constructor(opts:IMatchCountOpts) {
		super();
		this.domNode = document.createElement('div');
		this.domNode.className = 'matchCount';

		this.setState({
			isVisible: false,
			count: '0',
			title: ''
		});
		this.onclick(this.domNode, opts.onClick);
	}

	public width(): number {
		return this.isVisible ? 30 : 0;
	}

	public setState(state:IMatchCountState): void {
		dom.clearNode(this.domNode);
		this.domNode.appendChild(document.createTextNode(state.count));
		this.domNode.title = state.title;

		this.isVisible = state.isVisible;
		if (this.isVisible) {
			this.domNode.style.display = 'block';
		} else {
			this.domNode.style.display = 'none';
		}
	}
}
