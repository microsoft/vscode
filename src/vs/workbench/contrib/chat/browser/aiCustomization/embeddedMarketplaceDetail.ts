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
import { Codicon } from '../../../../../base/common/codicons.js';
import { Schemas } from '../../../../../base/common/network.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { CustomizationMarketplaceMediaType, ICustomizationMarketplaceResource } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { asTextOrError, IRequestService } from '../../../../../platform/request/common/request.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { CustomizationMarketplaceInstallState, ICustomizationMarketplaceInstallService } from '../../common/customizationMarketplaceInstallService.js';
import { renderCustomizationMarketplaceIcon } from './aiCustomizationPresentation.js';

const $ = DOM.$;

export interface IEmbeddedMarketplaceDetailOptions {
	readonly getSourceLabel: (sourceId: string) => string;
	readonly install: (resource: ICustomizationMarketplaceResource) => Promise<void>;
	readonly openExternal: (resource: URI | string) => Promise<void>;
}

export class EmbeddedMarketplaceDetail extends Disposable {

	private readonly _onDidChangeContent = this._register(new Emitter<void>());
	readonly onDidChangeContent = this._onDidChangeContent.event;

	private readonly root: HTMLElement;
	private readonly leadingSlotEl: HTMLElement;
	private readonly iconEl: HTMLElement;
	private readonly titleEl: HTMLElement;
	private readonly titleActionsEl: HTMLElement;
	private readonly descriptionEl: HTMLElement;
	private readonly publisherEl: HTMLAnchorElement;
	private readonly installStateEl: HTMLElement;
	private readonly installStateCardEl: HTMLElement;
	private readonly installStateIconEl: HTMLElement;
	private readonly installStateSummaryEl: HTMLElement;
	private readonly installStateDetailsEl: HTMLElement;
	private readonly queriesEl: HTMLElement;
	private readonly factsEl: HTMLElement;
	private readonly readmeEl: HTMLElement;
	private readonly readmeContentEl: HTMLElement;
	private readonly renderDisposables = this._register(new DisposableStore());
	private readonly installActionDisposables = this._register(new DisposableStore());
	private readonly readmeRenderDisposables = this._register(new DisposableStore());
	private readonly iconDisposables = this._register(new DisposableStore());
	private readonly previewDisposables = this._register(new MutableDisposable<DisposableStore>());
	private renderGeneration = 0;
	private current: ICustomizationMarketplaceResource | undefined;
	private locationFactEl: HTMLElement | undefined;
	private readmeContent: string | undefined;

