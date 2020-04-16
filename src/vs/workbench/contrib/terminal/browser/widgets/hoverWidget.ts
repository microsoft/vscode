/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { renderMarkdown } from 'vs/base/browser/markdownRenderer';
import { Widget } from 'vs/base/browser/ui/widget';

export enum HorizontalAlignment {
	Left,
	Right
}

export enum VerticalAlignment {
	Top,
	Bottom
}

export interface IProposedAnchor {
	x: number;
	y: number;
	horizontalAlignment: HorizontalAlignment;
	verticalAlignment: VerticalAlignment;
}

/**
 * A target for a hover which can know about domain-specific locations.
 */
export interface IHoverTarget {
	proposeIdealAnchor(): IProposedAnchor
	proposeSecondaryAnchor(): IProposedAnchor
}

export class HoverWidget extends Widget {
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

		// TODO: Support horizontal alignment
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
