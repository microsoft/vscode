/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IConnectorPresentation, IConnectorsManagementService } from '../../common/connectorsManagementService.js';
import { getConnectorActionLabel, getConnectorPrimaryAction, getConnectorStatusLabel } from './connectorsListWidget.js';

const $ = DOM.$;

interface IConnectorContainsEntry {
	readonly label: string;
	readonly items: readonly {
		readonly name: string;
		readonly description?: string;
	}[];
}

export class EmbeddedConnectorDetail extends Disposable {

	private readonly root: HTMLElement;
	private readonly leadingSlotEl: HTMLElement;
	private readonly nameEl: HTMLElement;
	private readonly statusBadgeEl: HTMLElement;
	private readonly titleActionsEl: HTMLElement;
	private readonly descriptionEl: HTMLElement;
	private readonly detailsEl: HTMLElement;
	private readonly factsEl: HTMLElement;
	private readonly containsEl: HTMLElement;
	private readonly containsListEl: HTMLElement;
	private readonly otherInfoEl: HTMLElement;
	private readonly otherInfoFactsEl: HTMLElement;
	private readonly emptyEl: HTMLElement;
	private readonly renderDisposables = this._register(new DisposableStore());
	private readonly narrowLayoutUpdate = this._register(new MutableDisposable());
	private current: IConnectorPresentation | undefined;
	private narrowLayout = false;

	constructor(
		parent: HTMLElement,
		@IConnectorsManagementService private readonly connectorsService: IConnectorsManagementService,
		@INotificationService private readonly notificationService: INotificationService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		super();

		this.root = DOM.append(parent, $('.ai-customization-embedded-detail.embedded-connector-detail'));
		const targetWindow = DOM.getWindow(this.root);
		const resizeObserver = this._register(new DOM.DisposableResizeObserver(
			'EmbeddedConnectorDetail',
			() => {
				const narrow = this.root.offsetWidth < 520;
				if (this.narrowLayout !== narrow) {
					this.narrowLayoutUpdate.value = DOM.scheduleAtNextAnimationFrame(targetWindow, () => {
						this.narrowLayout = narrow;
						this.root.classList.toggle('narrow-layout', narrow);
					});
				}
			},
			targetWindow,
		));
		this._register(resizeObserver.observe(this.root));

		const header = DOM.append(this.root, $('.embedded-detail-header'));
		this.leadingSlotEl = DOM.append(header, $('.embedded-detail-leading-slot'));
		const headerText = DOM.append(header, $('.embedded-detail-header-text'));
		const nameRow = DOM.append(headerText, $('.embedded-detail-name-row'));
		this.nameEl = DOM.append(nameRow, $('h2.embedded-detail-name'));
		this.statusBadgeEl = DOM.append(nameRow, $('.inline-badge.embedded-detail-status-badge'));
		this.titleActionsEl = DOM.append(header, $('.embedded-detail-title-actions'));

		this.descriptionEl = DOM.append(this.root, $('.embedded-detail-description'));

		this.detailsEl = DOM.append(this.root, $('.embedded-detail-section.connector-detail-facts'));
		DOM.append(this.detailsEl, $('h3.embedded-detail-section-title')).textContent = localize('connectorDetailsTitle', "Details");
		this.factsEl = DOM.append(this.detailsEl, $('.embedded-detail-facts.plugin-detail-flat-list'));

		this.containsEl = DOM.append(this.root, $('.embedded-detail-section.plugin-detail-contributions.connector-detail-contains'));
		DOM.append(this.containsEl, $('h3.embedded-detail-section-title')).textContent = localize('connectorContainsTitle', "Contains");
		this.containsListEl = DOM.append(this.containsEl, $('.embedded-detail-chip-list.plugin-detail-flat-list'));

		this.otherInfoEl = DOM.append(this.root, $('.embedded-detail-section.connector-detail-facts.connector-detail-other-info'));
		DOM.append(this.otherInfoEl, $('h3.embedded-detail-section-title')).textContent = localize('connectorOtherInformationTitle', "Other Information");
		this.otherInfoFactsEl = DOM.append(this.otherInfoEl, $('.embedded-detail-facts.plugin-detail-flat-list'));

		this.emptyEl = DOM.append(this.root, $('.embedded-detail-empty'));
		this.emptyEl.textContent = localize('connectorDetailEmpty', "No connector selected.");

		this._register(this.connectorsService.onDidChangeConnectors(() => {
			void this.refreshCurrent();
		}));
		this.renderItem();
	}

