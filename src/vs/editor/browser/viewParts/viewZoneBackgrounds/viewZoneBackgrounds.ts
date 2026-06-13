/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FastDomNode, createFastDomNode } from '../../../../base/browser/fastDomNode.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import * as viewEvents from '../../../common/viewEvents.js';
import { ViewContext } from '../../../common/viewModel/viewContext.js';
import { ViewModelDecoration } from '../../../common/viewModel/viewModelDecoration.js';
import { RenderingContext, RestrictedRenderingContext } from '../../view/renderingContext.js';
import { ViewPart } from '../../view/viewPart.js';

/**
 * Renders selection and whole-line decoration backgrounds across view zones
 * (e.g. code lens, peek inset) that sit between lines which are themselves
 * covered by the selection/decoration. Without this, the area reserved by a
 * view zone visually breaks an otherwise contiguous selection or decoration
 * background.
 */
export class ViewZoneBackgrounds extends ViewPart {

	public readonly domNode: FastDomNode<HTMLElement>;

	private _selections: Selection[];
	private _renderedHtml: string;

	constructor(context: ViewContext) {
		super(context);

		this._selections = [];
		this._renderedHtml = '';

		this.domNode = createFastDomNode(document.createElement('div'));
		this.domNode.setClassName('view-zone-backgrounds');
		this.domNode.setPosition('absolute');
		this.domNode.setAttribute('role', 'presentation');
		this.domNode.setAttribute('aria-hidden', 'true');
	}

	// --- begin event handlers

	public override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		return true;
	}
	public override onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		this._selections = e.selections.slice(0);
		return true;
	}
	public override onDecorationsChanged(e: viewEvents.ViewDecorationsChangedEvent): boolean {
		return true;
	}
	public override onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		return true;
	}
	public override onLinesChanged(e: viewEvents.ViewLinesChangedEvent): boolean {
		return true;
	}
	public override onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): boolean {
		return true;
	}
	public override onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): boolean {
		return true;
	}
	public override onLineMappingChanged(e: viewEvents.ViewLineMappingChangedEvent): boolean {
		return true;
	}
	public override onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return e.scrollTopChanged || e.scrollWidthChanged;
	}
	public override onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return true;
	}

	// --- end event handlers

	public prepareRender(ctx: RenderingContext): void {
		// Nothing to read
	}

	public render(ctx: RestrictedRenderingContext): void {
		const whitespaces = ctx.viewportData.whitespaceViewportData;

		let html = '';
		if (whitespaces.length > 0) {
			// Collect whole-line decorations with a background-affecting className.
			const wholeLineDecorations: ViewModelDecoration[] = [];
			const allDecorations = ctx.getDecorationsInViewport();
			for (const d of allDecorations) {
				if (d.options.isWholeLine && d.options.className) {
					wholeLineDecorations.push(d);
				}
			}

			for (const ws of whitespaces) {
				if (ws.height <= 0) {
					continue;
				}
				// A whitespace with afterLineNumber === 0 sits before line 1
				// and is never enclosed by a range.
				if (ws.afterLineNumber <= 0) {
					continue;
				}

				const top = ws.verticalOffset - ctx.bigNumbersDelta;
				const beforeLine = ws.afterLineNumber;
				const afterLine = ws.afterLineNumber + 1;

				// Selection background
				let hasSelection = false;
				for (const selection of this._selections) {
					if (ViewZoneBackgrounds._rangeEnclosesGap(selection, beforeLine, afterLine)) {
						hasSelection = true;
						break;
					}
				}
				if (hasSelection) {
					html += `<div class="cslr selected-text" style="top:${top}px;height:${ws.height}px;left:0;width:100%;"></div>`;
				}

				// Whole-line decoration backgrounds
				for (const d of wholeLineDecorations) {
					if (ViewZoneBackgrounds._rangeEnclosesGap(d.range, beforeLine, afterLine)) {
						html += `<div class="cdr ${d.options.className}" style="top:${top}px;height:${ws.height}px;left:0;width:100%;"></div>`;
					}
				}
			}
		}

		if (this._renderedHtml !== html) {
			this.domNode.domNode.innerHTML = html;
			this._renderedHtml = html;
		}

		this.domNode.setWidth(Math.max(ctx.scrollWidth, 0));
	}

	private static _rangeEnclosesGap(range: Range, beforeLine: number, afterLine: number): boolean {
		// The gap between view lines `beforeLine` and `afterLine` is enclosed
		// when the range fully spans the line break, i.e. it starts at or
		// before `beforeLine` and ends at or after `afterLine`.
		return range.startLineNumber <= beforeLine && range.endLineNumber >= afterLine;
	}
}