	constructor(
		parent: HTMLElement,
		private readonly options: IEmbeddedMarketplaceDetailOptions,
		@ICustomizationMarketplaceInstallService private readonly installService: ICustomizationMarketplaceInstallService,
		@INotificationService private readonly notificationService: INotificationService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
		@IHoverService private readonly hoverService: IHoverService,
		@IThemeService private readonly themeService: IThemeService,
		@IRequestService private readonly requestService: IRequestService,
	) {
		super();
		this.root = DOM.append(parent, $('article.ai-customization-embedded-detail.embedded-marketplace-detail'));
		const header = DOM.append(this.root, $('header.embedded-detail-header.marketplace-detail-header'));
		this.leadingSlotEl = DOM.append(header, $('.embedded-detail-leading-slot'));
		this.iconEl = DOM.append(header, $('.embedded-detail-icon.marketplace-detail-icon'));
		const identity = DOM.append(header, $('.embedded-detail-header-text'));
		const nameRow = DOM.append(identity, $('.embedded-detail-name-row'));
		this.titleEl = DOM.append(nameRow, $('h2.embedded-detail-name'));
		this.publisherEl = DOM.append(nameRow, $('a.embedded-detail-publisher')) as HTMLAnchorElement;
		this.titleActionsEl = DOM.append(header, $('.embedded-detail-title-actions'));
		this.descriptionEl = DOM.append(this.root, $('p.embedded-detail-description.marketplace-detail-description'));

		this.installStateEl = DOM.append(this.root, $('section.mcp-detail-diagnostics.marketplace-detail-install-state'));
		this.installStateEl.style.display = 'none';
		const installStateSection = DOM.append(this.installStateEl, $('section.mcp-detail-diagnostic-section'));
		this.installStateCardEl = DOM.append(installStateSection, $('.mcp-detail-diagnostic-card'));
		const installStateHeader = DOM.append(this.installStateCardEl, $('.mcp-detail-diagnostic-header'));
		this.installStateIconEl = DOM.append(installStateHeader, $('.mcp-detail-diagnostic-icon'));
		this.installStateIconEl.setAttribute('aria-hidden', 'true');
		this.installStateSummaryEl = DOM.append(installStateHeader, $('.mcp-detail-diagnostic-summary'));
		this.installStateSummaryEl.setAttribute('aria-live', 'polite');
		this.installStateDetailsEl = DOM.append(this.installStateCardEl, $('.mcp-detail-diagnostic-details'));

		const queriesSection = DOM.append(this.root, $('section.embedded-detail-section.marketplace-detail-queries'));
		DOM.append(queriesSection, $('h3.embedded-detail-section-title')).textContent = localize('marketplaceDetail.tryThis', "Try this");
		this.queriesEl = DOM.append(queriesSection, $('ul.marketplace-detail-query-list'));

		const factsSection = DOM.append(this.root, $('section.embedded-detail-section.marketplace-detail-source-facts'));
		DOM.append(factsSection, $('h3.embedded-detail-section-title')).textContent = localize('marketplaceDetail.details', "Details");
		this.factsEl = DOM.append(factsSection, $('dl.embedded-detail-facts.plugin-detail-flat-list.marketplace-detail-facts'));

		this.readmeEl = DOM.append(this.root, $('section.embedded-detail-section.plugin-detail-readme'));
		const readmeTitle = DOM.append(this.readmeEl, $('h3.plugin-detail-contribution-group-title'));
		DOM.append(readmeTitle, $('span.plugin-detail-contribution-title-label')).textContent = localize('marketplaceDetail.pluginReadme', "Plugin README");
		this.readmeContentEl = DOM.append(this.readmeEl, $('.plugin-detail-readme-content'));

		this._register(this.installService.onDidChange(() => {
			if (this.current) {
				this.renderInstallState(this.current);
				this._onDidChangeContent.fire();
			}
		}));
		this._register(this.themeService.onDidColorThemeChange(() => this.renderIcon()));
	}

	get leadingSlot(): HTMLElement {
		return this.leadingSlotEl;
	}

	setInput(resource: ICustomizationMarketplaceResource): void {
		const previous = this.current;
		this.current = resource;
		this.render(previous !== resource || !isEqual(previous?.readmeUri, resource.readmeUri));
	}

	clearInput(): void {
		this.current = undefined;
		this.renderGeneration++;
		this.previewDisposables.clear();
		this.renderDisposables.clear();
		this.installActionDisposables.clear();
		this.readmeRenderDisposables.clear();
		this.locationFactEl = undefined;
		this.readmeContent = undefined;
		this.titleEl.textContent = '';
		this.descriptionEl.textContent = '';
		this.publisherEl.textContent = '';
		this.publisherEl.style.display = 'none';
		this.publisherEl.removeAttribute('href');
		this.installStateEl.style.display = 'none';
		this.iconDisposables.clear();
		DOM.clearNode(this.iconEl);
		DOM.clearNode(this.titleActionsEl);
		DOM.clearNode(this.queriesEl);
		DOM.clearNode(this.factsEl);
		DOM.clearNode(this.readmeContentEl);
		this.readmeEl.style.display = 'none';
	}