	get leadingSlot(): HTMLElement {
		return this.leadingSlotEl;
	}

	setInput(connector: IConnectorPresentation): void {
		this.current = connector;
		this.renderItem();
	}

	clearInput(): void {
		this.current = undefined;
		this.renderItem();
	}

	private renderItem(): void {
		this.renderDisposables.clear();
		const connector = this.current;
		const hasItem = connector !== undefined;
		this.emptyEl.style.display = hasItem ? 'none' : '';
		this.root.classList.toggle('is-empty', !hasItem);
		if (!connector) {
			this.nameEl.textContent = '';
			this.statusBadgeEl.textContent = '';
			DOM.clearNode(this.titleActionsEl);
			this.descriptionEl.textContent = '';
			DOM.clearNode(this.factsEl);
			this.detailsEl.style.display = 'none';
			DOM.clearNode(this.containsListEl);
			this.containsEl.style.display = 'none';
			DOM.clearNode(this.otherInfoFactsEl);
			this.otherInfoEl.style.display = 'none';
			return;
		}

		this.nameEl.textContent = connector.displayName;
		this.statusBadgeEl.textContent = connector.releaseTag ?? '';
		this.statusBadgeEl.style.display = connector.releaseTag ? '' : 'none';
		this.statusBadgeEl.className = 'inline-badge embedded-detail-status-badge';
		this.descriptionEl.textContent = connector.description;

		DOM.clearNode(this.titleActionsEl);
		const action = getConnectorPrimaryAction(connector.connectionStatus);
		const actionLabel = getConnectorActionLabel(action);
		const actionButton = this.renderDisposables.add(new Button(this.titleActionsEl, {
			...defaultButtonStyles,
			secondary: connector.connectionStatus === 'connected',
			ariaLabel: localize('connectorDetailActionAriaLabel', "{0} {1}", actionLabel, connector.displayName),
		}));
		actionButton.label = actionLabel;
		this.renderDisposables.add(actionButton.onDidClick(() => this.runAction(connector)));

		DOM.clearNode(this.factsEl);
		DOM.clearNode(this.containsListEl);
		DOM.clearNode(this.otherInfoFactsEl);
		this.detailsEl.style.display = '';
		this.appendFact(this.factsEl, localize('connectorStatusFact', "Status"), getConnectorStatusLabel(connector.connectionStatus));
		this.appendFact(this.factsEl, localize('connectorIdentifierFact', "Identifier"), connector.id);
		this.appendFact(this.factsEl, localize('connectorVersionFact', "Version"), connector.version);
		this.appendFact(this.factsEl, localize('connectorAuthorFact', "Author"), this.formatAuthor(connector.author));
		this.renderContains(connector);
		let otherInformationCount = 0;
		otherInformationCount += this.appendLinkFact(this.otherInfoFactsEl, localize('connectorAuthorWebsiteFact', "Author Website"), connector.author?.url) ? 1 : 0;
		otherInformationCount += this.appendFact(this.otherInfoFactsEl, localize('connectorKeywordsFact', "Keywords"), this.formatList(connector.keywords)) ? 1 : 0;
		otherInformationCount += this.appendFact(this.otherInfoFactsEl, localize('connectorLicenseFact', "License"), connector.license) ? 1 : 0;
		otherInformationCount += this.appendLinkFact(this.otherInfoFactsEl, localize('connectorHomepageFact', "Homepage"), connector.homepage) ? 1 : 0;
		otherInformationCount += this.appendFact(this.otherInfoFactsEl, localize('connectorRepositoryFact', "Repository"), connector.repository) ? 1 : 0;
		this.otherInfoEl.style.display = otherInformationCount > 0 ? '' : 'none';
	}

	private appendFact(parent: HTMLElement, label: string, value: string | undefined): HTMLElement | undefined {
		if (!value) {
			return undefined;
		}
		const valueElement = this.appendFactRow(parent, label);
		valueElement.textContent = value;
		return valueElement;
	}

