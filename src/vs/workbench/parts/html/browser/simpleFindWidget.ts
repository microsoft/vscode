/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import 'vs/css!./simpleFindWidget';
import * as DOM from 'vs/base/browser/dom';
import { Widget } from 'vs/base/browser/ui/widget';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import * as strings from 'vs/base/common/strings';
import {
	SimpleButton, NLS_CLOSE_BTN_LABEL, NLS_FIND_INPUT_LABEL, NLS_FIND_INPUT_PLACEHOLDER, NLS_NEXT_MATCH_BTN_LABEL
	, NLS_PREVIOUS_MATCH_BTN_LABEL, NLS_MATCHES_LOCATION, NLS_NO_RESULTS
} from 'vs/editor/contrib/find/browser/findWidget';
import { SimpleFindState, SimpleFindStateChangedEvent } from './simpleFindState';
import { FindModelBoundToWebview } from './simpleFindModel';

let MAX_MATCHES_COUNT_WIDTH = 69;
const WIDGET_FIXED_WIDTH = 411 - 69;

export class SimpleFindWidget extends Widget {

	public domNode: HTMLElement;

	private countElement: HTMLElement;
	private _findPart: HTMLElement;
	private _findInput: InputBox;

	private nextButton: SimpleButton;
	private prevButton: SimpleButton;
	private closeButton: SimpleButton;
	private isVisible: boolean;
	private _state: SimpleFindState;
	private _model: FindModelBoundToWebview;

	constructor(parent: HTMLElement,
		state: SimpleFindState,
		@IContextViewService private contextViewService: IContextViewService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IInstantiationService private instantiationService: IInstantiationService) {
		super();
		this._state = state;
		this._register(this._state.addChangeListener((e) => this._onStateChanged(e)));
		this.create(parent);
	}

	private _onStateChanged(e: SimpleFindStateChangedEvent): void {
		if (e.searchString) {
			// this._findInput.value = this._state.searchString;
			this.updateButtons();
		}
		if (e.isRevealed) {
			if (this._state.isRevealed) {
				this.show();
			} else {
				this.hide();
			}
		}

		if (e.searchString || e.matchesCount || e.matchesPosition) {
			let showRedOutline = (this._state.searchString.length > 0 && this._state.matchesCount === 0);
			DOM.toggleClass(this.domNode, 'no-results', showRedOutline);

			this.showMessage();
			this.updateButtons();
		}
	}

	public set findModel(model: FindModelBoundToWebview) {
		this._model = model;
	}

	private create(parent: HTMLElement) {
		this.domNode = DOM.append(parent, DOM.$('div.find-widget'));
		this.onkeyup(this.domNode, (e) => this._onKeyUp(e));
		this._buildFindPart(DOM.append(this.domNode, DOM.$('div.find-part')));
		this._findInput.inputElement.setAttribute('aria-live', 'assertive');

		this.showMessage();
		this.updateButtons();
	}

	private _buildFindPart(findPart: HTMLElement) {
		this._findPart = findPart;

		const input = DOM.append(this._findPart, DOM.$('div'));
		this._findInput = this._register(new InputBox(input, this.contextViewService, {
			ariaLabel: NLS_FIND_INPUT_LABEL,
			placeholder: NLS_FIND_INPUT_PLACEHOLDER
		}));
		input.classList.add('monaco-findInput');
		this.countElement = DOM.append(this._findPart, DOM.$('.matchesCount'));
		this._register(this._findInput.onDidChange(value => this._state.change({ searchString: value })));
		this.onkeyup(this._findInput.inputElement, (e) => this._onInputBoxKeyUp(e));

		this.prevButton = this._register(new SimpleButton({
			label: NLS_PREVIOUS_MATCH_BTN_LABEL,
			className: 'previous',
			onTrigger: () => {
				if (this._model) {
					this._model.moveToPrevMatch();
				}
			},
			onKeyDown: (e) => { }
		}));
		this.nextButton = this._register(new SimpleButton({
			label: NLS_NEXT_MATCH_BTN_LABEL,
			className: 'next',
			onTrigger: () => {
				if (this._model) {
					this._model.moveToNextMatch();
				}
			},
			onKeyDown: (e) => { }
		}));
		this.closeButton = this._register(new SimpleButton({
			label: NLS_CLOSE_BTN_LABEL,
			className: 'close-fw',
			onTrigger: () => {
				this._state.change({ isRevealed: false });
			},
			onKeyDown: (e) => { }
		}));
		this._findPart.appendChild(this.prevButton.domNode);
		this._findPart.appendChild(this.nextButton.domNode);
		this._findPart.appendChild(this.closeButton.domNode);
	}

