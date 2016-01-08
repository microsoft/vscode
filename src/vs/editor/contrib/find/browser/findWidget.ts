/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./findWidget';

import * as nls from 'vs/nls';
import * as Errors from 'vs/base/common/errors';
import * as DomUtils from 'vs/base/browser/dom';
import {IContextViewProvider} from 'vs/base/browser/ui/contextview/contextview';
import {StandardKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import {InputBox, IMessage as InputBoxMessage} from 'vs/base/browser/ui/inputbox/inputBox';
import {FindInput} from 'vs/base/browser/ui/findinput/findInput';
import * as EditorBrowser from 'vs/editor/browser/editorBrowser';
import * as EditorCommon from 'vs/editor/common/editorCommon';
import {FindIds} from 'vs/editor/contrib/find/common/findModel';
import {disposeAll, IDisposable} from 'vs/base/common/lifecycle';
import {CommonKeybindings} from 'vs/base/common/keyCodes';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {INewFindReplaceState, FindReplaceStateChangedEvent, FindReplaceState} from 'vs/editor/contrib/find/common/findState';

export interface IFindController {
	replace(): void;
	replaceAll(): void;
}

const NLS_FIND_INPUT_LABEL = nls.localize('label.find', "Find");
const NLS_FIND_INPUT_PLACEHOLDER = nls.localize('placeholder.find', "Find");
const NLS_PREVIOUS_MATCH_BTN_LABEL = nls.localize('label.previousMatchButton', "Previous match");
const NLS_NEXT_MATCH_BTN_LABEL = nls.localize('label.nextMatchButton', "Next match");
const NLS_TOGGLE_SELECTION_FIND_TITLE = nls.localize('label.toggleSelectionFind', "Find in selection");
const NLS_CLOSE_BTN_LABEL = nls.localize('label.closeButton', "Close");
const NLS_REPLACE_INPUT_LABEL = nls.localize('label.replace', "Replace");
const NLS_REPLACE_INPUT_PLACEHOLDER = nls.localize('placeholder.replace', "Replace");
const NLS_REPLACE_BTN_LABEL = nls.localize('label.replaceButton', "Replace");
const NLS_REPLACE_ALL_BTN_LABEL = nls.localize('label.replaceAllButton', "Replace All");
const NLS_TOGGLE_REPLACE_MODE_BTN_LABEL = nls.localize('label.toggleReplaceButton', "Toggle Replace mode");

export class FindWidget implements EditorBrowser.IOverlayWidget {

	private static ID = 'editor.contrib.findWidget';
	private static PART_WIDTH = 275;
	private static FIND_INPUT_AREA_WIDTH = FindWidget.PART_WIDTH - 54;
	private static REPLACE_INPUT_AREA_WIDTH = FindWidget.FIND_INPUT_AREA_WIDTH;

	private _codeEditor: EditorBrowser.ICodeEditor;
	private _state: FindReplaceState;
	private _controller: IFindController;
	private _contextViewProvider: IContextViewProvider;
	private _keybindingService: IKeybindingService;

	private _domNode: HTMLElement;
	private _findInput: FindInput;
	private _replaceInputBox: InputBox;

	private _toggleReplaceBtn: SimpleButton;
	private _prevBtn: SimpleButton;
	private _nextBtn: SimpleButton;
	private _toggleSelectionFind: Checkbox;
	private _closeBtn: SimpleButton;
	private _replaceBtn: SimpleButton;
	private _replaceAllBtn: SimpleButton;

	private _isReplaceEnabled: boolean;
	private _isVisible: boolean;
	private _isReplaceVisible: boolean;

	private _toDispose: IDisposable[];

	private focusTracker: DomUtils.IFocusTracker;

	constructor(
		codeEditor: EditorBrowser.ICodeEditor,
		controller: IFindController,
		state: FindReplaceState,
		contextViewProvider: IContextViewProvider,
		keybindingService: IKeybindingService
	) {
		this._codeEditor = codeEditor;
		this._controller = controller;
		this._state = state;
		this._contextViewProvider = contextViewProvider;
		this._keybindingService = keybindingService;

		this._isVisible = false;
		this._isReplaceVisible = false;
		this._isReplaceEnabled = false;
		this._toDispose = [];

		this._toDispose.push(this._state.addChangeListener((e) => this._onStateChanged(e)));

		this._buildDomNode();

		this.focusTracker = DomUtils.trackFocus(this._findInput.inputBox.inputElement);
		this.focusTracker.addFocusListener(() => this._reseedFindScope());
		this._toDispose.push(this.focusTracker);

		this._toDispose.push({
			dispose: () => {
				this._findInput.destroy();
			}
		});
		this._toDispose.push(this._replaceInputBox);

		this._codeEditor.addOverlayWidget(this);
	}

	public dispose(): void {
		this._toDispose = disposeAll(this._toDispose);
	}

	private _reseedFindScope(): void {
		let selection = this._codeEditor.getSelection();
		if (selection.startLineNumber !== selection.endLineNumber) {
			// Reseed find scope
			this._state.change({ searchScope: selection }, true);
		}
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

	// ----- React to state changes

	private _onStateChanged(e:FindReplaceStateChangedEvent): void {
		if (e.searchString) {
			this._findInput.setValue(this._state.searchString);

			let findInputIsNonEmpty = (this._state.searchString.length > 0);
			this._prevBtn.setEnabled(findInputIsNonEmpty);
			this._nextBtn.setEnabled(findInputIsNonEmpty);
			this._replaceBtn.setEnabled(findInputIsNonEmpty);
			this._replaceAllBtn.setEnabled(findInputIsNonEmpty);
		}
		if (e.replaceString) {
			this._replaceInputBox.value = this._state.replaceString;
		}
		if (e.isRevealed) {
			if (this._state.isRevealed) {
				this._reveal(true);
			} else {
				this._hide(true);
			}
		}
		if (e.isReplaceRevealed) {
			if (this._state.isReplaceRevealed) {
				this._enableReplace();
			} else {
				this._disableReplace();
			}
		}
		if (e.isRegex) {
			this._findInput.setRegex(this._state.isRegex);
		}
		if (e.wholeWord) {
			this._findInput.setWholeWords(this._state.wholeWord);
		}
		if (e.matchCase) {
			this._findInput.setCaseSensitive(this._state.matchCase);
		}
		if (e.searchScope) {
			if (this._state.searchScope) {
				this._toggleSelectionFind.checkbox.checked = true;
			} else {
				this._toggleSelectionFind.checkbox.checked = false;
			}
			this._updateToggleSelectionFindButton();
		}
		if (e.searchString || e.matchesCount) {
			let showRedOutline = (this._state.searchString.length > 0 && this._state.matchesCount === 0);
			DomUtils.toggleClass(this._domNode, 'no-results', showRedOutline);
		}
	}

	// ----- Public

	public focusFindInput(): void {
		this._findInput.select();
		// Edge browser requires focus() in addition to select()
		this._findInput.focus();
	}

	public focusReplaceInput(): void {
		this._replaceInputBox.select();
		// Edge browser requires focus() in addition to select()
		this._replaceInputBox.focus();
	}

	private _enableReplace(): void {
		this._isReplaceEnabled = true;
		if (!this._codeEditor.getConfiguration().readOnly && !this._isReplaceVisible) {
			this._replaceInputBox.enable();
			this._isReplaceVisible = true;
			DomUtils.addClass(this._domNode, 'replaceToggled');
			this._toggleReplaceBtn.toggleClass('collapse', false);
			this._toggleReplaceBtn.toggleClass('expand', true);
			this._toggleReplaceBtn.setExpanded(true);
		}
	}

	private _disableReplace(): void {
		this._isReplaceEnabled = false;
		if (this._isReplaceVisible) {
			this._replaceInputBox.disable();
			DomUtils.removeClass(this._domNode, 'replaceToggled');
			this._toggleReplaceBtn.toggleClass('expand', false);
			this._toggleReplaceBtn.toggleClass('collapse', true);
			this._toggleReplaceBtn.setExpanded(false);
			this._isReplaceVisible = false;
		}
	}

	private _onFindInputKeyDown(e:DomUtils.IKeyboardEvent): void {

		let handled = false;

		if (e.equals(CommonKeybindings.ENTER)) {
			this._codeEditor.getAction(FindIds.NEXT_MATCH_FIND_ACTION_ID).run().done(null, Errors.onUnexpectedError);
			handled = true;
		} else if (e.equals(CommonKeybindings.SHIFT_ENTER)) {
			this._codeEditor.getAction(FindIds.PREVIOUS_MATCH_FIND_ACTION_ID).run().done(null, Errors.onUnexpectedError);
			handled = true;
		} else if (e.equals(CommonKeybindings.TAB)) {
			if (this._isReplaceVisible) {
				this._replaceInputBox.focus();
			} else {
				this._findInput.focusOnCaseSensitive();
			}
			handled = true;
		} else if (e.equals(CommonKeybindings.CTRLCMD_DOWN_ARROW)) {
			this._codeEditor.focus();
			handled = true;
		}

		if (handled) {
			e.preventDefault();
		} else {
			// getValue() is not updated right away
			setTimeout(() => {
				this._state.change({ searchString: this._findInput.getValue() }, true);
			}, 10);
		}
	}

	private _onReplaceInputKeyDown(e:DomUtils.IKeyboardEvent): void {

		let handled = false;

		if (e.equals(CommonKeybindings.ENTER)) {
			this._controller.replace();
			handled = true;
		} else if (e.equals(CommonKeybindings.CTRLCMD_ENTER)) {
			this._controller.replaceAll();
			handled = true;
		} else if (e.equals(CommonKeybindings.TAB)) {
			this._findInput.focusOnCaseSensitive();
			handled = true;
		} else if (e.equals(CommonKeybindings.CTRLCMD_DOWN_ARROW)) {
			this._codeEditor.focus();
			handled = true;
		}

		if (handled) {
			e.preventDefault();
		} else {
			setTimeout(() => {
				this._state.change({ replaceString: this._replaceInputBox.value }, false);
			}, 10);
		}
	}

	// ----- initialization

	private _keybindingLabelFor(actionId:string): string {
		let keybindings = this._keybindingService.lookupKeybindings(actionId);
		if (keybindings.length === 0) {
			return '';
		}
		return ' (' + this._keybindingService.getLabelFor(keybindings[0]) + ')';
	}

	private _buildFindPart(): HTMLElement {
		// Find input
		this._findInput = new FindInput(null, this._contextViewProvider, {
			width: FindWidget.FIND_INPUT_AREA_WIDTH,
			label: NLS_FIND_INPUT_LABEL,
			placeholder: NLS_FIND_INPUT_PLACEHOLDER,
			appendCaseSensitiveLabel: this._keybindingLabelFor(FindIds.TOGGLE_CASE_SENSITIVE_COMMAND_ID),
			appendWholeWordsLabel: this._keybindingLabelFor(FindIds.TOGGLE_WHOLE_WORD_COMMAND_ID),
			appendRegexLabel: this._keybindingLabelFor(FindIds.TOGGLE_REGEX_COMMAND_ID),
			validation: (value:string): InputBoxMessage => {
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
			this._onFindInputKeyDown(new StandardKeyboardEvent(browserEvent));
		}).on(FindInput.OPTION_CHANGE, () => {
			this._state.change({
				isRegex: this._findInput.getRegex(),
				wholeWord: this._findInput.getWholeWords(),
				matchCase: this._findInput.getCaseSensitive()
			}, true);
		});

		this._findInput.disable();

		// Previous button
		this._prevBtn = new SimpleButton({
			label: NLS_PREVIOUS_MATCH_BTN_LABEL + this._keybindingLabelFor(FindIds.PREVIOUS_MATCH_FIND_ACTION_ID),
			className: 'previous',
			onTrigger: () => {
				this._codeEditor.getAction(FindIds.PREVIOUS_MATCH_FIND_ACTION_ID).run().done(null, Errors.onUnexpectedError);
			},
			onKeyDown: (e) => {}
		});
		this._toDispose.push(this._prevBtn);

		// Next button
		this._nextBtn = new SimpleButton({
			label: NLS_NEXT_MATCH_BTN_LABEL + this._keybindingLabelFor(FindIds.NEXT_MATCH_FIND_ACTION_ID),
			className: 'next',
			onTrigger: () => {
				this._codeEditor.getAction(FindIds.NEXT_MATCH_FIND_ACTION_ID).run().done(null, Errors.onUnexpectedError);
			},
			onKeyDown: (e) => {}
		});
		this._toDispose.push(this._nextBtn);

		let findPart = document.createElement('div');
		findPart.className = 'find-part';
		findPart.appendChild(this._findInput.domNode);
		findPart.appendChild(this._prevBtn.domNode);
		findPart.appendChild(this._nextBtn.domNode);

		// Toggle selection button
		this._toggleSelectionFind = new Checkbox(findPart, NLS_TOGGLE_SELECTION_FIND_TITLE);
		this._toggleSelectionFind.disable();
		this._toDispose.push(DomUtils.addStandardDisposableListener(this._toggleSelectionFind.checkbox, 'change', (e) => {
			if (this._toggleSelectionFind.checkbox.checked) {
				this._reseedFindScope();
			} else {
				this._state.change({ searchScope: null }, true);
			}
		}));

		this._codeEditor.addListener(EditorCommon.EventType.CursorSelectionChanged, () => {
			this._updateToggleSelectionFindButton();
		});

		// Close button
		this._closeBtn = new SimpleButton({
			label: NLS_CLOSE_BTN_LABEL + this._keybindingLabelFor(FindIds.CLOSE_FIND_WIDGET_COMMAND_ID),
			className: 'close-fw',
			onTrigger: () => {
				this._state.change({ isRevealed: false }, false);
			},
			onKeyDown: (e) => {
				if (this._isReplaceVisible) {
					this._replaceBtn.focus();
					e.preventDefault();
				}
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
			let selection = this._codeEditor.getSelection();

			if (selection.startLineNumber === selection.endLineNumber) {
				this._toggleSelectionFind.disable();
			} else {
				this._toggleSelectionFind.enable();
			}
		}
	}

	private _buildReplacePart(): HTMLElement {
		// Replace input
		let replaceInput = document.createElement('div');
		replaceInput.className = 'replace-input';
		replaceInput.style.width = FindWidget.REPLACE_INPUT_AREA_WIDTH + 'px';
		this._replaceInputBox = new InputBox(replaceInput, null, {
			ariaLabel: NLS_REPLACE_INPUT_LABEL,
			placeholder: NLS_REPLACE_INPUT_PLACEHOLDER
		});

		this._toDispose.push(DomUtils.addStandardDisposableListener(this._replaceInputBox.inputElement, 'keydown', (e) => this._onReplaceInputKeyDown(e)));
		this._replaceInputBox.disable();

		// Replace one button
		this._replaceBtn = new SimpleButton({
			label: NLS_REPLACE_BTN_LABEL,
			className: 'replace',
			onTrigger: () => {
				this._controller.replace();
			},
			onKeyDown: (e) => {}
		});
		this._toDispose.push(this._replaceBtn);

		// Replace all button
		this._replaceAllBtn = new SimpleButton({
			label: NLS_REPLACE_ALL_BTN_LABEL,
			className: 'replace-all',
			onTrigger: () => {
				this._controller.replaceAll();
			},
			onKeyDown: (e) => {}
		});
		this._toDispose.push(this._replaceAllBtn);

		let replacePart = document.createElement('div');
		replacePart.className = 'replace-part';
		replacePart.appendChild(replaceInput);
		replacePart.appendChild(this._replaceBtn.domNode);
		replacePart.appendChild(this._replaceAllBtn.domNode);

		return replacePart;
	}

	private _buildDomNode(): void {
		// Find part
		let findPart = this._buildFindPart();

		// Replace part
		let replacePart = this._buildReplacePart();

		// Toggle replace button
		this._toggleReplaceBtn = new SimpleButton({
			label: NLS_TOGGLE_REPLACE_MODE_BTN_LABEL,
			className: 'toggle left',
			onTrigger: () => {
				this._state.change({ isReplaceRevealed: !this._isReplaceVisible }, true);
			},
			onKeyDown: (e) => {}
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

			let findInputIsNonEmpty = (this._state.searchString.length > 0);
			this._prevBtn.setEnabled(findInputIsNonEmpty);
			this._nextBtn.setEnabled(findInputIsNonEmpty);
			this._replaceBtn.setEnabled(findInputIsNonEmpty);
			this._replaceAllBtn.setEnabled(findInputIsNonEmpty);

			this._isVisible = true;
			setTimeout(() => {
				DomUtils.addClass(this._domNode, 'visible');
				if (!animate) {
					DomUtils.addClass(this._domNode, 'noanimation');
					setTimeout(() => {
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
}

export class Checkbox {

	private static _COUNTER = 0;

	private _domNode: HTMLElement;
	private _checkbox: HTMLInputElement;
	private _label: HTMLLabelElement;

	constructor(parent: HTMLElement, title: string) {
		this._domNode = document.createElement('div');
		this._domNode.className = 'monaco-checkbox';
		this._domNode.title = title;

		this._checkbox = document.createElement('input');
		this._checkbox.type = 'checkbox';
		this._checkbox.className = 'checkbox';
		this._checkbox.id = 'checkbox-' + Checkbox._COUNTER++;

		this._label = document.createElement('label');
		this._label.className = 'label';
		// Connect the label and the checkbox. Checkbox will get checked when the label recieves a click.
		this._label.htmlFor = this._checkbox.id;

		this._domNode.appendChild(this._checkbox);
		this._domNode.appendChild(this._label);

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
}

interface ISimpleButtonOpts {
	label: string;
	className: string;
	onTrigger: ()=>void;
	onKeyDown: (e:DomUtils.IKeyboardEvent)=>void;
}

class SimpleButton implements IDisposable {

	private _opts: ISimpleButtonOpts;
	private _domNode: HTMLElement;
	private _toDispose: IDisposable[];

	constructor(opts:ISimpleButtonOpts) {
		this._opts = opts;

		this._domNode = document.createElement('div');
		this._domNode.title = this._opts.label;
		this._domNode.tabIndex = -1;
		this._domNode.className = 'button ' + this._opts.className;
		this._domNode.setAttribute('role', 'button');
		this._domNode.setAttribute('aria-label', this._opts.label);

		this._toDispose = [];
		this._toDispose.push(DomUtils.addStandardDisposableListener(this._domNode, 'click', (e) => {
			this._opts.onTrigger();
			e.preventDefault();
		}));
		this._toDispose.push(DomUtils.addStandardDisposableListener(this._domNode, 'keydown', (e) => {
			if (e.equals(CommonKeybindings.SPACE) || e.equals(CommonKeybindings.ENTER)) {
				this._opts.onTrigger();
				e.preventDefault();
				return;
			}
			this._opts.onKeyDown(e);
		}));
	}

	public dispose(): void {
		this._toDispose = disposeAll(this._toDispose);
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
}
