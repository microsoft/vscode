/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./findWidget';
import nls = require('vs/nls');
import Errors = require('vs/base/common/errors');
import EventEmitter = require('vs/base/common/eventEmitter');
import DomUtils = require('vs/base/browser/dom');
import ContextView = require('vs/base/browser/ui/contextview/contextview');
import Keyboard = require('vs/base/browser/keyboardEvent');
import InputBox = require('vs/base/browser/ui/inputbox/inputBox');
import Findinput = require('vs/base/browser/ui/findinput/findInput');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');
import FindModel = require('vs/editor/contrib/find/common/findModel');
import Lifecycle = require('vs/base/common/lifecycle');
import {CommonKeybindings} from 'vs/base/common/keyCodes';

export interface IUserInputEvent {
	jumpToNextMatch: boolean;
}

export interface IFindWidget {
	dispose(): void;

	setModel(newFindModel:FindModel.IFindModel): void;
	setSearchString(searchString:string): void;
	getState(): FindModel.IFindState;

	addUserInputEventListener(callback:(e:IUserInputEvent)=>void): Lifecycle.IDisposable;
	addClosedEventListener(callback:()=>void): Lifecycle.IDisposable;
}

export interface IFindController {
	enableSelectionFind(): void;
	disableSelectionFind(): void;
	replace(): void;
	replaceAll(): void;
}

export class FindWidget extends EventEmitter.EventEmitter implements EditorBrowser.IOverlayWidget, IFindWidget {

	private static _USER_CLOSED_EVENT = 'close';
	private static _USER_INPUT_EVENT = 'userInputEvent';

	private static ID = 'editor.contrib.findWidget';
	private static PART_WIDTH = 275;
	private static FIND_INPUT_AREA_WIDTH = FindWidget.PART_WIDTH - 54;
	private static REPLACE_INPUT_AREA_WIDTH = FindWidget.FIND_INPUT_AREA_WIDTH;

	private _codeEditor:EditorBrowser.ICodeEditor;
	private _controller: IFindController;

	private _domNode:HTMLElement;
	private _findInput:Findinput.FindInput;
	private _replaceInputBox:InputBox.InputBox;

	private _toggleReplaceBtn:SimpleButton;
	private _prevBtn:SimpleButton;
	private _nextBtn:SimpleButton;
	private _toggleSelectionFind:Checkbox;
	private _closeBtn:SimpleButton;
	private _replaceBtn:SimpleButton;
	private _replaceAllBtn:SimpleButton;

	private _isReplaceEnabled:boolean;
	private _isVisible:boolean;
	private _isReplaceVisible:boolean;

	private _toDispose:Lifecycle.IDisposable[];

	private _model:FindModel.IFindModel;
	private _modelListenersToDispose:Lifecycle.IDisposable[];

	private _contextViewProvider:ContextView.IContextViewProvider;

	private focusTracker:DomUtils.IFocusTracker;

	constructor(codeEditor:EditorBrowser.ICodeEditor, controller:IFindController, contextViewProvider:ContextView.IContextViewProvider) {
		super([
			FindWidget._USER_INPUT_EVENT,
			FindWidget._USER_CLOSED_EVENT,
		]);
		this._codeEditor = codeEditor;
		this._controller = controller;
		this._contextViewProvider = contextViewProvider;

		this._isVisible = false;
		this._isReplaceVisible = false;
		this._isReplaceEnabled = false;
		this._toDispose = [];

		this._model = null;
		this._modelListenersToDispose = [];

		this._buildDomNode();

		this.focusTracker = DomUtils.trackFocus(this._domNode);

		this._codeEditor.addOverlayWidget(this);

		this.focusTracker.addFocusListener(() => {
			var selection = this._codeEditor.getSelection();
			if (selection.startLineNumber !== selection.endLineNumber) {
				// Search in selection
				this._controller.enableSelectionFind();
			}
		});
	}

	public dispose(): void {
		this.focusTracker.dispose();
		this._removeModel();
		this._findInput.destroy();
		this._replaceInputBox.dispose();
		this._toDispose = Lifecycle.disposeAll(this._toDispose);
	}

	// ----- IOverlayWidget API

