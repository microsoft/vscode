/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, dispose, DisposableStore } from 'vs/base/common/lifecycle';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IEnvironmentVariableInfo } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { Widget } from 'vs/base/browser/ui/widget';
import { IViewportRange } from 'xterm';
import { getDomNodePagePosition } from 'vs/base/browser/dom';
import { HoverWidget, HorizontalAlignment, VerticalAlignment, IProposedAnchor, IHoverTarget } from 'vs/workbench/contrib/terminal/browser/widgets/hoverWidget';

// const WIDGET_HEIGHT = 29;

export class TerminalWidgetManager implements IDisposable {
	private _container: HTMLElement | undefined;
	private _xtermViewport: HTMLElement | undefined;

	private _hoverWidget: HoverWidget | undefined;
	private readonly _hoverListeners = new DisposableStore();

	private _environmentVariableInfo: IEnvironmentVariableInfo | undefined;

	constructor() {
	}

	public attachToElement(terminalWrapper: HTMLElement) {
		if (!this._container) {
			this._container = document.createElement('div');
			this._container.classList.add('terminal-widget-container');
			terminalWrapper.appendChild(this._container);
			this._initTerminalHeightWatcher(terminalWrapper);
		}
	}

	public dispose(): void {
		if (this._container && this._container.parentElement) {
			this._container.parentElement.removeChild(this._container);
			this._container = undefined;
		}
		this._xtermViewport = undefined;
		this._hoverListeners.dispose();
	}

	private _initTerminalHeightWatcher(terminalWrapper: HTMLElement) {
		// Watch the xterm.js viewport for style changes and do a layout if it changes
		this._xtermViewport = <HTMLElement>terminalWrapper.querySelector('.xterm-viewport');
		if (!this._xtermViewport) {
			return;
		}
		const mutationObserver = new MutationObserver(() => this._refreshHeight());
		mutationObserver.observe(this._xtermViewport, { attributes: true, attributeFilter: ['style'] });
	}

	public showEnvironmentVariableInfo(info: IEnvironmentVariableInfo): IDisposable {
		this._environmentVariableInfo = info;
		return {
			dispose: () => {
				if (this._environmentVariableInfo === info) {
					this._environmentVariableInfo = undefined;
				}
			}
		};
	}

	public showHover(
		viewportRange: IViewportRange,
		cellDimensions: { width: number, height: number },
		terminalDimensions: { width: number, height: number },
		text: IMarkdownString,
		linkHandler: (url: string) => void
	): void {
		if (!this._container) {
			return;
		}
		dispose(this._hoverWidget);
		this._hoverListeners.clear();

		// TODO: Determine whether the tooltip should show on the bottom or top
		// const left = location.start.x * cellDimensions.width;
		// const top = location.start.y * cellDimensions.height;

		// TODO: Create targets and manage tooltip mouse leaving and positioning
		// this._hoverOverlayWidget = new HoverTarget(this._container, left, top, 50, 20);

		const target = new CellHoverTarget(this._container, viewportRange, cellDimensions, terminalDimensions);


		// this._hoverWidget = new HoverWidget(this._xtermViewport, this._container, target, left, top, text, linkHandler);
		this._hoverWidget = new HoverWidget(this._container, target, text, linkHandler);
	}

	public closeHover(): void {
		console.log('closeHover');
		this._hoverListeners.clear();
		// const currentWidget = this._hoverWidget;
		this._hoverWidget?.dispose();
		// this._hoverOverlayWidget?.dispose();
		// setTimeout(() => {
		// 	if (this._hoverWidget && !this._hoverWidget.mouseOver && this._hoverWidget === currentWidget) {
		// 		this._hoverListeners.add(HoverWidget.fadeOut(this._hoverWidget));
		// 	}
		// }, 50);
	}

	private _refreshHeight(): void {
		if (!this._container || !this._xtermViewport) {
			return;
		}
		this._container.style.height = this._xtermViewport.style.height;
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

		this._domNode = document.createElement('div');
		this._domNode.classList.add('terminal-hover-targets');

		const targets: HTMLElement[] = [];

		const rowCount = viewportRange.end.y - viewportRange.start.y + 1;

		// Add top target row
		const bottomLeft = {
			x: viewportRange.start.x * cellDimensions.width,
			y: (terminalDimensions.height - viewportRange.start.y - 1) * cellDimensions.height
		};
		const width = (viewportRange.end.y > viewportRange.start.y ? terminalDimensions.width - viewportRange.start.x : viewportRange.end.x - viewportRange.start.x + 1) * cellDimensions.width;
		const topTarget = document.createElement('div');
		topTarget.classList.add('terminal-hover-target');
		topTarget.style.left = `${bottomLeft.x}px`;
		topTarget.style.bottom = `${bottomLeft.y}px`;
		topTarget.style.width = `${width}px`;
		topTarget.style.height = `${cellDimensions.height}px`;
		targets.push(topTarget);
		this._domNode.appendChild(topTarget);

		// Add middle target rows
		if (rowCount > 2) {
			const middleTarget = document.createElement('div');
			middleTarget.classList.add('terminal-hover-target');
			middleTarget.style.left = `0px`;
			middleTarget.style.bottom = `${(terminalDimensions.height - viewportRange.start.y - 1 - (rowCount - 2)) * cellDimensions.height}px`;
			middleTarget.style.width = `${terminalDimensions.width * cellDimensions.width}px`;
			middleTarget.style.height = `${(rowCount - 2) * cellDimensions.height}px`;
			targets.push(middleTarget);
			this._domNode.appendChild(middleTarget);
		}

		// Add bottom target row
		if (rowCount > 1) {
			const bottomTarget = document.createElement('div');
			bottomTarget.classList.add('terminal-hover-target');
			bottomTarget.style.left = `0px`;
			bottomTarget.style.bottom = `${(terminalDimensions.height - viewportRange.end.y - 1) * cellDimensions.height}px`;
			bottomTarget.style.width = `${(viewportRange.end.x + 1) * cellDimensions.width}px`;
			bottomTarget.style.height = `${cellDimensions.height}px`;
			targets.push(bottomTarget);
			this._domNode.appendChild(bottomTarget);
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

	proposeIdealAnchor(): IProposedAnchor {
		const firstPosition = getDomNodePagePosition(this.targetElements[0]);
		return {
			x: firstPosition.left,
			horizontalAlignment: HorizontalAlignment.Left,
			y: document.documentElement.clientHeight - firstPosition.top - 1,
			verticalAlignment: VerticalAlignment.Bottom
		};
	}

	proposeSecondaryAnchor(): IProposedAnchor {
		const firstPosition = getDomNodePagePosition(this.targetElements[0]);
		return {
			x: firstPosition.left,
			horizontalAlignment: HorizontalAlignment.Left,
			y: firstPosition.top + firstPosition.height - 1,
			verticalAlignment: VerticalAlignment.Top
		};
	}
}
