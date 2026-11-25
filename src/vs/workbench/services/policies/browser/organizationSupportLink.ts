/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, EventType } from '../../../../base/browser/dom.js';
import { HoverStyle } from '../../../../base/browser/ui/hover/hover.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { getOrganizationSupportActionTooltip, openOrganizationSupport } from '../common/organizationSupport.js';

/** A "Contact your administrator" link; dispose it to remove its click handlers and hover. */
export interface IContactAdministratorLink extends IDisposable {
	readonly element: HTMLAnchorElement;
}

/**
 * Appends "Contact your administrator for more information." to `container` as a link to the
 * organization's support page, with a hover naming its host.
 */
export function appendContactAdministratorLink(container: HTMLElement, className: string, supportUrl: string, openerService: IOpenerService, hoverService: Pick<IHoverService, 'setupDelayedHover'>): IContactAdministratorLink {
	const store = new DisposableStore();
	const link = append(container, $(`a.${className}`, { href: supportUrl }));
	link.textContent = localize('organizationSupport.contactAdministratorForMoreInformation', "Contact your administrator for more information.");
	store.add(hoverService.setupDelayedHover(link, { content: getOrganizationSupportActionTooltip(supportUrl), style: HoverStyle.Pointer }));
	const open = (e: MouseEvent) => {
		e.preventDefault();
		void openOrganizationSupport(openerService, supportUrl);
	};
	store.add(addDisposableListener(link, EventType.CLICK, open));
	// A middle click would otherwise follow the real href natively, skipping link protection.
	store.add(addDisposableListener(link, EventType.AUXCLICK, e => {
		if (e.button === 1) {
			open(e);
		}
	}));
	return { element: link as HTMLAnchorElement, dispose: () => store.dispose() };
}
