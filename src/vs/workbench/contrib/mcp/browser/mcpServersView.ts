/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IListContextMenuEvent } from '../../../../base/browser/ui/list/list.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { combinedDisposable, Disposable, DisposableStore, dispose, IDisposable, isDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { DelayedPagedModel, IPagedModel, PagedModel, IterativePagedModel } from '../../../../base/common/paging.js';
import { localize, localize2 } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { CustomizationMarketplaceConfiguration } from '../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchPagedList } from '../../../../platform/list/browser/listService.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { getLocationBasedViewColors } from '../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../browser/parts/views/viewsViewlet.js';
import { IViewDescriptorService, IViewsRegistry, ViewContainerLocation, Extensions as ViewExtensions } from '../../../common/views.js';
import { IMcpWorkbenchService, IWorkbenchMcpServer, McpServerContainers, McpServerEnablementState } from '../common/mcpTypes.js';
import { DropDownAction, getContextMenuActions, InstallAction, InstallingLabelAction, ManageMcpServerAction, McpServerStatusAction } from './mcpServerActions.js';
import { PublisherWidget, StarredWidget, McpServerIconWidget, McpServerHoverWidget, McpServerScopeBadgeWidget } from './mcpServerWidgets.js';
import { ActionRunner, IAction, Separator } from '../../../../base/common/actions.js';
import { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { SearchMcpServersContext } from '../../extensions/common/extensions.js';
import { VIEW_CONTAINER } from '../../extensions/browser/extensions.contribution.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { AICustomizationManagementSection } from '../../chat/common/aiCustomizationWorkspaceService.js';
import { CustomizationMarketplaceWelcome } from '../../chat/browser/aiCustomization/customizationMarketplaceWelcome.js';
import { AbstractExtensionsListView } from '../../extensions/browser/extensionsViews.js';
import { ExtensionListRendererOptions } from '../../extensions/browser/extensionsList.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { IWorkbenchLayoutService, Position } from '../../../services/layout/browser/layoutService.js';
import { mcpServerIcon } from './mcpServerIcons.js';
import { IPagedRenderer } from '../../../../base/browser/ui/list/listPaging.js';
import { SeverityIcon } from '../../../../base/browser/ui/severityIcon/severityIcon.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { buildModalNavigationForPagedList } from '../../extensions/browser/extensionsViewer.js';

export interface McpServerListViewOptions {
	showMarketplaceWelcome?: boolean;
}

interface IQueryResult {
	model: IPagedModel<IWorkbenchMcpServer>;
	disposables: DisposableStore;
	showWelcomeContent?: boolean;
	readonly onDidChangeModel?: Event<IPagedModel<IWorkbenchMcpServer>>;
}

type Message = {
	readonly text: string;
	readonly severity: Severity;
};

export class McpServersListView extends AbstractExtensionsListView<IWorkbenchMcpServer> {

	private list: WorkbenchPagedList<IWorkbenchMcpServer> | null = null;
	private listContainer: HTMLElement | null = null;
	private welcomeContainer: HTMLElement | null = null;
	private bodyTemplate: {
		messageContainer: HTMLElement;
		messageSeverityIcon: HTMLElement;
		messageBox: HTMLElement;
		mcpServersList: HTMLElement;
	} | undefined;
	private readonly contextMenuActionRunner = this._register(new ActionRunner());
	private readonly modalNavigationDisposable = this._register(new MutableDisposable());
	private input: IQueryResult | undefined;
	private currentQuery = '@mcp';

	constructor(
		private readonly mpcViewOptions: McpServerListViewOptions,
		options: IViewletViewOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IConfigurationService private readonly marketplaceConfigurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IOpenerService openerService: IOpenerService,
		@IMcpWorkbenchService private readonly mcpWorkbenchService: IMcpWorkbenchService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ILogService private readonly logService: ILogService,
	) {
		super(options, keybindingService, contextMenuService, marketplaceConfigurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this._register(this.marketplaceConfigurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(CustomizationMarketplaceConfiguration.MarketplaceEnabled) && this.isBodyVisible()) {
				void this.show(this.currentQuery);
			}
		}));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		// Create welcome container
		this.welcomeContainer = dom.append(container, dom.$('.customizations-marketplace-welcome-container.hide'));
		this.createWelcomeContent(this.welcomeContainer);

		const messageContainer = dom.append(container, dom.$('.message-container'));
		const messageSeverityIcon = dom.append(messageContainer, dom.$(''));
		const messageBox = dom.append(messageContainer, dom.$('.message'));
		const mcpServersList = dom.$('.mcp-servers-list');

		this.bodyTemplate = {
			mcpServersList,
			messageBox,
			messageContainer,
			messageSeverityIcon
		};

		this.listContainer = dom.append(container, mcpServersList);
		this.list = this._register(this.instantiationService.createInstance(WorkbenchPagedList,
			`${this.id}-MCP-Servers`,
			this.listContainer,
			{
				getHeight() { return 72; },
				getTemplateId: () => McpServerRenderer.templateId,
			},
			[this.instantiationService.createInstance(McpServerRenderer, {
				hoverOptions: {
					position: () => {
						const viewLocation = this.viewDescriptorService.getViewLocationById(this.id);
						if (viewLocation === ViewContainerLocation.Sidebar) {
							return this.layoutService.getSideBarPosition() === Position.LEFT ? HoverPosition.RIGHT : HoverPosition.LEFT;
						}
						if (viewLocation === ViewContainerLocation.AuxiliaryBar) {
							return this.layoutService.getSideBarPosition() === Position.LEFT ? HoverPosition.LEFT : HoverPosition.RIGHT;
						}
						return HoverPosition.RIGHT;
					}
				}
			})],
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
			this.mcpWorkbenchService.open(options.element!, {
				...options.editorOptions,
				modal: options.sideBySide ? undefined : buildModalNavigationForPagedList(
					options.element!,
					() => this.list?.model,
					(serverA, serverB) => serverA.id === serverB.id,
					(server, modal) => this.mcpWorkbenchService.open(server, { pinned: false, modal }),
					this.modalNavigationDisposable,
					this.logService
				),
			});
		}));
		this._register(this.list.onContextMenu(e => this.onContextMenu(e), this));

		if (this.input) {
			this.renderInput();
		}
	}

	private async onContextMenu(e: IListContextMenuEvent<IWorkbenchMcpServer>): Promise<void> {
		if (e.element) {
			const disposables = new DisposableStore();
			const mcpServer = e.element ? this.mcpWorkbenchService.local.find(local => local.id === e.element!.id) || e.element
				: e.element;
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
		this.currentQuery = query;
		if (this.input) {
			this.input.disposables.dispose();
			this.input = undefined;
		}

		if (this.mpcViewOptions.showMarketplaceWelcome && this.marketplaceConfigurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.MarketplaceEnabled) === true) {
			this.input = { model: new PagedModel([]), disposables: new DisposableStore(), showWelcomeContent: true };
		} else {
			this.input = await this.query(query.trim());
		}

		this.renderInput();

		if (this.input.onDidChangeModel) {
			this.input.disposables.add(this.input.onDidChangeModel(model => {
				if (!this.input) {
					return;
				}
				this.input.model = model;
				this.renderInput();
			}));
		}

		return this.input.model;
	}

	private renderInput() {
		if (!this.input) {
			return;
		}
		if (this.list) {
			this.list.model = new DelayedPagedModel(this.input.model);
		}
		this.showWelcomeContent(!!this.input.showWelcomeContent);
		if (!this.input.showWelcomeContent) {
			this.updateBody();
		}
	}

	private showWelcomeContent(show: boolean): void {
		this.welcomeContainer?.classList.toggle('hide', !show);
		this.listContainer?.classList.toggle('hide', show);
		this.bodyTemplate?.messageContainer.classList.toggle('hidden', show);
	}

	private createWelcomeContent(welcomeContainer: HTMLElement): void {
		this._register(this.instantiationService.createInstance(CustomizationMarketplaceWelcome, welcomeContainer, {
			icon: mcpServerIcon,
			title: localize('mcp.welcome.title', "Find MCP Servers in Customizations"),
			description: new MarkdownString(localize('mcp.welcome.descriptionWithLink', "Browse and install [Model Context Protocol (MCP) servers](https://code.visualstudio.com/docs/agent-customization/mcp-servers) from the Customizations marketplace.")),
			buttonLabel: localize('mcp.welcome.openCustomizationsButton', "Browse MCP Servers"),
			section: AICustomizationManagementSection.McpServers,
		}));
	}

	private updateBody(message?: Message): void {
		if (this.bodyTemplate) {

			const count = this.input?.model.length ?? 0;
			this.bodyTemplate.mcpServersList.classList.toggle('hidden', count === 0);
			this.bodyTemplate.messageContainer.classList.toggle('hidden', !message && count > 0);

			if (this.isBodyVisible()) {
				if (message) {
					this.bodyTemplate.messageSeverityIcon.className = SeverityIcon.className(message.severity);
					this.bodyTemplate.messageBox.textContent = message.text;
				} else if (count === 0) {
					this.bodyTemplate.messageSeverityIcon.className = '';
					this.bodyTemplate.messageBox.textContent = localize('no extensions found', "No MCP Servers found.");
				}
				if (this.bodyTemplate.messageBox.textContent) {
					alert(this.bodyTemplate.messageBox.textContent);
				}
			}
		}
	}

	private async query(query: string): Promise<IQueryResult> {
		const disposables = new DisposableStore();
		if (query) {
			const servers = await this.mcpWorkbenchService.queryGallery({ text: query.replace('@mcp', '') });
			const model = disposables.add(new IterativePagedModel(servers));
			return { model, disposables };
		}

		const onDidChangeModel = disposables.add(new Emitter<IPagedModel<IWorkbenchMcpServer>>());
		let servers = await this.mcpWorkbenchService.queryLocal();
		disposables.add(Event.debounce(this.mcpWorkbenchService.onChange, () => undefined)(() => {
			const mergedMcpServers = this.mergeChangedMcpServers(servers, [...this.mcpWorkbenchService.local]);
			if (mergedMcpServers) {
				servers = mergedMcpServers;
				onDidChangeModel.fire(new PagedModel(servers));
			}
		}));
		disposables.add(this.mcpWorkbenchService.onReset(() => onDidChangeModel.fire(new PagedModel([...this.mcpWorkbenchService.local]))));
		return { model: new PagedModel(servers), onDidChangeModel: onDidChangeModel.event, disposables };
	}

	private mergeChangedMcpServers(mcpServers: IWorkbenchMcpServer[], newMcpServers: IWorkbenchMcpServer[]): IWorkbenchMcpServer[] | undefined {
		const oldMcpServers = [...mcpServers];
		const findPreviousMcpServerIndex = (from: number): number => {
			let index = -1;
			const previousMcpServerInNew = newMcpServers[from];
			if (previousMcpServerInNew) {
				index = oldMcpServers.findIndex(e => e.id === previousMcpServerInNew.id);
				if (index === -1) {
					return findPreviousMcpServerIndex(from - 1);
				}
			}
			return index;
		};

		let hasChanged: boolean = false;
		for (let index = 0; index < newMcpServers.length; index++) {
			const newMcpServer = newMcpServers[index];
			if (mcpServers.every(r => r.id !== newMcpServer.id)) {
				hasChanged = true;
				mcpServers.splice(findPreviousMcpServerIndex(index - 1) + 1, 0, newMcpServer);
			}
		}

		for (let index = mcpServers.length - 1; index >= 0; index--) {
			const oldMcpServer = mcpServers[index];
			if (newMcpServers.every(r => r.id !== oldMcpServer.id) && newMcpServers.some(r => r.name === oldMcpServer.name)) {
				hasChanged = true;
				mcpServers.splice(index, 1);
			}
		}

		if (!hasChanged) {
			if (mcpServers.length === newMcpServers.length) {
				for (let index = 0; index < newMcpServers.length; index++) {
					if (mcpServers[index]?.id !== newMcpServers[index]?.id) {
						hasChanged = true;
						mcpServers = newMcpServers;
						break;
					}
				}
			}
		}

		return hasChanged ? mcpServers : undefined;
	}
}

