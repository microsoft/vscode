/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { ViewPart } from 'vs/editor/browser/view/viewPart';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { RenderingContext, RestrictedRenderingContext } from 'vs/editor/common/view/renderingContext';
import * as viewEvents from 'vs/editor/common/view/viewEvents';

export class Margin extends ViewPart {

	public static CLASS_NAME = 'glyph-margin';

	private _domNode: FastDomNode<HTMLElement>;
	private _canUseLayerHinting: boolean;
	private _contentLeft: number;
	private _glyphMarginLeft: number;
	private _glyphMarginWidth: number;
	private _glyphMarginBackgroundDomNode: FastDomNode<HTMLElement>;

	constructor(context: ViewContext) {
		super(context);
		this._canUseLayerHinting = this._context.configuration.editor.canUseLayerHinting;
		this._contentLeft = this._context.configuration.editor.layoutInfo.contentLeft;
		this._glyphMarginLeft = this._context.configuration.editor.layoutInfo.glyphMarginLeft;
		this._glyphMarginWidth = this._context.configuration.editor.layoutInfo.glyphMarginWidth;

		this._domNode = this._createDomNode();
	}

	public dispose(): void {
		super.dispose();
	}

	public getDomNode(): FastDomNode<HTMLElement> {
		return this._domNode;
	}

	private _createDomNode(): FastDomNode<HTMLElement> {
		let domNode = createFastDomNode(document.createElement('div'));
		domNode.setClassName('margin');
		domNode.setPosition('absolute');
		domNode.setAttribute('role', 'presentation');
		domNode.setAttribute('aria-hidden', 'true');

		this._glyphMarginBackgroundDomNode = createFastDomNode(document.createElement('div'));
		this._glyphMarginBackgroundDomNode.setClassName(Margin.CLASS_NAME);

		domNode.appendChild(this._glyphMarginBackgroundDomNode);
		return domNode;
	}

	// --- begin event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		if (e.canUseLayerHinting) {
			this._canUseLayerHinting = this._context.configuration.editor.canUseLayerHinting;
		}

		if (e.layoutInfo) {
			this._contentLeft = this._context.configuration.editor.layoutInfo.contentLeft;
			this._glyphMarginLeft = this._context.configuration.editor.layoutInfo.glyphMarginLeft;
			this._glyphMarginWidth = this._context.configuration.editor.layoutInfo.glyphMarginWidth;
		}

		return true;
	}
	public onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return super.onScrollChanged(e) || e.scrollTopChanged;
	}

	// --- end event handlers

	public prepareRender(ctx: RenderingContext): void {
		// Nothing to read
	}

	public render(ctx: RestrictedRenderingContext): void {
		this._domNode.setLayerHinting(this._canUseLayerHinting);
		const adjustedScrollTop = ctx.scrollTop - ctx.bigNumbersDelta;
		this._domNode.setTop(-adjustedScrollTop);

		let height = Math.min(ctx.scrollHeight, 1000000);
		this._domNode.setHeight(height);
		this._domNode.setWidth(this._contentLeft);

		this._glyphMarginBackgroundDomNode.setLeft(this._glyphMarginLeft);
		this._glyphMarginBackgroundDomNode.setWidth(this._glyphMarginWidth);
		this._glyphMarginBackgroundDomNode.setHeight(height);
	}
}
