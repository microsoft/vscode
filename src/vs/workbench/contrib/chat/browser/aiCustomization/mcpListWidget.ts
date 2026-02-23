/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aiCustomizationManagement.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore, isDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { IListVirtualDelegate, IListRenderer, IListContextMenuEvent } from '../../../../../base/browser/ui/list/list.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IMcpWorkbenchService, IWorkbenchMcpServer, McpConnectionState, McpServerInstallState, IMcpService } from '../../../../contrib/mcp/common/mcpTypes.js';
import { McpCommandIds } from '../../../../contrib/mcp/common/mcpCommandIds.js';
import { autorun } from '../../../../../base/common/observable.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { URI } from '../../../../../base/common/uri.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Delayer } from '../../../../../base/common/async.js';
import { IAction, Separator } from '../../../../../base/common/actions.js';
import { getContextMenuActions } from '../../../../contrib/mcp/browser/mcpServerActions.js';

const $ = DOM.$;

const MCP_ITEM_HEIGHT = 60;

/**
 * Delegate for the MCP server list.
 */
class McpServerItemDelegate implements IListVirtualDelegate<IWorkbenchMcpServer> {
	getHeight(): number {
		return MCP_ITEM_HEIGHT;
	}

	getTemplateId(element: IWorkbenchMcpServer): string {
		return element.gallery && !element.local ? 'mcpGalleryItem' : 'mcpServerItem';
	}
}

interface IMcpServerItemTemplateData {
	readonly container: HTMLElement;
	readonly icon: HTMLElement;
	readonly name: HTMLElement;
	readonly description: HTMLElement;
	readonly status: HTMLElement;
	readonly disposables: DisposableStore;
}

/**
 * Renderer for local MCP server list items.
 */
class McpServerItemRenderer implements IListRenderer<IWorkbenchMcpServer, IMcpServerItemTemplateData> {
	readonly templateId = 'mcpServerItem';

	constructor(
		@IMcpService private readonly mcpService: IMcpService,
	) { }

