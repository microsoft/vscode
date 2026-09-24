/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { getErrorMessage } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { CustomizationMarketplaceMediaType, ICustomizationMarketplaceResource } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { CustomizationMarketplaceInstallState, ICustomizationMarketplaceInstallService } from '../../common/customizationMarketplaceInstallService.js';

const $ = DOM.$;

export interface IEmbeddedMarketplaceDetailOptions {
	readonly getSourceLabel: (sourceId: string) => string;
	readonly install: (resource: ICustomizationMarketplaceResource) => Promise<void>;
	readonly openExternal: (resource: URI | string) => Promise<void>;
}

export class EmbeddedMarketplaceDetail extends Disposable {
	private readonly root: HTMLElement;
	private readonly leadingSlotEl: HTMLElement;
	private readonly titleEl: HTMLElement;
	private readonly subtitleEl: HTMLElement;
	private readonly titleActionsEl: HTMLElement;
	private readonly descriptionEl: HTMLElement;
	private readonly stateEl: HTMLElement;
	private readonly factsEl: HTMLElement;
	private readonly sectionsEl: HTMLElement;
	private readonly renderDisposables = this._register(new DisposableStore());
	private current: ICustomizationMarketplaceResource | undefined;

	constructor(
		parent: HTMLElement,
		private readonly options: IEmbeddedMarketplaceDetailOptions,
		@ICustomizationMarketplaceInstallService private readonly installService: ICustomizationMarketplaceInstallService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this.root = DOM.append(parent, $('article.editor-content-container.ai-customization-embedded-detail.embedded-marketplace-detail'));
		const header = DOM.append(this.root, $('header.embedded-detail-header.marketplace-detail-header'));
		this.leadingSlotEl = DOM.append(header, $('.embedded-detail-leading-slot'));
		const identity = DOM.append(header, $('.embedded-detail-header-text'));
		this.titleEl = DOM.append(identity, $('h2.embedded-detail-name'));
		this.subtitleEl = DOM.append(identity, $('.embedded-detail-subtitle'));
		this.titleActionsEl = DOM.append(header, $('.embedded-detail-title-actions'));
		const body = DOM.append(this.root, $('.marketplace-detail-body'));
		this.descriptionEl = DOM.append(body, $('p.marketplace-detail-description'));
		this.stateEl = DOM.append(body, $('.marketplace-detail-state'));
		this.stateEl.setAttribute('role', 'status');
		this.factsEl = DOM.append(body, $('dl.marketplace-detail-facts'));
		this.sectionsEl = DOM.append(body, $('.marketplace-detail-sections'));
		this._register(this.installService.onDidChange(() => {
			if (this.current) {
				this.render();
			}
		}));
	}

	get leadingSlot(): HTMLElement {
		return this.leadingSlotEl;
	}

	setInput(resource: ICustomizationMarketplaceResource): void {
		this.current = resource;
		this.render();
	}

	clearInput(): void {
		this.current = undefined;
		this.renderDisposables.clear();
		this.titleEl.textContent = '';
		this.subtitleEl.textContent = '';
		this.descriptionEl.textContent = '';
		this.stateEl.textContent = '';
		DOM.clearNode(this.titleActionsEl);
		DOM.clearNode(this.factsEl);
		DOM.clearNode(this.sectionsEl);
	}

	getAccessibilityContent(): string {
		const resource = this.current;
		if (!resource) {
			return '';
		}
		const state = this.installService.getInstallState(resource);
		return [
			resource.displayName,
			`${getMarketplaceTypeLabel(resource)} · ${this.options.getSourceLabel(resource.sourceId)}`,
			resource.description,
			resource.publisher ? localize('marketplaceDetail.publisherAccessible', "Publisher: {0}", resource.publisher) : undefined,
			resource.version ? localize('marketplaceDetail.versionAccessible', "Version: {0}", resource.version) : undefined,
			resource.stars !== undefined ? localize('marketplaceDetail.starsAccessible', "Stars: {0}", resource.stars.toLocaleString()) : undefined,
			getInstallStateLabel(state),
			formatList(localize('marketplaceDetail.tags', "Tags"), resource.tags),
			formatList(localize('marketplaceDetail.capabilities', "Capabilities"), resource.capabilities),
			formatList(localize('marketplaceDetail.queries', "Representative queries"), resource.representativeQueries),
		].filter(Boolean).join('\n\n');
	}

