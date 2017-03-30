/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./findWidget';
import * as nls from 'vs/nls';
import { onUnexpectedError } from 'vs/base/common/errors';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import * as strings from 'vs/base/common/strings';
import * as dom from 'vs/base/browser/dom';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IContextViewProvider } from 'vs/base/browser/ui/contextview/contextview';
import { FindInput } from 'vs/base/browser/ui/findinput/findInput';
import { IMessage as InputBoxMessage, InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { Widget } from 'vs/base/browser/ui/widget';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IConfigurationChangedEvent } from 'vs/editor/common/editorCommon';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference } from 'vs/editor/browser/editorBrowser';
import { FIND_IDS, MATCHES_LIMIT } from 'vs/editor/contrib/find/common/findModel';
import { FindReplaceState, FindReplaceStateChangedEvent } from 'vs/editor/contrib/find/common/findState';
import { Range } from 'vs/editor/common/core/range';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { CONTEXT_FIND_INPUT_FOCUSSED } from 'vs/editor/contrib/find/common/findController';
import { ITheme, registerThemingParticipant, IThemeService } from 'vs/platform/theme/common/themeService';
import { Color } from 'vs/base/common/color';
import { editorFindRangeHighlight, editorFindMatch, editorFindMatchHighlight, highContrastOutline, highContrastBorder, inputBackground as findInputBackground, editorFindWidgetBackground, inputActiveOptionBorder } from "vs/platform/theme/common/colorRegistry";

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
const NLS_MATCHES_COUNT_LIMIT_TITLE = nls.localize('title.matchesCountLimit', "Only the first 999 results are highlighted, but all find operations work on the entire text.");
const NLS_MATCHES_LOCATION = nls.localize('label.matchesLocation', "{0} of {1}");
const NLS_NO_RESULTS = nls.localize('label.noResults', "No Results");

let MAX_MATCHES_COUNT_WIDTH = 69;
const WIDGET_FIXED_WIDTH = 411 - 69;

export class FindWidget extends Widget implements IOverlayWidget {

	private static ID = 'editor.contrib.findWidget';
	private static PART_WIDTH = 275;
	private static FIND_INPUT_AREA_WIDTH = FindWidget.PART_WIDTH - 54;
	private static REPLACE_INPUT_AREA_WIDTH = FindWidget.FIND_INPUT_AREA_WIDTH;

	private _codeEditor: ICodeEditor;
	private _state: FindReplaceState;
	private _controller: IFindController;
	private _contextViewProvider: IContextViewProvider;
	private _keybindingService: IKeybindingService;

	private _domNode: HTMLElement;
	private _findInput: FindInput;
	private _replaceInputBox: InputBox;

	private _toggleReplaceBtn: SimpleButton;
	private _matchesCount: HTMLElement;
	private _prevBtn: SimpleButton;
	private _nextBtn: SimpleButton;
	private _toggleSelectionFind: SimpleCheckbox;
	private _closeBtn: SimpleButton;
	private _replaceBtn: SimpleButton;
	private _replaceAllBtn: SimpleButton;

	private _isVisible: boolean;
	private _isReplaceVisible: boolean;

	private _focusTracker: dom.IFocusTracker;
	private _findInputFocussed: IContextKey<boolean>;

