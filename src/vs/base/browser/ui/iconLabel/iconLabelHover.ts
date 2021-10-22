/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { HoverPosition } from 'vs/base/browser/ui/hover/hoverWidget';
import { IHoverDelegate, IHoverDelegateOptions, IHoverDelegateTarget, IHoverWidget } from 'vs/base/browser/ui/iconLabel/iconHoverDelegate';
import { IIconLabelMarkdownString } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { TimeoutTimer } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { IMarkdownString, isMarkdownString } from 'vs/base/common/htmlContent';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
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
	show(focus?: boolean): void;

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

	constructor(private hoverDelegate: IHoverDelegate, private target: IHoverDelegateTarget | HTMLElement, private fadeInAnimation: boolean) {
	}

	async update(markdownTooltip: MarkdownTooltipContent, focus?: boolean): Promise<void> {
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
				this.show(localize('iconLabel.loading', "Loading..."), focus);
			}

			// compute the content
			this._cancellationTokenSource = new CancellationTokenSource();
			const token = this._cancellationTokenSource.token;
			resolvedContent = await markdownTooltip.markdown(token);

			if (this.isDisposed || token.isCancellationRequested) {
				// either the widget has been closed in the meantime
				// or there has been a new call to `update`
				return;
			}
		}

		this.show(resolvedContent, focus);
	}

	private show(content: ResolvedMarkdownTooltipContent, focus?: boolean): void {
		const oldHoverWidget = this._hoverWidget;

		if (this.hasContent(content)) {
			const hoverOptions: IHoverDelegateOptions = {
				content,
				target: this.target,
				showPointer: this.hoverDelegate.placement === 'element',
				hoverPosition: HoverPosition.BELOW,
				skipFadeInAnimation: !this.fadeInAnimation || !!oldHoverWidget // do not fade in if the hover is already showing
			};

			this._hoverWidget = this.hoverDelegate.showHover(hoverOptions, focus);
		}
		oldHoverWidget?.dispose();
	}

	private hasContent(content: ResolvedMarkdownTooltipContent): content is NonNullable<ResolvedMarkdownTooltipContent> {
		if (!content) {
			return false;
		}

		if (isMarkdownString(content)) {
			return !!content.value;
		}

		return true;
	}

	get isDisposed() {
		return this._hoverWidget?.isDisposed;
	}

	dispose(): void {
		this._hoverWidget?.dispose();
		this._cancellationTokenSource?.dispose(true);
		this._cancellationTokenSource = undefined;
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

	const triggerShowHover = (delay: number, focus?: boolean, target?: IHoverDelegateTarget) => {
		return new TimeoutTimer(async () => {
			if (!hoverWidget || hoverWidget.isDisposed) {
				hoverWidget = new UpdatableHoverWidget(hoverDelegate, target || htmlElement, delay > 0);
				await hoverWidget.update(markdownTooltip, focus);
			}
		}, delay);
	};

	const onMouseOver = () => {
		if (hoverPreparation) {
			return;
		}

		const toDispose: DisposableStore = new DisposableStore();

		const onMouseLeave = (e: MouseEvent) => hideHover(false, (<any>e).fromElement === htmlElement);
		toDispose.add(dom.addDisposableListener(htmlElement, dom.EventType.MOUSE_LEAVE, onMouseLeave, true));

		const onMouseDown = () => hideHover(true, true);
		toDispose.add(dom.addDisposableListener(htmlElement, dom.EventType.MOUSE_DOWN, onMouseDown, true));

		const target: IHoverDelegateTarget = {
			targetElements: [htmlElement],
			dispose: () => { }
		};
		if (hoverDelegate.placement === undefined || hoverDelegate.placement === 'mouse') {
			// track the mouse position
			const onMouseMove = (e: MouseEvent) => target.x = e.x + 10;
			toDispose.add(dom.addDisposableListener(htmlElement, dom.EventType.MOUSE_MOVE, onMouseMove, true));
		}
		toDispose.add(triggerShowHover(hoverDelegate.delay, false, target));

		hoverPreparation = toDispose;
	};
	const mouseOverDomEmitter = dom.addDisposableListener(htmlElement, dom.EventType.MOUSE_OVER, onMouseOver, true);
	const hover: ICustomHover = {
		show: focus => {
			hideHover(false, true); // terminate a ongoing mouse over preparation
			triggerShowHover(0, focus); // show hover immediately
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
