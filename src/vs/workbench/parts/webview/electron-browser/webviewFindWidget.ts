/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SimpleFindWidget } from 'vs/editor/contrib/find/simpleFindWidget';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { WebviewElement } from './webviewElement';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';

export class WebviewFindWidget extends SimpleFindWidget {

	constructor(
		private _webview: WebviewElement,
		@IContextViewService contextViewService: IContextViewService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(contextViewService, contextKeyService);
	}

	dispose() {
		this._webview = undefined;
		super.dispose();
	}

	public find(previous: boolean) {
		const val = this.inputValue;
		if (val) {
			this._webview.find(val, { findNext: true, forward: !previous });
		}
	}

	public hide() {
		super.hide();
		this._webview.stopFind(true);
		this._webview.focus();
	}

	public onInputChanged() {
		const val = this.inputValue;
		if (val) {
			this._webview.startFind(val);
		} else {
			this._webview.stopFind(false);
		}
	}

	protected onFocusTrackerFocus() { }

	protected onFocusTrackerBlur() { }

	protected onFindInputFocusTrackerFocus() { }

	protected onFindInputFocusTrackerBlur() { }
}