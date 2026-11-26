/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { HoverStyle, type IHoverLifecycleOptions } from '../../../../../base/browser/ui/hover/hover.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';

const $ = DOM.$;

/** Team tags on neighboring rows explain the same thing, so moving between them shows the hover without another delay. */
const teamProvidedHoverLifecycleOptions: IHoverLifecycleOptions = { groupId: 'customizationTeamProvidedTag' };

/**
 * Whether to present a plugin or marketplace as provided by the user's GitHub Team.
 * The organization label takes precedence, because organization settings decide the state of anything they manage.
 */
export function isTeamProvidedVisible(team: boolean | undefined, organizationManaged: boolean): boolean {
	return team === true && !organizationManaged;
}

/** The tag text shown for a plugin or marketplace the user's GitHub Team provides. */
export function getTeamProvidedLabel(): string {
	return localize('teamProvidedLabel', "Managed by your GitHub Team");
}

/** The quick pick description for a marketplace the user's GitHub Team provides. */
export function getTeamProvidedMarketplaceDescription(): string {
	return localize('teamProvidedMarketplaceDescription', "Managed by GitHub Team");
}

/** Explains that a plugin is assigned by the user's GitHub Team without restricting it. */
export function getTeamProvidedPluginTooltip(): string {
	return localize('teamProvidedPluginTooltip', "Assigned by your GitHub Team. You can still enable or disable it.");
}

/** Explains that a marketplace is provided by the user's GitHub Team. */
export function getTeamProvidedMarketplaceTooltip(): string {
	return localize('teamProvidedMarketplaceTooltip', "Provided by your GitHub Team.");
}

/** Appends the Team label to a marketplace name where a tag can't be shown, such as a menu item. */
export function getTeamProvidedMarketplaceName(name: string): string {
	return localize('teamProvidedMarketplaceName', "{0} (Managed by GitHub Team)", name);
}

/** Appends the Team explanation to a plugin row's accessible label, so screen readers hear what the tag shows. */
export function withTeamProvidedPluginAriaLabel(label: string, teamProvided: boolean): string {
	return teamProvided ? localize('teamProvidedAriaLabel', "{0}. {1}", label, getTeamProvidedPluginTooltip()) : label;
}

/** The "Managed by your GitHub Team" tag shown next to the name of a plugin or marketplace the user's GitHub Team provides. */
export class TeamProvidedTag extends Disposable {

	private readonly element: HTMLElement;
	private tooltip = '';

	constructor(container: HTMLElement, hoverService: IHoverService) {
		super();
		this.element = DOM.append(container, $('.inline-badge.team-provided-tag'));
		DOM.append(this.element, $(`span${ThemeIcon.asCSSSelector(Codicon.shield)}`, { 'aria-hidden': 'true' }));
		DOM.append(this.element, $('span')).textContent = getTeamProvidedLabel();
		this._register(hoverService.setupDelayedHover(this.element, () => ({ content: this.tooltip, style: HoverStyle.Pointer }), teamProvidedHoverLifecycleOptions));
		this.update(undefined);
	}

	/** Shows the tag explained by `tooltip`, or hides it when `tooltip` is undefined. */
	update(tooltip: string | undefined): void {
		this.tooltip = tooltip ?? '';
		this.element.style.display = tooltip ? '' : 'none';
		this.element.setAttribute('aria-label', this.tooltip);
	}
}