	constructor(
		codeEditor: ICodeEditor,
		controller: IFindController,
		state: FindReplaceState,
		contextViewProvider: IContextViewProvider,
		keybindingService: IKeybindingService,
		contextKeyService: IContextKeyService,
		themeService: IThemeService
	) {
		super();
		this._codeEditor = codeEditor;
		this._controller = controller;
		this._state = state;
		this._contextViewProvider = contextViewProvider;
		this._keybindingService = keybindingService;

		this._isVisible = false;
		this._isReplaceVisible = false;

		this._register(this._state.addChangeListener((e) => this._onStateChanged(e)));

		this._buildDomNode();
		this._updateButtons();

		let checkEditorWidth = () => {
			let editorWidth = this._codeEditor.getConfiguration().layoutInfo.width;
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
			dom.toggleClass(this._domNode, 'collapsed-find-widget', collapsedFindWidget);
			dom.toggleClass(this._domNode, 'reduced-find-widget', reducedFindWidget);
			dom.toggleClass(this._domNode, 'narrow-find-widget', narrowFindWidget);
		};
		checkEditorWidth();

		this._register(this._codeEditor.onDidChangeConfiguration((e: IConfigurationChangedEvent) => {
			if (e.readOnly) {
				if (this._codeEditor.getConfiguration().readOnly) {
					// Hide replace part if editor becomes read only
					this._state.change({ isReplaceRevealed: false }, false);
				}
				this._updateButtons();
			}
			if (e.layoutInfo) {
				checkEditorWidth();
			}
		}));
		this._register(this._codeEditor.onDidChangeCursorSelection(() => {
			if (this._isVisible) {
				this._updateToggleSelectionFindButton();
			}
		}));
		this._findInputFocussed = CONTEXT_FIND_INPUT_FOCUSSED.bindTo(contextKeyService);
		this._focusTracker = this._register(dom.trackFocus(this._findInput.inputBox.inputElement));
		this._focusTracker.addFocusListener(() => {
			this._findInputFocussed.set(true);

			if (this._toggleSelectionFind.checked) {
				let selection = this._codeEditor.getSelection();
				if (selection.endColumn === 1 && selection.endLineNumber > selection.startLineNumber) {
					selection = selection.setEndPosition(selection.endLineNumber - 1, 1);
				}
				let currentMatch = this._state.currentMatch;
				if (selection.startLineNumber !== selection.endLineNumber) {
					if (!Range.equalsRange(selection, currentMatch)) {
						// Reseed find scope
						this._state.change({ searchScope: selection }, true);
					}
				}
			}
		});
		this._focusTracker.addBlurListener(() => {
			this._findInputFocussed.set(false);
		});

		this._codeEditor.addOverlayWidget(this);

		this._applyTheme(themeService.getTheme());
		this._register(themeService.onThemeChange(this._applyTheme.bind(this)));
	}

	// ----- IOverlayWidget API

	public getId(): string {
		return FindWidget.ID;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public getPosition(): IOverlayWidgetPosition {
		if (this._isVisible) {
			return {
				preference: OverlayWidgetPositionPreference.TOP_RIGHT_CORNER
			};
		}
		return null;
	}

	// ----- React to state changes

	private _onStateChanged(e: FindReplaceStateChangedEvent): void {
		if (e.searchString) {
			this._findInput.setValue(this._state.searchString);
			this._updateButtons();
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
				if (!this._codeEditor.getConfiguration().readOnly && !this._isReplaceVisible) {
					this._isReplaceVisible = true;
					this._updateButtons();
				}
			} else {
				if (this._isReplaceVisible) {
					this._isReplaceVisible = false;
					this._updateButtons();
				}
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
				this._toggleSelectionFind.checked = true;
			} else {
				this._toggleSelectionFind.checked = false;
			}
			this._updateToggleSelectionFindButton();
		}
		if (e.searchString || e.matchesCount || e.matchesPosition) {
			let showRedOutline = (this._state.searchString.length > 0 && this._state.matchesCount === 0);
			dom.toggleClass(this._domNode, 'no-results', showRedOutline);

			this._updateMatchesCount();
		}
	}

	private _updateMatchesCount(): void {
		this._matchesCount.style.minWidth = MAX_MATCHES_COUNT_WIDTH + 'px';
		if (this._state.matchesCount >= MATCHES_LIMIT) {
			this._matchesCount.title = NLS_MATCHES_COUNT_LIMIT_TITLE;
		} else {
			this._matchesCount.title = '';
		}

		// remove previous content
		if (this._matchesCount.firstChild) {
			this._matchesCount.removeChild(this._matchesCount.firstChild);
		}

		let label: string;
		if (this._state.matchesCount > 0) {
			let matchesCount: string = String(this._state.matchesCount);
			if (this._state.matchesCount >= MATCHES_LIMIT) {
				matchesCount += '+';
			}
			let matchesPosition: string = String(this._state.matchesPosition);
			if (matchesPosition === '0') {
				matchesPosition = '?';
			}
			label = strings.format(NLS_MATCHES_LOCATION, matchesPosition, matchesCount);
		} else {
			label = NLS_NO_RESULTS;
		}
		this._matchesCount.appendChild(document.createTextNode(label));

		MAX_MATCHES_COUNT_WIDTH = Math.max(MAX_MATCHES_COUNT_WIDTH, this._matchesCount.clientWidth);
	}

