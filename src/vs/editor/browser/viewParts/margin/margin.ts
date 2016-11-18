/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { StyleMutator } from 'vs/base/browser/styleMutator';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ViewPart } from 'vs/editor/browser/view/viewPart';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { IRenderingContext, IRestrictedRenderingContext } from 'vs/editor/common/view/renderingContext';
import { ILayoutProvider } from 'vs/editor/browser/viewLayout/layoutProvider';

export class Margin extends ViewPart {
	public domNode: HTMLElement;
	private _layoutProvider: ILayoutProvider;
	private _canUseTranslate3d: boolean;
	private _height: number;
	private _contentLeft: number;

	constructor(context: ViewContext, layoutProvider: ILayoutProvider) {
		super(context);
		this._layoutProvider = layoutProvider;
		this._canUseTranslate3d = this._context.configuration.editor.viewInfo.canUseTranslate3d;
		this.domNode = this._createDomNode();
		this._height = this._context.configuration.editor.layoutInfo.contentHeight;
		this._contentLeft = this._context.configuration.editor.layoutInfo.contentLeft;
	}

	public dispose(): void {
		super.dispose();
	}

	public _createDomNode(): HTMLElement {
		let domNode = document.createElement('div');
		domNode.className = 'margin monaco-editor-background';
		domNode.style.position = 'absolute';
		domNode.setAttribute('role', 'presentation');
		domNode.setAttribute('aria-hidden', 'true');
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
		return super.onLayoutChanged(layoutInfo) || true;
	}

	// --- end event handlers

	public prepareRender(ctx: IRenderingContext): void {
		// Nothing to read
	}

	public render(ctx: IRestrictedRenderingContext): void {
		if (this._canUseTranslate3d) {
			let transform = 'translate3d(0px, ' + ctx.linesViewportData.visibleRangesDeltaTop + 'px, 0px)';
			StyleMutator.setTransform(this.domNode, transform);
			StyleMutator.setTop(this.domNode, 0);
		} else {
			StyleMutator.setTransform(this.domNode, '');
			StyleMutator.setTop(this.domNode, ctx.linesViewportData.visibleRangesDeltaTop);
		}

		let height = Math.min(this._layoutProvider.getTotalHeight(), 1000000);
		StyleMutator.setHeight(this.domNode, height);
		StyleMutator.setWidth(this.domNode, this._contentLeft);
	}
}