interface IMcpServerTemplateData {
	root: HTMLElement;
	element: HTMLElement;
	name: HTMLElement;
	description: HTMLElement;
	starred: HTMLElement;
	mcpServer: IWorkbenchMcpServer | null;
	disposables: IDisposable[];
	mcpServerDisposables: IDisposable[];
	actionbar: ActionBar;
}

class McpServerRenderer implements IPagedRenderer<IWorkbenchMcpServer, IMcpServerTemplateData> {

	static readonly templateId = 'mcpServer';
	readonly templateId = McpServerRenderer.templateId;

	constructor(
		private readonly options: ExtensionListRendererOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IMcpWorkbenchService private readonly mcpWorkbenchService: IMcpWorkbenchService,
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
		const starred = dom.append(header, dom.$('span.ratings'));
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
		const mcpServerStatusAction = this.instantiationService.createInstance(McpServerStatusAction);

		const actions = [
			this.instantiationService.createInstance(InstallAction, true),
			this.instantiationService.createInstance(InstallingLabelAction),
			this.instantiationService.createInstance(ManageMcpServerAction, false),
			mcpServerStatusAction
		];

		const widgets = [
			iconWidget,
			publisherWidget,
			this.instantiationService.createInstance(StarredWidget, starred, true),
			this.instantiationService.createInstance(McpServerScopeBadgeWidget, iconContainer),
			this.instantiationService.createInstance(McpServerHoverWidget, { target: root, position: this.options.hoverOptions.position }, mcpServerStatusAction)
		];
		const extensionContainers: McpServerContainers = this.instantiationService.createInstance(McpServerContainers, [...actions, ...widgets]);

		actionbar.push(actions, { icon: true, label: true });
		const disposable = combinedDisposable(...actions, ...widgets, actionbar, actionBarListener, extensionContainers);

		return {
			root, element, name, description, starred, disposables: [disposable], actionbar,
			mcpServerDisposables: [],
			set mcpServer(mcpServer: IWorkbenchMcpServer) {
				extensionContainers.mcpServer = mcpServer;
			}
		};
	}

