/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./scrollDecoration';
import * as dom from 'vs/base/browser/dom';
import {StyleMutator} from 'vs/base/browser/styleMutator';
import {IConfigurationChangedEvent, IEditorLayoutInfo, IScrollEvent} from 'vs/editor/common/editorCommon';
import {ClassNames, IRenderingContext, IViewContext} from 'vs/editor/browser/editorBrowser';
import {ViewPart} from 'vs/editor/browser/view/viewPart';

export class ScrollDecorationViewPart extends ViewPart {

	private _domNode: HTMLElement;
	private _scrollTop: number;
	private _width: number;
	private _shouldShow: boolean;

	constructor(context: IViewContext) {
		super(context);

		this._scrollTop = 0;
		this._width = 0;
		this._shouldShow = false;
		this._domNode = document.createElement('div');
	}

	private _updateShouldShow(): boolean {
		var newShouldShow = (this._context.configuration.editor.scrollbar.useShadows && this._scrollTop > 0);
		if (this._shouldShow !== newShouldShow) {
			this._shouldShow = newShouldShow;
			return true;
		}
		return false;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	// --- begin event handlers

	public onConfigurationChanged(e: IConfigurationChangedEvent): boolean {
		return this._updateShouldShow();
	}
	public onLayoutChanged(layoutInfo: IEditorLayoutInfo): boolean {
		if (this._width !== layoutInfo.width) {
			this._width = layoutInfo.width;
			return true;
		}
		return false;
	}
	public onScrollChanged(e: IScrollEvent): boolean {
		this._scrollTop = e.scrollTop;
		return this._updateShouldShow();
	}

	// --- end event handlers

	_render(ctx: IRenderingContext): void {
		this._requestModificationFrame(() => {
			StyleMutator.setWidth(this._domNode, this._width);
			dom.toggleClass(this._domNode, ClassNames.SCROLL_DECORATION, this._shouldShow);
		});
	}
}