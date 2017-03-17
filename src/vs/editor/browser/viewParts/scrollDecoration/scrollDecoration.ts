/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./scrollDecoration';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { ClassNames } from 'vs/editor/browser/editorBrowser';
import { ViewPart } from 'vs/editor/browser/view/viewPart';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { RenderingContext, RestrictedRenderingContext } from 'vs/editor/common/view/renderingContext';
import * as viewEvents from 'vs/editor/common/view/viewEvents';

export class ScrollDecorationViewPart extends ViewPart {

	private _domNode: FastDomNode<HTMLElement>;
	private _scrollTop: number;
	private _width: number;
	private _shouldShow: boolean;
	private _useShadows: boolean;

	constructor(context: ViewContext) {
		super(context);

		this._scrollTop = 0;
		this._width = 0;
		this._updateWidth();
		this._shouldShow = false;
		this._useShadows = this._context.configuration.editor.viewInfo.scrollbar.useShadows;
		this._domNode = createFastDomNode(document.createElement('div'));
	}

	private _updateShouldShow(): boolean {
		let newShouldShow = (this._useShadows && this._scrollTop > 0);
		if (this._shouldShow !== newShouldShow) {
			this._shouldShow = newShouldShow;
			return true;
		}
		return false;
	}

	public getDomNode(): HTMLElement {
		return this._domNode.domNode;
	}

	private _updateWidth(): boolean {
		const layoutInfo = this._context.configuration.editor.layoutInfo;
		let newWidth = layoutInfo.width - layoutInfo.minimapWidth;
		if (this._width !== newWidth) {
			this._width = newWidth;
			return true;
		}
		return false;
	}

	// --- begin event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		let shouldRender = false;
		if (e.viewInfo.scrollbar) {
			this._useShadows = this._context.configuration.editor.viewInfo.scrollbar.useShadows;
		}
		if (e.layoutInfo) {
			shouldRender = this._updateWidth();
		}
		return this._updateShouldShow() || shouldRender;
	}
	public onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		this._scrollTop = e.scrollTop;
		return this._updateShouldShow();
	}

	// --- end event handlers

	public prepareRender(ctx: RenderingContext): void {
		// Nothing to read
	}

	public render(ctx: RestrictedRenderingContext): void {
		this._domNode.setWidth(this._width);
		this._domNode.setClassName(this._shouldShow ? ClassNames.SCROLL_DECORATION : '');
	}
}
