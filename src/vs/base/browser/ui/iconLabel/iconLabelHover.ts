/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { HoverPosition } from 'vs/base/browser/ui/hover/hoverWidget';
import { IHoverDelegate, IHoverDelegateOptions, IHoverDelegateTarget, IHoverWidget } from 'vs/base/browser/ui/iconLabel/iconHoverDelegate';
import { IIconLabelMarkdownString } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { RunOnceScheduler } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
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

type HoverWidgetContent = IMarkdownString | string | HTMLElement | undefined;
class UpdatableHoverWidget {

	private _content: HoverWidgetContent;
	private _hoverWidget: IHoverWidget | undefined;

	constructor(private hoverDelegate: IHoverDelegate, private target: IHoverDelegateTarget, private fadeInAnimation: boolean) {

	}
	update(content: HoverWidgetContent): void {
		this._content = content;

		let skipFadeInAnimation = !this.fadeInAnimation;

		if (this._hoverWidget) {
			if (this._hoverWidget.isDisposed) {
				return;
			}
			this._hoverWidget.dispose();
			skipFadeInAnimation = true; // hover is already up, no need to fade in
		}

		if (content) {
			const hoverOptions: IHoverDelegateOptions = {
				content: content,
				target: this.target,
				showPointer: this.hoverDelegate.placement === 'element',
				hoverPosition: HoverPosition.BELOW,
				skipFadeInAnimation
			};

			this._hoverWidget = this.hoverDelegate.showHover(hoverOptions);
		}
	}

	get content(): HoverWidgetContent {
		return this._content;
	}

	get isDisposed() {
		return this._hoverWidget && this._hoverWidget.isDisposed;
	}

	dispose(): void {
		this._hoverWidget?.dispose();
	}

}
export function setupCustomHover(hoverDelegate: IHoverDelegate, htmlElement: HTMLElement, markdownTooltip: string | IIconLabelMarkdownString | HTMLElement | undefined): ICustomHover | undefined {
	if (!markdownTooltip) {
		return undefined;
	}

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

		const tokenSource = new CancellationTokenSource();

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

				hoverWidget.update(localize('iconLabel.loading', "Loading..."));

				let resolvedTooltip = await computeTooltip(markdownTooltip, tokenSource.token);

				// awaiting the tooltip could take a while. Make sure we're still preparing to hover.
				if (hoverPreparation) {
					hoverWidget.update(resolvedTooltip);
				}

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
			tokenSource.dispose(true);
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
			if (hoverWidget && !hoverWidget.isDisposed) {
				let resolvedTooltip = await computeTooltip(markdownTooltip, CancellationToken.None);
				if (hoverWidget && !hoverWidget.isDisposed) {
					hoverWidget.update(resolvedTooltip);
				}
			}
		},
		dispose: () => {
			mouseOverDomEmitter.dispose();
			hideHover(true, true);
		}
	};
	return hover;
}

async function computeTooltip(markdownTooltip: string | IIconLabelMarkdownString | HTMLElement | undefined, token: CancellationToken): Promise<HoverWidgetContent> {
	if (markdownTooltip === undefined || isString(markdownTooltip) || markdownTooltip instanceof HTMLElement) {
		return markdownTooltip;
	} else if (isFunction(markdownTooltip.markdown)) {
		return markdownTooltip.markdown(token);
	}
	return markdownTooltip.markdown ?? markdownTooltip.markdownNotSupportedFallback;

}
