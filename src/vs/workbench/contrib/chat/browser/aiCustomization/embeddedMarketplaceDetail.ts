/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { getErrorMessage, isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { CustomizationMarketplaceMediaType, ICustomizationMarketplaceResource } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { CustomizationMarketplaceInstallState, ICustomizationMarketplaceInstallService } from '../../common/customizationMarketplaceInstallService.js';
import { IMarketplacePluginPreview } from './embeddedAgentPluginDetail.js';

const $ = DOM.$;

export interface IEmbeddedMarketplaceDetailOptions {
	readonly getSourceLabel: (sourceId: string) => string;
	readonly install: (resource: ICustomizationMarketplaceResource) => Promise<void>;
	readonly openExternal: (resource: URI | string) => Promise<void>;
	readonly loadPluginPreview?: (resource: ICustomizationMarketplaceResource, token: CancellationToken) => Promise<IMarketplacePluginPreview | undefined>;
}

export class EmbeddedMarketplaceDetail extends Disposable {

	private readonly _onDidChangeContent = this._register(new Emitter<void>());
	readonly onDidChangeContent = this._onDidChangeContent.event;

	private readonly root: HTMLElement;
	private readonly leadingSlotEl: HTMLElement;
	private readonly titleEl: HTMLElement;
	private readonly titleActionsEl: HTMLElement;
	private readonly descriptionEl: HTMLElement;
	private readonly stateEl: HTMLElement;
	private readonly queriesEl: HTMLElement;
	private readonly factsEl: HTMLElement;
	private readonly containsEl: HTMLElement;
	private readonly containsListEl: HTMLElement;
	private readonly readmeEl: HTMLElement;
	private readonly readmeContentEl: HTMLElement;
	private readonly renderDisposables = this._register(new DisposableStore());
	private readonly previewDisposables = this._register(new MutableDisposable<DisposableStore>());
	private renderGeneration = 0;
	private current: ICustomizationMarketplaceResource | undefined;

	constructor(
		parent: HTMLElement,
		private readonly options: IEmbeddedMarketplaceDetailOptions,
		@ICustomizationMarketplaceInstallService private readonly installService: ICustomizationMarketplaceInstallService,
		@INotificationService private readonly notificationService: INotificationService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
	) {
		super();
		this.root = DOM.append(parent, $('article.ai-customization-embedded-detail.embedded-marketplace-detail'));
		const header = DOM.append(this.root, $('header.embedded-detail-header.marketplace-detail-header'));
		this.leadingSlotEl = DOM.append(header, $('.embedded-detail-leading-slot'));
		const identity = DOM.append(header, $('.embedded-detail-header-text'));
		const nameRow = DOM.append(identity, $('.embedded-detail-name-row'));
		this.titleEl = DOM.append(nameRow, $('h2.embedded-detail-name'));
		this.stateEl = DOM.append(nameRow, $('.inline-badge.embedded-detail-status-badge'));
		this.stateEl.setAttribute('role', 'status');
		this.titleActionsEl = DOM.append(header, $('.embedded-detail-title-actions'));
		this.descriptionEl = DOM.append(this.root, $('p.embedded-detail-description.marketplace-detail-description'));

		const queriesSection = DOM.append(this.root, $('section.embedded-detail-section.marketplace-detail-queries'));
		DOM.append(queriesSection, $('h3.embedded-detail-section-title')).textContent = localize('marketplaceDetail.tryThis', "Try this");
		this.queriesEl = DOM.append(queriesSection, $('ul.marketplace-detail-query-list'));

		const factsSection = DOM.append(this.root, $('section.embedded-detail-section.marketplace-detail-source-facts'));
		DOM.append(factsSection, $('h3.embedded-detail-section-title')).textContent = localize('marketplaceDetail.details', "Details");
		this.factsEl = DOM.append(factsSection, $('dl.embedded-detail-facts.plugin-detail-flat-list.marketplace-detail-facts'));

		this.containsEl = DOM.append(this.root, $('section.embedded-detail-section.plugin-detail-contributions'));
		DOM.append(this.containsEl, $('h3.embedded-detail-section-title')).textContent = localize('marketplaceDetail.contains', "Contains");
		this.containsListEl = DOM.append(this.containsEl, $('.embedded-detail-chip-list.plugin-detail-flat-list'));

		this.readmeEl = DOM.append(this.root, $('section.embedded-detail-section.plugin-detail-readme'));
		const readmeTitle = DOM.append(this.readmeEl, $('h3.plugin-detail-contribution-group-title'));
		DOM.append(readmeTitle, $('span.plugin-detail-contribution-title-label')).textContent = localize('marketplaceDetail.pluginReadme', "Plugin README");
		this.readmeContentEl = DOM.append(this.readmeEl, $('.plugin-detail-readme-content'));

		this._register(this.installService.onDidChange(() => {
			if (this.current) {
				this.render(true);
			}
		}));
	}

	get leadingSlot(): HTMLElement {
		return this.leadingSlotEl;
	}

	setInput(resource: ICustomizationMarketplaceResource): void {
		this.current = resource;
		this.render(true);
	}

	clearInput(): void {
		this.current = undefined;
		this.renderGeneration++;
		this.previewDisposables.clear();
		this.renderDisposables.clear();
		this.titleEl.textContent = '';
		this.descriptionEl.textContent = '';
		this.stateEl.textContent = '';
		DOM.clearNode(this.titleActionsEl);
		DOM.clearNode(this.queriesEl);
		DOM.clearNode(this.factsEl);
		DOM.clearNode(this.containsListEl);
		DOM.clearNode(this.readmeContentEl);
		this.containsEl.style.display = 'none';
		this.readmeEl.style.display = 'none';
	}

	getAccessibilityContent(): string {
		const resource = this.current;
		if (!resource) {
			return '';
		}
		const state = this.installService.getInstallState(resource);
		const target = getLocationTarget(state);
		return [
			resource.displayName,
			getInstallStateLabel(state),
			resource.description,
			formatList(localize('marketplaceDetail.queries', "Try this"), resource.representativeQueries),
			localize('marketplaceDetail.typeAccessible', "Type: {0}", getMarketplaceTypeLabel(resource)),
			resource.publisher ? localize('marketplaceDetail.publisherAccessible', "Publisher: {0}", resource.publisher) : undefined,
			resource.version ? localize('marketplaceDetail.versionAccessible', "Version: {0}", resource.version) : undefined,
			localize('marketplaceDetail.sourceAccessible', "Source: {0}", this.options.getSourceLabel(resource.sourceId)),
			formatList(localize('marketplaceDetail.tags', "Tags"), resource.tags),
			resource.repository ? localize('marketplaceDetail.repositoryAccessible', "Repository: {0}", getRepositoryLabel(resource.repository)) : undefined,
			target ? localize('marketplaceDetail.locationAccessible', "Location: {0}", target.fsPath || target.toString()) : undefined,
		].filter(Boolean).join('\n\n');
	}

	private render(loadPreview: boolean): void {
		const resource = this.current;
		if (!resource) {
			return;
		}
		this.renderDisposables.clear();
		DOM.clearNode(this.titleActionsEl);
		DOM.clearNode(this.queriesEl);
		DOM.clearNode(this.factsEl);

		this.titleEl.textContent = resource.displayName;
		this.descriptionEl.textContent = resource.description || localize('marketplaceDetail.noDescription', "No description provided.");
		const state = this.installService.getInstallState(resource);
		this.stateEl.textContent = getInstallStateLabel(state);
		this.stateEl.classList.toggle('unavailable', state.kind === 'unavailable');

		this.renderInstallAction(resource, state);
		this.renderQueries(resource.representativeQueries);
		this.appendFact(localize('marketplaceDetail.type', "Type"), getMarketplaceTypeLabel(resource));
		if (resource.publisher) {
			this.appendFact(localize('marketplaceDetail.publisher', "Publisher"), resource.publisher);
		}
		if (resource.version) {
			this.appendFact(localize('marketplaceDetail.version', "Version"), resource.version);
		}
		const sourceLabel = this.options.getSourceLabel(resource.sourceId);
		this.appendFact(localize('marketplaceDetail.source', "Source"), this.createLink(sourceLabel, resource.externalUrl ?? resource.url ?? resource.repository));
		if (resource.tags.length) {
			this.appendFact(localize('marketplaceDetail.tags', "Tags"), resource.tags.join(', '));
		}
		if (resource.repository) {
			this.appendFact(localize('marketplaceDetail.repository', "Repository"), this.createLink(getRepositoryLabel(resource.repository), resource.repository));
		}
		const location = getLocationTarget(state);
		if (location) {
			const value = $('span');
			value.textContent = location.fsPath || location.toString();
			value.title = location.fsPath || location.toString();
			this.appendFact(localize('marketplaceDetail.location', "Location"), value);
		}

		if (loadPreview) {
			this.renderPluginPreview(resource);
		}
		this._onDidChangeContent.fire();
	}

	private renderQueries(queries: readonly string[]): void {
		const section = this.queriesEl.parentElement;
		if (section) {
			section.style.display = queries.length ? '' : 'none';
		}
		for (const query of queries) {
			DOM.append(this.queriesEl, $('li')).textContent = query;
		}
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

	private appendFact(label: string, value: string | HTMLElement): void {
		const row = DOM.append(this.factsEl, $('.embedded-detail-fact-row'));
		DOM.append(row, $('dt.embedded-detail-fact-label')).textContent = label;
		const valueEl = DOM.append(row, $('dd.embedded-detail-fact-value'));
		if (typeof value === 'string') {
			valueEl.textContent = value;
		} else {
			valueEl.classList.add('has-actions');
			valueEl.appendChild(value);
		}
	}

	private createLink(label: string, resource: URI | string | undefined): HTMLElement {
		if (!resource) {
			const value = $('span');
			value.textContent = label;
			return value;
		}
		const link = $('a.embedded-detail-fact-link') as HTMLAnchorElement;
		link.href = typeof resource === 'string' ? resource : resource.toString();
		link.textContent = label;
		this.renderDisposables.add(DOM.addDisposableListener(link, DOM.EventType.CLICK, event => {
			event.preventDefault();
			void this.options.openExternal(resource);
		}));
		return link;
	}

	private renderPluginPreview(resource: ICustomizationMarketplaceResource): void {
		this.previewDisposables.clear();
		DOM.clearNode(this.containsListEl);
		DOM.clearNode(this.readmeContentEl);
		const loadPreview = this.options.loadPluginPreview;
		if (!loadPreview || !isPlugin(resource)) {
			this.containsEl.style.display = 'none';
			this.readmeEl.style.display = 'none';
			return;
		}

		this.containsEl.style.display = '';
		this.readmeEl.style.display = '';
		DOM.append(this.containsListEl, $('.plugin-detail-contribution-empty')).textContent = localize('marketplaceDetail.containsLoading', "Loading contained items...");
		DOM.append(this.readmeContentEl, $('.plugin-detail-readme-message')).textContent = localize('marketplaceDetail.readmeLoading', "Loading plugin README...");

		const generation = ++this.renderGeneration;
		const disposables = new DisposableStore();
		this.previewDisposables.value = disposables;
		const cancellation = disposables.add(new CancellationTokenSource());
		void loadPreview(resource, cancellation.token).then(preview => {
			if (!preview || !this.isCurrent(resource, generation)) {
				return;
			}
			this.renderContains(preview);
			this.renderReadme(preview);
			this._onDidChangeContent.fire();
		}, error => {
			if (isCancellationError(error) || cancellation.token.isCancellationRequested || !this.isCurrent(resource, generation)) {
				return;
			}
			DOM.clearNode(this.containsListEl);
			DOM.append(this.containsListEl, $('.plugin-detail-contribution-empty')).textContent = localize('marketplaceDetail.containsError', "Could not load contained items. {0}", getErrorMessage(error));
			DOM.clearNode(this.readmeContentEl);
			DOM.append(this.readmeContentEl, $('.plugin-detail-readme-message')).textContent = localize('marketplaceDetail.readmeLoadError', "The plugin README could not be loaded.");
			this._onDidChangeContent.fire();
		});
	}

	private renderContains(preview: IMarketplacePluginPreview): void {
		DOM.clearNode(this.containsListEl);
		const entries = preview.contributions.filter(entry => entry.kind === 'skills' || entry.kind === 'mcp');
		this.containsEl.style.display = entries.length ? '' : 'none';
		for (const entry of entries) {
			const section = DOM.append(this.containsListEl, $('.plugin-detail-contribution-section'));
			const header = DOM.append(section, $('.plugin-detail-contribution-group-title'));
			DOM.append(header, $('span.plugin-detail-contribution-title-label')).textContent = entry.kind === 'skills'
				? localize('marketplaceDetail.skills', "Skills")
				: localize('marketplaceDetail.mcpServers', "MCP Servers");
			DOM.append(header, $('span.plugin-detail-contribution-title-count')).textContent = String(entry.items.length);
			const group = DOM.append(section, $('.plugin-detail-contribution-group'));
			const list = DOM.append(group, $('.plugin-detail-contribution-list'));
			for (const item of entry.items) {
				DOM.append(DOM.append(list, $('.plugin-detail-contribution-row')), $('.plugin-detail-contribution-name')).textContent = item.name;
			}
		}
	}

	private renderReadme(preview: IMarketplacePluginPreview): void {
		DOM.clearNode(this.readmeContentEl);
		this.readmeEl.style.display = '';
		if (!preview.readme) {
			DOM.append(this.readmeContentEl, $('.plugin-detail-readme-message')).textContent = localize('marketplaceDetail.readmeMissing', "No README was provided for this plugin.");
			return;
		}
		if (!preview.readme.content.trim()) {
			DOM.append(this.readmeContentEl, $('.plugin-detail-readme-message')).textContent = localize('marketplaceDetail.readmeEmpty', "The plugin README is empty.");
			return;
		}
		const markdown = new MarkdownString(preview.readme.content, { supportHtml: false });
		markdown.baseUri = preview.readme.baseUri;
		const rendered = this.renderDisposables.add(this.markdownRendererService.render(markdown, {
			asyncRenderCallback: () => this._onDidChangeContent.fire(),
		}));
		this.readmeContentEl.appendChild(rendered.element);
	}

	private isCurrent(resource: ICustomizationMarketplaceResource, generation: number): boolean {
		return !this._store.isDisposed && this.current === resource && this.renderGeneration === generation;
	}
}

function isPlugin(resource: ICustomizationMarketplaceResource): boolean {
	return resource.mediaType === CustomizationMarketplaceMediaType.ClaudePlugin
		|| resource.mediaType === CustomizationMarketplaceMediaType.CopilotPlugin
		|| resource.mediaType === CustomizationMarketplaceMediaType.CursorPlugin;
}

function getLocationTarget(state: CustomizationMarketplaceInstallState): URI | undefined {
	return 'target' in state && (state.target.kind === 'plugin' || state.target.kind === 'skill') ? state.target.uri : undefined;
}

function getRepositoryLabel(repository: URI): string {
	const path = repository.path.replace(/^\/|\/$/g, '');
	return path || repository.authority || repository.toString();
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
		case 'checking':
			return localize('marketplaceDetail.checkingState', "Checking installation");
		case 'installed':
			return localize('marketplaceDetail.installedState', "Installed");
		case 'missing':
			return localize('marketplaceDetail.missingState', "Installation needs repair");
		case 'repairing':
			return localize('marketplaceDetail.repairingState', "Repair in progress");
		case 'uninstalling':
			return localize('marketplaceDetail.uninstallingState', "Uninstall in progress");
		case 'error':
			return localize('marketplaceDetail.errorState', "Installation error: {0}", state.message);
		case 'unavailable':
			return localize('marketplaceDetail.unavailableState', "Unavailable: {0}", state.message);
	}
}

function formatList(label: string, values: readonly string[]): string | undefined {
	return values.length ? `${label}: ${values.join(', ')}` : undefined;
}
