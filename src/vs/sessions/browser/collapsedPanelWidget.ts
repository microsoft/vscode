/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/collapsedPanelWidget.css';
import * as dom from '../../base/browser/dom.js';
import { $, append } from '../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../base/common/lifecycle.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../workbench/common/views.js';
import { IPaneCompositePartService } from '../../workbench/services/panecomposite/browser/panecomposite.js';
import { IWorkbenchLayoutService, Parts } from '../../workbench/services/layout/browser/layoutService.js';
import { IHoverService } from '../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../base/browser/ui/hover/hoverDelegateFactory.js';
import { ThemeIcon } from '../../base/common/themables.js';
import { Codicon } from '../../base/common/codicons.js';
import { enableDrag } from './collapsedPartWidgets.js';

/**
 * A compact widget shown in the bottom-right corner when the panel is collapsed.
 * Displays quick-action buttons for each registered panel view container,
 * allowing the user to expand the panel directly to a specific view.
 *
 * Designed as a placeholder for a future hover-preview feature.
 */
export class CollapsedPanelWidget extends Disposable {

	private readonly element: HTMLElement;
	private readonly buttonContainer: HTMLElement;
	private readonly buttonDisposables = this._register(new DisposableStore());

	constructor(
		parent: HTMLElement,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super();

		this.element = append(parent, $('.collapsed-panel-widget'));
		this.buttonContainer = append(this.element, $('.collapsed-panel-buttons'));

		// Listen for view container registration changes to rebuild buttons
		this._register(this.viewDescriptorService.onDidChangeViewContainers(() => this.rebuildButtons()));

		// Initial build
		this.rebuildButtons();

		// Enable drag repositioning
		this._register(enableDrag(this.element));

		// Start hidden — the workbench controls visibility
		this.hide();
	}

	private rebuildButtons(): void {
		this.buttonDisposables.clear();
		this.buttonContainer.textContent = '';

		const containers = this.viewDescriptorService.getViewContainersByLocation(ViewContainerLocation.Panel);
		for (const container of containers) {
			let icon: ThemeIcon | undefined;
			let title: string;
			try {
				const model = this.viewDescriptorService.getViewContainerModel(container);
				icon = ThemeIcon.isThemeIcon(model.icon) ? model.icon : undefined;
				title = model.title;
			} catch {
				icon = container.icon && ThemeIcon.isThemeIcon(container.icon) ? container.icon : undefined;
				title = typeof container.title === 'string' ? container.title : container.title.value;
			}

			const btn = append(this.buttonContainer, $('.collapsed-panel-button'));
			append(btn, $(ThemeIcon.asCSSSelector(icon ?? Codicon.window)));

			this.buttonDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), btn, title));

			this.buttonDisposables.add(dom.addDisposableListener(btn, dom.EventType.CLICK, () => {
				this.layoutService.setPartHidden(false, Parts.PANEL_PART);
				this.paneCompositeService.openPaneComposite(container.id, ViewContainerLocation.Panel);
			}));
		}
	}

	show(): void {
		// Reset any custom drag position so the widget returns to its default anchor
		this.element.style.top = '';
		this.element.style.left = '';
		this.element.style.bottom = '';
		this.element.style.right = '';
		this.element.classList.remove('collapsed-panel-hidden');
	}

	hide(): void {
		this.element.classList.add('collapsed-panel-hidden');
	}

	get isVisible(): boolean {
		return !this.element.classList.contains('collapsed-panel-hidden');
	}
}