	renderTemplate(container: HTMLElement): IMcpServerItemTemplateData {
		container.classList.add('mcp-server-item');

		const icon = DOM.append(container, $('.mcp-server-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.server));

		const details = DOM.append(container, $('.mcp-server-details'));
		const name = DOM.append(details, $('.mcp-server-name'));
		const description = DOM.append(details, $('.mcp-server-description'));

		const status = DOM.append(container, $('.mcp-server-status'));

		return { container, icon, name, description, status, disposables: new DisposableStore() };
	}

	renderElement(element: IWorkbenchMcpServer, index: number, templateData: IMcpServerItemTemplateData): void {
		templateData.disposables.clear();

		templateData.name.textContent = element.label;
		templateData.description.textContent = element.description || '';

		// Find the server from IMcpService to get connection state
		const server = this.mcpService.servers.get().find(s => s.definition.id === element.id);
		templateData.disposables.add(autorun(reader => {
			const connectionState = server?.connectionState.read(reader);
			this.updateStatus(templateData.status, connectionState?.state);
		}));
	}

	private updateStatus(statusElement: HTMLElement, state: McpConnectionState.Kind | undefined): void {
		statusElement.className = 'mcp-server-status';

		switch (state) {
			case McpConnectionState.Kind.Running:
				statusElement.textContent = localize('running', "Running");
				statusElement.classList.add('running');
				break;
			case McpConnectionState.Kind.Starting:
				statusElement.textContent = localize('starting', "Starting");
				statusElement.classList.add('starting');
				break;
			case McpConnectionState.Kind.Error:
				statusElement.textContent = localize('error', "Error");
				statusElement.classList.add('error');
				break;
			case McpConnectionState.Kind.Stopped:
			default:
				statusElement.textContent = localize('stopped', "Stopped");
				statusElement.classList.add('stopped');
				break;
		}
	}

	disposeTemplate(templateData: IMcpServerItemTemplateData): void {
		templateData.disposables.dispose();
	}
}

interface IMcpGalleryItemTemplateData {
	readonly container: HTMLElement;
	readonly icon: HTMLElement;
	readonly name: HTMLElement;
	readonly publisher: HTMLElement;
	readonly description: HTMLElement;
	readonly installButton: Button;
	readonly elementDisposables: DisposableStore;
	readonly templateDisposables: DisposableStore;
}

/**
 * Renderer for gallery MCP server items with an install button.
 */
class McpGalleryItemRenderer implements IListRenderer<IWorkbenchMcpServer, IMcpGalleryItemTemplateData> {
	readonly templateId = 'mcpGalleryItem';

	constructor(
		private readonly mcpWorkbenchService: IMcpWorkbenchService,
	) { }

	renderTemplate(container: HTMLElement): IMcpGalleryItemTemplateData {
		container.classList.add('mcp-server-item', 'mcp-gallery-item');

		const icon = DOM.append(container, $('.mcp-server-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.server));

		const details = DOM.append(container, $('.mcp-server-details'));
		const nameRow = DOM.append(details, $('.mcp-gallery-name-row'));
		const name = DOM.append(nameRow, $('.mcp-server-name'));
		const publisher = DOM.append(nameRow, $('.mcp-gallery-publisher'));
		const description = DOM.append(details, $('.mcp-server-description'));

		const actionContainer = DOM.append(container, $('.mcp-gallery-action'));
		const installButton = new Button(actionContainer, { ...defaultButtonStyles, supportIcons: true });
		installButton.element.classList.add('mcp-gallery-install-button');

		const templateDisposables = new DisposableStore();
		templateDisposables.add(installButton);

		return { container, icon, name, publisher, description, installButton, elementDisposables: new DisposableStore(), templateDisposables };
	}

	renderElement(element: IWorkbenchMcpServer, _index: number, templateData: IMcpGalleryItemTemplateData): void {
		templateData.elementDisposables.clear();

		templateData.name.textContent = element.label;
		templateData.publisher.textContent = element.publisherDisplayName ? `by ${element.publisherDisplayName}` : '';
		templateData.description.textContent = element.description || '';

		this.updateInstallButton(templateData.installButton, element);

		templateData.elementDisposables.add(templateData.installButton.onDidClick(async () => {
			const canInstall = this.mcpWorkbenchService.canInstall(element);
			if (canInstall === true) {
				templateData.installButton.label = localize('installing', "Installing...");
				templateData.installButton.enabled = false;
				await this.mcpWorkbenchService.install(element);
			}
		}));

		templateData.elementDisposables.add(this.mcpWorkbenchService.onChange(changed => {
			if (!changed || changed.id === element.id) {
				this.updateInstallButton(templateData.installButton, element);
			}
		}));
	}

	private updateInstallButton(button: Button, server: IWorkbenchMcpServer): void {
		switch (server.installState) {
			case McpServerInstallState.Installed:
				button.label = localize('installed', "Installed");
				button.enabled = false;
				break;
			case McpServerInstallState.Installing:
				button.label = localize('installing', "Installing...");
				button.enabled = false;
				break;
			default:
				button.label = localize('install', "Install");
				button.enabled = true;
				break;
		}
	}

	disposeTemplate(templateData: IMcpGalleryItemTemplateData): void {
		templateData.elementDisposables.dispose();
		templateData.templateDisposables.dispose();
	}
}

/**
 * Widget that displays a list of MCP servers with marketplace browsing.
 */
export class McpListWidget extends Disposable {

	readonly element: HTMLElement;

	private readonly _onDidSelectServer = this._register(new Emitter<IWorkbenchMcpServer>());
	readonly onDidSelectServer = this._onDidSelectServer.event;

	private sectionHeader!: HTMLElement;
	private sectionDescription!: HTMLElement;
	private sectionLink!: HTMLAnchorElement;
	private searchAndButtonContainer!: HTMLElement;
	private searchInput!: InputBox;
	private listContainer!: HTMLElement;
	private list!: WorkbenchList<IWorkbenchMcpServer>;
	private emptyContainer!: HTMLElement;
	private emptyText!: HTMLElement;
	private emptySubtext!: HTMLElement;
	private browseButton!: Button;
	private addButton!: Button;
	private backLink!: HTMLElement;

	private filteredServers: IWorkbenchMcpServer[] = [];
	private galleryServers: IWorkbenchMcpServer[] = [];
	private searchQuery: string = '';
	private browseMode: boolean = false;
	private galleryCts: CancellationTokenSource | undefined;
	private readonly delayedFilter = new Delayer<void>(200);
	private readonly delayedGallerySearch = new Delayer<void>(400);

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IMcpWorkbenchService private readonly mcpWorkbenchService: IMcpWorkbenchService,
		@IMcpService private readonly mcpService: IMcpService,
		@ICommandService private readonly commandService: ICommandService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
	) {
		super();
		this.element = $('.mcp-list-widget');
		this.create();
		this._register({
			dispose: () => {
				this.galleryCts?.dispose();
			}
		});
	}

	private create(): void {
		// Search and button container
		this.searchAndButtonContainer = DOM.append(this.element, $('.list-search-and-button-container'));

		// Search container
		const searchContainer = DOM.append(this.searchAndButtonContainer, $('.list-search-container'));
		this.searchInput = this._register(new InputBox(searchContainer, this.contextViewService, {
			placeholder: localize('searchMcpPlaceholder', "Type to search..."),
			inputBoxStyles: defaultInputBoxStyles,
		}));

		this._register(this.searchInput.onDidChange(() => {
			this.searchQuery = this.searchInput.value;
			if (this.browseMode) {
				this.delayedGallerySearch.trigger(() => this.queryGallery());
			} else {
				this.delayedFilter.trigger(() => this.filterServers());
			}
		}));

		// Button container (Add Server + Browse Marketplace)
		const buttonContainer = DOM.append(this.searchAndButtonContainer, $('.list-button-group'));

		const addButtonContainer = DOM.append(buttonContainer, $('.list-add-button-container'));
		this.addButton = this._register(new Button(addButtonContainer, { ...defaultButtonStyles, supportIcons: true }));
		this.addButton.label = `$(${Codicon.add.id}) ${localize('addServer', "Add Server")}`;
		this.addButton.element.classList.add('list-add-button');
		this._register(this.addButton.onDidClick(() => {
			this.commandService.executeCommand(McpCommandIds.AddConfiguration);
		}));

		// Browse Marketplace button
		const browseButtonContainer = DOM.append(buttonContainer, $('.list-add-button-container'));
		this.browseButton = this._register(new Button(browseButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
		this.browseButton.label = `$(${Codicon.library.id}) ${localize('browseMarketplace', "Browse Marketplace")}`;
		this.browseButton.element.classList.add('list-add-button');
		this._register(this.browseButton.onDidClick(() => {
			this.toggleBrowseMode(!this.browseMode);
		}));

		// Back to installed link (shown only in browse mode)
		this.backLink = DOM.append(this.element, $('.mcp-back-link'));
		this.backLink.setAttribute('role', 'button');
		this.backLink.tabIndex = 0;
		this.backLink.setAttribute('aria-label', localize('backToInstalledAriaLabel', "Back to installed servers"));
		const backIcon = DOM.append(this.backLink, $('span'));
		backIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.arrowLeft));
		const backText = DOM.append(this.backLink, $('span'));
		backText.textContent = localize('backToInstalled', "Back to installed servers");
		this._register(DOM.addDisposableListener(this.backLink, 'click', () => {
			this.toggleBrowseMode(false);
		}));
		this._register(DOM.addDisposableListener(this.backLink, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this.toggleBrowseMode(false);
			}
		}));
		this.backLink.style.display = 'none';

		// Empty state
		this.emptyContainer = DOM.append(this.element, $('.mcp-empty-state'));
		const emptyIcon = DOM.append(this.emptyContainer, $('.empty-icon'));
		emptyIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.server));
		this.emptyText = DOM.append(this.emptyContainer, $('.empty-text'));
		this.emptySubtext = DOM.append(this.emptyContainer, $('.empty-subtext'));

