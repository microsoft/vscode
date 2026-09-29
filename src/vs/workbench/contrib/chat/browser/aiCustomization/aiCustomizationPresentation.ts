/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ContributionEnablementState } from '../../common/enablement.js';
import { IAgentPlugin } from '../../common/plugins/agentPluginService.js';

export function renderCustomizationMarketplaceIcon(
	container: HTMLElement,
	fallbackIcon: ThemeIcon,
	icon: URI | undefined,
	disposables: DisposableStore,
): void {
	DOM.clearNode(container);
	container.classList.toggle('has-custom-icon', !!icon);
	container.classList.toggle('is-fallback', !icon);
	const fallback = DOM.append(container, DOM.$('.codicon'));
	fallback.classList.add(...ThemeIcon.asClassNameArray(fallbackIcon));
	fallback.setAttribute('aria-hidden', 'true');
	fallback.hidden = !!icon;
	if (!icon) {
		return;
	}
	const image = DOM.append(container, DOM.$('img')) as HTMLImageElement;
	image.alt = '';
	image.loading = 'lazy';
	image.referrerPolicy = 'no-referrer';
	disposables.add(DOM.addDisposableListener(image, DOM.EventType.LOAD, () => {
		container.classList.remove('is-fallback');
	}));
	disposables.add(DOM.addDisposableListener(image, DOM.EventType.ERROR, () => {
		fallback.hidden = false;
		container.classList.add('is-fallback');
		image.remove();
	}));
	image.src = icon.toString(true);
}

export function getPluginInclusionLabel(plugin: IAgentPlugin): string {
	if (plugin.policyBlocked?.get() === true) {
		return localize('pluginBlockedByOrganization', "Blocked by Organization");
	}

	switch (plugin.enablement.get()) {
		case ContributionEnablementState.EnabledWorkspace:
			return localize('pluginIncludedInWorkspace', "Included in Workspace");
		case ContributionEnablementState.DisabledWorkspace:
			return localize('pluginExcludedFromWorkspace', "Excluded from Workspace");
		case ContributionEnablementState.EnabledProfile:
			return localize('pluginIncludedForProfile', "Included for Profile");
		case ContributionEnablementState.DisabledProfile:
			return localize('pluginExcludedFromProfile', "Excluded from Profile");
		default:
			return localize('pluginUnknownInclusion', "Inclusion Unknown");
	}
}