	// ----- actions

	/**
	 * If 'selection find' is ON we should not disable the button (its function is to cancel 'selection find').
	 * If 'selection find' is OFF we enable the button only if there is a selection.
	 */
	private _updateToggleSelectionFindButton(): void {
		let selection = this._codeEditor.getSelection();
		let isSelection = selection ? (selection.startLineNumber !== selection.endLineNumber || selection.startColumn !== selection.endColumn) : false;
		let isChecked = this._toggleSelectionFind.checked;

		this._toggleSelectionFind.setEnabled(this._isVisible && (isChecked || isSelection));
	}

	private _updateButtons(): void {
		this._findInput.setEnabled(this._isVisible);
		this._replaceInputBox.setEnabled(this._isVisible && this._isReplaceVisible);
		this._updateToggleSelectionFindButton();
		this._closeBtn.setEnabled(this._isVisible);

		let findInputIsNonEmpty = (this._state.searchString.length > 0);
		this._prevBtn.setEnabled(this._isVisible && findInputIsNonEmpty);
		this._nextBtn.setEnabled(this._isVisible && findInputIsNonEmpty);
		this._replaceBtn.setEnabled(this._isVisible && this._isReplaceVisible && findInputIsNonEmpty);
		this._replaceAllBtn.setEnabled(this._isVisible && this._isReplaceVisible && findInputIsNonEmpty);

		dom.toggleClass(this._domNode, 'replaceToggled', this._isReplaceVisible);
		this._toggleReplaceBtn.toggleClass('collapse', !this._isReplaceVisible);
		this._toggleReplaceBtn.toggleClass('expand', this._isReplaceVisible);
		this._toggleReplaceBtn.setExpanded(this._isReplaceVisible);

		let canReplace = !this._codeEditor.getConfiguration().readOnly;
		this._toggleReplaceBtn.setEnabled(this._isVisible && canReplace);
	}

	private _reveal(animate: boolean): void {
		if (!this._isVisible) {
			this._isVisible = true;

			this._updateButtons();

			setTimeout(() => {
				dom.addClass(this._domNode, 'visible');
				if (!animate) {
					dom.addClass(this._domNode, 'noanimation');
					setTimeout(() => {
						dom.removeClass(this._domNode, 'noanimation');
					}, 200);
				}
			}, 0);
			this._codeEditor.layoutOverlayWidget(this);
		}
	}

	private _hide(focusTheEditor: boolean): void {
		if (this._isVisible) {
			this._isVisible = false;

			this._updateButtons();

			dom.removeClass(this._domNode, 'visible');
			if (focusTheEditor) {
				this._codeEditor.focus();
			}
			this._codeEditor.layoutOverlayWidget(this);
		}
	}