	public showMessage(): void {
		this.countElement.style.minWidth = MAX_MATCHES_COUNT_WIDTH + 'px';

		const message = this._state.matchesCount === 0 || this._findInput.value.length === 0 ? NLS_NO_RESULTS :
			strings.format(NLS_MATCHES_LOCATION, this._state.matchesPosition, this._state.matchesCount);
		this._findInput.inputElement.setAttribute('aria-label', message);
		this.countElement.textContent = message;

		MAX_MATCHES_COUNT_WIDTH = Math.max(MAX_MATCHES_COUNT_WIDTH, this.countElement.clientWidth);
	}

	public updateButtons(): void {
		let findInputIsNonEmpty = (this._state.searchString.length > 0);

		this._findInput.setEnabled(this.isVisible);
		this.nextButton.setEnabled(this.isVisible && this._state.matchesCount > 0 && findInputIsNonEmpty);
		this.prevButton.setEnabled(this.isVisible && this._state.matchesCount > 0 && findInputIsNonEmpty);
		this.closeButton.setEnabled(this.isVisible);
	}

	public layout(editorWidth: number) {
		let collapsedFindWidget = false;
		let reducedFindWidget = false;
		let narrowFindWidget = false;
		if (WIDGET_FIXED_WIDTH + 28 >= editorWidth + 50) {
			collapsedFindWidget = true;
		}
		if (WIDGET_FIXED_WIDTH + 28 >= editorWidth) {
			narrowFindWidget = true;
		}
		if (WIDGET_FIXED_WIDTH + MAX_MATCHES_COUNT_WIDTH + 28 >= editorWidth) {
			reducedFindWidget = true;
		}
		DOM.toggleClass(this.domNode, 'collapsed-find-widget', collapsedFindWidget);
		DOM.toggleClass(this.domNode, 'reduced-find-widget', reducedFindWidget);
		DOM.toggleClass(this.domNode, 'narrow-find-widget', narrowFindWidget);
	}

	/**
	 * Activates the widget by focusing it, selecting the text, and starting a search.
	 * Separated from show() so it can be managed separate from state changes
	 * (i.e. focus is in the page, find is shown, ctrl+f is pressed again.
	 * Visibility hasn't changed, but the widget should be activated)
	 * This is consistent with the behavior in other find widgets in VS Code and with Chrome.
	 *
	 * @memberOf SimpleFindWidget
	 */
	public activate() {
		this._findInput.focus();
		this._findInput.select({ start: 0, end: this._findInput.value.length });
		this._model.startFind();
	}

	/**
	 * Shows the widget by changing the visibility.
	 * Controlled by the isVisible state property.
	 *
	 * @private
	 *
	 * @memberOf SimpleFindWidget
	 */
	private show() {
		if (!this.isVisible) {
			this.isVisible = true;
			this.updateButtons();
			this.domNode.classList.add('visible');
		}
	}

	public hide() {
		if (this.isVisible) {
			this.isVisible = false;
			this.domNode.classList.remove('visible');
			this.updateButtons();
			this.domNode.blur();
		}
	}

	private _onKeyUp(keyboardEvent: IKeyboardEvent): void {
		let handled = false;
		switch (keyboardEvent.keyCode) {
			case KeyCode.Escape:
				this._state.change({ isRevealed: false });
				handled = true;
		}

		if (handled) {
			keyboardEvent.preventDefault();
			keyboardEvent.stopPropagation();
		}
	}

	private _onInputBoxKeyUp(keyboardEvent: IKeyboardEvent): void {
		let handled = false;
		switch (keyboardEvent.keyCode) {
			case KeyCode.Enter:
				if (keyboardEvent.shiftKey) {
					if (this._model) {
						this._model.moveToPrevMatch();
					}
				} else {
					if (this._model) {
						this._model.moveToNextMatch();
					}
				}
				handled = true;
				break;
			// case KeyCode.Escape:
			// 	this._state.change({ isRevealed: false });
			// 	handled = true;
			// 	break;
		}
		if (handled) {
			keyboardEvent.preventDefault();
			keyboardEvent.stopPropagation();
		}
	}
}
