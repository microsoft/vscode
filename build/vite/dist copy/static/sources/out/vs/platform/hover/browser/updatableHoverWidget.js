/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isHTMLElement } from '../../../base/browser/dom.js';
import { isManagedHoverTooltipMarkdownString } from '../../../base/browser/ui/hover/hover.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { isMarkdownString } from '../../../base/common/htmlContent.js';
import { isFunction, isString } from '../../../base/common/types.js';
import { localize } from '../../../nls.js';
export class ManagedHoverWidget {
    constructor(hoverDelegate, target, fadeInAnimation) {
        this.hoverDelegate = hoverDelegate;
        this.target = target;
        this.fadeInAnimation = fadeInAnimation;
    }
    onDidHide() {
        if (this._cancellationTokenSource) {
            // there's an computation ongoing, cancel it
            this._cancellationTokenSource.dispose(true);
            this._cancellationTokenSource = undefined;
        }
    }
    async update(content, focus, options) {
        if (this._cancellationTokenSource) {
            // there's an computation ongoing, cancel it
            this._cancellationTokenSource.dispose(true);
            this._cancellationTokenSource = undefined;
        }
        if (this.isDisposed) {
            return;
        }
        let resolvedContent;
        if (isString(content) || isHTMLElement(content) || content === undefined) {
            resolvedContent = content;
        }
        else {
            // compute the content, potentially long-running
            this._cancellationTokenSource = new CancellationTokenSource();
            const token = this._cancellationTokenSource.token;
            let managedContent;
            if (isManagedHoverTooltipMarkdownString(content)) {
                if (isFunction(content.markdown)) {
                    managedContent = content.markdown(token).then(resolvedContent => resolvedContent ?? content.markdownNotSupportedFallback);
                }
                else {
                    managedContent = content.markdown ?? content.markdownNotSupportedFallback;
                }
            }
            else {
                managedContent = content.element(token);
            }
            // compute the content
            if (managedContent instanceof Promise) {
                // show 'Loading' if no hover is up yet
                if (!this._hoverWidget) {
                    this.show(localize('iconLabel.loading', "Loading..."), focus, options);
                }
                resolvedContent = await managedContent;
            }
            else {
                resolvedContent = managedContent;
            }
            if (this.isDisposed || token.isCancellationRequested) {
                // either the widget has been closed in the meantime
                // or there has been a new call to `update`
                return;
            }
        }
        this.show(resolvedContent, focus, options);
    }
    show(content, focus, options) {
        const oldHoverWidget = this._hoverWidget;
        if (this.hasContent(content)) {
            const hoverOptions = {
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
                    hoverPosition: 2 /* HoverPosition.BELOW */,
                },
            };
            this._hoverWidget = this.hoverDelegate.showHover(hoverOptions, focus);
        }
        oldHoverWidget?.dispose();
    }
    hasContent(content) {
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
    dispose() {
        this._hoverWidget?.dispose();
        this._cancellationTokenSource?.dispose(true);
        this._cancellationTokenSource = undefined;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBkYXRhYmxlSG92ZXJXaWRnZXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL3VwZGF0YWJsZUhvdmVyV2lkZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUM3RCxPQUFPLEVBQUUsbUNBQW1DLEVBQTJFLE1BQU0seUNBQXlDLENBQUM7QUFHdkssT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDL0UsT0FBTyxFQUFFLGdCQUFnQixFQUF3QixNQUFNLHFDQUFxQyxDQUFDO0FBRTdGLE9BQU8sRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDckUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBSTNDLE1BQU0sT0FBTyxrQkFBa0I7SUFLOUIsWUFBb0IsYUFBNkIsRUFBVSxNQUEwQyxFQUFVLGVBQXdCO1FBQW5ILGtCQUFhLEdBQWIsYUFBYSxDQUFnQjtRQUFVLFdBQU0sR0FBTixNQUFNLENBQW9DO1FBQVUsb0JBQWUsR0FBZixlQUFlLENBQVM7SUFBSSxDQUFDO0lBRTVJLFNBQVM7UUFDUixJQUFJLElBQUksQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO1lBQ25DLDRDQUE0QztZQUM1QyxJQUFJLENBQUMsd0JBQXdCLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzVDLElBQUksQ0FBQyx3QkFBd0IsR0FBRyxTQUFTLENBQUM7UUFDM0MsQ0FBQztJQUNGLENBQUM7SUFFRCxLQUFLLENBQUMsTUFBTSxDQUFDLE9BQTZCLEVBQUUsS0FBZSxFQUFFLE9BQThCO1FBQzFGLElBQUksSUFBSSxDQUFDLHdCQUF3QixFQUFFLENBQUM7WUFDbkMs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