	private _applyTheme(theme: ITheme) {
		let inputStyles = { inputActiveOptionBorder: theme.getColor(inputActiveOptionBorder) };
		this._findInput.style(inputStyles);
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

	public highlightFindOptions(): void {
		this._findInput.highlightFindOptions();
	}

	private _onFindInputKeyDown(e: IKeyboardEvent): void {

		if (e.equals(KeyCode.Enter)) {
			this._codeEditor.getAction(FIND_IDS.NextMatchFindAction).run().done(null, onUnexpectedError);
			e.preventDefault();
			return;
		}

		if (e.equals(KeyMod.Shift | KeyCode.Enter)) {
			this._codeEditor.getAction(FIND_IDS.PreviousMatchFindAction).run().done(null, onUnexpectedError);
			e.preventDefault();
			return;
		}

		if (e.equals(KeyCode.Tab)) {
			if (this._isReplaceVisible) {
				this._replaceInputBox.focus();
			} else {
				this._findInput.focusOnCaseSensitive();
			}
			e.preventDefault();
			return;
		}

		if (e.equals(KeyMod.CtrlCmd | KeyCode.DownArrow)) {
			this._codeEditor.focus();
			e.preventDefault();
			return;
		}
	}

	private _onReplaceInputKeyDown(e: IKeyboardEvent): void {

		if (e.equals(KeyCode.Enter)) {
			this._controller.replace();
			e.preventDefault();
			return;
		}

		if (e.equals(KeyMod.CtrlCmd | KeyCode.Enter)) {
			this._controller.replaceAll();
			e.preventDefault();
			return;
		}

		if (e.equals(KeyCode.Tab)) {
			this._findInput.focusOnCaseSensitive();
			e.preventDefault();
			return;
		}

		if (e.equals(KeyMod.Shift | KeyCode.Tab)) {
			this._findInput.focus();
			e.preventDefault();
			return;
		}

		if (e.equals(KeyMod.CtrlCmd | KeyCode.DownArrow)) {
			this._codeEditor.focus();
			e.preventDefault();
			return;
		}
	}

	// ----- initialization

	private _keybindingLabelFor(actionId: string): string {
		let kb = this._keybindingService.lookupKeybinding(actionId);
		if (!kb) {
			return '';
		}
		return ` (${kb.getLabel()})`;
	}

	private _buildFindPart(): HTMLElement {
		// Find input
		this._findInput = this._register(new FindInput(null, this._contextViewProvider, {
			width: FindWidget.FIND_INPUT_AREA_WIDTH,
			label: NLS_FIND_INPUT_LABEL,
			placeholder: NLS_FIND_INPUT_PLACEHOLDER,
			appendCaseSensitiveLabel: this._keybindingLabelFor(FIND_IDS.ToggleCaseSensitiveCommand),
			appendWholeWordsLabel: this._keybindingLabelFor(FIND_IDS.ToggleWholeWordCommand),
			appendRegexLabel: this._keybindingLabelFor(FIND_IDS.ToggleRegexCommand),
			validation: (value: string): InputBoxMessage => {
				if (value.length === 0) {
					return null;
				}
				if (!this._findInput.getRegex()) {
					return null;
				}
				try {
					/* tslint:disable:no-unused-expression */
					new RegExp(value);
					/* tslint:enable:no-unused-expression */
					return null;
				} catch (e) {
					return { content: e.message };
				}
			}
		}));
		this._register(this._findInput.onKeyDown((e) => this._onFindInputKeyDown(e)));
		this._register(this._findInput.onInput(() => {
			this._state.change({ searchString: this._findInput.getValue() }, true);
		}));
		this._register(this._findInput.onDidOptionChange(() => {
			this._state.change({
				isRegex: this._findInput.getRegex(),
				wholeWord: this._findInput.getWholeWords(),
				matchCase: this._findInput.getCaseSensitive()
			}, true);
		}));
		this._register(this._findInput.onCaseSensitiveKeyDown((e) => {
			if (e.equals(KeyMod.Shift | KeyCode.Tab)) {
				if (this._isReplaceVisible) {
					this._replaceInputBox.focus();
					e.preventDefault();
				}
			}
		}));

		this._matchesCount = document.createElement('div');
		this._matchesCount.className = 'matchesCount';
		this._updateMatchesCount();

		// Previous button
		this._prevBtn = this._register(new SimpleButton({
			label: NLS_PREVIOUS_MATCH_BTN_LABEL + this._keybindingLabelFor(FIND_IDS.PreviousMatchFindAction),
			className: 'previous',
			onTrigger: () => {
				this._codeEditor.getAction(FIND_IDS.PreviousMatchFindAction).run().done(null, onUnexpectedError);
			},
			onKeyDown: (e) => { }
		}));

		// Next button
		this._nextBtn = this._register(new SimpleButton({
			label: NLS_NEXT_MATCH_BTN_LABEL + this._keybindingLabelFor(FIND_IDS.NextMatchFindAction),
			className: 'next',
			onTrigger: () => {
				this._codeEditor.getAction(FIND_IDS.NextMatchFindAction).run().done(null, onUnexpectedError);
			},
			onKeyDown: (e) => { }
		}));

		let findPart = document.createElement('div');
		findPart.className = 'find-part';
		findPart.appendChild(this._findInput.domNode);
		findPart.appendChild(this._matchesCount);
		findPart.appendChild(this._prevBtn.domNode);
		findPart.appendChild(this._nextBtn.domNode);

		// Toggle selection button
		this._toggleSelectionFind = this._register(new SimpleCheckbox({
			parent: findPart,
			title: NLS_TOGGLE_SELECTION_FIND_TITLE,
			onChange: () => {
				if (this._toggleSelectionFind.checked) {
					let selection = this._codeEditor.getSelection();
					if (selection.endColumn === 1 && selection.endLineNumber > selection.startLineNumber) {
						selection = selection.setEndPosition(selection.endLineNumber - 1, 1);
					}
					if (!selection.isEmpty()) {
						this._state.change({ searchScope: selection }, true);
					}
				} else {
					this._state.change({ searchScope: null }, true);
				}
			}
		}));

		// Close button
		this._closeBtn = this._register(new SimpleButton({
			label: NLS_CLOSE_BTN_LABEL + this._keybindingLabelFor(FIND_IDS.CloseFindWidgetCommand),
			className: 'close-fw',
			onTrigger: () => {
				this._state.change({ isRevealed: false }, false);
			},
			onKeyDown: (e) => {
				if (e.equals(KeyCode.Tab)) {
					if (this._isReplaceVisible) {
						if (this._replaceBtn.isEnabled()) {
							this._replaceBtn.focus();
						} else {
							this._codeEditor.focus();
						}
						e.preventDefault();
					}
				}
			}
		}));

		findPart.appendChild(this._closeBtn.domNode);

		return findPart;
	}

	private _buildReplacePart(): HTMLElement {
		// Replace input
		let replaceInput = document.createElement('div');
		replaceInput.className = 'replace-input';
		replaceInput.style.width = FindWidget.REPLACE_INPUT_AREA_WIDTH + 'px';
		this._replaceInputBox = this._register(new InputBox(replaceInput, null, {
			ariaLabel: NLS_REPLACE_INPUT_LABEL,
			placeholder: NLS_REPLACE_INPUT_PLACEHOLDER
		}));

		this._register(dom.addStandardDisposableListener(this._replaceInputBox.inputElement, 'keydown', (e) => this._onReplaceInputKeyDown(e)));
		this._register(dom.addStandardDisposableListener(this._replaceInputBox.inputElement, 'input', (e) => {
			this._state.change({ replaceString: this._replaceInputBox.value }, false);
		}));

		// Replace one button
		this._replaceBtn = this._register(new SimpleButton({
			label: NLS_REPLACE_BTN_LABEL + this._keybindingLabelFor(FIND_IDS.ReplaceOneAction),
			className: 'replace',
			onTrigger: () => {
				this._controller.replace();
			},
			onKeyDown: (e) => {
				if (e.equals(KeyMod.Shift | KeyCode.Tab)) {
					this._closeBtn.focus();
					e.preventDefault();
				}
			}
		}));

		// Replace all button
		this._replaceAllBtn = this._register(new SimpleButton({
			label: NLS_REPLACE_ALL_BTN_LABEL + this._keybindingLabelFor(FIND_IDS.ReplaceAllAction),
			className: 'replace-all',
			onTrigger: () => {
				this._controller.replaceAll();
			},
			onKeyDown: (e) => { }
		}));

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
		this._toggleReplaceBtn = this._register(new SimpleButton({
			label: NLS_TOGGLE_REPLACE_MODE_BTN_LABEL,
			className: 'toggle left',
			onTrigger: () => {
				this._state.change({ isReplaceRevealed: !this._isReplaceVisible }, false);
			},
			onKeyDown: (e) => { }
		}));
		this._toggleReplaceBtn.toggleClass('expand', this._isReplaceVisible);
		this._toggleReplaceBtn.toggleClass('collapse', !this._isReplaceVisible);
		this._toggleReplaceBtn.setExpanded(this._isReplaceVisible);

		// Widget
		this._domNode = document.createElement('div');
		this._domNode.className = 'editor-widget find-widget';
		this._domNode.setAttribute('aria-hidden', 'false');

		this._domNode.appendChild(this._toggleReplaceBtn.domNode);
		this._domNode.appendChild(findPart);
		this._domNode.appendChild(replacePart);
	}
}

interface ISimpleCheckboxOpts {
	parent: HTMLElement;
	title: string;
	onChange: () => void;
}

class SimpleCheckbox extends Widget {

