/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SimpleFindWidget } from '../../codeEditor/browser/find/simpleFindWidget.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IBrowserViewModel } from '../common/browserView.js';
import { localize } from '../../../../nls.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';

export const CONTEXT_BROWSER_FIND_WIDGET_VISIBLE = new RawContextKey<boolean>('browserFindWidgetVisible', false, localize('browser.findWidgetVisible', "Whether the browser find widget is visible"));
export const CONTEXT_BROWSER_FIND_WIDGET_FOCUSED = new RawContextKey<boolean>('browserFindWidgetFocused', false, localize('browser.findWidgetFocused', "Whether the browser find widget is focused"));

/**
 * Find widget for the integrated browser view.
 * Uses the SimpleFindWidget base class and communicates with the browser view model
 * to perform find operations in the rendered web page.
 */
export class BrowserFindWidget extends SimpleFindWidget {
	private _model: IBrowserViewModel | undefined;
	private readonly _modelDisposables = this._register(new DisposableStore());
	private readonly _findWidgetVisible: IContextKey<boolean>;
	private readonly _findWidgetFocused: IContextKey<boolean>;
	private _lastFindResult: { resultIndex: number; resultCount: number } | undefined;
	private _hasFoundMatch = false;

	constructor(
		private readonly container: HTMLElement,
		@IContextViewService contextViewService: IContextViewService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHoverService hoverService: IHoverService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super({
			showCommonFindToggles: true,
			checkImeCompletionState: true,
			showResultCount: true,
			enableSash: true,
			initialWidth: 350,
			previousMatchActionId: 'workbench.action.browser.findPrevious',
			nextMatchActionId: 'workbench.action.browser.findNext',
			closeWidgetActionId: 'workbench.action.browser.hideFind'
		}, contextViewService, contextKeyService, hoverService, keybindingService);

		this._findWidgetVisible = CONTEXT_BROWSER_FIND_WIDGET_VISIBLE.bindTo(contextKeyService);
		this._findWidgetFocused = CONTEXT_BROWSER_FIND_WIDGET_FOCUSED.bindTo(contextKeyService);

		container.appendChild(this.getDomNode());
	}

	/**
	 * Set the browser view model to use for find operations.
	 * This should be called whenever the editor input changes.
	 */
	setModel(model: IBrowserViewModel | undefined): void {
		this._modelDisposables.clear();
		this._model = model;
		this._lastFindResult = undefined;
		this._hasFoundMatch = false;

		if (model) {
			this._modelDisposables.add(model.onDidFindInPage(result => {
				this._lastFindResult = {
					resultIndex: result.activeMatchOrdinal - 1, // Convert to 0-based index
					resultCount: result.matches
				};
				this._hasFoundMatch = result.matches > 0;
				this.updateButtons(this._hasFoundMatch);
				this.updateResultCount();
			}));

			this._modelDisposables.add(model.onWillDispose(() => {
				this.setModel(undefined);
			}));
		}
	}

	override reveal(initialInput?: string): void {
		const wasVisible = this.isVisible();
		super.reveal(initialInput);
		this._findWidgetVisible.set(true);
		this.container.classList.toggle('find-visible', true);

		// Focus the find input
		this.focusFindBox();

		// If there's existing input and the widget wasn't already visible, trigger a search
		if (this.inputValue && !wasVisible) {
			this._onInputChanged();
		}
	}

	override hide(): void {
		super.hide(false);
		this._findWidgetVisible.reset();
		this.container.classList.toggle('find-visible', false);

		// Stop find and clear highlights in the browser view
		this._model?.stopFindInPage(true);
		this._lastFindResult = undefined;
		this._hasFoundMatch = false;
	}

	find(previous: boolean): void {
		const value = this.inputValue;
		if (value && this._model) {
			this._model.findInPage(value, {
				forward: !previous,
				recompute: false,
				matchCase: this._getCaseSensitiveValue()
			});
		}
	}

	findFirst(): void {
		const value = this.inputValue;
		if (value && this._model) {
			this._model.findInPage(value, {
				forward: true,
				recompute: true,
				matchCase: this._getCaseSensitiveValue()
			});
		}
	}

	clear(): void {
		if (this._model) {
			this._model.stopFindInPage(false);
			this._lastFindResult = undefined;
			this._hasFoundMatch = false;
		}
	}

	protected _onInputChanged(): boolean {
		if (this.inputValue) {
			this.findFirst();
		} else if (this._model) {
			this.clear();
		}
		return false;
	}

	protected async _getResultCount(): Promise<{ resultIndex: number; resultCount: number } | undefined> {
		return this._lastFindResult;
	}

	protected _onFocusTrackerFocus(): void {
		this._findWidgetFocused.set(true);
	}

	protected _onFocusTrackerBlur(): void {
		this._findWidgetFocused.reset();
	}

	protected _onFindInputFocusTrackerFocus(): void {
		// No-op
	}

	protected _onFindInputFocusTrackerBlur(): void {
		// No-op
	}
}