		// List container
		this.listContainer = DOM.append(this.element, $('.mcp-list-container'));

		// Section footer at bottom with description and link
		this.sectionHeader = DOM.append(this.element, $('.section-footer'));
		this.sectionDescription = DOM.append(this.sectionHeader, $('p.section-footer-description'));
		this.sectionDescription.textContent = localize('mcpServersDescription', "An open standard that lets AI use external tools and services. MCP servers provide tools for file operations, databases, APIs, and more.");
		this.sectionLink = DOM.append(this.sectionHeader, $('a.section-footer-link')) as HTMLAnchorElement;
		this.sectionLink.textContent = localize('learnMoreMcp', "Learn more about MCP servers");
		this.sectionLink.href = 'https://code.visualstudio.com/docs/copilot/chat/mcp-servers';
		this._register(DOM.addDisposableListener(this.sectionLink, 'click', (e) => {
			e.preventDefault();
			const href = this.sectionLink.href;
			if (href) {
				this.openerService.open(URI.parse(href));
			}
		}));

		// Create list
		const delegate = new McpServerItemDelegate();
		const localRenderer = this.instantiationService.createInstance(McpServerItemRenderer);
		const galleryRenderer = new McpGalleryItemRenderer(this.mcpWorkbenchService);

		this.list = this._register(this.instantiationService.createInstance(
			WorkbenchList<IWorkbenchMcpServer>,
			'McpManagementList',
			this.listContainer,
			delegate,
			[localRenderer, galleryRenderer],
			{
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				horizontalScrolling: false,
				accessibilityProvider: {
					getAriaLabel(element: IWorkbenchMcpServer) {
						return element.label;
					},
					getWidgetAriaLabel() {
						return localize('mcpServersListAriaLabel', "MCP Servers");
					}
				},
				openOnSingleClick: true,
				identityProvider: {
					getId(element: IWorkbenchMcpServer) {
						return element.id;
					}
				}
			}
		));

