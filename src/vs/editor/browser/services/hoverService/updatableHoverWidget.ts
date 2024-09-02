/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isHTMLElement } from '../../../../base/browser/dom.js';
import type { IHoverWidget, IManagedHoverContent, IManagedHoverOptions } from '../../../../base/browser/ui/hover/hover.js';
import type { IHoverDelegate, IHoverDelegateOptions, IHoverDelegateTarget } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isMarkdownString, type IMarkdownString } from '../../../../base/common/htmlContent.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { isFunction, isString } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';

type IManagedHoverResolvedContent = IMarkdownString | string | HTMLElement | undefined;

export class ManagedHoverWidget implements IDisposable {

	private _hoverWidget: IHoverWidget | undefined;
	private _cancellationTokenSource: CancellationTokenSource | undefined;

	constructor(private hoverDelegate: IHoverDelegate, private target: IHoverDelegateTarget | HTMLElement, private fadeInAnimation: boolean) {
	}

	async update(content: IManagedHoverContent, focus?: boolean, options?: IManagedHoverOptions): Promise<void> {
		if (this._cancellationTokenSource) {
			// there's an computation ongoing, cancel it
			this._cancellationTokenSource.dispose(true);
			this._cancellationTokenSource = undefined;
		}
		if (this.isDisposed) {
			return;
		}

		let resolvedContent;
		if (content === undefined || isString(content) || isHTMLElement(content)) {
			resolvedContent = content;
		} else if (!isFunction(content.markdown)) {
			resolvedContent = content.markdown ?? content.markdownNotSupportedFallback;
		} else {
			// compute the content, potentially long-running

			// show 'Loading' if no hover is up yet
			if (!this._hoverWidget) {
				this.show(localize('iconLabel.loading', "Loading..."), focus, options);
			}

			// compute the content
			this._cancellationTokenSource = new CancellationTokenSource();
			const token = this._cancellationTokenSource.token;
			resolvedContent = await content.markdown(token);
			if (resolvedContent === undefined) {
				resolvedContent = content.markdownNotSupportedFallback;
			}

			if (this.isDisposed || token.isCancellationRequested) {
				// either the widget has been closed in the meantime
				// or there has been a new call to `update`
				return;
			}
		}

		this.show(resolvedContent, focus, options);
	}

	private show(content: IManagedHoverResolvedContent, focus?: boolean, options?: IManagedHoverOptions): void {
		const oldHoverWidget = this._hoverWidget;

		if (this.hasContent(content)) {
			const hoverOptions: IHoverDelegateOptions = {
				content,
				target: this.target,
				actions: options?.actions,
				linkHandler: options?.linkHandler,
				trapFocus: options?.trapFocus,
				appearance: {
					showPointer: this.hoverDelegate.placement === 'element',
					skipFadeInAnimation: !this.fadeInAnimation || !!oldHoverWidget, // do not fade in if the hover is already showing
					showHoverHint: options?.appearance?.showHoverHint,
				},
				position: {
					hoverPosition: HoverPosition.BELOW,
				},
			};

			this._hoverWidget = this.hoverDelegate.showHover(hoverOptions, focus);
		}
		oldHoverWidget?.dispose();
	}

	private hasContent(content: IManagedHoverResolvedContent): content is NonNullable<IManagedHoverResolvedContent> {
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
