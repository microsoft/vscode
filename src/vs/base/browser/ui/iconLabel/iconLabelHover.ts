/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isFunction, isString } from 'vs/base/common/types';
import * as dom from 'vs/base/browser/dom';
import { IIconLabelMarkdownString } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { IHoverDelegate, IHoverDelegateOptions, IHoverDelegateTarget } from 'vs/base/browser/ui/iconLabel/iconHoverDelegate';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { DomEmitter } from 'vs/base/browser/event';
import { HoverPosition } from 'vs/base/browser/ui/hover/hoverWidget';
import { localize } from 'vs/nls';
import { IMarkdownString } from 'vs/base/common/htmlContent';


export function setupNativeHover(htmlElement: HTMLElement, tooltip: string | IIconLabelMarkdownString | undefined): void {
	if (isString(tooltip)) {
		htmlElement.title = tooltip;
	} else if (tooltip?.markdownNotSupportedFallback) {
		htmlElement.title = tooltip.markdownNotSupportedFallback;
	} else {
		htmlElement.removeAttribute('title');
	}
}

export function setupCustomHover(hoverDelegate: IHoverDelegate, htmlElement: HTMLElement, markdownTooltip: string | IIconLabelMarkdownString | undefined): IDisposable | undefined {
	if (!markdownTooltip) {
		return undefined;
	}

	const tooltip = getTooltipForCustom(markdownTooltip);

	let hoverOptions: IHoverDelegateOptions | undefined;
	let mouseX: number | undefined;
	let isHovering = false;
	let tokenSource: CancellationTokenSource;
	let hoverDisposable: IDisposable | undefined;

	const mouseOverDomEmitter = new DomEmitter(htmlElement, dom.EventType.MOUSE_OVER, true);
	mouseOverDomEmitter.event((e: MouseEvent) => {
		if (isHovering) {
			return;
		}
		tokenSource = new CancellationTokenSource();
		function mouseLeaveOrDown(e: MouseEvent): void {
			const isMouseDown = e.type === dom.EventType.MOUSE_DOWN;
			if (isMouseDown) {
				hoverDisposable?.dispose();
				hoverDisposable = undefined;
			}
			if (isMouseDown || (<any>e).fromElement === htmlElement) {
				isHovering = false;
				hoverOptions = undefined;
				tokenSource.dispose(true);
				mouseLeaveDomEmitter.dispose();
				mouseDownDomEmitter.dispose();
			}
		}
		const mouseLeaveDomEmitter = new DomEmitter(htmlElement, dom.EventType.MOUSE_LEAVE, true);
		mouseLeaveDomEmitter.event(mouseLeaveOrDown);
		const mouseDownDomEmitter = new DomEmitter(htmlElement, dom.EventType.MOUSE_DOWN, true);
		mouseDownDomEmitter.event(mouseLeaveOrDown);
		isHovering = true;

		function mouseMove(e: MouseEvent): void {
			mouseX = e.x;
		}
		const mouseMoveDomEmitter = new DomEmitter(htmlElement, dom.EventType.MOUSE_MOVE, true);
		mouseMoveDomEmitter.event(mouseMove);
		setTimeout(async () => {
			if (isHovering && tooltip) {
				// Re-use the already computed hover options if they exist.
				if (!hoverOptions) {
					const target: IHoverDelegateTarget = {
						targetElements: [htmlElement],
						dispose: () => { }
					};
					hoverOptions = {
						text: localize('iconLabel.loading', "Loading..."),
						target,
						hoverPosition: HoverPosition.BELOW
					};
					hoverDisposable = adjustXAndShowCustomHover(hoverOptions, mouseX, hoverDelegate, isHovering);

					const resolvedTooltip = (await tooltip(tokenSource.token)) ?? (!isString(markdownTooltip) ? markdownTooltip.markdownNotSupportedFallback : undefined);
					if (resolvedTooltip) {
						hoverOptions = {
							text: resolvedTooltip,
							target,
							hoverPosition: HoverPosition.BELOW
						};
						// awaiting the tooltip could take a while. Make sure we're still hovering.
						hoverDisposable = adjustXAndShowCustomHover(hoverOptions, mouseX, hoverDelegate, isHovering);
					} else if (hoverDisposable) {
						hoverDisposable.dispose();
						hoverDisposable = undefined;
					}
				}

			}
			mouseMoveDomEmitter.dispose();
		}, hoverDelegate.delay);
	});
	return mouseOverDomEmitter;
}


function getTooltipForCustom(markdownTooltip: string | IIconLabelMarkdownString): (token: CancellationToken) => Promise<string | IMarkdownString | undefined> {
	if (isString(markdownTooltip)) {
		return async () => markdownTooltip;
	} else if (isFunction(markdownTooltip.markdown)) {
		return markdownTooltip.markdown;
	} else {
		const markdown = markdownTooltip.markdown;
		return async () => markdown;
	}
}

function adjustXAndShowCustomHover(hoverOptions: IHoverDelegateOptions | undefined, mouseX: number | undefined, hoverDelegate: IHoverDelegate, isHovering: boolean): IDisposable | undefined {
	if (hoverOptions && isHovering) {
		if (mouseX !== undefined && (hoverDelegate.placement === undefined || hoverDelegate.placement === 'mouse')) {
			(<IHoverDelegateTarget>hoverOptions.target).x = mouseX + 10;
		}
		return hoverDelegate.showHover(hoverOptions);
	}
	return undefined;
}