	public getId(): string {
		return FindWidget.ID;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public getPosition(): EditorBrowser.IOverlayWidgetPosition {
		if (this._isVisible) {
			return {
				preference: EditorBrowser.OverlayWidgetPositionPreference.TOP_RIGHT_CORNER
			};
		}
		return null;
	}

	public setSearchString(searchString:string): void {
		this._findInput.setValue(searchString);
	}

	private _setState(state:FindModel.IFindState, selectionFindEnabled:boolean): void {
		this._findInput.setValue(state.searchString);
		this._findInput.setCaseSensitive(state.properties.matchCase);
		this._findInput.setWholeWords(state.properties.wholeWord);
		this._findInput.setRegex(state.properties.isRegex);
		this._toggleSelectionFind.checkbox.disabled = !selectionFindEnabled;
		this._toggleSelectionFind.checkbox.checked = selectionFindEnabled;

		this._replaceInputBox.value = state.replaceString;
		if (state.isReplaceRevealed) {
			this._enableReplace(false);
		} else {
			this._disableReplace(false);
		}
		this._onFindValueChange();
	}

	// ----- Public

	public getState(): FindModel.IFindState {
		var result:FindModel.IFindState = {
			searchString: this._findInput.getValue(),
			replaceString: this._replaceInputBox.value,
			properties: {
				isRegex: this._findInput.getRegex(),
				wholeWord: this._findInput.getWholeWords(),
				matchCase: this._findInput.getCaseSensitive()
			},
			isReplaceRevealed: this._isReplaceEnabled
		};
		return result;
	}

	public setModel(newFindModel:FindModel.IFindModel): void {
		this._removeModel();
		if (newFindModel) {
			// We have a new model! :)
			this._model = newFindModel;
			this._modelListenersToDispose.push(this._model.addStartEventListener((e:FindModel.IFindStartEvent) => {
				this._reveal(e.shouldFocus);
				this._setState(e.state, e.selectionFindEnabled);
				if (e.shouldFocus) {
					this._findInput.select();
					// Edge browser requires focus() in addition to select()
					this._findInput.focus();
				}
			}));
			this._modelListenersToDispose.push(this._model.addMatchesUpdatedEventListener((e:FindModel.IFindMatchesEvent) => {
				DomUtils.toggleClass(this._domNode, 'no-results', this._findInput.getValue() !== '' && e.count === 0);
			}));
		} else {
			// No model :(
			this._hide(false);
		}
	}

	private _removeModel(): void {
		if (this._model !== null) {
			this._modelListenersToDispose = Lifecycle.disposeAll(this._modelListenersToDispose);
			this._model = null;
		}
	}

	private _enableReplace(sendEvent:boolean): void {
		this._isReplaceEnabled = true;
		if (!this._codeEditor.getConfiguration().readOnly && !this._isReplaceVisible) {
			this._replaceInputBox.enable();
			this._isReplaceVisible = true;
			DomUtils.addClass(this._domNode, 'replaceToggled');
			this._toggleReplaceBtn.toggleClass('collapse', false);
			this._toggleReplaceBtn.toggleClass('expand', true);
			this._toggleReplaceBtn.setExpanded(true);
		}
		if (sendEvent) {
			this._emitUserInputEvent(false);
		}
	}

	private _disableReplace(sendEvent:boolean): void {
		this._isReplaceEnabled = false;
		if (this._isReplaceVisible) {
			this._replaceInputBox.disable();
			DomUtils.removeClass(this._domNode, 'replaceToggled');
			this._toggleReplaceBtn.toggleClass('expand', false);
			this._toggleReplaceBtn.toggleClass('collapse', true);
			this._toggleReplaceBtn.setExpanded(false);
			this._isReplaceVisible = false;
		}
		if (sendEvent) {
			this._emitUserInputEvent(false);
		}
	}

	// ----- initialization

	private _onFindInputKeyDown(e:DomUtils.IKeyboardEvent): void {

		var handled = false;

		if (e.equals(CommonKeybindings.ENTER)) {
			this._codeEditor.getAction(FindModel.NEXT_MATCH_FIND_ID).run().done(null, Errors.onUnexpectedError);
			handled = true;
		} else if (e.equals(CommonKeybindings.SHIFT_ENTER)) {
			this._codeEditor.getAction(FindModel.PREVIOUS_MATCH_FIND_ID).run().done(null, Errors.onUnexpectedError);
			handled = true;
		} else if (e.equals(CommonKeybindings.TAB)) {
			if (this._isReplaceVisible) {
				this._replaceInputBox.focus();
			} else {
				this._findInput.focusOnCaseSensitive();
			}
			handled = true;
		}

		if (handled) {
			e.preventDefault();
		} else {
			setTimeout(() => {
				this._onFindValueChange();
				this._emitUserInputEvent(true);
			}, 10);
		}
	}

	private _onReplaceInputKeyDown(e:DomUtils.IKeyboardEvent): void {

		var handled = false;

		if (e.equals(CommonKeybindings.ENTER)) {
			this._controller.replace();
			handled = true;
		} else if (e.equals(CommonKeybindings.CTRLCMD_ENTER)) {
			this._controller.replaceAll();
			handled = true;
		} else if (e.equals(CommonKeybindings.TAB)) {
			this._findInput.focusOnCaseSensitive();
			handled = true;
		}

		if (handled) {
			e.preventDefault();
		} else {
			setTimeout(() => {
				this._emitUserInputEvent(true);
			}, 10);
		}
	}

	private _onFindValueChange(): void {
		var findInputIsNonEmpty = (this._findInput.getValue().length > 0);

		this._prevBtn.setEnabled(findInputIsNonEmpty);
		this._nextBtn.setEnabled(findInputIsNonEmpty);
		this._replaceBtn.setEnabled(findInputIsNonEmpty);
		this._replaceAllBtn.setEnabled(findInputIsNonEmpty);
	}

	private _buildFindPart(): HTMLElement {
		// Find input
		this._findInput = new Findinput.FindInput(null, this._contextViewProvider, {
			width: FindWidget.FIND_INPUT_AREA_WIDTH,
			label: nls.localize('label.find', "Find"),
			placeholder: nls.localize('placeholder.find', "Find"),
			validation: (value:string): InputBox.IMessage => {
				if (value.length === 0) {
					return null;
				}
				if (!this._findInput.getRegex()) {
					return null;
				}
				try {
					new RegExp(value);
					return null;
				} catch (e) {
					return { content: e.message };
				}
			}
		}).on('keydown', (browserEvent:KeyboardEvent) => {
			this._onFindInputKeyDown(new Keyboard.StandardKeyboardEvent(browserEvent));
		}).on(Findinput.FindInput.OPTION_CHANGE, () => {
			this._emitUserInputEvent(true);
		});

		this._findInput.disable();

		// Previous button
		this._prevBtn = new SimpleButton(
			nls.localize('label.previousMatchButton', "Previous match (Shift+F3)"),
			'previous'
		).onTrigger(() => {
			this._codeEditor.getAction(FindModel.PREVIOUS_MATCH_FIND_ID).run().done(null, Errors.onUnexpectedError);
		});
		this._toDispose.push(this._prevBtn);

		// Next button
		this._nextBtn = new SimpleButton(
			nls.localize('label.nextMatchButton', "Next match (F3)"),
			'next'
		).onTrigger(() => {
			this._codeEditor.getAction(FindModel.NEXT_MATCH_FIND_ID).run().done(null, Errors.onUnexpectedError);
		});
		this._toDispose.push(this._nextBtn);

		var findPart = document.createElement('div');
		findPart.className = 'find-part';
		findPart.appendChild(this._findInput.domNode);
		findPart.appendChild(this._prevBtn.domNode);
		findPart.appendChild(this._nextBtn.domNode);

		// Toggle selection button
		this._toggleSelectionFind = new Checkbox(findPart, nls.localize('label.toggleSelectionFind', "Find in selection"));
		this._toggleSelectionFind.disable();
		this._toDispose.push(DomUtils.addStandardDisposableListener(this._toggleSelectionFind.checkbox, 'change', (e) => {
			if (this._toggleSelectionFind.checkbox.checked) {
				this._controller.enableSelectionFind();
			} else {
				this._controller.disableSelectionFind();
				this._updateToggleSelectionFindButton();
			}
		}));
		this._toDispose.push(this._toggleSelectionFind);

		this._codeEditor.addListener(EditorCommon.EventType.CursorSelectionChanged, () => {
			this._updateToggleSelectionFindButton();
		});

		// Close button
		this._closeBtn = new SimpleButton(
			nls.localize('label.closeButton', "Close (Escape)"),
			'close-fw'
			).onTrigger(() => {
			this._hide(true);
			this._emitClosedEvent();
		}).onKeyDown((e) => {
			if (this._isReplaceVisible) {
				this._replaceBtn.focus();
				e.preventDefault();
			}
		});
		this._toDispose.push(this._closeBtn);

		findPart.appendChild(this._closeBtn.domNode);

		return findPart;
	}

	/**
	 * If 'selection find' is ON we should not disable the button (its function is to cancel 'selection find').
	 * If 'selection find' is OFF we enable the button only if there is a multi line selection.
	 */
	private _updateToggleSelectionFindButton(): void {
		if (!this._isVisible) {
			return;
		}

		if (!this._toggleSelectionFind.checkbox.checked) {
			var selection = this._codeEditor.getSelection();

			if (selection.startLineNumber === selection.endLineNumber) {
				this._toggleSelectionFind.disable();
			} else {
				this._toggleSelectionFind.enable();
			}
		}
	}

	private _buildReplacePart(): HTMLElement {
		// Replace input
		var replaceInput = document.createElement('div');
		replaceInput.className = 'replace-input';
		replaceInput.style.width = FindWidget.REPLACE_INPUT_AREA_WIDTH + 'px';
		this._replaceInputBox = new InputBox.InputBox(replaceInput, null, {
			ariaLabel: nls.localize('label.replace', "Replace"),
			placeholder: nls.localize('placeholder.replace', "Replace")
		});

		this._toDispose.push(DomUtils.addStandardDisposableListener(this._replaceInputBox.inputElement, 'keydown', (e) => this._onReplaceInputKeyDown(e)));
		this._replaceInputBox.disable();

		// Replace one button
		this._replaceBtn = new SimpleButton(
			nls.localize('label.replaceButton', "Replace"),
			'replace'
		).onTrigger(() => {
			this._controller.replace();
		});
		this._toDispose.push(this._replaceBtn);

		// Replace all button
		this._replaceAllBtn = new SimpleButton(
			nls.localize('label.replaceAllButton', "Replace All"),
			'replace-all'
		).onTrigger(() => {
			this._controller.replaceAll();
		});
		this._toDispose.push(this._replaceAllBtn);

		var replacePart = document.createElement('div');
		replacePart.className = 'replace-part';
		replacePart.appendChild(replaceInput);
		replacePart.appendChild(this._replaceBtn.domNode);
		replacePart.appendChild(this._replaceAllBtn.domNode);

		return replacePart;
	}

	private _buildDomNode(): void {
		// Find part
		var findPart = this._buildFindPart();

		// Replace part
		var replacePart = this._buildReplacePart();

		// Toggle replace button
		this._toggleReplaceBtn = new SimpleButton(
			nls.localize('label.toggleReplaceButton', "Toggle Replace mode"),
			'toggle left'
		).onTrigger(() => {
			if (this._isReplaceVisible) {
				this._disableReplace(true);
			} else {
				this._enableReplace(true);
			}
		});
		this._toggleReplaceBtn.toggleClass('expand', this._isReplaceVisible);
		this._toggleReplaceBtn.toggleClass('collapse', !this._isReplaceVisible);
		this._toggleReplaceBtn.setExpanded(this._isReplaceVisible);
		this._toDispose.push(this._toggleReplaceBtn);

		// Widget
		this._domNode = document.createElement('div');
		this._domNode.className = 'editor-widget find-widget';
		this._domNode.setAttribute('aria-hidden', 'false');

		if (!this._codeEditor.getConfiguration().readOnly) {
			DomUtils.addClass(this._domNode, 'can-replace');
		}

		this._domNode.appendChild(this._toggleReplaceBtn.domNode);
		this._domNode.appendChild(findPart);
		this._domNode.appendChild(replacePart);
	}

	// ----- actions

	private _reveal(animate:boolean): void {
		if (!this._isVisible) {
			this._findInput.enable();
			if (this._isReplaceVisible) {
				this._replaceInputBox.enable();
			}

			this._toggleSelectionFind.enable();
			this._closeBtn.setEnabled(true);

			this._onFindValueChange();

			this._isVisible = true;
			window.setTimeout(() => {
				DomUtils.addClass(this._domNode, 'visible');
				if (!animate) {
					DomUtils.addClass(this._domNode, 'noanimation');
					window.setTimeout(() => {
						DomUtils.removeClass(this._domNode, 'noanimation');
					}, 200);
				}
			}, 0);
			this._codeEditor.layoutOverlayWidget(this);
		}
	}

	private _hide(focusTheEditor:boolean): void {
		if (this._isVisible) {
			this._findInput.disable();
			this._replaceInputBox.disable();
			this._toggleSelectionFind.disable();
			this._closeBtn.setEnabled(false);

			this._prevBtn.setEnabled(false);
			this._nextBtn.setEnabled(false);
			this._replaceBtn.setEnabled(false);
			this._replaceAllBtn.setEnabled(false);

			DomUtils.removeClass(this._domNode, 'visible');
			this._isVisible = false;
			if (focusTheEditor) {
				this._codeEditor.focus();
			}
			this._codeEditor.layoutOverlayWidget(this);
		}
	}

	public addUserInputEventListener(callback:(e:IUserInputEvent)=>void): Lifecycle.IDisposable {
		return this.addListener2(FindWidget._USER_INPUT_EVENT, callback);
	}

	private _emitUserInputEvent(jumpToNextMatch:boolean): void {
		var e:IUserInputEvent = {
			jumpToNextMatch: jumpToNextMatch
		};
		this.emit(FindWidget._USER_INPUT_EVENT, e);
	}

	public addClosedEventListener(callback:()=>void): Lifecycle.IDisposable {
		return this.addListener2(FindWidget._USER_CLOSED_EVENT, callback);
	}

	private _emitClosedEvent(): void {
		this.emit(FindWidget._USER_CLOSED_EVENT);
	}
}

export class Checkbox implements Lifecycle.IDisposable {

