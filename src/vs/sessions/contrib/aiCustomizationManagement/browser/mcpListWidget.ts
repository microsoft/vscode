/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aiCustomizationManagement.css';
import * as DOM from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore, isDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { IListVirtualDelegate, IListRenderer, IListContextMenuEvent } from '../../../../base/browser/ui/list/list.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IMcpWorkbenchService, IWorkbenchMcpServer, McpConnectionState, IMcpService } from '../../../../workbench/contrib/mcp/common/mcpTypes.js';
import { McpCommandIds } from '../../../../workbench/contrib/mcp/common/mcpCommandIds.js';
import { autorun } from '../../../../base/common/observable.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { URI } from '../../../../base/common/uri.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { Delayer } from '../../../../base/common/async.js';
import { IAction, Separator } from '../../../../base/common/actions.js';
import { getContextMenuActions } from '../../../../workbench/contrib/mcp/browser/mcpServerActions.js';

const $ = DOM.$;

const MCP_ITEM_HEIGHT = 60;

/**
 * Delegate for the MCP server list.
 */
class McpServerItemDelegate implements IListVirtualDelegate<IWorkbenchMcpServer> {
	getHeight(): number {
		return MCP_ITEM_HEIGHT;
	}

	getTemplateId(): string {
		return 'mcpServerItem';
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
 * Renderer for MCP server list items.
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

/**
 * Widget that displays a list of MCP servers.
 */
export class McpListWidget extends Disposable {

	readonly element: HTMLElement;

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

	private filteredServers: IWorkbenchMcpServer[] = [];
	private searchQuery: string = '';
	private readonly delayedFilter = new Delayer<void>(200);

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
			this.delayedFilter.trigger(() => this.filterServers());
		}));

		// Add button next to search
		const addButtonContainer = DOM.append(this.searchAndButtonContainer, $('.list-add-button-container'));
		const addButton = this._register(new Button(addButtonContainer, { ...defaultButtonStyles, supportIcons: true }));
		addButton.label = `$(${Codicon.add.id}) ${localize('addServer', "Add Server")}`;
		addButton.element.classList.add('list-add-button');
		this._register(addButton.onDidClick(() => {
			this.commandService.executeCommand(McpCommandIds.AddConfiguration);
		}));

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
		const renderer = this.instantiationService.createInstance(McpServerItemRenderer);

		this.list = this._register(this.instantiationService.createInstance(
			WorkbenchList<IWorkbenchMcpServer>,
			'McpManagementList',
			this.listContainer,
			delegate,
			[renderer],
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
				this.mcpWorkbenchService.open(e.element);
			}
		}));

		// Handle context menu
		this._register(this.list.onContextMenu(e => this.onContextMenu(e)));

		// Listen to MCP service changes
		this._register(this.mcpWorkbenchService.onChange(() => this.refresh()));
		this._register(autorun(reader => {
			this.mcpService.servers.read(reader);
			this.refresh();
		}));

		// Initial refresh
		void this.refresh();
	}

	private async refresh(): Promise<void> {
		this.filterServers();
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
		const margins = 12; // search margin (6+6), not included in offsetHeight
		const listHeight = height - sectionFooterHeight - searchBarHeight - margins;

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