		this._register(this.list.onDidOpen(e => {
			if (e.element) {
				this._onDidSelectServer.fire(e.element);
			}
		}));

		// Handle context menu
		this._register(this.list.onContextMenu(e => this.onContextMenu(e)));

		// Listen to MCP service changes
		this._register(this.mcpWorkbenchService.onChange(() => {
			if (!this.browseMode) {
				this.refresh();
			}
		}));
		this._register(autorun(reader => {
			this.mcpService.servers.read(reader);
			if (!this.browseMode) {
				this.refresh();
			}
		}));

		// Initial refresh
		void this.refresh();
	}

	private async refresh(): Promise<void> {
		if (this.browseMode) {
			await this.queryGallery();
		} else {
			this.filterServers();
		}
	}

	private toggleBrowseMode(browse: boolean): void {
		this.browseMode = browse;
		this.searchInput.value = '';
		this.searchQuery = '';

		// Update UI for browse vs installed mode
		this.backLink.style.display = browse ? '' : 'none';
		this.addButton.element.parentElement!.style.display = browse ? 'none' : '';
		this.browseButton.element.parentElement!.style.display = browse ? 'none' : '';

		this.searchInput.setPlaceHolder(browse
			? localize('searchGalleryPlaceholder', "Search MCP marketplace...")
			: localize('searchMcpPlaceholder', "Type to search...")
		);

		if (browse) {
			void this.queryGallery();
		} else {
			this.galleryCts?.dispose(true);
			this.galleryServers = [];
			this.filterServers();
		}
	}

	private async queryGallery(): Promise<void> {
		this.galleryCts?.dispose(true);
		const cts = this.galleryCts = new CancellationTokenSource();

		// Show loading state
		this.emptyContainer.style.display = 'flex';
		this.listContainer.style.display = 'none';
		this.emptyText.textContent = localize('loadingGallery', "Loading marketplace...");
		this.emptySubtext.textContent = '';

		try {
			const pager = await this.mcpWorkbenchService.queryGallery(
				{ text: this.searchQuery.trim() || undefined },
				cts.token,
			);

			if (cts.token.isCancellationRequested) {
				return;
			}

			this.galleryServers = pager.firstPage.items;
			this.updateGalleryList();
		} catch {
			if (!cts.token.isCancellationRequested) {
				this.galleryServers = [];
				this.emptyContainer.style.display = 'flex';
				this.listContainer.style.display = 'none';
				this.emptyText.textContent = localize('galleryError', "Unable to load marketplace");
				this.emptySubtext.textContent = localize('tryAgainLater', "Check your connection and try again");
			}
		}
	}

	private updateGalleryList(): void {
		if (this.galleryServers.length === 0) {
			this.emptyContainer.style.display = 'flex';
			this.listContainer.style.display = 'none';
			if (this.searchQuery.trim()) {
				this.emptyText.textContent = localize('noGalleryResults', "No servers match '{0}'", this.searchQuery);
				this.emptySubtext.textContent = localize('tryDifferentSearch', "Try a different search term");
			} else {
				this.emptyText.textContent = localize('emptyGallery', "No MCP servers available");
				this.emptySubtext.textContent = '';
			}
		} else {
			this.emptyContainer.style.display = 'none';
			this.listContainer.style.display = '';
		}

		this.list.splice(0, this.list.length, this.galleryServers);
	}

	private filterServers(): void {
		const query = this.searchQuery.toLowerCase().trim();

		if (query) {
			this.filteredServers = this.mcpWorkbenchService.local.filter(server =>
				server.label.toLowerCase().includes(query) ||
				(server.description?.toLowerCase().includes(query))
			);
		} else {
			this.filteredServers = [...this.mcpWorkbenchService.local];
		}

		// Show empty state only when there are no servers at all (not when filtered to empty)
		if (this.filteredServers.length === 0) {
			this.emptyContainer.style.display = 'flex';
			this.listContainer.style.display = 'none';

			if (this.searchQuery.trim()) {
				// Search with no results
				this.emptyText.textContent = localize('noMatchingServers', "No servers match '{0}'", this.searchQuery);
				this.emptySubtext.textContent = localize('tryDifferentSearch', "Try a different search term");
			} else {
				// No servers configured
				this.emptyText.textContent = localize('noMcpServers', "No MCP servers configured");
				this.emptySubtext.textContent = localize('addMcpServer', "Add an MCP server configuration to get started");
			}
		} else {
			this.emptyContainer.style.display = 'none';
			this.listContainer.style.display = '';
		}

		this.list.splice(0, this.list.length, this.filteredServers);
	}

	/**
	 * Layouts the widget.
	 */
	layout(height: number, width: number): void {
		const sectionFooterHeight = this.sectionHeader.offsetHeight || 100;
		const searchBarHeight = this.searchAndButtonContainer.offsetHeight || 40;
		const backLinkHeight = this.browseMode ? (this.backLink.offsetHeight || 28) : 0;
		const margins = 12;
		const listHeight = height - sectionFooterHeight - searchBarHeight - backLinkHeight - margins;

		this.listContainer.style.height = `${Math.max(0, listHeight)}px`;
		this.list.layout(Math.max(0, listHeight), width);
	}

	/**
	 * Focuses the search input.
	 */
	focusSearch(): void {
		this.searchInput.focus();
	}

	/**
	 * Focuses the list.
	 */
	focus(): void {
		this.list.domFocus();
		const servers = this.list.length;
		if (servers > 0) {
			this.list.setFocus([0]);
		}
	}

	/**
	 * Handles context menu for MCP server items.
	 */
	private onContextMenu(e: IListContextMenuEvent<IWorkbenchMcpServer>): void {
		if (!e.element) {
			return;
		}

		const disposables = new DisposableStore();
		const mcpServer = this.mcpWorkbenchService.local.find(local => local.id === e.element!.id) || e.element;

		// Get context menu actions from the MCP module
		const groups: IAction[][] = getContextMenuActions(mcpServer, false, this.instantiationService);
		const actions: IAction[] = [];
		for (const menuActions of groups) {
			for (const menuAction of menuActions) {
				actions.push(menuAction);
				if (isDisposable(menuAction)) {
					disposables.add(menuAction);
				}
			}
			actions.push(new Separator());
		}
		// Remove trailing separator
		if (actions.length > 0 && actions[actions.length - 1] instanceof Separator) {
			actions.pop();
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => actions,
			onHide: () => disposables.dispose()
		});
	}
}
