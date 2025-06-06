/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IListContextMenuEvent, IListRenderer } from '../../../../base/browser/ui/list/list.js';
import { Event } from '../../../../base/common/event.js';
import { combinedDisposable, DisposableStore, dispose, IDisposable, isDisposable } from '../../../../base/common/lifecycle.js';
import { DelayedPagedModel, IPagedModel, PagedModel } from '../../../../base/common/paging.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchPagedList } from '../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { getLocationBasedViewColors, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../browser/parts/views/viewsViewlet.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IMcpWorkbenchService, IWorkbenchMcpServer, McpServerContainers } from '../common/mcpTypes.js';
import { DropDownAction, InstallAction, ManageMcpServerAction } from './mcpServerActions.js';
import { PublisherWidget, InstallCountWidget, RatingsWidget, McpServerIconWidget } from './mcpServerWidgets.js';
import { ActionRunner, IAction, Separator } from '../../../../base/common/actions.js';
import { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';

export class McpServersListView extends ViewPane {

	private list: WorkbenchPagedList<IWorkbenchMcpServer> | null = null;
	private readonly contextMenuActionRunner = this._register(new ActionRunner());

	constructor(
		options: IViewletViewOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IOpenerService openerService: IOpenerService,
		@IMcpWorkbenchService private readonly mcpWorkbenchService: IMcpWorkbenchService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		const mcpServersList = dom.append(container, dom.$('.mcp-servers-list'));
		this.list = this._register(this.instantiationService.createInstance(WorkbenchPagedList,
			`${this.id}-MCP-Servers`,
			mcpServersList,
			{
				getHeight() { return 72; },
				getTemplateId: () => McpServerRenderer.templateId,
			},
			[this.instantiationService.createInstance(McpServerRenderer)],
			{
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				horizontalScrolling: false,
				accessibilityProvider: {
					getAriaLabel(mcpServer: IWorkbenchMcpServer | null): string {
						return mcpServer?.label ?? '';
					},
					getWidgetAriaLabel(): string {
						return localize('mcp servers', "MCP Servers");
					}
				},
				overrideStyles: getLocationBasedViewColors(this.viewDescriptorService.getViewLocationById(this.id)).listOverrideStyles,
				openOnSingleClick: true,
			}) as WorkbenchPagedList<IWorkbenchMcpServer>);
		this._register(Event.debounce(Event.filter(this.list.onDidOpen, e => e.element !== null), (_, event) => event, 75, true)(options => {
			this.mcpWorkbenchService.open(options.element!, options.editorOptions);
		}));
		this._register(this.list.onContextMenu(e => this.onContextMenu(e), this));
	}

	private async onContextMenu(e: IListContextMenuEvent<IWorkbenchMcpServer>): Promise<void> {
		if (e.element) {
			const disposables = new DisposableStore();
			const manageExtensionAction = disposables.add(this.instantiationService.createInstance(ManageMcpServerAction, false));
			const extension = e.element ? this.mcpWorkbenchService.local.find(local => local.name === e.element!.name) || e.element
				: e.element;
			manageExtensionAction.mcpServer = extension;
			let groups: IAction[][] = [];
			if (manageExtensionAction.enabled) {
				groups = await manageExtensionAction.getActionGroups();
			}
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
			actions.pop();
			this.contextMenuService.showContextMenu({
				getAnchor: () => e.anchor,
				getActions: () => actions,
				actionRunner: this.contextMenuActionRunner,
				onHide: () => disposables.dispose()
			});
		}
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.list?.layout(height, width);
	}

	async show(query: string): Promise<IPagedModel<IWorkbenchMcpServer>> {
		if (!this.list) {
			return new PagedModel([]);
		}

		query = query.trim();
		const servers = query ? await this.mcpWorkbenchService.queryGallery({ text: query.replace('@mcp', '') }) : await this.mcpWorkbenchService.queryLocal();
		this.list.model = new DelayedPagedModel(new PagedModel(servers));
		return this.list.model;
	}

}

interface IMcpServerTemplateData {
	root: HTMLElement;
	element: HTMLElement;
	name: HTMLElement;
	description: HTMLElement;
	installCount: HTMLElement;
	ratings: HTMLElement;
	mcpServer: IWorkbenchMcpServer | null;
	disposables: IDisposable[];
	mcpServerDisposables: IDisposable[];
	actionbar: ActionBar;
}

class McpServerRenderer implements IListRenderer<IWorkbenchMcpServer, IMcpServerTemplateData> {

	static readonly templateId = 'mcpServer';
	readonly templateId = McpServerRenderer.templateId;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@INotificationService private readonly notificationService: INotificationService,
	) { }

	renderTemplate(root: HTMLElement): IMcpServerTemplateData {
		const element = dom.append(root, dom.$('.mcp-server-item.extension-list-item'));
		const iconContainer = dom.append(element, dom.$('.icon-container'));
		const iconWidget = this.instantiationService.createInstance(McpServerIconWidget, iconContainer);
		const details = dom.append(element, dom.$('.details'));
		const headerContainer = dom.append(details, dom.$('.header-container'));
		const header = dom.append(headerContainer, dom.$('.header'));
		const name = dom.append(header, dom.$('span.name'));
		const installCount = dom.append(header, dom.$('span.install-count'));
		const ratings = dom.append(header, dom.$('span.ratings'));
		const description = dom.append(details, dom.$('.description.ellipsis'));
		const footer = dom.append(details, dom.$('.footer'));
		const publisherWidget = this.instantiationService.createInstance(PublisherWidget, dom.append(footer, dom.$('.publisher-container')), true);
		const actionbar = new ActionBar(footer, {
			actionViewItemProvider: (action: IAction, options: IActionViewItemOptions) => {
				if (action instanceof DropDownAction) {
					return action.createActionViewItem(options);
				}
				return undefined;
			},
			focusOnlyEnabledItems: true
		});

		actionbar.setFocusable(false);
		const actionBarListener = actionbar.onDidRun(({ error }) => error && this.notificationService.error(error));

		const actions = [
			this.instantiationService.createInstance(InstallAction),
			this.instantiationService.createInstance(ManageMcpServerAction, false),
		];

		const widgets = [
			iconWidget,
			publisherWidget,
			this.instantiationService.createInstance(InstallCountWidget, installCount, true),
			this.instantiationService.createInstance(RatingsWidget, ratings, true),
		];
		const extensionContainers: McpServerContainers = this.instantiationService.createInstance(McpServerContainers, [...actions, ...widgets]);

		actionbar.push(actions, { icon: true, label: true });
		const disposable = combinedDisposable(...actions, ...widgets, actionbar, actionBarListener, extensionContainers);

		return {
			root, element, name, description, installCount, ratings, disposables: [disposable], actionbar,
			mcpServerDisposables: [],
			set mcpServer(mcpServer: IWorkbenchMcpServer) {
				extensionContainers.mcpServer = mcpServer;
			}
		};
	}

	renderElement(mcpServer: IWorkbenchMcpServer, index: number, data: IMcpServerTemplateData): void {
		data.element.classList.remove('loading');
		data.mcpServerDisposables = dispose(data.mcpServerDisposables);
		data.root.setAttribute('data-mcp-server-id', mcpServer.id);
		data.name.textContent = mcpServer.label;
		data.description.textContent = mcpServer.description;

		data.installCount.style.display = '';
		data.ratings.style.display = '';
		data.mcpServer = mcpServer;
	}

	disposeElement(mcpServer: IWorkbenchMcpServer, index: number, data: IMcpServerTemplateData): void {
		data.mcpServerDisposables = dispose(data.mcpServerDisposables);
	}

	disposeTemplate(data: IMcpServerTemplateData): void {
		data.mcpServerDisposables = dispose(data.mcpServerDisposables);
		data.disposables = dispose(data.disposables);
	}
}
