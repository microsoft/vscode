/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/viewTitleBadge.css';
import { $, append } from '../../../../base/browser/dom.js';
import type { IManagedHover } from '../../../../base/browser/ui/hover/hover.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IViewTitleBadge } from '../../../common/views.js';

/**
 * Renders the {@link IViewTitleBadge} of a view after its title.
 */
export class ViewTitleBadgeWidget extends Disposable {

	readonly element: HTMLElement;
	private readonly icon: HTMLElement;
	private readonly label: HTMLElement;
	private readonly hover: IManagedHover;

	constructor(hoverService: IHoverService) {
		super();

		// The container takes the room left after the title, so the pill can drop its label when that room is small
		this.element = $('span.view-title-badge-container.hidden', { 'aria-hidden': 'true' });
		const pill = append(this.element, $('span.view-title-badge'));
		this.icon = append(pill, $('span.view-title-badge-icon'));
		this.label = append(pill, $('span.view-title-badge-label'));
		this.hover = this._register(hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), pill, ''));
	}

	update(badge: IViewTitleBadge | undefined): void {
		this.element.classList.toggle('hidden', !badge);
		this.icon.className = badge ? `view-title-badge-icon ${ThemeIcon.asClassName(badge.icon)}` : 'view-title-badge-icon';
		this.label.textContent = badge?.label ?? '';
		this.hover.update(badge?.tooltip ?? '');
	}
}
