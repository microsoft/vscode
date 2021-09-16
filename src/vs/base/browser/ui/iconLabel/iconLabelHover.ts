/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { HoverPosition } from 'vs/base/browser/ui/hover/hoverWidget';
import { IHoverDelegate, IHoverDelegateOptions, IHoverDelegateTarget, IHoverWidget } from 'vs/base/browser/ui/iconLabel/iconHoverDelegate';
import { IIconLabelMarkdownString } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { RunOnceScheduler } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { isFunction, isString } from 'vs/base/common/types';
import { localize } from 'vs/nls';

export function setupNativeHover(htmlElement: HTMLElement, tooltip: string | IIconLabelMarkdownString | undefined): void {
	if (isString(tooltip)) {
		htmlElement.title = tooltip;
	} else if (tooltip?.markdownNotSupportedFallback) {
		htmlElement.title = tooltip.markdownNotSupportedFallback;
	} else {
		htmlElement.removeAttribute('title');
	}
}

export interface ICustomHover extends IDisposable {

	/**
	 * Allows to programmatically open the hover.
	 */
	show(): void;

	/**
	 * Allows to programmatically hide the hover.
	 */
	hide(): void;

	/**
	 * Updates the contents of the hover.
	 */
	update(tooltip: string | IIconLabelMarkdownString | HTMLElement): void;
}

type MarkdownTooltipContent = string | IIconLabelMarkdownString | HTMLElement | undefined;
type ResolvedMarkdownTooltipContent = IMarkdownString | string | HTMLElement | undefined;
class UpdatableHoverWidget implements IDisposable {

	private _hoverWidget: IHoverWidget | undefined;
	private _cancellationTokenSource: CancellationTokenSource | undefined;

	constructor(private hoverDelegate: IHoverDelegate, private target: IHoverDelegateTarget, private fadeInAnimation: boolean) {
	}

	async update(markdownTooltip: MarkdownTooltipContent): Promise<void> {
		if (this._cancellationTokenSource) {
			// there's an computation ongoing, cancel it
			this._cancellationTokenSource.dispose(true);
			this._cancellationTokenSource = undefined;
		}
		if (this.isDisposed) {
			return;
		}

		let resolvedContent;
		if (markdownTooltip === undefined || isString(markdownTooltip) || markdownTooltip instanceof HTMLElement) {
			resolvedContent = markdownTooltip;
		} else if (!isFunction(markdownTooltip.markdown)) {
			resolvedContent = markdownTooltip.markdown ?? markdownTooltip.markdownNotSupportedFallback;
		} else {
			// compute the content, potentially long-running

			// show 'Loading' if no hover is up yet
			if (!this._hoverWidget) {
				this.show(localize('iconLabel.loading', "Loading..."));
			}

			// compute the content
			const cancellationTokenSource = this._cancellationTokenSource = new CancellationTokenSource();
			resolvedContent = await markdownTooltip.markdown(cancellationTokenSource.token);

			if (this.isDisposed || cancellationTokenSource !== this._cancellationTokenSource) {
				// either the widget has been closed in the meantime
				// or there has been a new call to `update`
				return;
			}
		}

		this.show(resolvedContent);
	}

	private show(content: ResolvedMarkdownTooltipContent): void {
		const oldHoverWidget = this._hoverWidget;

		if (content) {
			const hoverOptions: IHoverDelegateOptions = {
				content: content,
				target: this.target,
				showPointer: this.hoverDelegate.placement === 'element',
				hoverPosition: HoverPosition.BELOW,
				skipFadeInAnimation: !this.fadeInAnimation || !!oldHoverWidget // do not fade in if the hover is already showing
			};

			this._hoverWidget = this.hoverDelegate.showHover(hoverOptions);
		}
		oldHoverWidget?.dispose();
	}

	get isDisposed() {
		return this._hoverWidget?.isDisposed;
	}

	dispose(): void {
		this._hoverWidget?.dispose();
		if (this._cancellationTokenSource) {
			this._cancellationTokenSource.dispose(true);
			this._cancellationTokenSource = undefined;
		}
	}

}
export function setupCustomHover(hoverDelegate: IHoverDelegate, htmlElement: HTMLElement, markdownTooltip: string | IIconLabelMarkdownString | HTMLElement): ICustomHover {
	let hoverPreparation: IDisposable | undefined;

	let hoverWidget: UpdatableHoverWidget | undefined;

	const hideHover = (disposeWidget: boolean, disposePreparation: boolean) => {
		if (disposeWidget) {
			hoverWidget?.dispose();
			hoverWidget = undefined;
		}
		if (disposePreparation) {
			hoverPreparation?.dispose();
			hoverPreparation = undefined;
		}
		hoverDelegate.onDidHideHover?.();
	};

	const showHoverDelayed = (delay: number) => {
		if (hoverPreparation) {
			return;
		}

		const mouseLeaveOrDown = (e: MouseEvent) => {
			const isMouseDown = e.type === dom.EventType.MOUSE_DOWN;
			hideHover(isMouseDown, isMouseDown || (<any>e).fromElement === htmlElement);
		};
		const mouseLeaveDomListener = dom.addDisposableListener(htmlElement, dom.EventType.MOUSE_LEAVE, mouseLeaveOrDown, true);
		const mouseDownDownListener = dom.addDisposableListener(htmlElement, dom.EventType.MOUSE_DOWN, mouseLeaveOrDown, true);

		const target: IHoverDelegateTarget = {
			targetElements: [htmlElement],
			dispose: () => { }
		};

		let mouseMoveDomListener: IDisposable | undefined;
		if (hoverDelegate.placement === undefined || hoverDelegate.placement === 'mouse') {
			const mouseMove = (e: MouseEvent) => target.x = e.x + 10;
			mouseMoveDomListener = dom.addDisposableListener(htmlElement, dom.EventType.MOUSE_MOVE, mouseMove, true);
		}

		const showHover = async () => {
			if (hoverPreparation && (!hoverWidget || hoverWidget.isDisposed)) {
				hoverWidget = new UpdatableHoverWidget(hoverDelegate, target, delay > 0);
				await hoverWidget.update(markdownTooltip);
			}
			mouseMoveDomListener?.dispose();
		};
		const timeout = new RunOnceScheduler(showHover, delay);
		timeout.schedule();

		hoverPreparation = toDisposable(() => {
			timeout.dispose();
			mouseMoveDomListener?.dispose();
			mouseDownDownListener.dispose();
			mouseLeaveDomListener.dispose();
		});
	};
	const mouseOverDomEmitter = dom.addDisposableListener(htmlElement, dom.EventType.MOUSE_OVER, () => showHoverDelayed(hoverDelegate.delay), true);
	const hover: ICustomHover = {
		show: () => {
			showHoverDelayed(0); // show hover immediately
		},
		hide: () => {
			hideHover(true, true);
		},
		update: async newTooltip => {
			markdownTooltip = newTooltip;
			await hoverWidget?.update(markdownTooltip);
		},
		dispose: () => {
			mouseOverDomEmitter.dispose();
			hideHover(true, true);
		}
	};
	return hover;
}
