/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SimpleFindWidget } from 'vs/editor/contrib/find/browser/simpleFindWidget';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import WebView from './webview';

export class WebviewFindWidget extends SimpleFindWidget {

	constructor(
		@IContextViewService _contextViewService: IContextViewService,
		@IContextKeyService private _contextKeyService: IContextKeyService,
		private webview: WebView,
		private _findInputContextKey: RawContextKey<boolean>
	) {
		super(_contextViewService);

		this._findInputFocused = _findInputContextKey.bindTo(this._contextKeyService);
		console.debug(this._findInputContextKey.keys());
		this.find = this.find.bind(this);
		this.hide = this.hide.bind(this);
		this.onInputChanged = this.onInputChanged.bind(this);
	}

	public find(previous) {
		let val = this.inputValue;
		if (this.webview !== null && val) {
			this.webview.find(val, { findNext: true, forward: !previous });
		}
	};

	public hide() {
		super.hide();
		this.webview.stopFind(true);
		this.webview.focus();
	}

	public onInputChanged() {
		if (!this.webview) {
			return;
		}

		let val = this.inputValue;
		if (val) {
			this.webview.startFind(val);
		} else {
			this.webview.stopFind(false);
		}
	}

	protected onFocusTrackerFocus() {
		this.webview.notifyFindWidgetFocusChanged(true);
	}

	protected onFocusTrackerBlur() {
		this.webview.notifyFindWidgetFocusChanged(false);
	}

	protected onFindInputFocusTrackerFocus() {
		this._findInputFocused.set(true);
	}

	protected onFindInputFocusTrackerBlur() {
		this._findInputFocused.reset();
	}
}