/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { ClassNames } from 'vs/editor/browser/editorBrowser';
import { ViewPart } from 'vs/editor/browser/view/viewPart';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { RenderingContext, RestrictedRenderingContext } from 'vs/editor/common/view/renderingContext';
import * as viewEvents from 'vs/editor/common/view/viewEvents';

export class Margin extends ViewPart {
	private _domNode: FastDomNode<HTMLElement>;
	private _canUseTranslate3d: boolean;
	private _contentLeft: number;
	private _glyphMarginLeft: number;
	private _glyphMarginWidth: number;
	private _glyphMarginBackgroundDomNode: FastDomNode<HTMLElement>;

	constructor(context: ViewContext) {
		super(context);
		this._canUseTranslate3d = this._context.configuration.editor.viewInfo.canUseTranslate3d;
		this._contentLeft = this._context.configuration.editor.layoutInfo.contentLeft;
		this._glyphMarginLeft = this._context.configuration.editor.layoutInfo.glyphMarginLeft;
		this._glyphMarginWidth = this._context.configuration.editor.layoutInfo.glyphMarginWidth;

		this._domNode = this._createDomNode();
	}

	public dispose(): void {
		super.dispose();
	}

	public getDomNode(): HTMLElement {
		return this._domNode.domNode;
	}

	private _createDomNode(): FastDomNode<HTMLElement> {
		let domNode = createFastDomNode(document.createElement('div'));
		domNode.setClassName(ClassNames.MARGIN + ' monaco-editor-background');
		domNode.setPosition('absolute');
		domNode.setAttribute('role', 'presentation');
		domNode.setAttribute('aria-hidden', 'true');

		this._glyphMarginBackgroundDomNode = createFastDomNode(document.createElement('div'));
		this._glyphMarginBackgroundDomNode.setClassName(ClassNames.GLYPH_MARGIN);

		domNode.domNode.appendChild(this._glyphMarginBackgroundDomNode.domNode);
		return domNode;
	}

	// --- begin event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		if (e.viewInfo.canUseTranslate3d) {
			this._canUseTranslate3d = this._context.configuration.editor.viewInfo.canUseTranslate3d;
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
		const adjustedScrollTop = ctx.scrollTop - ctx.bigNumbersDelta;
		if (this._canUseTranslate3d) {
			let transform = 'translate3d(0px, ' + -adjustedScrollTop + 'px, 0px)';
			this._domNode.setTransform(transform);
			this._domNode.setTop(0);
		} else {
			this._domNode.setTransform('');
			this._domNode.setTop(-adjustedScrollTop);
		}

		let height = Math.min(ctx.scrollHeight, 1000000);
		this._domNode.setHeight(height);
		this._domNode.setWidth(this._contentLeft);

		this._glyphMarginBackgroundDomNode.setLeft(this._glyphMarginLeft);
		this._glyphMarginBackgroundDomNode.setWidth(this._glyphMarginWidth);
		this._glyphMarginBackgroundDomNode.setHeight(height);
	}
}
