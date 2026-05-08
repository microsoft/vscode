/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/openInVSCode.css';
import { $, append, EventHelper, EventLike } from '../../../base/browser/dom.js';
import { getDefaultHoverDelegate } from '../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../base/common/actions.js';
import { localize } from '../../../nls.js';
import { IHoverService } from '../../../platform/hover/browser/hover.js';
import { IProductService } from '../../../platform/product/common/productService.js';

/**
 * Renders the "Open in VS Code" titlebar entry as an icon-only button that
 * expands to reveal a label on hover / keyboard focus.
 */
export class OpenInVSCodeTitleBarWidget extends BaseActionViewItem {

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions | undefined,
		@IProductService private readonly productService: IProductService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super(undefined, action, options);
	}

	override render(container: HTMLElement): void {
		super.render(container);

		container.classList.add('open-in-vscode-titlebar-widget');
		container.setAttribute('role', 'button');

		// Set quality attribute for distro icon selection. Only set when quality is
		// known so that the CSS fallback icon is used in dev builds.
		const quality = this.productService.quality;
		if (quality) {
			container.setAttribute('data-product-quality', quality);
		}

		const label = this.action.label;
		const hoverText = localize('openInVSCodeHover', "Open in VS Code Editor Window");
		container.setAttribute('aria-label', hoverText);
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), container, hoverText));

		const icon = append(container, $('span.open-in-vscode-titlebar-widget-icon'));
		icon.setAttribute('aria-hidden', 'true');

		const labelEl = append(container, $('span.open-in-vscode-titlebar-widget-label'));
		labelEl.textContent = label;
	}

	override onClick(event: EventLike): void {
		EventHelper.stop(event, true);
		this.action.run();
	}
}
