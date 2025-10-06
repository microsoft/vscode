/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/mcpServersView.css';
import * as dom from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IListContextMenuEvent } from '../../../../base/browser/ui/list/list.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { markdownCommandLink, MarkdownString } from '../../../../base/common/htmlContent.js';
import { combinedDisposable, Disposable, DisposableStore, dispose, IDisposable, isDisposable } from '../../../../base/common/lifecycle.js';
import { DelayedPagedModel, IPagedModel, PagedModel } from '../../../../base/common/paging.js';
import { localize, localize2 } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyDefinedExpr, ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
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
import { HasInstalledMcpServersContext, IMcpWorkbenchService, InstalledMcpServersViewId, IWorkbenchMcpServer, McpServerContainers, McpServerEnablementState, McpServerInstallState, McpServersGalleryStatusContext } from '../common/mcpTypes.js';
import { DropDownAction, InstallAction, InstallingLabelAction, ManageMcpServerAction, McpServerStatusAction } from './mcpServerActions.js';
import { PublisherWidget, StarredWidget, McpServerIconWidget, McpServerHoverWidget, McpServerScopeBadgeWidget } from './mcpServerWidgets.js';
import { ActionRunner, IAction, Separator } from '../../../../base/common/actions.js';
import { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAllowedMcpServersService, mcpGalleryServiceEnablementConfig, mcpGalleryServiceUrlConfig } from '../../../../platform/mcp/common/mcpManagement.js';
import { URI } from '../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { DefaultViewsContext, SearchMcpServersContext } from '../../extensions/common/extensions.js';
import { VIEW_CONTAINER } from '../../extensions/browser/extensions.contribution.js';
import { renderMarkdown } from '../../../../base/browser/markdownRenderer.js';
import { ChatContextKeys } from '../../chat/common/chatContextKeys.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { AbstractExtensionsListView } from '../../extensions/browser/extensionsViews.js';
import { ExtensionListRendererOptions } from '../../extensions/browser/extensionsList.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { IWorkbenchLayoutService, Position } from '../../../services/layout/browser/layoutService.js';
import { mcpServerIcon } from './mcpServerIcons.js';
import { IPagedRenderer } from '../../../../base/browser/ui/list/listPaging.js';
import { IMcpGalleryManifestService, McpGalleryManifestStatus } from '../../../../platform/mcp/common/mcpGalleryManifest.js';
import { ProductQualityContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { SeverityIcon } from '../../../../base/browser/ui/severityIcon/severityIcon.js';

export interface McpServerListViewOptions {
	showWelcome?: boolean;
}

interface IQueryResult {
	model: IPagedModel<IWorkbenchMcpServer>;
	disposables: DisposableStore;
	showWelcomeContent?: boolean;
	onDidChangeModel?: Event<IPagedModel<IWorkbenchMcpServer>>;
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
	private input: IQueryResult | undefined;

	constructor(
		private readonly mpcViewOptions: McpServerListViewOptions,
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
		@IDialogService private readonly dialogService: IDialogService,
		@IMcpWorkbenchService private readonly mcpWorkbenchService: IMcpWorkbenchService,
		@IMcpGalleryManifestService protected readonly mcpGalleryManifestService: IMcpGalleryManifestService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		// Create welcome container
		this.welcomeContainer = dom.append(container, dom.$('.mcp-welcome-container.hide'));
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
			this.mcpWorkbenchService.open(options.element!, options.editorOptions);
		}));
		this._register(this.list.onContextMenu(e => this.onContextMenu(e), this));

		if (this.input) {
			this.renderInput();
		}
	}

	private async onContextMenu(e: IListContextMenuEvent<IWorkbenchMcpServer>): Promise<void> {
		if (e.element) {
			const disposables = new DisposableStore();
			const manageExtensionAction = disposables.add(this.instantiationService.createInstance(ManageMcpServerAction, false));
			const extension = e.element ? this.mcpWorkbenchService.local.find(local => local.id === e.element!.id) || e.element
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
		if (this.input) {
			this.input.disposables.dispose();
			this.input = undefined;
		}

		if (this.mpcViewOptions.showWelcome) {
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
	}

	private createWelcomeContent(welcomeContainer: HTMLElement): void {
		const welcomeContent = dom.append(welcomeContainer, dom.$('.mcp-welcome-content'));

		const iconContainer = dom.append(welcomeContent, dom.$('.mcp-welcome-icon'));
		const iconElement = dom.append(iconContainer, dom.$('span'));
		iconElement.className = ThemeIcon.asClassName(mcpServerIcon);

		const title = dom.append(welcomeContent, dom.$('.mcp-welcome-title'));
		title.textContent = localize('mcp.welcome.title', "MCP Servers");

		const settingsCommandLink = markdownCommandLink({ id: 'workbench.action.openSettings', arguments: [`@id:${mcpGalleryServiceEnablementConfig}`], title: mcpGalleryServiceEnablementConfig, tooltip: localize('mcp.welcome.settings.tooltip', "Open Settings") }).toString();
		const description = dom.append(welcomeContent, dom.$('.mcp-welcome-description'));
		const markdownResult = this._register(renderMarkdown(new MarkdownString(
			localize('mcp.welcome.descriptionWithLink', "Browse and install [Model Context Protocol (MCP) servers](https://code.visualstudio.com/docs/copilot/customization/mcp-servers) directly from VS Code to extend agent mode with extra tools for connecting to databases, invoking APIs and performing specialized tasks."),
			true,
		)
			.appendMarkdown('\n\n')
			.appendMarkdown(localize('mcp.gallery.enableDialog.setting', "This feature is currently in preview. You can disable it anytime using the setting {0}.", settingsCommandLink)),
			{
				actionHandler: (content: string) => {
					this.openerService.open(URI.parse(content), { allowCommands: ['workbench.action.openSettings'] });
				}
			}));
		description.appendChild(markdownResult.element);

		const buttonContainer = dom.append(welcomeContent, dom.$('.mcp-welcome-button-container'));
		const button = this._register(new Button(buttonContainer, {
			title: localize('mcp.welcome.enableGalleryButton', "Enable MCP Servers Marketplace"),
			...defaultButtonStyles
		}));
		button.label = localize('mcp.welcome.enableGalleryButton', "Enable MCP Servers Marketplace");

		this._register(button.onDidClick(async () => {

			const { result } = await this.dialogService.prompt({
				type: 'info',
				message: localize('mcp.gallery.enableDialog.title', "Enable MCP Servers Marketplace?"),
				custom: {
					markdownDetails: [{
						markdown: new MarkdownString(localize('mcp.gallery.enableDialog.setting', "This feature is currently in preview. You can disable it anytime using the setting {0}.", settingsCommandLink), { isTrusted: true })
					}]
				},
				buttons: [
					{ label: localize('mcp.gallery.enableDialog.enable', "Enable"), run: () => true },
					{ label: localize('mcp.gallery.enableDialog.cancel', "Cancel"), run: () => false }
				]
			});

			if (result) {
				await this.configurationService.updateValue(mcpGalleryServiceEnablementConfig, true);
			}
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
			return { model: new PagedModel(servers), disposables };
		}

		const onDidChangeModel = disposables.add(new Emitter<IPagedModel<IWorkbenchMcpServer>>());
		let servers = await this.mcpWorkbenchService.queryLocal();
		disposables.add(Event.debounce(Event.filter(this.mcpWorkbenchService.onChange, e => e?.installState === McpServerInstallState.Installed), () => undefined)(() => {
			const mergedMcpServers = this.mergeAddedMcpServers(servers, [...this.mcpWorkbenchService.local]);
			if (mergedMcpServers) {
				servers = mergedMcpServers;
				onDidChangeModel.fire(new PagedModel(servers));
			}
		}));
		disposables.add(this.mcpWorkbenchService.onReset(() => onDidChangeModel.fire(new PagedModel([...this.mcpWorkbenchService.local]))));
		return { model: new PagedModel(servers), onDidChangeModel: onDidChangeModel.event, disposables };
	}

	private mergeAddedMcpServers(mcpServers: IWorkbenchMcpServer[], newMcpServers: IWorkbenchMcpServer[]): IWorkbenchMcpServer[] | undefined {
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
			const mcpServer = newMcpServers[index];
			if (mcpServers.every(r => r.id !== mcpServer.id)) {
				hasChanged = true;
				mcpServers.splice(findPreviousMcpServerIndex(index - 1) + 1, 0, mcpServer);
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
		@IAllowedMcpServersService private readonly allowedMcpServersService: IAllowedMcpServersService,
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
			this.instantiationService.createInstance(InstallAction, false),
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

		const updateEnablement = () => {
			const disabled = !!mcpServer.local &&
				(mcpServer.installState === McpServerInstallState.Installed
					? mcpServer.enablementState === McpServerEnablementState.DisabledByAccess
					: mcpServer.installState === McpServerInstallState.Uninstalled);
			data.root.classList.toggle('disabled', disabled);
		};
		updateEnablement();
		this.allowedMcpServersService.onDidChangeAllowedMcpServers(() => updateEnablement(), this, data.mcpServerDisposables);
	}

	disposeElement(mcpServer: IWorkbenchMcpServer, index: number, data: IMcpServerTemplateData): void {
		data.mcpServerDisposables = dispose(data.mcpServerDisposables);
	}

	disposeTemplate(data: IMcpServerTemplateData): void {
		data.mcpServerDisposables = dispose(data.mcpServerDisposables);
		data.disposables = dispose(data.disposables);
	}
}


export class DefaultBrowseMcpServersView extends McpServersListView {

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this._register(this.mcpGalleryManifestService.onDidChangeMcpGalleryManifest(() => this.show()));
	}

	override async show(): Promise<IPagedModel<IWorkbenchMcpServer>> {
		return super.show('@mcp');
	}
}

export class McpServersViewsContribution extends Disposable implements IWorkbenchContribution {

	static ID = 'workbench.mcp.servers.views.contribution';

	constructor() {
		super();

		Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([
			{
				id: InstalledMcpServersViewId,
				name: localize2('mcp-installed', "MCP Servers - Installed"),
				ctorDescriptor: new SyncDescriptor(McpServersListView, [{}]),
				when: ContextKeyExpr.and(DefaultViewsContext, HasInstalledMcpServersContext),
				weight: 40,
				order: 4,
				canToggleVisibility: true
			},
			{
				id: 'workbench.views.mcp.default.marketplace',
				name: localize2('mcp', "MCP Servers"),
				ctorDescriptor: new SyncDescriptor(DefaultBrowseMcpServersView, [{}]),
				when: ContextKeyExpr.and(DefaultViewsContext, HasInstalledMcpServersContext.toNegated(), ChatContextKeys.Setup.hidden.negate(), McpServersGalleryStatusContext.isEqualTo(McpGalleryManifestStatus.Available), ContextKeyExpr.or(ContextKeyDefinedExpr.create(`config.${mcpGalleryServiceUrlConfig}`), ProductQualityContext.notEqualsTo('stable'), ContextKeyDefinedExpr.create(`config.${mcpGalleryServiceEnablementConfig}`))),
				weight: 40,
				order: 4,
				canToggleVisibility: true
			},
			{
				id: 'workbench.views.mcp.marketplace',
				name: localize2('mcp', "MCP Servers"),
				ctorDescriptor: new SyncDescriptor(McpServersListView, [{}]),
				when: ContextKeyExpr.and(SearchMcpServersContext, McpServersGalleryStatusContext.isEqualTo(McpGalleryManifestStatus.Available), ContextKeyExpr.or(ContextKeyDefinedExpr.create(`config.${mcpGalleryServiceUrlConfig}`), ProductQualityContext.notEqualsTo('stable'), ContextKeyDefinedExpr.create(`config.${mcpGalleryServiceEnablementConfig}`))),
			},
			{
				id: 'workbench.views.mcp.default.welcomeView',
				name: localize2('mcp', "MCP Servers"),
				ctorDescriptor: new SyncDescriptor(DefaultBrowseMcpServersView, [{ showWelcome: true }]),
				when: ContextKeyExpr.and(DefaultViewsContext, HasInstalledMcpServersContext.toNegated(), ChatContextKeys.Setup.hidden.negate(), McpServersGalleryStatusContext.isEqualTo(McpGalleryManifestStatus.Available), ContextKeyDefinedExpr.create(`config.${mcpGalleryServiceUrlConfig}`).negate(), ProductQualityContext.isEqualTo('stable'), ContextKeyDefinedExpr.create(`config.${mcpGalleryServiceEnablementConfig}`).negate()),
				weight: 40,
				order: 4,
				canToggleVisibility: false
			},
			{
				id: 'workbench.views.mcp.welcomeView',
				name: localize2('mcp', "MCP Servers"),
				ctorDescriptor: new SyncDescriptor(McpServersListView, [{ showWelcome: true }]),
				when: ContextKeyExpr.and(SearchMcpServersContext, McpServersGalleryStatusContext.isEqualTo(McpGalleryManifestStatus.Available), ContextKeyDefinedExpr.create(`config.${mcpGalleryServiceUrlConfig}`).negate(), ProductQualityContext.isEqualTo('stable'), ContextKeyDefinedExpr.create(`config.${mcpGalleryServiceEnablementConfig}`).negate()),
			}
		], VIEW_CONTAINER);
	}
}
