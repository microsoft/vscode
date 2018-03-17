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
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { editorRuler } from 'vs/editor/common/view/editorColorRegistry';
import * as dom from 'vs/base/browser/dom';

export class Rulers extends ViewPart {

	public domNode: FastDomNode<HTMLElement>;
	private _renderedRulers: FastDomNode<HTMLElement>[];
	private _rulers: number[];
	private _typicalHalfwidthCharacterWidth: number;

	constructor(context: ViewContext) {
		super(context);
		this.domNode = createFastDomNode<HTMLElement>(document.createElement('div'));
		this.domNode.setAttribute('role', 'presentation');
		this.domNode.setAttribute('aria-hidden', 'true');
		this.domNode.setClassName('view-rulers');
		this._renderedRulers = [];
		this._rulers = this._context.configuration.editor.viewInfo.rulers;
		this._typicalHalfwidthCharacterWidth = this._context.configuration.editor.fontInfo.typicalHalfwidthCharacterWidth;
	}

	public dispose(): void {
		super.dispose();
	}

	// --- begin event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		if (e.viewInfo || e.layoutInfo || e.fontInfo) {
			this._rulers = this._context.configuration.editor.viewInfo.rulers;
			this._typicalHalfwidthCharacterWidth = this._context.configuration.editor.fontInfo.typicalHalfwidthCharacterWidth;
			return true;
		}
		return false;
	}
	public onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return e.scrollHeightChanged;
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
			const rulerWidth = this._context.model.getTabSize();
			let addCount = desiredCount - currentCount;
			while (addCount > 0) {
				let node = createFastDomNode(document.createElement('div'));
				node.setClassName('view-ruler');
				node.setWidth(rulerWidth);
				this.domNode.appendChild(node);
				this._renderedRulers.push(node);
				addCount--;
			}
			return;
		}

		let removeCount = currentCount - desiredCount;
		while (removeCount > 0) {
			let node = this._renderedRulers.pop();
			this.domNode.removeChild(node);
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

registerThemingParticipant((theme, collector) => {
	let rulerColor = theme.getColor(editorRuler);
	if (rulerColor) {
		collector.addRule(`.monaco-editor .view-ruler { --box-shadow-color: ${rulerColor}; }`);
	}
});
