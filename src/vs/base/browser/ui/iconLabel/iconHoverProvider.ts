/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { isFunction, isString } from 'vs/base/common/types';
import * as dom from 'vs/base/browser/dom';
import { IIconLabelMarkdownString } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { IHoverDelegate, IHoverDelegateOptions, IHoverDelegateTarget } from 'vs/base/browser/ui/iconLabel/iconHoverDelegate';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { domEvent } from 'vs/base/browser/event';
import { HoverPosition } from 'vs/base/browser/ui/hover/hoverWidget';
import { localize } from 'vs/nls';
import { IMarkdownString } from 'vs/base/common/htmlContent';

export class CustomHoverProvider extends Disposable {

	private readonly customHovers: Map<HTMLElement, IDisposable> = new Map();

	constructor(private hoverDelegate: IHoverDelegate) {
		super();
	}

	public setupHover(htmlElement: HTMLElement, tooltip: string | IIconLabelMarkdownString | undefined): void {
		const previousCustomHover = this.customHovers.get(htmlElement);
		if (previousCustomHover) {
			previousCustomHover.dispose();
			this.customHovers.delete(htmlElement);
		}

		if (tooltip) {
			return this.setupCustomHover(this.hoverDelegate, htmlElement, tooltip);
		}
	}

	private getTooltipForCustom(markdownTooltip: string | IIconLabelMarkdownString): (token: CancellationToken) => Promise<string | IMarkdownString | undefined> {
		if (isString(markdownTooltip)) {
			return async () => markdownTooltip;
		} else if (isFunction(markdownTooltip.markdown)) {
			return markdownTooltip.markdown;
		} else {
			const markdown = markdownTooltip.markdown;
			return async () => markdown;
		}
	}

	private setupCustomHover(hoverDelegate: IHoverDelegate, htmlElement: HTMLElement, markdownTooltip: string | IIconLabelMarkdownString): void {
		let tooltip = this.getTooltipForCustom(markdownTooltip);

		let hoverOptions: IHoverDelegateOptions | undefined;
		let mouseX: number | undefined;
		let isHovering = false;
		let tokenSource: CancellationTokenSource;
		let hoverDisposable: IDisposable | undefined;
		function mouseOver(this: HTMLElement, e: MouseEvent): void {
			if (isHovering) {
				return;
			}
			tokenSource = new CancellationTokenSource();
			function mouseLeaveOrDown(this: HTMLElement, e: MouseEvent): void {
				const isMouseDown = e.type === dom.EventType.MOUSE_DOWN;
				if (isMouseDown) {
					hoverDisposable?.dispose();
					hoverDisposable = undefined;
				}
				if (isMouseDown || (<any>e).fromElement === htmlElement) {
					isHovering = false;
					hoverOptions = undefined;
					tokenSource.dispose(true);
					mouseLeaveDisposable.dispose();
					mouseDownDisposable.dispose();
				}
			}
			const mouseLeaveDisposable = domEvent(htmlElement, dom.EventType.MOUSE_LEAVE, true)(mouseLeaveOrDown.bind(htmlElement));
			const mouseDownDisposable = domEvent(htmlElement, dom.EventType.MOUSE_DOWN, true)(mouseLeaveOrDown.bind(htmlElement));
			isHovering = true;

			function mouseMove(this: HTMLElement, e: MouseEvent): void {
				mouseX = e.x;
			}
			const mouseMoveDisposable = domEvent(htmlElement, dom.EventType.MOUSE_MOVE, true)(mouseMove.bind(htmlElement));
			setTimeout(async () => {
				if (isHovering && tooltip) {
					// Re-use the already computed hover options if they exist.
					if (!hoverOptions) {
						const target: IHoverDelegateTarget = {
							targetElements: [this],
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
				mouseMoveDisposable.dispose();
			}, hoverDelegate.delay);
		}
		const mouseOverDisposable = this._register(domEvent(htmlElement, dom.EventType.MOUSE_OVER, true)(mouseOver.bind(htmlElement)));
		this.customHovers.set(htmlElement, mouseOverDisposable);
	}
}

function adjustXAndShowCustomHover(hoverOptions: IHoverDelegateOptions | undefined, mouseX: number | undefined, hoverDelegate: IHoverDelegate, isHovering: boolean): IDisposable | undefined {
	if (hoverOptions && isHovering) {
		if (mouseX !== undefined) {
			(<IHoverDelegateTarget>hoverOptions.target).x = mouseX + 10;
		}
		return hoverDelegate.showHover(hoverOptions);
	}
	return undefined;
}
