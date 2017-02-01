/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { StyleMutator, FastDomNode, createFastDomNode } from 'vs/base/browser/styleMutator';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ClassNames } from 'vs/editor/browser/editorBrowser';
import { ViewPart } from 'vs/editor/browser/view/viewPart';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { IRenderingContext, IRestrictedRenderingContext } from 'vs/editor/common/view/renderingContext';
import { ILayoutProvider } from 'vs/editor/browser/viewLayout/layoutProvider';

export class Margin extends ViewPart {
	public domNode: HTMLElement;
	private _layoutProvider: ILayoutProvider;
	private _canUseTranslate3d: boolean;
	private _contentLeft: number;
	private _glyphMarginLeft: number;
	private _glyphMarginWidth: number;
	private _glyphMarginBackgroundDomNode: FastDomNode;

	constructor(context: ViewContext, layoutProvider: ILayoutProvider) {
		super(context);
		this._layoutProvider = layoutProvider;
		this._canUseTranslate3d = this._context.configuration.editor.viewInfo.canUseTranslate3d;
		this._contentLeft = this._context.configuration.editor.layoutInfo.contentLeft;
		this._glyphMarginLeft = this._context.configuration.editor.layoutInfo.glyphMarginLeft;
		this._glyphMarginWidth = this._context.configuration.editor.layoutInfo.glyphMarginWidth;

		this.domNode = this._createDomNode();
	}

	public dispose(): void {
		super.dispose();
	}

	public _createDomNode(): HTMLElement {
		let domNode = document.createElement('div');
		domNode.className = ClassNames.MARGIN + ' monaco-editor-background';
		domNode.style.position = 'absolute';
		domNode.setAttribute('role', 'presentation');
		domNode.setAttribute('aria-hidden', 'true');

		this._glyphMarginBackgroundDomNode = createFastDomNode(document.createElement('div'));
		this._glyphMarginBackgroundDomNode.setClassName(ClassNames.GLYPH_MARGIN);

		domNode.appendChild(this._glyphMarginBackgroundDomNode.domNode);
		return domNode;
	}

	// --- begin event handlers

	public onConfigurationChanged(e: editorCommon.IConfigurationChangedEvent): boolean {
		if (e.viewInfo.canUseTranslate3d) {
			this._canUseTranslate3d = this._context.configuration.editor.viewInfo.canUseTranslate3d;
		}

		return super.onConfigurationChanged(e);
	}

	public onScrollChanged(e: editorCommon.IScrollEvent): boolean {
		return super.onScrollChanged(e) || e.scrollTopChanged;
	}

	public onLayoutChanged(layoutInfo: editorCommon.EditorLayoutInfo): boolean {
		this._contentLeft = layoutInfo.contentLeft;
		this._glyphMarginLeft = layoutInfo.glyphMarginLeft;
		this._glyphMarginWidth = layoutInfo.glyphMarginWidth;

		return super.onLayoutChanged(layoutInfo) || true;
	}

	// --- end event handlers

	public prepareRender(ctx: IRenderingContext): void {
		// Nothing to read
	}

	public render(ctx: IRestrictedRenderingContext): void {
		if (this._canUseTranslate3d) {
			let transform = 'translate3d(0px, ' + ctx.viewportData.visibleRangesDeltaTop + 'px, 0px)';
			StyleMutator.setTransform(this.domNode, transform);
			StyleMutator.setTop(this.domNode, 0);
		} else {
			StyleMutator.setTransform(this.domNode, '');
			StyleMutator.setTop(this.domNode, ctx.viewportData.visibleRangesDeltaTop);
		}

		let height = Math.min(this._layoutProvider.getTotalHeight(), 1000000);
		StyleMutator.setHeight(this.domNode, height);
		StyleMutator.setWidth(this.domNode, this._contentLeft);

		this._glyphMarginBackgroundDomNode.setLeft(this._glyphMarginLeft);
		this._glyphMarginBackgroundDomNode.setWidth(this._glyphMarginWidth);
		this._glyphMarginBackgroundDomNode.setHeight(height);
	}
}
