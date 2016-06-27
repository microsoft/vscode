/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import strings = require('vs/base/common/strings');
import dom = require('vs/base/browser/dom');
import { TPromise } from 'vs/base/common/winjs.base';
import { Widget } from 'vs/base/browser/ui/widget';
import { Action } from 'vs/base/common/actions';
import { FindInput, IFindInputOptions } from 'vs/base/browser/ui/findinput/findInput';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { Button } from 'vs/base/browser/ui/button/button';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { KeyCode } from 'vs/base/common/keyCodes';
import Event, { Emitter } from 'vs/base/common/event';
import { Builder } from 'vs/base/browser/builder';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export interface ISearchWidgetOptions {
	value?:string;
	isRegex?:boolean;
	isCaseSensitive?:boolean;
	isWholeWords?:boolean;
}

export class SearchWidget extends Widget {

	public domNode: HTMLElement;
	public searchInput: FindInput;
	private replaceInput: InputBox;

	private replaceInputContainer: HTMLElement;
	private toggleReplaceButton: Button;
	private replaceAllAction: Action;

	private _onSearchSubmit = this._register(new Emitter<boolean>());
	public onSearchSubmit: Event<boolean> = this._onSearchSubmit.event;

	private _onSearchCancel = this._register(new Emitter<void>());
	public onSearchCancel: Event<void> = this._onSearchCancel.event;

	private _onReplaceToggled = this._register(new Emitter<void>());
	public onReplaceToggled: Event<void> = this._onReplaceToggled.event;

	private _onReplaceState = this._register(new Emitter<void>());
	public onReplaceStateChange: Event<void> = this._onReplaceState.event;

	private _onReplaceValueChanged = this._register(new Emitter<string>());
	public onReplaceValueChanged: Event<string> = this._onReplaceValueChanged.event;

	private _onKeyDownArrow = this._register(new Emitter<void>());
	public onKeyDownArrow: Event<void> = this._onKeyDownArrow.event;

	private _onReplaceAll = this._register(new Emitter<void>());
	public onReplaceAll: Event<void> = this._onReplaceAll.event;

	constructor(container: Builder, private contextViewService: IContextViewService, options: ISearchWidgetOptions= Object.create(null),
											@IInstantiationService private instantiationService: IInstantiationService) {
		super();
		this.render(container, options);
	}