	private render(): void {
		const resource = this.current;
		if (!resource) {
			return;
		}
		this.renderDisposables.clear();
		DOM.clearNode(this.titleActionsEl);
		DOM.clearNode(this.factsEl);
		DOM.clearNode(this.sectionsEl);

		this.titleEl.textContent = resource.displayName;
		this.subtitleEl.textContent = `${getMarketplaceTypeLabel(resource)} · ${this.options.getSourceLabel(resource.sourceId)}`;
		this.descriptionEl.textContent = resource.description || localize('marketplaceDetail.noDescription', "No description provided.");
		const state = this.installService.getInstallState(resource);
		this.stateEl.textContent = getInstallStateLabel(state);
		this.stateEl.classList.toggle('unavailable', state.kind === 'unavailable');

		this.renderInstallAction(resource, state);
		this.renderExternalAction(localize('marketplaceDetail.openResource', "Open Resource"), resource.externalUrl ?? resource.url);
		this.renderExternalAction(localize('marketplaceDetail.openRepository', "Open Repository"), resource.repository);

		this.appendFact(localize('marketplaceDetail.type', "Type"), getMarketplaceTypeLabel(resource));
		this.appendFact(localize('marketplaceDetail.source', "Source"), this.options.getSourceLabel(resource.sourceId));
		if (resource.publisher) {
			this.appendFact(localize('marketplaceDetail.publisher', "Publisher"), resource.publisher);
		}
		if (resource.version) {
			this.appendFact(localize('marketplaceDetail.version', "Version"), resource.version);
		}
		if (resource.stars !== undefined) {
			this.appendFact(localize('marketplaceDetail.stars', "Stars"), resource.stars.toLocaleString());
		}
		this.appendListSection(localize('marketplaceDetail.tags', "Tags"), resource.tags);
		this.appendListSection(localize('marketplaceDetail.capabilities', "Capabilities"), resource.capabilities);
		this.appendListSection(localize('marketplaceDetail.queries', "Representative queries"), resource.representativeQueries);
	}

	private renderInstallAction(resource: ICustomizationMarketplaceResource, state: CustomizationMarketplaceInstallState): void {
		const setupUrl = state.kind === 'unavailable' ? state.setupUrl : undefined;
		const label = state.kind === 'installed'
			? localize('marketplaceDetail.installed', "Installed")
			: state.kind === 'installing'
				? localize('marketplaceDetail.installing', "Installing...")
				: state.kind === 'uninstalling'
					? localize('marketplaceDetail.uninstalling', "Uninstalling...")
					: setupUrl
						? localize('marketplaceDetail.viewSetup', "View Setup")
						: localize('marketplaceDetail.install', "Install");
		const button = this.renderDisposables.add(new Button(this.titleActionsEl, {
			...defaultButtonStyles,
			ariaLabel: localize('marketplaceDetail.actionAria', "{0} {1}", label, resource.displayName),
		}));
		button.label = label;
		button.enabled = state.kind === 'available' || !!setupUrl;
		button.element.setAttribute('aria-busy', String(state.kind === 'installing'));
		this.renderDisposables.add(button.onDidClick(async () => {
			try {
				if (setupUrl) {
					await this.options.openExternal(setupUrl);
				} else {
					await this.options.install(resource);
					status(localize('marketplaceDetail.installedStatus', "Installed {0}.", resource.displayName));
				}
			} catch (error) {
				this.notificationService.error(localize('marketplaceDetail.installError', "Could not install {0}. {1}", resource.displayName, getErrorMessage(error)));
			}
		}));
	}

	private renderExternalAction(label: string, resource: URI | string | undefined): void {
		if (!resource) {
			return;
		}
		const button = this.renderDisposables.add(new Button(this.titleActionsEl, {
			...defaultButtonStyles,
			secondary: true,
			ariaLabel: label,
		}));
		button.label = label;
		this.renderDisposables.add(button.onDidClick(() => void this.options.openExternal(resource)));
	}

	private appendFact(label: string, value: string): void {
		const row = DOM.append(this.factsEl, $('.marketplace-detail-fact'));
		DOM.append(row, $('dt')).textContent = label;
		DOM.append(row, $('dd')).textContent = value;
	}

	private appendListSection(label: string, values: readonly string[]): void {
		if (!values.length) {
			return;
		}
		const section = DOM.append(this.sectionsEl, $('section.marketplace-detail-section'));
		DOM.append(section, $('h3')).textContent = label;
		const list = DOM.append(section, $('ul'));
		for (const value of values) {
			DOM.append(list, $('li')).textContent = value;
		}
	}
}

function getMarketplaceTypeLabel(resource: ICustomizationMarketplaceResource): string {
	switch (resource.mediaType) {
		case CustomizationMarketplaceMediaType.Skill:
			return localize('marketplaceDetail.skill', "Skill");
		case CustomizationMarketplaceMediaType.McpServer:
			return localize('marketplaceDetail.mcp', "MCP server");
		case CustomizationMarketplaceMediaType.ClaudePlugin:
		case CustomizationMarketplaceMediaType.CopilotPlugin:
		case CustomizationMarketplaceMediaType.CursorPlugin:
			return localize('marketplaceDetail.plugin', "Plugin");
		default:
			return resource.mediaType;
	}
}

function getInstallStateLabel(state: CustomizationMarketplaceInstallState): string {
	switch (state.kind) {
		case 'available':
			return localize('marketplaceDetail.availableState', "Available to install");
		case 'installing':
			return localize('marketplaceDetail.installingState', "Installation in progress");
		case 'installed':
			return localize('marketplaceDetail.installedState', "Installed");
		case 'uninstalling':
			return localize('marketplaceDetail.uninstallingState', "Uninstall in progress");
		case 'unavailable':
			return localize('marketplaceDetail.unavailableState', "Unavailable: {0}", state.message);
	}
}

function formatList(label: string, values: readonly string[]): string | undefined {
	return values.length ? `${label}: ${values.join(', ')}` : undefined;
}