	private static COUNTER = 0;
	private _domNode:HTMLElement;
	private _checkbox:HTMLInputElement;
	private label:HTMLLabelElement;

	constructor(parent: HTMLElement, title: string) {
		this._domNode = document.createElement('div');
		this._domNode.className = 'monaco-checkbox';
		this._domNode.title = title;

		this._checkbox = document.createElement('input');
		this._checkbox.type = 'checkbox';
		this._checkbox.className = 'checkbox';
		this._checkbox.id = 'checkbox-' + Checkbox.COUNTER++;

		this.label = document.createElement('label');
		this.label.className = 'label';
		// Connect the label and the checkbox. Checkbox will get checked when the label recieves a click.
		this.label.htmlFor = this._checkbox.id;

		this._domNode.appendChild(this._checkbox);
		this._domNode.appendChild(this.label);

		parent.appendChild(this._domNode);
	}

	public get domNode(): HTMLElement {
		return this._domNode;
	}

	public get checkbox(): HTMLInputElement {
		return this._checkbox;
	}

	public focus(): void {
		this._checkbox.focus();
	}

	public enable(): void {
		this._checkbox.removeAttribute('disabled');
	}

	public disable(): void {
		this._checkbox.disabled = true;
	}

	public dispose(): void {
		this._domNode = null;
		this._checkbox = null;
		this.label = null;
	}
}

class SimpleButton implements Lifecycle.IDisposable {

