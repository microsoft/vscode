/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IContextViewService} from 'vs/platform/contextview/browser/contextView';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybinding';
import {ICodeEditor} from 'vs/editor/browser/editorBrowser';
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import {FindWidget, IFindController} from 'vs/editor/contrib/find/browser/findWidget';
import {CommonFindController, FindStartFocusAction, IFindStartOptions, SelectionHighlighter} from 'vs/editor/contrib/find/common/findController';

class FindController extends CommonFindController implements IFindController {

	private _widget: FindWidget;

	constructor(editor:ICodeEditor, @IContextViewService contextViewService: IContextViewService, @IKeybindingService keybindingService: IKeybindingService) {
		super(editor, keybindingService);

		this._widget = this._register(new FindWidget(editor, this, this._state, contextViewService, keybindingService));
	}

	protected _start(opts:IFindStartOptions): void {
		super._start(opts);

		if (opts.shouldFocus === FindStartFocusAction.FocusReplaceInput) {
			this._widget.focusReplaceInput();
		} else if (opts.shouldFocus === FindStartFocusAction.FocusFindInput) {
			this._widget.focusFindInput();
		}
	}
}

EditorBrowserRegistry.registerEditorContribution(FindController);
EditorBrowserRegistry.registerEditorContribution(SelectionHighlighter);