	getAccessibilityContent(): string {
		const resource = this.current;
		if (!resource) {
			return '';
		}
		const state = this.installService.getInstallState(resource);
		const target = getLocationTarget(state);
		const statePresentation = getInstallStatePresentation(state);
		return [
			resource.displayName,
			resource.publisher,
			resource.description,
			statePresentation ? [statePresentation.summary, ...statePresentation.details].join('\n') : undefined,
			formatList(localize('marketplaceDetail.queries', "Try this"), resource.representativeQueries),
			localize('marketplaceDetail.typeAccessible', "Type: {0}", getMarketplaceTypeLabel(resource)),
			resource.publisher ? localize('marketplaceDetail.publisherAccessible', "Publisher: {0}", resource.publisher) : undefined,
			resource.version ? localize('marketplaceDetail.versionAccessible', "Version: {0}", resource.version) : undefined,
			localize('marketplaceDetail.sourceAccessible', "Source: {0}", this.options.getSourceLabel(resource.sourceId)),
			formatList(localize('marketplaceDetail.tags', "Tags"), resource.tags),
			resource.repository ? localize('marketplaceDetail.repositoryAccessible', "Repository: {0}", getRepositoryLabel(resource.repository)) : undefined,
			target ? localize('marketplaceDetail.locationAccessible', "Location: {0}", target.fsPath || target.toString()) : undefined,
			this.readmeContent?.trim() ? localize('marketplaceDetail.pluginReadmeAccessible', "Plugin README:\n{0}", this.readmeContent) : undefined,
		].filter(Boolean).join('\n\n');
	}