	private _onTrigger:()=>void;
	private _onKeyDown:(e:DomUtils.IKeyboardEvent)=>void;
	private _domNode:HTMLElement;
	private _toDispose:Lifecycle.IDisposable[];

	constructor(label:string, className:string) {

		this._onTrigger = null;
		this._onKeyDown = null;

		this._domNode = document.createElement('div');
		this._domNode.title = label;
		this._domNode.tabIndex = -1;
		this._domNode.className = 'button ' + className;
		this._domNode.setAttribute('role', 'button');
		this._domNode.setAttribute('aria-label', label);

		this._toDispose = [];
		this._toDispose.push(DomUtils.addStandardDisposableListener(this._domNode, 'click', (e) => {
			this._invokeOnTrigger();
			e.preventDefault();
		}));
		this._toDispose.push(DomUtils.addStandardDisposableListener(this._domNode, 'keydown', (e) => {
			if (e.equals(CommonKeybindings.SPACE) || e.equals(CommonKeybindings.ENTER)) {
				this._invokeOnTrigger();
				e.preventDefault();
				return;
			}
			this._invokeOnKeyDown(e);
		}));
	}

	public dispose(): void {
		this._toDispose = Lifecycle.disposeAll(this._toDispose);
	}

	public get domNode(): HTMLElement {
		return this._domNode;
	}

	public focus(): void {
		this._domNode.focus();
	}

	public setEnabled(enabled:boolean): void {
		DomUtils.toggleClass(this._domNode, 'disabled', !enabled);
		this._domNode.setAttribute('aria-disabled', String(!enabled));
		this._domNode.tabIndex = enabled ? 0 : -1;
	}

	public setExpanded(expanded:boolean): void {
		this._domNode.setAttribute('aria-expanded', String(expanded));
	}

	public toggleClass(className:string, shouldHaveIt:boolean): void {
		DomUtils.toggleClass(this._domNode, className, shouldHaveIt);
	}

	public onTrigger(onTrigger:()=>void): SimpleButton {
		this._onTrigger = onTrigger;
		return this;
	}

	public onKeyDown(onKeyDown:(e:DomUtils.IKeyboardEvent)=>void): SimpleButton {
		this._onKeyDown = onKeyDown;
		return this;
	}

	private _invokeOnTrigger(): void {
		if (this._onTrigger) {
			this._onTrigger();
		}
	}

	private _invokeOnKeyDown(e:DomUtils.IKeyboardEvent): void {
		if (this._onKeyDown) {
			this._onKeyDown(e);
		}
	}
}
