/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./findOptionsWidget';
import * as dom from 'vs/base/browser/dom';
import { Widget } from 'vs/base/browser/ui/widget';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference } from 'vs/editor/browser/editorBrowser';
import { FIND_IDS } from 'vs/editor/contrib/find/common/findModel';
import { FindReplaceState } from 'vs/editor/contrib/find/common/findState';
import { CaseSensitiveCheckbox, WholeWordsCheckbox } from 'vs/base/browser/ui/findinput/findInputCheckboxes';
import { RunOnceScheduler } from 'vs/base/common/async';

export class FindOptionsWidget extends Widget implements IOverlayWidget {

	private static ID = 'editor.contrib.findOptionsWidget';

	private _editor: ICodeEditor;
	private _state: FindReplaceState;
	private _keybindingService: IKeybindingService;

	private _domNode: HTMLElement;
	private wholeWords: WholeWordsCheckbox;
	private caseSensitive: CaseSensitiveCheckbox;

	constructor(
		editor: ICodeEditor,
		state: FindReplaceState,
		keybindingService: IKeybindingService,
	) {
		super();

		this._editor = editor;
		this._state = state;
		this._keybindingService = keybindingService;

		this._domNode = document.createElement('div');
		this._domNode.className = 'monaco-editor-background findOptionsWidget';
		this._domNode.style.display = 'none';
		this._domNode.style.top = '10px';
		this._domNode.setAttribute('role', 'presentation');
		this._domNode.setAttribute('aria-hidden', 'true');

		this.caseSensitive = this._register(new CaseSensitiveCheckbox({
			appendTitle: this._keybindingLabelFor(FIND_IDS.ToggleCaseSensitiveCommand),
			isChecked: this._state.matchCase,
			onChange: (viaKeyboard) => {
				this._state.change({
					matchCase: this.caseSensitive.checked
				}, false);
			}
		}));
		this._domNode.appendChild(this.caseSensitive.domNode);

		this.wholeWords = this._register(new WholeWordsCheckbox({
			appendTitle: this._keybindingLabelFor(FIND_IDS.ToggleWholeWordCommand),
			isChecked: this._state.wholeWord,
			onChange: (viaKeyboard) => {
				this._state.change({
					wholeWord: this.wholeWords.checked
				}, false);
			}
		}));
		this._domNode.appendChild(this.wholeWords.domNode);

		this._editor.addOverlayWidget(this);

		this._register(this._state.addChangeListener((e) => {
			let somethingChanged = false;
			if (e.wholeWord) {
				this.wholeWords.checked = this._state.wholeWord;
				somethingChanged = true;
			}
			if (e.matchCase) {
				this.caseSensitive.checked = this._state.matchCase;
				somethingChanged = true;
			}
			if (!this._state.isRevealed && somethingChanged) {
				this._revealTemporarily();
			}
		}));

		this._register(dom.addDisposableNonBubblingMouseOutListener(this._domNode, (e) => this._onMouseOut()));
		this._register(dom.addDisposableListener(this._domNode, 'mouseover', (e) => this._onMouseOver()));
	}

	private _keybindingLabelFor(actionId: string): string {
		let kb = this._keybindingService.lookupKeybinding(actionId);
		if (!kb) {
			return '';
		}
		return ` (${kb.getLabel()})`;
	}

	public dispose(): void {
		this._editor.removeOverlayWidget(this);
		super.dispose();
	}

	// ----- IOverlayWidget API

	public getId(): string {
		return FindOptionsWidget.ID;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public getPosition(): IOverlayWidgetPosition {
		return {
			preference: OverlayWidgetPositionPreference.TOP_RIGHT_CORNER
		};
	}

	public highlightFindOptions(): void {
		this._revealTemporarily();
	}

	private _hideSoon = this._register(new RunOnceScheduler(() => this._hide(), 1000));

	private _revealTemporarily(): void {
		this._show();
		this._hideSoon.schedule();
	}

	private _onMouseOut(): void {
		this._hideSoon.schedule();
	}

	private _onMouseOver(): void {
		this._hideSoon.cancel();
	}

	private _isVisible: boolean = false;

	private _show(): void {
		if (this._isVisible) {
			return;
		}
		this._isVisible = true;
		this._domNode.style.display = 'block';
	}

	private _hide(): void {
		if (!this._isVisible) {
			return;
		}
		this._isVisible = false;
		this._domNode.style.display = 'none';
	}
}
