/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import {IFindController, FindWidget} from 'vs/editor/contrib/find/browser/findWidget';
import * as EditorBrowser from 'vs/editor/browser/editorBrowser';
import {IKeybindingService, IKeybindingContextKey, IKeybindings} from 'vs/platform/keybinding/common/keybindingService';
import {IContextViewService} from 'vs/platform/contextview/browser/contextView';
import {CommonFindController, IFindStartOptions, FindStartFocusAction, SelectionHighlighter} from 'vs/editor/contrib/find/common/findController';

class FindController extends CommonFindController implements IFindController {

	private _widget: FindWidget;

	constructor(editor:EditorBrowser.ICodeEditor, @IContextViewService contextViewService: IContextViewService, @IKeybindingService keybindingService: IKeybindingService) {
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
