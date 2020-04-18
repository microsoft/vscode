/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { Widget } from 'vs/base/browser/ui/widget';
import { IViewportRange } from 'xterm';
import { ITerminalWidget, IHoverAnchor, IHoverTarget, HorizontalAnchorSide, VerticalAnchorSide } from 'vs/workbench/contrib/terminal/browser/widgets/widgets';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { HoverWidget } from 'vs/workbench/contrib/terminal/browser/widgets/hoverWidget';
import * as dom from 'vs/base/browser/dom';

const $ = dom.$;

export class TerminalHover extends Disposable implements ITerminalWidget {
	readonly id = 'hover';

	constructor(
		private _viewportRange: IViewportRange,
		private _cellDimensions: { width: number, height: number },
		private _terminalDimensions: { width: number, height: number },
		private _text: IMarkdownString,
		private _linkHandler: (url: string) => void,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();
	}

	attach(container: HTMLElement): void {
		const target = new CellHoverTarget(container, this._viewportRange, this._cellDimensions, this._terminalDimensions);
		this._register(this._instantiationService.createInstance(HoverWidget, container, target, this._text, this._linkHandler, []));
	}
}

class CellHoverTarget extends Widget implements IHoverTarget {
	private _domNode: HTMLElement;
	private _isDisposed: boolean = false;

	readonly targetElements: readonly HTMLElement[];

	constructor(
		private readonly _container: HTMLElement,
		viewportRange: IViewportRange,
		cellDimensions: { width: number, height: number },
		terminalDimensions: { width: number, height: number }
	) {
		super();

		this._domNode = $('div.terminal-hover-targets');
		const targets: HTMLElement[] = [];
		const rowCount = viewportRange.end.y - viewportRange.start.y + 1;

		// Add top target row
		const width = (viewportRange.end.y > viewportRange.start.y ? terminalDimensions.width - viewportRange.start.x : viewportRange.end.x - viewportRange.start.x + 1) * cellDimensions.width;
		const topTarget = $('div.terminal-hover-target.hoverHighlight');
		topTarget.style.left = `${(terminalDimensions.height - viewportRange.start.y - 1) * cellDimensions.height}px`;
		topTarget.style.bottom = `${viewportRange.start.x * cellDimensions.width}px`;
		topTarget.style.width = `${width}px`;
		topTarget.style.height = `${cellDimensions.height}px`;
		targets.push(this._domNode.appendChild(topTarget));

		// Add middle target rows
		if (rowCount > 2) {
			const middleTarget = $('div.terminal-hover-target.hoverHighlight');
			middleTarget.style.left = `0px`;
			middleTarget.style.bottom = `${(terminalDimensions.height - viewportRange.start.y - 1 - (rowCount - 2)) * cellDimensions.height}px`;
			middleTarget.style.width = `${terminalDimensions.width * cellDimensions.width}px`;
			middleTarget.style.height = `${(rowCount - 2) * cellDimensions.height}px`;
			targets.push(this._domNode.appendChild(middleTarget));
		}

		// Add bottom target row
		if (rowCount > 1) {
			const bottomTarget = $('div.terminal-hover-target.hoverHighlight');
			bottomTarget.style.left = `0px`;
			bottomTarget.style.bottom = `${(terminalDimensions.height - viewportRange.end.y - 1) * cellDimensions.height}px`;
			bottomTarget.style.width = `${(viewportRange.end.x + 1) * cellDimensions.width}px`;
			bottomTarget.style.height = `${cellDimensions.height}px`;
			targets.push(this._domNode.appendChild(bottomTarget));
		}

		this.targetElements = targets;

		this._container.appendChild(this._domNode);
	}

	dispose(): void {
		if (!this._isDisposed) {
			this._container.removeChild(this._domNode);
		}
		this._isDisposed = true;
		super.dispose();
	}

	get anchor(): IHoverAnchor {
		const firstPosition = dom.getDomNodePagePosition(this.targetElements[0]);
		return {
			x: firstPosition.left,
			horizontalAnchorSide: HorizontalAnchorSide.Left,
			y: document.documentElement.clientHeight - firstPosition.top - 1,
			verticalAnchorSide: VerticalAnchorSide.Bottom,
			fallbackY: firstPosition.top + firstPosition.height - 1
		};
	}
}
