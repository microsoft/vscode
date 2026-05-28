/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { AgentPluginItemKind, IAgentPluginItem } from '../agentPluginEditor/agentPluginItems.js';

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
	private readonly headerEl: HTMLElement;
	private readonly leadingSlotEl: HTMLElement;
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

		this.headerEl = DOM.append(this.root, $('.embedded-detail-header'));
		// Slot at the start of the header for callers to append leading chrome
		// (e.g. a back button) without reaching into private DOM structure.
		this.leadingSlotEl = DOM.append(this.headerEl, $('.embedded-detail-leading-slot'));
		const headerText = DOM.append(this.headerEl, $('.embedded-detail-header-text'));
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

	get headerElement(): HTMLElement {
		return this.headerEl;
	}

	/**
	 * Header slot reserved for leading chrome (e.g. a back button).
	 * Prefer this over reaching into the header element directly.
	 */
	get leadingSlot(): HTMLElement {
		return this.leadingSlotEl;
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
			return;
		}

		this.nameEl.textContent = item.name;

		const isMarketplace = item.kind === AgentPluginItemKind.Marketplace;

		const sourceLabel = item.marketplace
			? (isMarketplace
				? localize('pluginSourceMarketplace', "From {0}", item.marketplace)
				: localize('pluginSourceInstalled', "Installed from {0}", item.marketplace))
			: (isMarketplace
				? localize('pluginSourceMarketplaceUnknown', "Marketplace plugin")
				: localize('pluginSourceLocal', "Installed plugin"));
		this.sourceEl.textContent = sourceLabel;

		const description = (item.description || '').trim();
		this.descriptionEl.textContent = description;
		this.descriptionEl.style.display = description ? '' : 'none';
	}
}