	private render(loadPreview: boolean): void {
		const resource = this.current;
		if (!resource) {
			return;
		}
		this.renderDisposables.clear();
		DOM.clearNode(this.queriesEl);
		DOM.clearNode(this.factsEl);
		this.locationFactEl = undefined;

		this.titleEl.textContent = resource.displayName;
		this.publisherEl.textContent = resource.publisher ?? '';
		this.publisherEl.style.display = resource.publisher ? '' : 'none';
		const publisherUrl = getPublisherUrl(resource);
		if (publisherUrl) {
			this.publisherEl.href = publisherUrl.toString(true);
			this.renderDisposables.add(DOM.addDisposableListener(this.publisherEl, DOM.EventType.CLICK, event => {
				event.preventDefault();
				void this.options.openExternal(publisherUrl);
			}));
		} else {
			this.publisherEl.removeAttribute('href');
		}
		if (resource.publisher) {
			this.renderDisposables.add(this.hoverService.setupDelayedHover(this.publisherEl, { content: resource.publisher }));
		}
		this.renderIcon();
		this.descriptionEl.textContent = resource.description || localize('marketplaceDetail.noDescription', "No description provided.");
		this.renderQueries(resource.representativeQueries);
		this.appendFact(localize('marketplaceDetail.type', "Type"), getMarketplaceTypeLabel(resource));
		if (resource.publisher) {
			this.appendFact(localize('marketplaceDetail.publisher', "Publisher"), this.createLink(resource.publisher, publisherUrl));
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
		this.renderInstallState(resource);

		if (loadPreview) {
			this.renderReadme(resource);
		}
		this._onDidChangeContent.fire();
	}

	private renderInstallState(resource: ICustomizationMarketplaceResource): void {
		this.installActionDisposables.clear();
		DOM.clearNode(this.titleActionsEl);
		this.locationFactEl?.remove();
		this.locationFactEl = undefined;

		const state = this.installService.getInstallState(resource);
		this.renderInstallStateBanner(state);
		this.renderInstallAction(resource, state);

		const location = getLocationTarget(state);
		if (location) {
			const value = $('span');
			value.textContent = location.fsPath || location.toString();
			value.title = location.fsPath || location.toString();
			this.locationFactEl = this.appendFact(localize('marketplaceDetail.location', "Location"), value);
		}
	}

	private renderInstallStateBanner(state: CustomizationMarketplaceInstallState): void {
		const presentation = getInstallStatePresentation(state);
		this.installStateEl.style.display = presentation ? '' : 'none';
		if (!presentation) {
			return;
		}

		this.installStateCardEl.className = `mcp-detail-diagnostic-card ${presentation.kind}`;
		this.installStateIconEl.className = 'mcp-detail-diagnostic-icon';
		this.installStateIconEl.classList.add(...ThemeIcon.asClassNameArray(presentation.icon));
		this.installStateSummaryEl.textContent = presentation.summary;
		DOM.clearNode(this.installStateDetailsEl);
		this.installStateDetailsEl.style.display = presentation.details.length ? '' : 'none';
		for (const message of presentation.details) {
			DOM.append(this.installStateDetailsEl, $('p.mcp-detail-diagnostic-message')).textContent = message;
		}
	}

	private renderIcon(): void {
		const resource = this.current;
		this.iconDisposables.clear();
		if (!resource) {
			DOM.clearNode(this.iconEl);
			return;
		}
		const fallbackIcon = resource.mediaType === CustomizationMarketplaceMediaType.McpServer
			? Codicon.server
			: isPlugin(resource)
				? Codicon.extensions
				: resource.mediaType === CustomizationMarketplaceMediaType.Skill
					? Codicon.lightbulb
					: Codicon.file;
		renderCustomizationMarketplaceIcon(this.iconEl, fallbackIcon, resource.icon, this.themeService.getColorTheme().type, this.iconDisposables);
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
		if (resource.installation?.kind === 'copilotConnector') {
			this.renderConnectorAction(resource, state);
			return;
		}
		const setupUrl = state.kind === 'unavailable' ? state.setupUrl : undefined;
		const label = state.kind === 'installed'
			? localize('marketplaceDetail.installed', "Installed")
			: state.kind === 'installing'
				? localize('marketplaceDetail.installing', "Installing...")
				: state.kind === 'repairing'
					? localize('marketplaceDetail.repairing', "Repairing...")
					: state.kind === 'missing'
						? localize('marketplaceDetail.repair', "Repair")
						: state.kind === 'uninstalling'
							? localize('marketplaceDetail.uninstalling', "Uninstalling...")
							: setupUrl
								? localize('marketplaceDetail.viewSetup', "View Setup")
								: state.kind === 'unavailable'
									? localize('marketplaceDetail.unavailable', "Unavailable")
									: localize('marketplaceDetail.install', "Install");
		const action = state.kind === 'missing' && !state.repairUnavailableMessage
			? () => this.installService.repair(resource)
			: state.kind === 'available'
				? () => this.options.install(resource)
				: setupUrl
					? () => this.options.openExternal(setupUrl)
					: undefined;
		const button = this.installActionDisposables.add(new Button(this.titleActionsEl, {
			...defaultButtonStyles,
			ariaLabel: localize('marketplaceDetail.actionAria', "{0} {1}", label, resource.displayName),
		}));
		button.label = label;
		button.enabled = action !== undefined;
		button.element.setAttribute('aria-busy', String(state.kind === 'installing' || state.kind === 'repairing'));
		if (!action) {
			return;
		}
		this.installActionDisposables.add(button.onDidClick(async () => {
			try {
				await action();
				if (state.kind === 'available') {
					status(localize('marketplaceDetail.installedStatus', "Installed {0}.", resource.displayName));
				} else if (state.kind === 'missing') {
					status(localize('marketplaceDetail.repairedStatus', "Repaired {0}.", resource.displayName));
				}
			} catch (error) {
				const message = state.kind === 'missing'
					? localize('marketplaceDetail.repairError', "Could not repair {0}. {1}", resource.displayName, getErrorMessage(error))
					: localize('marketplaceDetail.installError', "Could not install {0}. {1}", resource.displayName, getErrorMessage(error));
				this.notificationService.error(message);
			}
		}));
	}

	private renderConnectorAction(resource: ICustomizationMarketplaceResource, state: CustomizationMarketplaceInstallState): void {
		const setupUrl = state.kind === 'unavailable' ? state.setupUrl : undefined;
		const label = state.kind === 'installed'
			? localize('marketplaceDetail.disconnect', "Disconnect")
			: state.kind === 'missing'
				? localize('marketplaceDetail.reconnect', "Reconnect")
				: state.kind === 'installing'
					? localize('marketplaceDetail.connecting', "Connecting...")
					: state.kind === 'repairing'
						? localize('marketplaceDetail.reconnecting', "Reconnecting...")
						: state.kind === 'uninstalling'
							? localize('marketplaceDetail.disconnecting', "Disconnecting...")
							: state.kind === 'checking'
								? localize('marketplaceDetail.checkingConnection', "Checking...")
								: setupUrl
									? localize('marketplaceDetail.viewSetup', "View Setup")
									: state.kind === 'error' || state.kind === 'unavailable'
										? localize('marketplaceDetail.unavailable', "Unavailable")
										: localize('marketplaceDetail.connect', "Connect");
		const action = state.kind === 'installed'
			? () => this.installService.uninstall(resource)
			: state.kind === 'missing' && !state.repairUnavailableMessage
				? () => this.installService.repair(resource)
				: state.kind === 'available'
					? () => this.options.install(resource)
					: setupUrl
						? () => this.options.openExternal(setupUrl)
						: undefined;
		const button = this.installActionDisposables.add(new Button(this.titleActionsEl, {
			...defaultButtonStyles,
			secondary: state.kind === 'installed',
			ariaLabel: localize('marketplaceDetail.actionAria', "{0} {1}", label, resource.displayName),
		}));
		button.label = label;
		button.enabled = action !== undefined;
		button.element.setAttribute('aria-busy', String(state.kind === 'installing' || state.kind === 'checking' || state.kind === 'repairing' || state.kind === 'uninstalling'));
		if (!action) {
			return;
		}
		this.installActionDisposables.add(button.onDidClick(async () => {
			try {
				await action();
				if (state.kind === 'installed') {
					status(localize('marketplaceDetail.disconnectedStatus', "Disconnected {0}.", resource.displayName));
				} else if (state.kind === 'missing') {
					status(localize('marketplaceDetail.reconnectedStatus', "Reconnected {0}.", resource.displayName));
				} else if (state.kind === 'available') {
					status(localize('marketplaceDetail.connectedStatus', "Connected {0}.", resource.displayName));
				}
			} catch (error) {
				const message = state.kind === 'installed'
					? localize('marketplaceDetail.disconnectError', "Could not disconnect {0}. {1}", resource.displayName, getErrorMessage(error))
					: state.kind === 'missing'
						? localize('marketplaceDetail.reconnectError', "Could not reconnect {0}. {1}", resource.displayName, getErrorMessage(error))
						: localize('marketplaceDetail.connectError', "Could not connect {0}. {1}", resource.displayName, getErrorMessage(error));
				this.notificationService.error(message);
			}
		}));
	}

	private appendFact(label: string, value: string | HTMLElement): HTMLElement {
		const row = DOM.append(this.factsEl, $('.embedded-detail-fact-row'));
		DOM.append(row, $('dt.embedded-detail-fact-label')).textContent = label;
		const valueEl = DOM.append(row, $('dd.embedded-detail-fact-value'));
		if (typeof value === 'string') {
			valueEl.textContent = value;
		} else {
			valueEl.classList.add('has-actions');
			valueEl.appendChild(value);
		}
		return row;
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

	private renderReadme(resource: ICustomizationMarketplaceResource): void {
		this.previewDisposables.clear();
		this.readmeRenderDisposables.clear();
		this.readmeContent = undefined;
		DOM.clearNode(this.readmeContentEl);
		const generation = ++this.renderGeneration;
		if (!isPlugin(resource) || !resource.readmeUri) {
			this.readmeEl.style.display = 'none';
			return;
		}

		this.readmeEl.style.display = '';
		DOM.append(this.readmeContentEl, $('.plugin-detail-readme-message')).textContent = localize('marketplaceDetail.readmeLoading', "Loading plugin README...");

		const disposables = new DisposableStore();
		this.previewDisposables.value = disposables;
		const cancellation = disposables.add(new CancellationTokenSource());
		void this.loadReadme(resource.readmeUri, cancellation.token).then(readme => {
			if (!this.isCurrent(resource, generation)) {
				return;
			}
			this.renderReadmeContent(readme.content, readme.baseUri);
			this._onDidChangeContent.fire();
		}, error => {
			if (isCancellationError(error) || cancellation.token.isCancellationRequested || !this.isCurrent(resource, generation)) {
				return;
			}
			DOM.clearNode(this.readmeContentEl);
			DOM.append(this.readmeContentEl, $('.plugin-detail-readme-message')).textContent = localize('marketplaceDetail.readmeLoadError', "The plugin README could not be loaded.");
			this._onDidChangeContent.fire();
		});
	}

	private async loadReadme(readmeUri: URI, token: CancellationToken): Promise<{ readonly content: string; readonly baseUri: URI }> {
		if (readmeUri.scheme !== Schemas.https) {
			throw new Error(`Unsupported marketplace README scheme: ${readmeUri.scheme}`);
		}
		let fetchedUri = readmeUri;
		const githubBlobMatch = readmeUri.toString().match(/^https:\/\/github\.com\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/blob\/(?<rest>.+)$/);
		if (githubBlobMatch?.groups) {
			fetchedUri = URI.parse(`https://raw.githubusercontent.com/${githubBlobMatch.groups.owner}/${githubBlobMatch.groups.repo}/${githubBlobMatch.groups.rest}`);
		}
		const context = await this.requestService.request({ type: 'GET', url: fetchedUri.toString(), callSite: 'aiCustomizationMarketplaceDetail.fetchReadme' }, token);
		return { content: await asTextOrError(context) ?? '', baseUri: fetchedUri };
	}

	private renderReadmeContent(content: string, baseUri: URI): void {
		this.readmeContent = content;
		DOM.clearNode(this.readmeContentEl);
		this.readmeEl.style.display = '';
		if (!content.trim()) {
			DOM.append(this.readmeContentEl, $('.plugin-detail-readme-message')).textContent = localize('marketplaceDetail.readmeEmpty', "The plugin README is empty.");
			return;
		}
		const markdown = new MarkdownString(content, { supportHtml: false });
		markdown.baseUri = baseUri;
		const rendered = this.readmeRenderDisposables.add(this.markdownRendererService.render(markdown, {
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
	switch (state.kind) {
		case 'checking':
		case 'installed':
		case 'repairing':
		case 'uninstalling':
		case 'missing':
		case 'error':
			return state.target.kind === 'plugin' || state.target.kind === 'skill' ? state.target.uri : undefined;
		default:
			return undefined;
	}
}

function getInstallStatePresentation(state: CustomizationMarketplaceInstallState): { readonly kind: 'warning' | 'error'; readonly icon: ThemeIcon; readonly summary: string; readonly details: readonly string[] } | undefined {
	switch (state.kind) {
		case 'missing':
			return {
				kind: 'warning',
				icon: Codicon.warning,
				summary: localize('marketplaceDetail.missingSummary', "This customization needs repair"),
				details: state.repairUnavailableMessage ? [state.repairUnavailableMessage] : [],
			};
		case 'error':
			return {
				kind: 'error',
				icon: Codicon.error,
				summary: localize('marketplaceDetail.errorSummary', "This customization has an error"),
				details: [state.message],
			};
		case 'unavailable':
			return {
				kind: 'warning',
				icon: Codicon.warning,
				summary: localize('marketplaceDetail.unavailableSummary', "This customization is unavailable"),
				details: [state.message],
			};
		default:
			return undefined;
	}
}

function getPublisherUrl(resource: ICustomizationMarketplaceResource): URI | undefined {
	if (resource.publisherUrl) {
		return resource.publisherUrl;
	}
	if (resource.publisher && resource.repository?.scheme === Schemas.https && resource.repository.authority.toLowerCase() === 'github.com') {
		const owner = resource.repository.path.split('/').filter(Boolean)[0];
		return owner ? URI.from({ scheme: Schemas.https, authority: 'github.com', path: `/${owner}` }) : undefined;
	}
	return undefined;
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

function formatList(label: string, values: readonly string[]): string | undefined {
	return values.length ? `${label}: ${values.join(', ')}` : undefined;
}