	private static _COUNTER = 0;

	private _opts: ISimpleCheckboxOpts;
	private _domNode: HTMLElement;
	private _checkbox: HTMLInputElement;
	private _label: HTMLLabelElement;

	constructor(opts: ISimpleCheckboxOpts) {
		super();
		this._opts = opts;

		this._domNode = document.createElement('div');
		this._domNode.className = 'monaco-checkbox';
		this._domNode.title = this._opts.title;

		this._checkbox = document.createElement('input');
		this._checkbox.type = 'checkbox';
		this._checkbox.className = 'checkbox';
		this._checkbox.id = 'checkbox-' + SimpleCheckbox._COUNTER++;

		this._label = document.createElement('label');
		this._label.className = 'label';
		// Connect the label and the checkbox. Checkbox will get checked when the label recieves a click.
		this._label.htmlFor = this._checkbox.id;

		this._domNode.appendChild(this._checkbox);
		this._domNode.appendChild(this._label);

		this._opts.parent.appendChild(this._domNode);

		this.onchange(this._checkbox, (e) => {
			this._opts.onChange();
		});
	}

	public get domNode(): HTMLElement {
		return this._domNode;
	}

	public get checked(): boolean {
		return this._checkbox.checked;
	}

	public set checked(newValue: boolean) {
		this._checkbox.checked = newValue;
	}