	private appendFactRow(parent: HTMLElement, label: string): HTMLElement {
		const row = DOM.append(parent, $('.embedded-detail-fact-row'));
		DOM.append(row, $('.embedded-detail-fact-label')).textContent = label;
		return DOM.append(row, $('.embedded-detail-fact-value'));
	}

	private appendLinkFact(parent: HTMLElement, label: string, url: string | undefined): boolean {
		if (!url) {
			return false;
		}
		const value = this.appendFactRow(parent, label);
		const link = DOM.append(value, $('a.embedded-detail-fact-link')) as HTMLAnchorElement;
		link.href = url;
		link.textContent = url;
		this.renderDisposables.add(DOM.addDisposableListener(link, 'click', event => {
			event.preventDefault();
			void this.openerService.open(URI.parse(url));
		}));
		return true;
	}

	private formatAuthor(author: IConnectorPresentation['author']): string {
		if (!author) {
			return '';
		}
		return [author.name, author.email].filter(value => !!value).join(' · ');
	}

	private formatList(values: readonly string[] | undefined): string | undefined {
		return values?.length ? values.join(', ') : undefined;
	}

	private renderContains(connector: IConnectorPresentation): void {
		const entries: readonly IConnectorContainsEntry[] = [
			{
				label: localize('connectorMcpServersFact', "MCP Servers"),
				items: (connector.mcpServers ?? []).map(server => ({
					name: server.name,
					description: server.url
						? localize('connectorMcpServerWithUrl', "{0} · {1}", server.type, server.url)
						: server.type,
				})),
			},
			{
				label: localize('connectorAgentsFact', "Agents"),
				items: (connector.agents ?? []).map(name => ({ name })),
			},
			{
				label: localize('connectorCommandsFact', "Commands"),
				items: (connector.commands ?? []).map(name => ({ name })),
			},
			{
				label: localize('connectorSkillsFact', "Skills"),
				items: (connector.skills ?? []).map(name => ({ name })),
			},
		].filter(entry => entry.items.length > 0);

		this.containsEl.style.display = entries.length > 0 ? '' : 'none';
		for (const entry of entries) {
			const section = DOM.append(this.containsListEl, $('.plugin-detail-contribution-section'));
			const header = DOM.append(section, $('.plugin-detail-contribution-group-title'));
			DOM.append(header, $('span.plugin-detail-contribution-title-label')).textContent = entry.label;
			DOM.append(header, $('span.plugin-detail-contribution-title-count')).textContent = String(entry.items.length);
			const group = DOM.append(section, $('.plugin-detail-contribution-group'));
			const list = DOM.append(group, $('.plugin-detail-contribution-list'));
			for (const item of entry.items) {
				const row = DOM.append(list, $('.plugin-detail-contribution-row'));
				DOM.append(row, $('.plugin-detail-contribution-name')).textContent = item.name;
				if (item.description) {
					DOM.append(row, $('.plugin-detail-contribution-description')).textContent = item.description;
				}
			}
		}
	}

	private async runAction(connector: IConnectorPresentation): Promise<void> {
		const action = getConnectorPrimaryAction(connector.connectionStatus);
		try {
			switch (action) {
				case 'connect':
				case 'reconnect':
					await this.connectorsService.connect(connector.id);
					break;
				case 'refresh':
					await this.connectorsService.refresh(connector.id);
					break;
				case 'disconnect':
					await this.connectorsService.disconnect(connector.id);
					break;
			}
			await this.refreshCurrent();
			status(localize('connectorDetailActionComplete', "{0}: {1}", connector.displayName, getConnectorActionLabel(action)));
		} catch (error) {
			this.notificationService.error(localize(
				'connectorDetailActionFailed',
				"Unable to update {0}: {1}",
				connector.displayName,
				error instanceof Error ? error.message : String(error)
			));
		}
	}

	private async refreshCurrent(): Promise<void> {
		const connectorId = this.current?.id;
		if (!connectorId) {
			return;
		}
		try {
			const snapshot = await this.connectorsService.getConnectors();
			const connector = snapshot.connectors.find(candidate => candidate.id === connectorId);
			if (connector) {
				this.current = connector;
				this.renderItem();
			}
		} catch (error) {
			this.notificationService.error(localize(
				'connectorDetailRefreshFailed',
				"Unable to refresh connector details: {0}",
				error instanceof Error ? error.message : String(error)
			));
		}
	}
}