	public focus(select:boolean= true, focusReplace: boolean= false):void {
		if (this.searchInput.inputBox.hasFocus() || this.replaceInput.hasFocus()) {
			return;
		}

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

	public setWidth(width: number) {
		this.searchInput.setWidth(width - 2);
		this.replaceInput.width= width - 28;
	}

	public clear() {
		this.searchInput.clear();
		this.replaceInput.value= '';
	}

	public isReplaceActive(): boolean {
		return this.isReplaceShown() && this.replaceAllAction.enabled;
	}

	public isReplaceShown(): boolean {
		return !dom.hasClass(this.replaceInputContainer, 'disabled');
	}

	public getReplaceValue():string {
		return this.isReplaceActive() ? this.replaceInput.value : null;
	}

	private render(container: Builder, options: ISearchWidgetOptions): void {
		this.domNode = container.div({ 'class': 'search-widget' }).style({ position: 'relative' }).getHTMLElement();
		this.renderToggleReplaceButton(this.domNode);

		this.renderSearchInput(this.domNode, options);
		this.renderReplaceInput(this.domNode);
	}

	private renderToggleReplaceButton(parent: HTMLElement): void {
		this.toggleReplaceButton= this._register(new Button(parent));
		this.toggleReplaceButton.icon= 'toggle-replace-button collapse';
		this.toggleReplaceButton.addListener2('click', () => this.onToggleReplaceButton());
		this.toggleReplaceButton.getElement().title= nls.localize('search.replace.toggle.button.title', "Toggle Replace");
	}

	private renderSearchInput(parent: HTMLElement, options: ISearchWidgetOptions): void {
		let inputOptions: IFindInputOptions = {
			label: nls.localize('label.Search', 'Search: Type Search Term and press Enter to search or Escape to cancel'),
			validation: (value: string) => this.validatSearchInput(value),
			placeholder: nls.localize('search.placeHolder', "Search")
		};

		let searchInputContainer= dom.append(parent, dom.emmet('.search-box.input-box'));
		this.searchInput = this._register(new FindInput(searchInputContainer, this.contextViewService, inputOptions));
		this.searchInput.onKeyUp((keyboardEvent: IKeyboardEvent) => this.onSearchInputKeyUp(keyboardEvent));
		this.searchInput.onKeyDown((keyboardEvent: IKeyboardEvent) => this.onSearchInputKeyDown(keyboardEvent));
		this.searchInput.setValue(options.value || '');
		this.searchInput.setRegex(!!options.isRegex);
		this.searchInput.setCaseSensitive(!!options.isCaseSensitive);
		this.searchInput.setWholeWords(!!options.isWholeWords);
		this._register(dom.addDisposableListener(this.searchInput.inputBox.inputElement, dom.EventType.FOCUS, () => this.updateReplaceActionState()));
		this._register(dom.addDisposableListener(this.searchInput.inputBox.inputElement, dom.EventType.BLUR, () => this.updateReplaceActionState()));
	}

	private renderReplaceInput(parent: HTMLElement): void {
		this.replaceAllAction = new Action('action-replace-all', nls.localize('file.replaceAll.label', "Replace All"), 'action-replace-all', false, () => {
			this._onReplaceAll.fire();
			return TPromise.as(null);
		});
		this.replaceInputContainer= dom.append(parent, dom.emmet('.replace-box.input-box.disabled'));
		this.replaceInput = this._register(new InputBox(this.replaceInputContainer, this.contextViewService, {
			ariaLabel: nls.localize('label.Replace', 'Replace: Type replace term and press Enter to preview or Escape to cancel'),
			placeholder: nls.localize('search.replace.placeHolder', "Replace"),
			actions: [this.replaceAllAction]
		}));
		this.onkeydown(this.replaceInput.inputElement, (keyboardEvent) => this.onReplaceInputKeyDown(keyboardEvent));
		this.onkeyup(this.replaceInput.inputElement, (keyboardEvent) => this.onReplaceInputKeyUp(keyboardEvent));
		this.replaceInput.onDidChange(() => this._onReplaceValueChanged.fire());
	}

	private onToggleReplaceButton():void {
		dom.toggleClass(this.replaceInputContainer, 'disabled');
		dom.toggleClass(this.toggleReplaceButton.getElement(), 'collapse');
		dom.toggleClass(this.toggleReplaceButton.getElement(), 'expand');
		this._onReplaceToggled.fire();
		this.updateReplaceActionState();
	}

	private updateReplaceActionState():boolean {
		let enabled= this.isReplaceShown() && !this.searchInput.inputBox.hasFocus();
		if (this.replaceAllAction.enabled !== enabled) {
			this.replaceAllAction.enabled= enabled;
			this._onReplaceState.fire();
			return true;
		}
		return false;
	}

	private validatSearchInput(value: string): any {
		if (value.length === 0) {
			return null;
		}
		if (!this.searchInput.getRegex()) {
			return null;
		}
		let regExp: RegExp;
		try {
			regExp = new RegExp(value);
		} catch (e) {
			return { content: e.message };
		}
		if (strings.regExpLeadsToEndlessLoop(regExp)) {
			return { content: nls.localize('regexp.validationFailure', "Expression matches everything") };
		}
	}

	private onSearchInputKeyUp(keyboardEvent: IKeyboardEvent) {
		switch (keyboardEvent.keyCode) {
			case KeyCode.Enter:
				this.submitSearch();
				return;
			case KeyCode.Escape:
				this._onSearchCancel.fire();
				return;
			default:
				return;
		}
	}

	private onSearchInputKeyDown(keyboardEvent: IKeyboardEvent) {
		switch (keyboardEvent.keyCode) {
			case KeyCode.DownArrow:
				if (this.isReplaceShown()) {
					this.replaceInput.focus();
					keyboardEvent.stopPropagation();
				} else {
					this._onKeyDownArrow.fire();
				}
				return;
			default:
				return;
		}
	}

	private onReplaceInputKeyUp(keyboardEvent: IKeyboardEvent) {
		switch (keyboardEvent.keyCode) {
			case KeyCode.Enter:
				this.submitSearch();
				return;
			case KeyCode.Escape:
				this.onToggleReplaceButton();
				this.searchInput.focus();
				return;
			default:
				return;
		}
	}

	private onReplaceInputKeyDown(keyboardEvent: IKeyboardEvent) {
		switch (keyboardEvent.keyCode) {
			case KeyCode.UpArrow:
				this.searchInput.focus();
				return;
			case KeyCode.DownArrow:
				this._onKeyDownArrow.fire();
				return;
			default:
				return;
		}
	}

	private submitSearch(refresh: boolean= true): void {
		if (this.searchInput.getValue()) {
			this._onSearchSubmit.fire(refresh);
		}
	}

	public dispose(): void {
		super.dispose();
	}
}