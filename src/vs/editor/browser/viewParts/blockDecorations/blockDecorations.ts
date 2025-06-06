/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createFastDomNode, FastDomNode } from '../../../../base/browser/fastDomNode.js';
import './blockDecorations.css';
import { RenderingContext, RestrictedRenderingContext } from '../../view/renderingContext.js';
import { ViewPart } from '../../view/viewPart.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import * as viewEvents from '../../../common/viewEvents.js';
import { ViewContext } from '../../../common/viewModel/viewContext.js';

export class BlockDecorations extends ViewPart {

	public domNode: FastDomNode<HTMLElement>;

	private readonly blocks: FastDomNode<HTMLElement>[] = [];

	private contentWidth: number = -1;
	private contentLeft: number = 0;

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

		const newContentLeft = layoutInfo.contentLeft;
		if (this.contentLeft !== newContentLeft) {
			this.contentLeft = newContentLeft;
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

			let top: number;
			let bottom: number;

			if (decoration.options.blockIsAfterEnd) {
				// range must be empty
				top = ctx.getVerticalOffsetAfterLineNumber(decoration.range.endLineNumber, false);
				bottom = ctx.getVerticalOffsetAfterLineNumber(decoration.range.endLineNumber, true);
			} else {
				top = ctx.getVerticalOffsetForLineNumber(decoration.range.startLineNumber, true);
				bottom = decoration.range.isEmpty() && !decoration.options.blockDoesNotCollapse
					? ctx.getVerticalOffsetForLineNumber(decoration.range.startLineNumber, false)
					: ctx.getVerticalOffsetAfterLineNumber(decoration.range.endLineNumber, true);
			}

			const [paddingTop, paddingRight, paddingBottom, paddingLeft] = decoration.options.blockPadding ?? [0, 0, 0, 0];

			block.setClassName('blockDecorations-block ' + decoration.options.blockClassName);
			block.setLeft(this.contentLeft - paddingLeft);
			block.setWidth(this.contentWidth + paddingLeft + paddingRight);
			block.setTop(top - ctx.scrollTop - paddingTop);
			block.setHeight(bottom - top + paddingTop + paddingBottom);

			count++;
		}

		for (let i = count; i < this.blocks.length; i++) {
			this.blocks[i].domNode.remove();
		}
		this.blocks.length = count;
	}
}
