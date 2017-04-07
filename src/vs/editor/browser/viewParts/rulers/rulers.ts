/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./rulers';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { ViewPart } from 'vs/editor/browser/view/viewPart';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { RenderingContext, RestrictedRenderingContext } from 'vs/editor/common/view/renderingContext';
import * as viewEvents from 'vs/editor/common/view/viewEvents';

export class Rulers extends ViewPart {

	public domNode: HTMLElement;
	private _renderedRulers: FastDomNode<HTMLElement>[];
	private _rulers: number[];
	private _height: number;
	private _typicalHalfwidthCharacterWidth: number;

	constructor(context: ViewContext) {
		super(context);
		this.domNode = document.createElement('div');
		this.domNode.className = 'view-rulers';
		this._renderedRulers = [];
		this._rulers = this._context.configuration.editor.viewInfo.rulers;
		this._height = this._context.configuration.editor.layoutInfo.contentHeight;
		this._typicalHalfwidthCharacterWidth = this._context.configuration.editor.fontInfo.typicalHalfwidthCharacterWidth;
	}

	public dispose(): void {
		super.dispose();
	}

	// --- begin event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		if (e.viewInfo.rulers || e.layoutInfo || e.fontInfo) {
			this._rulers = this._context.configuration.editor.viewInfo.rulers;
			this._height = this._context.configuration.editor.layoutInfo.contentHeight;
			this._typicalHalfwidthCharacterWidth = this._context.configuration.editor.fontInfo.typicalHalfwidthCharacterWidth;
			return true;
		}
		return false;
	}
	public onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return super.onScrollChanged(e) || e.scrollHeightChanged;
	}

	// --- end event handlers

	public prepareRender(ctx: RenderingContext): void {
		// Nothing to read
	}

	private _ensureRulersCount(): void {
		const currentCount = this._renderedRulers.length;
		const desiredCount = this._rulers.length;

		if (currentCount === desiredCount) {
			// Nothing to do
			return;
		}

		if (currentCount < desiredCount) {
			// Add more rulers
			let addCount = desiredCount - currentCount;
			while (addCount > 0) {
				let node = createFastDomNode(document.createElement('div'));
				node.setClassName('view-ruler');
				this.domNode.appendChild(node.domNode);
				this._renderedRulers.push(node);
				addCount--;
			}
			return;
		}

		let removeCount = currentCount - desiredCount;
		while (removeCount > 0) {
			let node = this._renderedRulers.pop();
			this.domNode.removeChild(node.domNode);
			removeCount--;
		}
	}

	public render(ctx: RestrictedRenderingContext): void {

		this._ensureRulersCount();

		for (let i = 0, len = this._rulers.length; i < len; i++) {
			let node = this._renderedRulers[i];

			node.setHeight(Math.min(ctx.scrollHeight, 1000000));
			node.setLeft(this._rulers[i] * this._typicalHalfwidthCharacterWidth);
		}
	}
}
