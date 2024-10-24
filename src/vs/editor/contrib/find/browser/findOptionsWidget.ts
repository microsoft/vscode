/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import './findOptionsWidget.css';
import { CaseSensitiveToggle, RegexToggle, WholeWordsToggle } from '../../../../base/browser/ui/findinput/findInputToggles.js';
import { Widget } from '../../../../base/browser/ui/widget.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference } from '../../../browser/editorBrowser.js';
import { FIND_IDS } from './findModel.js';
import { FindReplaceState } from './findState.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { asCssVariable, inputActiveOptionBackground, inputActiveOptionBorder, inputActiveOptionForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { createInstantHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';

export class FindOptionsWidget extends Widget implements IOverlayWidget {

	private static readonly ID = 'editor.contrib.findOptionsWidget';

	private readonly _editor: ICodeEditor;
	private readonly _state: FindReplaceState;
	private readonly _keybindingService: IKeybindingService;

	private readonly _domNode: HTMLElement;
	private readonly regex: RegexToggle;
	private readonly wholeWords: WholeWordsToggle;
	private readonly caseSensitive: CaseSensitiveToggle;

	constructor(
		editor: ICodeEditor,
		state: FindReplaceState,
		keybindingService: IKeybindingService
	) {
		super();

		this._editor = editor;
		this._state = state;
		this._keybindingService = keybindingService;

		this._domNode = document.createElement('div');
		this._domNode.className = 'findOptionsWidget';
		this._domNode.style.display = 'none';
		this._domNode.style.top = '10px';
		this._domNode.style.zIndex = '12';
		this._domNode.setAttribute('role', 'presentation');
		this._domNode.setAttribute('aria-hidden', 'true');

		const toggleStyles = {
			inputActiveOptionBorder: asCssVariable(inputActiveOptionBorder),
			inputActiveOptionForeground: asCssVariable(inputActiveOptionForeground),
			inputActiveOptionBackground: asCssVariable(inputActiveOptionBackground),
		};

		const hoverDelegate = this._register(createInstantHoverDelegate());

		this.caseSensitive = this._register(new CaseSensitiveToggle({
			appendTitle: this._keybindingLabelFor(FIND_IDS.ToggleCaseSensitiveCommand),
			isChecked: this._state.matchCase,
			hoverDelegate,
			...toggleStyles
		}));
		this._domNode.appendChild(this.caseSensitive.domNode);
		this._register(this.caseSensitive.onChange(() => {
			this._state.change({
				matchCase: this.caseSensitive.checked
			}, false);
		}));

		this.wholeWords = this._register(new WholeWordsToggle({
			appendTitle: this._keybindingLabelFor(FIND_IDS.ToggleWholeWordCommand),
			isChecked: this._state.wholeWord,
			hoverDelegate,
			...toggleStyles
		}));
		this._domNode.appendChild(this.wholeWords.domNode);
		this._register(this.wholeWords.onChange(() => {
			this._state.change({
				wholeWord: this.wholeWords.checked
			}, false);
		}));

		this.regex = this._register(new RegexToggle({
			appendTitle: this._keybindingLabelFor(FIND_IDS.ToggleRegexCommand),
			isChecked: this._state.isRegex,
			hoverDelegate,
			...toggleStyles
		}));
		this._domNode.appendChild(this.regex.domNode);
		this._register(this.regex.onChange(() => {
			this._state.change({
				isRegex: this.regex.checked
			}, false);
		}));

		this._editor.addOverlayWidget(this);

		this._register(this._state.onFindReplaceStateChange((e) => {
			let somethingChanged = false;
			if (e.isRegex) {
				this.regex.checked = this._state.isRegex;
				somethingChanged = true;
			}
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

		this._register(dom.addDisposableListener(this._domNode, dom.EventType.MOUSE_LEAVE, (e) => this._onMouseLeave()));
		this._register(dom.addDisposableListener(this._domNode, 'mouseover', (e) => this._onMouseOver()));
	}

	private _keybindingLabelFor(actionId: string): string {
		const kb = this._keybindingService.lookupKeybinding(actionId);
		if (!kb) {
			return '';
		}
		return ` (${kb.getLabel()})`;
	}

	public override dispose(): void {
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

	private _hideSoon = this._register(new RunOnceScheduler(() => this._hide(), 2000));

	private _revealTemporarily(): void {
		this._show();
		this._hideSoon.schedule();
	}

	private _onMouseLeave(): void {
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
