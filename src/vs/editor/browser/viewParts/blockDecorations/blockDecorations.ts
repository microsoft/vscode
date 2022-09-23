/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createFastDomNode, FastDomNode } from 'vs/base/browser/fastDomNode';
import 'vs/css!./blockDecorations';
import { RenderingContext, RestrictedRenderingContext } from 'vs/editor/browser/view/renderingContext';
import { ViewPart } from 'vs/editor/browser/view/viewPart';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import * as viewEvents from 'vs/editor/common/viewEvents';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';

export class BlockDecorations extends ViewPart {

	public domNode: FastDomNode<HTMLElement>;

	private readonly blocks: FastDomNode<HTMLElement>[] = [];

	private contentWidth: number = -1;

	constructor(context: ViewContext) {
		super(context);

		this.domNode = createFastDomNode<HTMLElement>(document.createElement('div'));
		this.domNode.setAttribute('role', 'presentation');
		this.domNode.setAttribute('aria-hidden', 'true');
		this.domNode.setClassName('blockDecorations-container');

		this.update();
	}

	private update(): boolean {
		let didChange = false;
		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);
		const newContentWidth = layoutInfo.contentWidth - layoutInfo.verticalScrollbarWidth;

		if (this.contentWidth !== newContentWidth) {
			this.contentWidth = newContentWidth;
			didChange = true;
		}

		return didChange;
	}

	public override dispose(): void {
		super.dispose();
	}

	// --- begin event handlers

	public override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		return this.update();
	}
	public override onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return e.scrollTopChanged || e.scrollLeftChanged;
	}
	public override onDecorationsChanged(e: viewEvents.ViewDecorationsChangedEvent): boolean {
		return true;
	}

	public override onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return true;
	}

	// --- end event handlers
	public prepareRender(ctx: RenderingContext): void {
		// Nothing to read
	}

	public render(ctx: RestrictedRenderingContext): void {
		let count = 0;
		const decorations = ctx.getDecorationsInViewport();
		for (const decoration of decorations) {
			if (!decoration.options.blockClassName) {
				continue;
			}

			let block = this.blocks[count];
			if (!block) {
				block = this.blocks[count] = createFastDomNode(document.createElement('div'));
				this.domNode.appendChild(block);
			}
			const top = ctx.getVerticalOffsetForLineNumber(decoration.range.startLineNumber, true);
			const bottom = decoration.range.isEmpty()
				? ctx.getVerticalOffsetForLineNumber(decoration.range.startLineNumber, false)
				: ctx.getVerticalOffsetAfterLineNumber(decoration.range.endLineNumber, true);

			block.setClassName('blockDecorations-block ' + decoration.options.blockClassName);
			block.setLeft(ctx.scrollLeft);
			block.setWidth(this.contentWidth);
			block.setTop(top);
			block.setHeight(bottom - top);

			count++;
		}

		for (let i = count; i < this.blocks.length; i++) {
			this.blocks[i].domNode.remove();
		}
		this.blocks.length = count;
	}
}
