/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { AgentPluginItemKind, IAgentPluginItem } from '../agentPluginEditor/agentPluginItems.js';
import { extensionIcon, pluginIcon } from './aiCustomizationIcons.js';

const $ = DOM.$;

/**
 * Compact detail view for an agent plugin inside the AI Customizations management editor's
 * split-pane host. Renders identity (icon + name + source) and description.
 *
 * Advanced actions (enable / disable / uninstall) remain accessible via the row's existing
 * context menu, so this component intentionally stays small.
 */
export class EmbeddedAgentPluginDetail extends Disposable {

	private readonly root: HTMLElement;
	private readonly iconEl: HTMLElement;
	private readonly nameEl: HTMLElement;
	private readonly sourceEl: HTMLElement;
	private readonly descriptionEl: HTMLElement;
	private readonly emptyEl: HTMLElement;

	private current: IAgentPluginItem | undefined;

	constructor(
		parent: HTMLElement,
	) {
		super();

		this.root = DOM.append(parent, $('.ai-customization-embedded-detail.embedded-plugin-detail'));

		const header = DOM.append(this.root, $('.embedded-detail-header'));
		this.iconEl = DOM.append(header, $('.embedded-detail-icon'));
		const headerText = DOM.append(header, $('.embedded-detail-header-text'));
		this.nameEl = DOM.append(headerText, $('h2.embedded-detail-name'));
		this.nameEl.setAttribute('role', 'heading');
		this.sourceEl = DOM.append(headerText, $('.embedded-detail-scope'));

		this.descriptionEl = DOM.append(this.root, $('.embedded-detail-description'));

		this.emptyEl = DOM.append(this.root, $('.embedded-detail-empty'));
		this.emptyEl.textContent = localize('pluginDetailEmpty', "No plugin selected.");

		this.renderItem();
	}

	get element(): HTMLElement {
		return this.root;
	}

	setInput(item: IAgentPluginItem): void {
		this.current = item;
		this.renderItem();
	}

	clearInput(): void {
		this.current = undefined;
		this.renderItem();
	}

	private renderItem(): void {
		const item = this.current;
		const hasItem = !!item;
		this.emptyEl.style.display = hasItem ? 'none' : '';
		this.root.classList.toggle('is-empty', !hasItem);
		if (!item) {
			this.nameEl.textContent = '';
			this.sourceEl.textContent = '';
			this.descriptionEl.textContent = '';
			this.iconEl.className = 'embedded-detail-icon';
			return;
		}

		this.nameEl.textContent = item.name;

		const isMarketplace = item.kind === AgentPluginItemKind.Marketplace;
		const iconId = isMarketplace ? extensionIcon.id : pluginIcon.id;
		this.iconEl.className = `embedded-detail-icon codicon codicon-${iconId}`;

		const sourceLabel = item.marketplace
			? (isMarketplace
				? localize('pluginSourceMarketplace', "From {0}", item.marketplace)
				: localize('pluginSourceInstalled', "Installed from {0}", item.marketplace))
			: (isMarketplace
				? localize('pluginSourceMarketplaceUnknown', "Marketplace plugin")
				: localize('pluginSourceLocal', "Installed plugin"));
		const iconSpan = $(`span.codicon.codicon-${iconId}`);
		this.sourceEl.replaceChildren(iconSpan, document.createTextNode(' ' + sourceLabel));

		const description = (item.description || '').trim();
		this.descriptionEl.textContent = description;
		this.descriptionEl.style.display = description ? '' : 'none';
	}
}