	renderPlaceholder(index: number, data: IMcpServerTemplateData): void {
		data.element.classList.add('loading');

		data.mcpServerDisposables = dispose(data.mcpServerDisposables);
		data.name.textContent = '';
		data.description.textContent = '';
		data.starred.style.display = 'none';
		data.mcpServer = null;
	}

	renderElement(mcpServer: IWorkbenchMcpServer, index: number, data: IMcpServerTemplateData): void {
		data.element.classList.remove('loading');
		data.mcpServerDisposables = dispose(data.mcpServerDisposables);
		data.root.setAttribute('data-mcp-server-id', mcpServer.id);
		data.name.textContent = mcpServer.label;
		data.description.textContent = mcpServer.description;

		data.starred.style.display = '';
		data.mcpServer = mcpServer;

		const updateEnablement = () => data.root.classList.toggle('disabled', !!mcpServer.runtimeStatus?.state && mcpServer.runtimeStatus.state !== McpServerEnablementState.Enabled);
		updateEnablement();
		data.mcpServerDisposables.push(this.mcpWorkbenchService.onChange(e => {
			if (!e || e.id === mcpServer.id) {
				updateEnablement();
			}
		}));
	}

	disposeElement(mcpServer: IWorkbenchMcpServer, index: number, data: IMcpServerTemplateData): void {
		data.mcpServerDisposables = dispose(data.mcpServerDisposables);
	}

	disposeTemplate(data: IMcpServerTemplateData): void {
		data.mcpServerDisposables = dispose(data.mcpServerDisposables);
		data.disposables = dispose(data.disposables);
	}
}


export class McpServersViewsContribution extends Disposable implements IWorkbenchContribution {

	static ID = 'workbench.mcp.servers.views.contribution';

	constructor() {
		super();

		Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([
			{
				id: 'workbench.views.mcp.marketplace',
				name: localize2('mcp', "MCP Servers"),
				ctorDescriptor: new SyncDescriptor(McpServersListView, [{ showMarketplaceWelcome: true }]),
				when: ContextKeyExpr.and(SearchMcpServersContext, ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate()),
			}
		], VIEW_CONTAINER);
	}
}
