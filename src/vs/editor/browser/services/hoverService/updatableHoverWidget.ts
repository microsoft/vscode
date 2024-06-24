/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isHTMLElement } from 'vs/base/browser/dom';
import type { IHoverWidget, IManagedHoverContent, IManagedHoverOptions } from 'vs/base/browser/ui/hover/hover';
import type { IHoverDelegate, IHoverDelegateOptions, IHoverDelegateTarget } from 'vs/base/browser/ui/hover/hoverDelegate';
import { HoverPosition } from 'vs/base/browser/ui/hover/hoverWidget';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { isMarkdownString, type IMarkdownString } from 'vs/base/common/htmlContent';
import { IDisposable } from 'vs/base/common/lifecycle';
import { isFunction, isString } from 'vs/base/common/types';
import { localize } from 'vs/nls';

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
				appearance: {
					showPointer: this.hoverDelegate.placement === 'element',
					skipFadeInAnimation: !this.fadeInAnimation || !!oldHoverWidget, // do not fade in if the hover is already showing
				},
				position: {
					hoverPosition: HoverPosition.BELOW,
				},
				...options
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
