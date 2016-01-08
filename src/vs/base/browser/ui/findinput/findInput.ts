/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./findInput';
import nls = require('vs/nls');
import Builder = require('vs/base/browser/builder');
import mouse = require('vs/base/browser/mouseEvent');
import keyboard = require('vs/base/browser/keyboardEvent');
import InputBox = require('vs/base/browser/ui/inputbox/inputBox');
import Checkbox = require('vs/base/browser/ui/checkbox/checkbox');
import ContextView = require('vs/base/browser/ui/contextview/contextview');

var $ = Builder.$;

export interface IOptions {
	placeholder?:string;
	width?:number;
	validation?:InputBox.IInputValidator;
	label:string;

	appendCaseSensitiveLabel?: string;
	appendWholeWordsLabel?: string;
	appendRegexLabel?: string;
}

const NLS_REGEX_CHECKBOX_LABEL = nls.localize('regexDescription', "Use Regular Expression");
const NLS_WHOLE_WORD_CHECKBOX_LABEL = nls.localize('wordsDescription', "Match Whole Word");
const NLS_CASE_SENSITIVE_CHECKBOX_LABEL = nls.localize('caseDescription', "Match Case");
const NLS_DEFAULT_LABEL = nls.localize('defaultLabel', "input");

export class FindInput {

	static OPTION_CHANGE:string = 'optionChange';

	private contextViewProvider: ContextView.IContextViewProvider;
	private onOptionChange:(event:Event)=>void;
	private width:number;
	private placeholder:string;
	private validation:InputBox.IInputValidator;
	private label:string;

	private listenersToRemove:{():void;}[];
	private regex:Checkbox.Checkbox;
	private wholeWords:Checkbox.Checkbox;
	private caseSensitive:Checkbox.Checkbox;
	public domNode: HTMLElement;
	public validationNode: Builder.Builder;
	public inputBox:InputBox.InputBox;

	constructor(parent:HTMLElement, contextViewProvider: ContextView.IContextViewProvider, options?:IOptions) {
		this.contextViewProvider = contextViewProvider;
		this.onOptionChange = null;
		this.width = options.width || 100;
		this.placeholder = options.placeholder || '';
		this.validation = options.validation;
		this.label = options.label || NLS_DEFAULT_LABEL;

		this.listenersToRemove = [];
		this.regex = null;
		this.wholeWords = null;
		this.caseSensitive = null;
		this.domNode = null;
		this.inputBox = null;
		this.validationNode = null;

		this.buildDomNode(options.appendCaseSensitiveLabel || '', options.appendWholeWordsLabel || '', options.appendRegexLabel || '');

		if(Boolean(parent)) {
			parent.appendChild(this.domNode);
		}
	}

	public destroy(): void {
		this.regex.dispose();
		this.wholeWords.dispose();
		this.caseSensitive.dispose();
		this.listenersToRemove.forEach((element) => {
			element();
		});
		this.listenersToRemove = [];
	}

	public on(eventType:string, handler:(event:Event)=>void): FindInput {
		switch(eventType) {
			case 'keydown':
			case 'keyup':
				$(this.inputBox.inputElement).on(eventType, handler);
				break;
			case FindInput.OPTION_CHANGE:
				this.onOptionChange = handler;
				break;
		}
		return this;
	}

	public enable(): void {
		$(this.domNode).removeClass('disabled');
		this.inputBox.enable();
		this.regex.enable();
		this.wholeWords.enable();
		this.caseSensitive.enable();
	}

	public disable(): void {
		$(this.domNode).addClass('disabled');
		this.inputBox.disable();
		this.regex.disable();
		this.wholeWords.disable();
		this.caseSensitive.disable();
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
		var w = this.width - this.caseSensitive.width() - this.wholeWords.width() - this.regex.width();
		this.inputBox.width = w;
	}

	private buildDomNode(appendCaseSensitiveLabel:string, appendWholeWordsLabel: string, appendRegexLabel: string): void {
		this.domNode = document.createElement('div');
		this.domNode.style.width = this.width + 'px';
		$(this.domNode).addClass('monaco-findInput');

		this.inputBox = new InputBox.InputBox(this.domNode, this.contextViewProvider, {
			placeholder: this.placeholder || '',
			ariaLabel: this.label || '',
			validationOptions: {
				validation: this.validation || null,
				showMessage: true
			}
		});

		this.regex = new Checkbox.Checkbox({
			actionClassName: 'regex',
			title: NLS_REGEX_CHECKBOX_LABEL + appendRegexLabel,
			isChecked: false,
			onChange: () => {
				this.onOptionChange(null);
				this.inputBox.focus();
				this.setInputWidth();
				this.validate();
			}
		});
		this.wholeWords = new Checkbox.Checkbox({
			actionClassName: 'whole-word',
			title: NLS_WHOLE_WORD_CHECKBOX_LABEL + appendWholeWordsLabel,
			isChecked: false,
			onChange: () => {
				this.onOptionChange(null);
				this.inputBox.focus();
				this.setInputWidth();
				this.validate();
			}
		});
		this.caseSensitive = new Checkbox.Checkbox({
			actionClassName: 'case-sensitive',
			title: NLS_CASE_SENSITIVE_CHECKBOX_LABEL + appendCaseSensitiveLabel,
			isChecked: false,
			onChange: () => {
				this.onOptionChange(null);
				this.inputBox.focus();
				this.setInputWidth();
				this.validate();
			}
		});
		this.setInputWidth();

		var controls = document.createElement('div');
		controls.className = 'controls';
		controls.appendChild(this.caseSensitive.domNode);
		controls.appendChild(this.wholeWords.domNode);
		controls.appendChild(this.regex.domNode);

		this.domNode.appendChild(controls);
	}

	public validate(): void {
		this.inputBox.validate();
	}

	public showMessage(message: InputBox.IMessage): void {
		this.inputBox.showMessage(message);
	}

	public clearMessage(): void {
		this.inputBox.hideMessage();
	}

	private clearValidation(): void {
		this.inputBox.hideMessage();
	}
}
