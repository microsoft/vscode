/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { SimpleFindWidget } from '../../codeEditor/browser/find/simpleFindWidget.js';
import { KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED } from './webview.js';

export interface WebviewFindDelegate {
	readonly hasFindResult: Event<boolean>;
	readonly onDidStopFind: Event<void>;
	readonly checkImeCompletionState: boolean;
	find(value: string, previous: boolean): void;
	updateFind(value: string): void;
	stopFind(keepSelection?: boolean): void;
	focus(): void;
}

export class WebviewFindWidget extends SimpleFindWidget {
	protected async _getResultCount(dataChanged?: boolean): Promise<{ resultIndex: number; resultCount: number } | undefined> {
		return undefined;
	}

	protected readonly _findWidgetFocused: IContextKey<boolean>;

	constructor(
		private readonly _delegate: WebviewFindDelegate,
		@IContextViewService contextViewService: IContextViewService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHoverService hoverService: IHoverService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super({
			showCommonFindToggles: false,
			checkImeCompletionState: _delegate.checkImeCompletionState,
			enableSash: true,
		}, contextViewService, contextKeyService, hoverService, keybindingService);
		this._findWidgetFocused = KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED.bindTo(contextKeyService);

		this._register(_delegate.hasFindResult(hasResult => {
			this.updateButtons(hasResult);
			this.focusFindBox();
		}));

		this._register(_delegate.onDidStopFind(() => {
			this.updateButtons(false);
		}));
	}

	public find(previous: boolean) {
		const val = this.inputValue;
		if (val) {
			this._delegate.find(val, previous);
		}
	}

	public override hide(animated = true) {
		super.hide(animated);
		this._delegate.stopFind(true);
		this._delegate.focus();
	}

	protected _onInputChanged(): boolean {
		const val = this.inputValue;
		if (val) {
			this._delegate.updateFind(val);
		} else {
			this._delegate.stopFind(false);
		}
		return false;
	}

	protected _onFocusTrackerFocus() {
		this._findWidgetFocused.set(true);
	}

	protected _onFocusTrackerBlur() {
		this._findWidgetFocused.reset();
	}

	protected _onFindInputFocusTrackerFocus() { }

	protected _onFindInputFocusTrackerBlur() { }

	findFirst() { }
}
