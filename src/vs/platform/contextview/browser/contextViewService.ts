/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContextView, ContextViewDOMPosition } from 'vs/base/browser/ui/contextview/contextview';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { IContextViewDelegate, IContextViewService } from './contextView';
import { getWindow } from 'vs/base/browser/dom';

export class ContextViewService extends Disposable implements IContextViewService {

	declare readonly _serviceBrand: undefined;

	private currentViewDisposable: IDisposable = Disposable.None;
	private readonly contextView = this._register(new ContextView(this.layoutService.mainContainer, ContextViewDOMPosition.ABSOLUTE));

	constructor(
		@ILayoutService private readonly layoutService: ILayoutService
	) {
		super();

		this.layout();
		this._register(layoutService.onDidLayoutContainer(() => this.layout()));
	}

	// ContextView

	showContextView(delegate: IContextViewDelegate, container?: HTMLElement, shadowRoot?: boolean): IDisposable {
		let domPosition: ContextViewDOMPosition;
		if (container) {
			if (container === this.layoutService.getContainer(getWindow(container))) {
				domPosition = ContextViewDOMPosition.ABSOLUTE;
			} else if (shadowRoot) {
				domPosition = ContextViewDOMPosition.FIXED_SHADOW;
			} else {
				domPosition = ContextViewDOMPosition.FIXED;
			}
		} else {
			domPosition = ContextViewDOMPosition.ABSOLUTE;
		}

		this.contextView.setContainer(container ?? this.layoutService.activeContainer, domPosition);

		this.contextView.show(delegate);

		const disposable = toDisposable(() => {
			if (this.currentViewDisposable === disposable) {
				this.hideContextView();
			}
		});

		this.currentViewDisposable = disposable;
		return disposable;
	}

	getContextViewElement(): HTMLElement {
		return this.contextView.getViewElement();
	}

	layout(): void {
		this.contextView.layout();
	}

	hideContextView(data?: any): void {
		this.contextView.hide(data);
	}

	override dispose(): void {
		super.dispose();

		this.currentViewDisposable.dispose();
		this.currentViewDisposable = Disposable.None;
	}
}
