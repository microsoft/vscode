/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IViewportRange } from 'xterm';
import { HoverWidget } from 'vs/workbench/contrib/terminal/browser/widgets/hoverWidget';
import { ITerminalWidget } from 'vs/workbench/contrib/terminal/browser/widgets/widgets';
import { TerminalHover } from 'vs/workbench/contrib/terminal/browser/widgets/terminalHoverWidget';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export class TerminalWidgetManager implements IDisposable {
	private _container: HTMLElement | undefined;
	private _xtermViewport: HTMLElement | undefined;

	private _hoverWidget: HoverWidget | undefined;

	private _attached: Map<string, ITerminalWidget> = new Map();

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
	}

	attachToElement(terminalWrapper: HTMLElement) {
		if (!this._container) {
			this._container = document.createElement('div');
			this._container.classList.add('terminal-widget-container');
			terminalWrapper.appendChild(this._container);
			this._trackTerminalDimensions(terminalWrapper);
		}
	}

	dispose(): void {
		if (this._container && this._container.parentElement) {
			this._container.parentElement.removeChild(this._container);
			this._container = undefined;
		}
		this._xtermViewport = undefined;
	}

	showHover(
		viewportRange: IViewportRange,
		cellDimensions: { width: number, height: number },
		terminalDimensions: { width: number, height: number },
		text: IMarkdownString,
		linkHandler: (url: string) => void
	): void {
		if (!this._container) {
			return;
		}
		// dispose(this._hoverWidget);
		// this._hoverListeners.clear();
		const widget = this._instantiationService.createInstance(TerminalHover, viewportRange, cellDimensions, terminalDimensions, text, linkHandler);
		this.attachWidget(widget);
		// const hoverTarget = new CellHoverTarget(this._container, viewportRange, cellDimensions, terminalDimensions);
		// this._hoverWidget = new HoverWidget(this._container, hoverTarget, text, linkHandler);
	}

	attachWidget(widget: ITerminalWidget): IDisposable | undefined {
		if (!this._container) {
			return;
		}
		this._attached.get(widget.id)?.dispose();
		widget.attach(this._container);
		this._attached.set(widget.id, widget);
		return {
			dispose: () => {
				const current = this._attached.get(widget.id);
				if (current === widget) {
					this._attached.delete(widget.id);
					widget.dispose();
				}
			}
		};
	}

	closeHover(): void {
		this._hoverWidget?.dispose();
	}

	private _trackTerminalDimensions(terminalWrapper: HTMLElement) {
		// Watch the xterm.js viewport for style changes and do a layout if it changes
		this._xtermViewport = <HTMLElement>terminalWrapper.querySelector('.xterm-viewport');
		const xtermElement = <HTMLElement>terminalWrapper.querySelector('.xterm');
		if (!this._xtermViewport || !xtermElement) {
			return;
		}
		const mutationObserver = new MutationObserver(() => this._refreshDimensions());
		mutationObserver.observe(xtermElement, { attributes: true, attributeFilter: ['style'] });
		this._refreshDimensions();
	}

	private _refreshDimensions(): void {
		if (!this._container || !this._xtermViewport) {
			return;
		}
		const computed = window.getComputedStyle(this._xtermViewport);
		console.log('computed', computed);
		const marginRight = parseInt(computed.marginRight.replace('px', ''));
		const width = parseInt(computed.width.replace('px', ''));
		console.log('width', width, 'marginRight', marginRight);
		// this._container.style.width = `${width - marginRight}px`;
		this._container.style.width = `${width}px`;
	}
}
