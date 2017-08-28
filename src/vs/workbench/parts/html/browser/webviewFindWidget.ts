/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SimpleFindWidget } from 'vs/editor/contrib/find/browser/simpleFindWidget';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ISimpleFindWidgetService } from 'vs/editor/contrib/find/browser/simpleFindWidgetService';
import WebView from './webview';

export class WebviewFindWidget extends SimpleFindWidget {

	constructor(
		@IContextViewService _contextViewService: IContextViewService,
		@IContextKeyService _contextKeyService: IContextKeyService,
		@ISimpleFindWidgetService _simpleFindWidgetService: ISimpleFindWidgetService,
		private _webview: WebView,
	) {
		super(_contextViewService, _contextKeyService, _simpleFindWidgetService);
		this.find = this.find.bind(this);
		this.hide = this.hide.bind(this);
		this.onInputChanged = this.onInputChanged.bind(this);
	}

	public find(previous) {
		let val = this.inputValue;
		if (this._webview !== null && val) {
			if (!this._isVisible) {
				this.reveal(false);
			}
			this._webview.find(val, { findNext: true, forward: !previous });
		}
	};

	public hide() {
		super.hide();
		this._webview.stopFind(true);
		this._webview.focus();
	}

	public onInputChanged() {
		if (!this._webview) {
			return;
		}

		let val = this.inputValue;
		if (val) {
			this._webview.startFind(val);
		} else {
			this._webview.stopFind(false);
		}
	}

	protected onFocusTrackerFocus() {
		this._webview.notifyFindWidgetFocusChanged(true);
	}

	protected onFocusTrackerBlur() {
		this._webview.notifyFindWidgetFocusChanged(false);
	}

}