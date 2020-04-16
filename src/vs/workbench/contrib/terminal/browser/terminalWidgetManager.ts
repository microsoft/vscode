/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, dispose, DisposableStore } from 'vs/base/common/lifecycle';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { renderMarkdown } from 'vs/base/browser/markdownRenderer';
import { IEnvironmentVariableInfo } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { Widget } from 'vs/base/browser/ui/widget';
import { IViewportRange } from 'xterm';
import { getDomNodePagePosition } from 'vs/base/browser/dom';

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
		if (!this._container || !this._xtermViewport || this._hoverWidget?.isMouseOver) {
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

class HoverWidget extends Widget {
	private readonly _domNode: HTMLElement;
	private readonly _messageListeners = new DisposableStore();

	private _isMouseOver = false;

	// public get left(): number { return this._left; }
	// public get row(): number { return this._y; }
	// public get text(): IMarkdownString { return this._text; }
	public get domNode(): HTMLElement { return this._domNode; }
	// public get verticalAlignment(): WidgetVerticalAlignment { return this._verticalAlignment; }
	public get isMouseOver(): boolean { return this._isMouseOver; }

	constructor(
		private _container: HTMLElement,
		/**
		 * One or more targets that the hover must not overlap
		 */
		private _target: IHoverTarget,
		private _text: IMarkdownString,
		private _linkHandler: (url: string) => void
	) {
		super();
		this._domNode = renderMarkdown(this._text, {
			actionHandler: {
				callback: this._linkHandler,
				disposeables: this._messageListeners
			}
		});
		this._domNode.style.position = 'fixed';
		this.layout();

		this._domNode.classList.add('terminal-message-widget', 'fadeIn');

		this.onmouseover(this._domNode, () => this._isMouseOver = true);
		this.onnonbubblingmouseout(this._domNode, () => {
			console.log('mouseout');
			this._isMouseOver = false;
			this.dispose();
		});

		this._container.appendChild(this._domNode);
	}

	public layout(): void {
		const anchor = this._target.proposeIdealAnchor();
		console.log('anchor', anchor);
		this._domNode.style.left = `${anchor.x}px`;
		if (anchor.verticalAlignment === VerticalAlignment.Bottom) {
			this._domNode.style.bottom = `${anchor.y}px`;
		} else {
			this._domNode.style.top = `${anchor.y}px`;
		}
	}

	// public height(): number {

	// }

	public dispose(): void {
		console.log('dispose');
		if (this.domNode.parentElement === this._container) {
			this._container.removeChild(this.domNode);
		}
		this._messageListeners.dispose();
		super.dispose();
	}
}

enum HorizontalAlignment {
	Left,
	Right
}

enum VerticalAlignment {
	Top,
	Bottom
}

interface IProposedAnchor {
	x: number;
	y: number;
	horizontalAlignment: HorizontalAlignment;
	verticalAlignment: VerticalAlignment;
}

/**
 * A target for a hover which can know about domain-specific locations.
 */
interface IHoverTarget {
	proposeIdealAnchor(): IProposedAnchor
	proposeSecondaryAnchor(): IProposedAnchor
}

class CellHoverTarget extends Widget implements IHoverTarget {
	private _domNode: HTMLElement;
	private _targetDomNodes: HTMLElement[] = [];
	private _isDisposed: boolean = false;

	constructor(
		private readonly _container: HTMLElement,
		viewportRange: IViewportRange,
		cellDimensions: { width: number, height: number },
		terminalDimensions: { width: number, height: number }
	) {
		super();

		this._domNode = document.createElement('div');
		this._domNode.classList.add('terminal-hover-targets');

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
		this._targetDomNodes.push(topTarget);
		this._domNode.appendChild(topTarget);

		// Add middle target rows
		if (rowCount > 2) {
			const middleTarget = document.createElement('div');
			middleTarget.classList.add('terminal-hover-target');
			middleTarget.style.left = `0px`;
			middleTarget.style.bottom = `${(terminalDimensions.height - viewportRange.start.y - 1 - (rowCount - 2)) * cellDimensions.height}px`;
			middleTarget.style.width = `${terminalDimensions.width * cellDimensions.width}px`;
			middleTarget.style.height = `${(rowCount - 2) * cellDimensions.height}px`;
			this._targetDomNodes.push(middleTarget);
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
			this._targetDomNodes.push(bottomTarget);
			this._domNode.appendChild(bottomTarget);
		}

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
		const firstPosition = getDomNodePagePosition(this._targetDomNodes[0]);
		return {
			x: firstPosition.left,
			horizontalAlignment: HorizontalAlignment.Left,
			y: document.documentElement.clientHeight - firstPosition.top - 1,
			verticalAlignment: VerticalAlignment.Bottom
		};
	}

	proposeSecondaryAnchor(): IProposedAnchor {
		const firstPosition = getDomNodePagePosition(this._targetDomNodes[0]);
		return {
			x: firstPosition.left,
			horizontalAlignment: HorizontalAlignment.Left,
			y: firstPosition.top + firstPosition.height - 1,
			verticalAlignment: VerticalAlignment.Top
		};
	}
}
