/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/openInVSCode.css';
import { $, append, EventHelper, EventLike } from '../../../../base/browser/dom.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../base/common/actions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { Menus } from '../../../browser/menus.js';

const OpenInVSCodeActionId = 'chat.openSessionWorktreeInVSCode';

/**
 * Renders the "Open in VS Code" titlebar entry as an icon-only button that
 * expands to reveal a label on hover / keyboard focus.
 */
class OpenInVSCodeTitleBarWidget extends BaseActionViewItem {

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

		// Set quality attribute for quality-tinted hover styling and distro icon selection.
		// Only set when quality is known so that the CSS fallback icon is used in dev builds.
		const quality = this.productService.quality;
		if (quality) {
			container.setAttribute('data-product-quality', quality);
		}

		const label = this.action.label || localize('openInVSCodeLabel', "Open in VS Code");
		container.setAttribute('aria-label', label);
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), container, label));

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

/**
 * Workbench contribution that registers the custom action view item for
 * the "Open in VS Code" action in the sessions titlebar toolbar, replacing
 * the default icon-only codicon with a rich expandable widget.
 */
class OpenInVSCodeWidgetContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.openInVSCode.widget';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._register(actionViewItemService.register(Menus.TitleBarSessionMenu, OpenInVSCodeActionId, (action, options) => {
			return instantiationService.createInstance(OpenInVSCodeTitleBarWidget, action, options);
		}, undefined));
	}
}

registerWorkbenchContribution2(OpenInVSCodeWidgetContribution.ID, OpenInVSCodeWidgetContribution, WorkbenchPhase.BlockRestore);
