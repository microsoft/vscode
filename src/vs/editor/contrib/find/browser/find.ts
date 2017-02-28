/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { FindWidget, IFindController } from 'vs/editor/contrib/find/browser/findWidget';
import { FindOptionsWidget } from 'vs/editor/contrib/find/browser/findOptionsWidget';
import { CommonFindController, FindStartFocusAction, IFindStartOptions } from 'vs/editor/contrib/find/common/findController';

@editorContribution
export class FindController extends CommonFindController implements IFindController {

	private _widget: FindWidget;
	private _findOptionsWidget: FindOptionsWidget;

	constructor(
		editor: ICodeEditor,
		@IContextViewService contextViewService: IContextViewService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(editor, contextKeyService);

		this._widget = this._register(new FindWidget(editor, this, this._state, contextViewService, keybindingService, contextKeyService));
		this._findOptionsWidget = this._register(new FindOptionsWidget(editor, this._state, keybindingService));
	}

	protected _start(opts: IFindStartOptions): void {
		super._start(opts);

		if (opts.shouldFocus === FindStartFocusAction.FocusReplaceInput) {
			this._widget.focusReplaceInput();
		} else if (opts.shouldFocus === FindStartFocusAction.FocusFindInput) {
			this._widget.focusFindInput();
		}
	}

	public highlightFindOptions(): void {
		if (this._state.isRevealed) {
			this._widget.highlightFindOptions();
		} else {
			this._findOptionsWidget.highlightFindOptions();
		}
	}
}