	public focus(): void {
		this._checkbox.focus();
	}

	private enable(): void {
		this._checkbox.removeAttribute('disabled');
	}

	private disable(): void {
		this._checkbox.disabled = true;
	}

	public setEnabled(enabled: boolean): void {
		if (enabled) {
			this.enable();
		} else {
			this.disable();
		}
	}
}

interface ISimpleButtonOpts {
	label: string;
	className: string;
	onTrigger: () => void;
	onKeyDown: (e: IKeyboardEvent) => void;
}

class SimpleButton extends Widget {

	private _opts: ISimpleButtonOpts;
	private _domNode: HTMLElement;

	constructor(opts: ISimpleButtonOpts) {
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

	public setExpanded(expanded: boolean): void {
		this._domNode.setAttribute('aria-expanded', String(expanded));
	}

	public toggleClass(className: string, shouldHaveIt: boolean): void {
		dom.toggleClass(this._domNode, className, shouldHaveIt);
	}
}

// theming

registerThemingParticipant((theme, collector) => {
	function addBackgroundColorRule(selector: string, color: Color): void {
		if (color) {
			collector.addRule(`.monaco-editor.${theme.selector} ${selector} { background-color: ${color}; }`);
		}
	}

	addBackgroundColorRule('.findMatch', theme.getColor(editorFindMatchHighlight));
	addBackgroundColorRule('.currentFindMatch', theme.getColor(editorFindMatch));
	addBackgroundColorRule('.findScope', theme.getColor(editorFindRangeHighlight));

	let inputBackground = theme.getColor(findInputBackground);
	addBackgroundColorRule('.find-widget .monaco-findInput', inputBackground);
	addBackgroundColorRule('.find-widget .replace-input', inputBackground);

	let widgetBackground = theme.getColor(editorFindWidgetBackground);
	addBackgroundColorRule('.find-widget', widgetBackground);

	let hcOutline = theme.getColor(highContrastOutline);
	if (hcOutline) {
		collector.addRule(`.monaco-editor.${theme.selector} .findScope { border: 1px dashed ${hcOutline.transparent(0.4)}; }`);
		collector.addRule(`.monaco-editor.${theme.selector} .currentFindMatch { border: 2px solid ${hcOutline}; padding: 1px; -moz-box-sizing: border-box; box-sizing: border-box; }`);
		collector.addRule(`.monaco-editor.${theme.selector} .findMatch { border: 1px dotted ${hcOutline}; -moz-box-sizing: border-box; box-sizing: border-box; }`);
	}
	let hcBorder = theme.getColor(highContrastBorder);
	if (hcBorder) {
		collector.addRule(`.monaco-editor.${theme.selector} .find-widget { border: 2px solid ${hcBorder}; box-shadow: none; }`);
	}
});

