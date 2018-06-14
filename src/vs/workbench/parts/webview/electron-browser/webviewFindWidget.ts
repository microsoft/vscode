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
		private webview: WebviewElement,
		@IContextViewService contextViewService: IContextViewService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(contextViewService, contextKeyService);
	}

	dispose() {
		this.webview = undefined;
		super.dispose();
	}

	public find(previous: boolean) {
		const val = this.inputValue;
		if (val) {
			this.webview.find(val, { findNext: true, forward: !previous });
		}
	}

	public hide() {
		super.hide();
		this.webview.stopFind(true);
		this.webview.focus();
	}

	public onInputChanged() {
		const val = this.inputValue;
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
		this.webview.notifyFindWidgetInputFocusChanged(true);
	}

	protected onFindInputFocusTrackerBlur() {
		this.webview.notifyFindWidgetInputFocusChanged(false);
	}
}