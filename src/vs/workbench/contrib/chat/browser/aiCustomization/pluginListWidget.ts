/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aiCustomizationManagement.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore, MutableDisposable, isDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { IListVirtualDelegate, IListRenderer, IListContextMenuEvent } from '../../../../../base/browser/ui/list/list.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Button, ButtonWithDropdown } from '../../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { autorun } from '../../../../../base/common/observable.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { URI } from '../../../../../base/common/uri.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Delayer } from '../../../../../base/common/async.js';
import { Action, IAction, Separator } from '../../../../../base/common/actions.js';
import { basename, dirname, isEqual } from '../../../../../base/common/resources.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { IAgentPlugin, IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { isContributionEnabled } from '../../common/enablement.js';
import { getInstalledPluginContextMenuActions } from '../agentPluginActions.js';
import { IMarketplacePlugin, IPluginMarketplaceService } from '../../common/plugins/pluginMarketplaceService.js';
import { IPluginInstallService } from '../../common/plugins/pluginInstallService.js';
import { AgentPluginItemKind, IAgentPluginItem, IInstalledPluginItem, IMarketplacePluginItem } from '../agentPluginEditor/agentPluginItems.js';
import { pluginIcon } from './aiCustomizationIcons.js';
import { formatDisplayName, truncateToFirstLine } from './aiCustomizationListWidget.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { CustomizationGroupHeaderRenderer, ICustomizationGroupHeaderEntry, CUSTOMIZATION_GROUP_HEADER_HEIGHT, CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR } from './customizationGroupHeaderRenderer.js';
import { ICustomizationHarnessService, isPluginCustomizationItem, type ICustomizationItem, type ICustomizationItemAction } from '../../common/customizationHarnessService.js';
import { Checkbox } from '../../../../../base/browser/ui/toggle/toggle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ChatConfiguration } from '../../common/constants.js';

const $ = DOM.$;

const PLUGIN_ITEM_HEIGHT = 36;

//#region Entry types

/**
 * Represents a collapsible group header in the plugin list.
 */
interface IPluginGroupHeaderEntry extends ICustomizationGroupHeaderEntry {
	readonly group: string;
}

/**
 * Represents an installed plugin item in the list.
 */
interface IPluginInstalledItemEntry {
	readonly type: 'plugin-item';
	readonly item: IInstalledPluginItem;
}

/**
 * Represents a marketplace plugin item in the list (browse mode).
 */
interface IPluginMarketplaceItemEntry {
	readonly type: 'marketplace-item';
	readonly item: IMarketplacePluginItem;
}

interface IPluginRemoteItemEntry {
	readonly type: 'remote-item';
	readonly item: ICustomizationItem;
}

type IPluginListEntry = IPluginGroupHeaderEntry | IPluginInstalledItemEntry | IPluginMarketplaceItemEntry | IPluginRemoteItemEntry;

//#endregion

//#region Delegate

class PluginItemDelegate implements IListVirtualDelegate<IPluginListEntry> {
	getHeight(element: IPluginListEntry): number {
		if (element.type === 'group-header') {
			return element.isFirst ? CUSTOMIZATION_GROUP_HEADER_HEIGHT : CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR;
		}
		if (element.type === 'marketplace-item') {
			return 62;
		}
		return PLUGIN_ITEM_HEIGHT;
	}

	getTemplateId(element: IPluginListEntry): string {
		if (element.type === 'group-header') {
			return 'pluginGroupHeader';
		}
		if (element.type === 'marketplace-item') {
			return 'pluginMarketplaceItem';
		}
		if (element.type === 'remote-item') {
			return 'pluginRemoteItem';
		}
		return 'pluginInstalledItem';
	}
}

//#endregion

//#endregion

//#region Installed Plugin Renderer (reuses .mcp-server-item CSS)

interface IPluginInstalledItemTemplateData {
	readonly container: HTMLElement;
	readonly syncCheckboxContainer: HTMLElement;
	readonly typeIcon: HTMLElement;
	readonly name: HTMLElement;
	readonly description: HTMLElement;
	readonly disposables: DisposableStore;
}

class PluginInstalledItemRenderer implements IListRenderer<IPluginInstalledItemEntry, IPluginInstalledItemTemplateData> {
	readonly templateId = 'pluginInstalledItem';

	constructor(
		private readonly _harnessService: ICustomizationHarnessService,
	) { }

	renderTemplate(container: HTMLElement): IPluginInstalledItemTemplateData {
		container.classList.add('mcp-server-item');

		const syncCheckboxContainer = DOM.append(container, $('.item-sync-checkbox'));
		const typeIcon = DOM.append(container, $('.mcp-server-icon'));
		typeIcon.classList.add(...ThemeIcon.asClassNameArray(pluginIcon));

		const details = DOM.append(container, $('.mcp-server-details'));
		const name = DOM.append(details, $('.mcp-server-name'));
		const description = DOM.append(details, $('.mcp-server-description'));

		return { container, syncCheckboxContainer, typeIcon, name, description, disposables: new DisposableStore() };
	}

	renderElement(element: IPluginInstalledItemEntry, _index: number, templateData: IPluginInstalledItemTemplateData): void {
		templateData.disposables.clear();

		templateData.name.textContent = formatDisplayName(element.item.name);

		if (element.item.description) {
			templateData.description.textContent = truncateToFirstLine(element.item.description);
			templateData.description.style.display = '';
		} else {
			templateData.description.style.display = 'none';
		}

		// Reflect enabled/disabled state on the container for visual styling. The
		// inline status badge ("Enabled"/"Disabled") is intentionally omitted —
		// items are already grouped under "Enabled Locally" / "Disabled Locally"
		// section headers, and the row's aria-label conveys state to screen readers.
		templateData.disposables.add(autorun(reader => {
			const enabled = isContributionEnabled(element.item.plugin.enablement.read(reader));
			templateData.container.classList.toggle('disabled', !enabled);
		}));

		// Disable checkbox: shown when the active harness has a disable provider
		const syncProvider = this._harnessService.getActiveDescriptor().syncProvider;
		if (syncProvider) {
			templateData.syncCheckboxContainer.style.display = '';
			const pluginUri = element.item.plugin.uri;
			const disabled = syncProvider.isDisabled(pluginUri);
			const title = disabled
				? localize('enablePlugin', "Enable {0} for sync", element.item.name)
				: localize('disablePlugin', "Disable {0} from sync", element.item.name);
			const checkbox = templateData.disposables.add(
				new Checkbox(title, !disabled, defaultCheckboxStyles)
			);
			templateData.syncCheckboxContainer.replaceChildren(checkbox.domNode);
			templateData.disposables.add(checkbox.onChange(() => {
				syncProvider.setDisabled(pluginUri, !checkbox.checked);
			}));
		} else {
			templateData.syncCheckboxContainer.style.display = 'none';
			templateData.syncCheckboxContainer.replaceChildren();
		}
	}

	disposeTemplate(templateData: IPluginInstalledItemTemplateData): void {
		templateData.disposables.dispose();
	}
}

//#endregion

//#region Remote Plugin Renderer

interface IPluginRemoteItemTemplateData {
	readonly container: HTMLElement;
	readonly typeIcon: HTMLElement;
	readonly name: HTMLElement;
	readonly badge: HTMLElement;
	readonly description: HTMLElement;
	readonly status: HTMLElement;
}

class PluginRemoteItemRenderer implements IListRenderer<IPluginRemoteItemEntry, IPluginRemoteItemTemplateData> {
	readonly templateId = 'pluginRemoteItem';

	renderTemplate(container: HTMLElement): IPluginRemoteItemTemplateData {
		container.classList.add('mcp-server-item');

		const typeIcon = DOM.append(container, $('.mcp-server-icon'));
		typeIcon.classList.add(...ThemeIcon.asClassNameArray(pluginIcon));

		const details = DOM.append(container, $('.mcp-server-details'));
		const nameRow = DOM.append(details, $('.mcp-server-name'));
		const name = DOM.append(nameRow, $('span'));
		const badge = DOM.append(nameRow, $('.inline-badge.item-badge'));
		const description = DOM.append(details, $('.mcp-server-description'));
		const status = DOM.append(container, $('.mcp-server-status'));

		return { container, typeIcon, name, badge, description, status };
	}

	renderElement(element: IPluginRemoteItemEntry, _index: number, templateData: IPluginRemoteItemTemplateData): void {
		templateData.name.textContent = formatDisplayName(element.item.name);

		if (element.item.badge) {
			templateData.badge.textContent = element.item.badge;
			templateData.badge.style.display = '';
			templateData.badge.title = element.item.badgeTooltip ?? '';
		} else {
			templateData.badge.textContent = '';
			templateData.badge.style.display = 'none';
			templateData.badge.title = '';
		}

		if (element.item.description) {
			templateData.description.textContent = truncateToFirstLine(element.item.description);
			templateData.description.style.display = '';
		} else {
			templateData.description.textContent = '';
			templateData.description.style.display = 'none';
		}

		templateData.container.classList.toggle('disabled', element.item.enabled === false);
		templateData.status.className = 'mcp-server-status';
		if (element.item.enabled === false) {
			templateData.status.textContent = localize('remotePluginDisabled', "Disabled");
			templateData.status.classList.add('disabled');
			return;
		}

		switch (element.item.status) {
			case 'loading':
				templateData.status.textContent = localize('remotePluginLoading', "Loading");
				templateData.status.classList.add('running');
				break;
			case 'loaded':
				templateData.status.textContent = localize('remotePluginLoaded', "Loaded");
				templateData.status.classList.add('running');
				break;
			case 'degraded':
				templateData.status.textContent = localize('remotePluginDegraded', "Warning");
				templateData.status.classList.add('disabled');
				break;
			case 'error':
				templateData.status.textContent = localize('remotePluginError', "Error");
				templateData.status.classList.add('disabled');
				break;
			default:
				templateData.status.textContent = '';
				break;
		}
	}

	disposeTemplate(_templateData: IPluginRemoteItemTemplateData): void { }
}

//#endregion

//#region Marketplace Plugin Renderer (reuses .mcp-gallery-item CSS)

interface IPluginMarketplaceItemTemplateData {
	readonly container: HTMLElement;
	readonly name: HTMLElement;
	readonly publisher: HTMLElement;
	readonly description: HTMLElement;
	readonly installButton: Button;
	readonly elementDisposables: DisposableStore;
	readonly templateDisposables: DisposableStore;
}

class PluginMarketplaceItemRenderer implements IListRenderer<IPluginMarketplaceItemEntry, IPluginMarketplaceItemTemplateData> {
	readonly templateId = 'pluginMarketplaceItem';

	constructor(
		private readonly pluginInstallService: IPluginInstallService,
		private readonly agentPluginService: IAgentPluginService,
	) { }

	renderTemplate(container: HTMLElement): IPluginMarketplaceItemTemplateData {
		container.classList.add('mcp-server-item', 'mcp-gallery-item', 'extension-list-item');
		const details = DOM.append(container, $('.details'));
		const headerContainer = DOM.append(details, $('.header-container'));
		const header = DOM.append(headerContainer, $('.header'));
		const name = DOM.append(header, $('span.name'));
		const description = DOM.append(details, $('.description.ellipsis'));
		const publisherContainer = DOM.append(details, $('.publisher-container'));
		const publisher = DOM.append(publisherContainer, $('span.publisher-name.mcp-gallery-publisher'));
		const actionContainer = DOM.append(container, $('.mcp-gallery-action'));
		const installButton = new Button(actionContainer, { ...defaultButtonStyles, supportIcons: true });
		installButton.element.classList.add('mcp-gallery-install-button');

		const templateDisposables = new DisposableStore();
		templateDisposables.add(installButton);

		return { container, name, publisher, description, installButton, elementDisposables: new DisposableStore(), templateDisposables };
	}

	renderElement(element: IPluginMarketplaceItemEntry, _index: number, templateData: IPluginMarketplaceItemTemplateData): void {
		templateData.elementDisposables.clear();

		templateData.name.textContent = element.item.name;
		templateData.publisher.textContent = element.item.marketplace ? localize('byPublisher', "by {0}", element.item.marketplace) : '';
		templateData.description.textContent = element.item.description || '';

		// Check if the plugin is already installed by comparing install URIs
		const installUri = this.pluginInstallService.getPluginInstallUri({
			name: element.item.name,
			description: element.item.description,
			version: '',
			sourceDescriptor: element.item.sourceDescriptor,
			source: element.item.source,
			marketplace: element.item.marketplace,
			marketplaceReference: element.item.marketplaceReference,
			marketplaceType: element.item.marketplaceType,
		});
		const isAlreadyInstalled = this.agentPluginService.plugins.get().some(p => isEqual(p.uri, installUri));

		if (isAlreadyInstalled) {
			templateData.installButton.label = localize('installed', "Installed");
			templateData.installButton.enabled = false;
			return;
		}

		templateData.installButton.label = localize('install', "Install");
		templateData.installButton.enabled = true;

		templateData.elementDisposables.add(templateData.installButton.onDidClick(async () => {
			templateData.installButton.label = localize('installing', "Installing...");
			templateData.installButton.enabled = false;
			try {
				await this.pluginInstallService.installPlugin({
					name: element.item.name,
					description: element.item.description,
					version: '',
					sourceDescriptor: element.item.sourceDescriptor,
					source: element.item.source,
					marketplace: element.item.marketplace,
					marketplaceReference: element.item.marketplaceReference,
					marketplaceType: element.item.marketplaceType,
					readmeUri: element.item.readmeUri,
				});
				templateData.installButton.label = localize('installed', "Installed");
			} catch (_e) {
				templateData.installButton.label = localize('install', "Install");
				templateData.installButton.enabled = true;
			}
		}));
	}

	disposeTemplate(templateData: IPluginMarketplaceItemTemplateData): void {
		templateData.elementDisposables.dispose();
		templateData.templateDisposables.dispose();
	}
}

//#endregion

//#region Helpers

function installedPluginToItem(plugin: IAgentPlugin, labelService: ILabelService): IInstalledPluginItem {
	// Use `||` (not `??`) so an empty `label` also falls back to the URI basename.
	// The items model's `getPluginCount` dedupes against this same fallback; using
	// `??` here would silently break dedup for plugins whose label is `''`.
	const name = plugin.label || basename(plugin.uri);
	const description = plugin.fromMarketplace?.description ?? labelService.getUriLabel(dirname(plugin.uri), { relative: true });
	const marketplace = plugin.fromMarketplace?.marketplace;
	return { kind: AgentPluginItemKind.Installed, name, description, marketplace, plugin };
}

function marketplacePluginToItem(plugin: IMarketplacePlugin): IMarketplacePluginItem {
	return {
		kind: AgentPluginItemKind.Marketplace,
		name: plugin.name,
		description: plugin.description,
		source: plugin.source,
		sourceDescriptor: plugin.sourceDescriptor,
		marketplace: plugin.marketplace,
		marketplaceReference: plugin.marketplaceReference,
		marketplaceType: plugin.marketplaceType,
		readmeUri: plugin.readmeUri,
	};
}

//#endregion

/**
 * Widget that displays a list of agent plugins with marketplace browsing.
 * Follows the same patterns as {@link McpListWidget}.
 */
export class PluginListWidget extends Disposable {

	readonly element: HTMLElement;

	private readonly _onDidSelectPlugin = this._register(new Emitter<IAgentPluginItem>());
	readonly onDidSelectPlugin = this._onDidSelectPlugin.event;

	private readonly _onDidChangeItemCount = this._register(new Emitter<number>());
	readonly onDidChangeItemCount = this._onDidChangeItemCount.event;

	private sectionHeader!: HTMLElement;
	private sectionDescription!: HTMLElement;
	private sectionLink!: HTMLAnchorElement;
	private searchAndButtonContainer!: HTMLElement;
	private searchInput!: InputBox;
	private listContainer!: HTMLElement;
	private list!: WorkbenchList<IPluginListEntry>;
	private emptyContainer!: HTMLElement;
	private emptyText!: HTMLElement;
	private emptySubtext!: HTMLElement;
	private disabledContainer!: HTMLElement;
	private disabledIcon!: HTMLElement;
	private disabledMessage!: HTMLElement;
	private readonly disabledLinkListener = this._register(new MutableDisposable());
	private buttonContainer!: HTMLElement;
	private browseButton!: Button;
	private addButtonContainer!: HTMLElement;
	private addButtonSimple!: Button;
	private addButton!: ButtonWithDropdown;
	private createPluginButton!: Button;
	private readonly addDropdownActions = this._register(new DisposableStore());

	private installedItems: IInstalledPluginItem[] = [];
	private remoteItems: ICustomizationItem[] = [];
	private displayEntries: IPluginListEntry[] = [];
	private marketplaceItems: IMarketplacePluginItem[] = [];
	private searchQuery: string = '';
	private browseMode: boolean = false;
	private lastHeight: number = 0;
	private lastWidth: number = 0;
	private _layoutDeferred = false;
	private readonly collapsedGroups = new Set<string>();
	private marketplaceCts: CancellationTokenSource | undefined;
	private readonly delayedFilter = new Delayer<void>(200);
	private readonly delayedMarketplaceSearch = new Delayer<void>(400);

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAgentPluginService private readonly agentPluginService: IAgentPluginService,
		@IPluginMarketplaceService private readonly pluginMarketplaceService: IPluginMarketplaceService,
		@IPluginInstallService private readonly pluginInstallService: IPluginInstallService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IHoverService private readonly hoverService: IHoverService,
		@ILabelService private readonly labelService: ILabelService,
		@ICommandService private readonly commandService: ICommandService,
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this.element = $('.mcp-list-widget'); // reuse MCP list widget CSS
		this.create();
		this.updateAccessState();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.PluginsEnabled)) {
				this.updateAccessState();
			}
		}));
		this._register({
			dispose: () => {
				this.marketplaceCts?.dispose();
			}
		});
	}

	private create(): void {
		// Search and button container
		this.searchAndButtonContainer = DOM.append(this.element, $('.list-search-and-button-container'));

		// Search container
		const searchContainer = DOM.append(this.searchAndButtonContainer, $('.list-search-container'));
		this.searchInput = this._register(new InputBox(searchContainer, this.contextViewService, {
			placeholder: localize('searchPluginsPlaceholder', "Type to search..."),
			inputBoxStyles: defaultInputBoxStyles,
		}));

		this._register(this.searchInput.onDidChange(() => {
			this.searchQuery = this.searchInput.value;
			if (this.browseMode) {
				this.delayedMarketplaceSearch.trigger(() => this.queryMarketplace());
			} else {
				this.delayedFilter.trigger(() => this.filterPlugins());
			}
		}));

		// Button container (Browse Marketplace + Add actions + Create Plugin)
		this.buttonContainer = DOM.append(this.searchAndButtonContainer, $('.list-button-group'));

		const browseButtonContainer = DOM.append(this.buttonContainer, $('.list-add-button-container'));
		const browseMarketplaceLabel = localize('browseMarketplace', "Browse Marketplace");
		this.browseButton = this._register(new Button(browseButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: browseMarketplaceLabel, ariaLabel: browseMarketplaceLabel }));
		this.browseButton.element.classList.add('list-add-button');
		this._register(this.browseButton.onDidClick(() => this.runPrimaryButtonAction()));

		this.addButtonContainer = DOM.append(this.buttonContainer, $('.list-add-button-container'));
		const addPluginLabel = localize('addPlugin', "Add Plugin");
		this.addButtonSimple = this._register(new Button(this.addButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: addPluginLabel, ariaLabel: addPluginLabel }));
		this.addButtonSimple.element.classList.add('list-add-button');
		this._register(this.addButtonSimple.onDidClick(() => this.runPrimaryAddAction()));

		this.addButton = this._register(new ButtonWithDropdown(this.addButtonContainer, {
			...defaultButtonStyles,
			secondary: true,
			supportIcons: true,
			contextMenuProvider: this.contextMenuService,
			addPrimaryActionToDropdown: false,
			actions: { getActions: () => this.getAddDropdownActions() },
			title: addPluginLabel,
			ariaLabel: addPluginLabel,
		}));
		this.addButton.element.classList.add('list-add-button');
		this._register(this.addButton.onDidClick(() => this.runPrimaryAddAction()));

		const createPluginLabel = localize('createPlugin', "Create Plugin");
		this.createPluginButton = this._register(new Button(this.buttonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: createPluginLabel, ariaLabel: createPluginLabel }));
		this.createPluginButton.element.classList.add('list-icon-button');
		this.createPluginButton.label = `$(${Codicon.newFile.id})`;
		this._register(this.createPluginButton.onDidClick(() => this.runCreatePluginAction()));

		// Empty state
		this.emptyContainer = DOM.append(this.element, $('.mcp-empty-state'));
		const emptyHeader = DOM.append(this.emptyContainer, $('.empty-state-header'));
		const emptyIcon = DOM.append(emptyHeader, $('.empty-icon'));
		emptyIcon.classList.add(...ThemeIcon.asClassNameArray(pluginIcon));
		this.emptyText = DOM.append(emptyHeader, $('.empty-text'));
		this.emptySubtext = DOM.append(this.emptyContainer, $('.empty-subtext'));

		// Disabled (access blocked) state — shown when chat.plugins.enabled is false,
		// either by user setting or by enterprise policy.
		this.disabledContainer = DOM.append(this.element, $('.mcp-disabled-state'));
		const disabledHeader = DOM.append(this.disabledContainer, $('.empty-state-header'));
		this.disabledIcon = DOM.append(disabledHeader, $('.empty-icon'));
		const disabledText = DOM.append(disabledHeader, $('.empty-text'));
		disabledText.textContent = localize('pluginsDisabledTitle', "Plugins are disabled");
		this.disabledMessage = DOM.append(this.disabledContainer, $('.empty-subtext'));

		// List container
		this.listContainer = DOM.append(this.element, $('.mcp-list-container'));

		// Section footer
		this.sectionHeader = DOM.append(this.element, $('.section-footer'));
		this.sectionDescription = DOM.append(this.sectionHeader, $('p.section-footer-description'));
		this.sectionDescription.textContent = localize('pluginsDescription', "Extend your AI agent with plugins that add commands, skills, agents, hooks, and MCP servers from reusable packages.");
		this.sectionLink = DOM.append(this.sectionHeader, $('a.section-footer-link')) as HTMLAnchorElement;
		this.sectionLink.textContent = localize('learnMorePlugins', "Learn more about agent plugins");
		this.sectionLink.href = 'https://code.visualstudio.com/docs/copilot/customization/agent-plugins';
		this._register(DOM.addDisposableListener(this.sectionLink, 'click', (e) => {
			e.preventDefault();
			const href = this.sectionLink.href;
			if (href) {
				this.openerService.open(URI.parse(href));
			}
		}));

		// Create list
		const delegate = new PluginItemDelegate();
		const groupHeaderRenderer = new CustomizationGroupHeaderRenderer<IPluginGroupHeaderEntry>('pluginGroupHeader', this.hoverService);
		const installedRenderer = new PluginInstalledItemRenderer(this.harnessService);
		const remoteRenderer = new PluginRemoteItemRenderer();
		const marketplaceRenderer = new PluginMarketplaceItemRenderer(this.pluginInstallService, this.agentPluginService);

		this.list = this._register(this.instantiationService.createInstance(
			WorkbenchList<IPluginListEntry>,
			'PluginManagementList',
			this.listContainer,
			delegate,
			[groupHeaderRenderer, installedRenderer, remoteRenderer, marketplaceRenderer],
			{
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				horizontalScrolling: false,
				accessibilityProvider: {
					getAriaLabel(element: IPluginListEntry) {
						if (element.type === 'group-header') {
							return localize('pluginGroupAriaLabel', "{0}, {1} items, {2}", element.label, element.count, element.collapsed ? localize('collapsed', "collapsed") : localize('expanded', "expanded"));
						}
						const name = formatDisplayName(element.item.name);
						const description = element.item.description ? truncateToFirstLine(element.item.description) : undefined;
						const nameAndDesc = description
							? localize('pluginItemAriaLabel', "{0}. {1}", name, description)
							: name;
						if (element.type === 'plugin-item') {
							const enabled = isContributionEnabled(element.item.plugin.enablement.get());
							return enabled
								? localize('pluginInstalledItemAriaLabelEnabled', "{0}. Enabled", nameAndDesc)
								: localize('pluginInstalledItemAriaLabelDisabled', "{0}. Disabled", nameAndDesc);
						}
						return nameAndDesc;
					},
					getWidgetAriaLabel() {
						return localize('pluginsListAriaLabel', "Plugins");
					}
				},
				openOnSingleClick: true,
				identityProvider: {
					getId(element: IPluginListEntry) {
						if (element.type === 'group-header') {
							return element.id;
						}
						if (element.type === 'marketplace-item') {
							return `marketplace-${element.item.marketplaceReference.canonicalId}/${element.item.source}`;
						}
						if (element.type === 'remote-item') {
							return element.item.itemKey ?? `remote-${element.item.groupKey ?? 'default'}-${element.item.uri.toString()}`;
						}
						return element.item.plugin.uri.toString();
					}
				}
			}
		));

		this._register(this.list.onDidOpen(e => {
			if (e.element) {
				if (e.element.type === 'group-header') {
					this.toggleGroup(e.element);
				} else if (e.element.type === 'plugin-item') {
					this._onDidSelectPlugin.fire(e.element.item);
				} else if (e.element.type === 'remote-item') {
					// Keep row activation inert for remote-configured plugins. Management
					// actions are surfaced via the context menu and toolbar.
				} else if (e.element.type === 'marketplace-item') {
					this._onDidSelectPlugin.fire(e.element.item);
				}
			}
		}));

		// Handle context menu
		this._register(this.list.onContextMenu(e => this.onContextMenu(e as IListContextMenuEvent<IPluginListEntry>)));

		// Listen to plugin service changes
		this._register(autorun(reader => {
			const plugins = this.agentPluginService.plugins.read(reader);
			for (const plugin of plugins) {
				plugin.enablement.read(reader);
			}
			if (!this.browseMode) {
				void this.refresh();
			}
		}));
		this._register(this.pluginMarketplaceService.onDidChangeMarketplaces(() => {
			if (!this.browseMode) {
				void this.refresh();
			}
		}));

		// Re-render when the active harness changes (sync checkboxes may appear/disappear)
		this._register(autorun(reader => {
			this.harnessService.activeHarness.read(reader);
			this.updateToolbarActions();
			if (!this.browseMode) {
				void this.refresh();
			}
		}));

		// Re-render when the active harness's remote item provider reports changes
		const itemProviderChangeDisposable = this._register(new MutableDisposable());
		this._register(autorun(reader => {
			this.harnessService.activeHarness.read(reader);
			const itemProvider = this.harnessService.getActiveDescriptor().itemProvider;
			if (itemProvider) {
				itemProviderChangeDisposable.value = itemProvider.onDidChange(() => {
					if (!this.browseMode) {
						void this.refresh();
					}
				});
			} else {
				itemProviderChangeDisposable.clear();
			}
		}));

		this.updateToolbarActions();

		// Initial refresh
		void this.refresh();
	}

	private async refresh(): Promise<void> {
		if (this.browseMode) {
			await this.queryMarketplace();
		} else {
			this.filterPlugins();
		}
	}

	private updateAccessState(): void {
		const inspect = this.configurationService.inspect<boolean>(ChatConfiguration.PluginsEnabled);
		const value = inspect.value ?? inspect.defaultValue;
		const disabled = value === false;
		const policyLocked = inspect.policyValue === false;

		this.element.classList.toggle('access-disabled', disabled);

		if (disabled) {
			this.disabledIcon.className = 'empty-icon';
			this.disabledIcon.classList.add(...ThemeIcon.asClassNameArray(policyLocked ? Codicon.shield : pluginIcon));

			DOM.clearNode(this.disabledMessage);
			this.disabledLinkListener.clear();
			if (policyLocked) {
				this.disabledMessage.textContent = localize('pluginsDisabledByPolicy', "Plugin integration in chat is disabled by your organization. Contact your organization administrator for more information.");
			} else {
				this.disabledMessage.appendChild(document.createTextNode(localize('pluginsDisabledBySettingPrefix', "Plugins are disabled in settings. ")));
				const link = DOM.append(this.disabledMessage, $('a.mcp-disabled-settings-link')) as HTMLAnchorElement;
				link.textContent = localize('pluginsDisabledSettingLink', "Configure in settings.");
				link.href = '#';
				link.setAttribute('role', 'button');
				this.disabledLinkListener.value = DOM.addDisposableListener(link, 'click', (e) => {
					e.preventDefault();
					this.commandService.executeCommand('workbench.action.openSettings', `@id:${ChatConfiguration.PluginsEnabled}`);
				});
			}
		}
	}

	private get pluginActions(): readonly ICustomizationItemAction[] {
		return this.harnessService.getActiveDescriptor().pluginActions ?? [];
	}

	private formatActionLabel(action: ICustomizationItemAction, iconOnly = false): string {
		if (!action.icon) {
			return action.label;
		}

		return iconOnly
			? `$(${action.icon.id})`
			: `$(${action.icon.id}) ${action.label}`;
	}

	private updateToolbarActions(): void {
		const browseMarketplaceAvailable = this.isBrowseMarketplaceAvailable();
		if (!browseMarketplaceAvailable && this.browseMode) {
			this.toggleBrowseMode(false);
		}

		this.browseButton.element.parentElement!.style.display = this.browseMode ? 'none' : '';
		this.browseButton.label = `$(${Codicon.library.id}) ${localize('browseMarketplace', "Browse Marketplace")}`;
		this.browseButton.enabled = browseMarketplaceAvailable;
		const browseTitle = browseMarketplaceAvailable
			? localize('browseMarketplace', "Browse Marketplace")
			: localize('browseMarketplaceUnsupportedWeb', "Browse Marketplace is not available in VS Code for the Web.");
		this.browseButton.setTitle(browseTitle);
		this.browseButton.element.setAttribute('aria-label', browseTitle);

		this.updateAddButton();
		this.createPluginButton.enabled = true;
	}

	private isBrowseMarketplaceAvailable(): boolean {
		return !isWeb;
	}

	private updateAddButton(): void {
		const actions = this.buildAddActions();
		const [primary, ...dropdown] = actions;
		const hasDropdown = dropdown.length > 0;

		this.addButton.element.style.display = hasDropdown ? '' : 'none';
		this.addButtonSimple.element.style.display = hasDropdown ? 'none' : '';

		if (!primary) {
			this.addButton.element.style.display = 'none';
			this.addButtonSimple.element.style.display = 'none';
			return;
		}

		if (hasDropdown) {
			this.addButton.label = this.formatActionLabel(primary);
			this.addButton.enabled = primary.enabled !== false;
			const addPrimaryTitle = primary.tooltip ?? primary.label;
			this.addButton.primaryButton.setTitle(addPrimaryTitle);
			this.addButton.primaryButton.element.setAttribute('aria-label', addPrimaryTitle);
			const moreLabel = localize('morePluginAddActions', "More Plugin Add Actions...");
			this.addButton.dropdownButton.setTitle(moreLabel);
			this.addButton.dropdownButton.element.setAttribute('aria-label', moreLabel);
		} else {
			this.addButtonSimple.label = this.formatActionLabel(primary);
			this.addButtonSimple.enabled = primary.enabled !== false;
			const addSimpleTitle = primary.tooltip ?? primary.label;
			this.addButtonSimple.setTitle(addSimpleTitle);
			this.addButtonSimple.element.setAttribute('aria-label', addSimpleTitle);
		}
	}

	private buildAddActions(): readonly ICustomizationItemAction[] {
		return [
			...this.pluginActions,
			{
				id: 'plugin.installFromSource',
				label: localize('installFromSource', "Install Plugin from Source"),
				tooltip: localize('installFromSource', "Install Plugin from Source"),
				icon: Codicon.add,
				run: () => this.commandService.executeCommand('workbench.action.chat.installPluginFromSource'),
			},
		];
	}

	private getAddDropdownActions(): Action[] {
		this.addDropdownActions.clear();
		return this.buildAddActions().slice(1).map((action, index) => this.addDropdownActions.add(new Action(`plugin_add_${index}`, this.formatActionLabel(action), undefined, action.enabled !== false, () => this.runPluginAction(action))));
	}

	private async runPrimaryButtonAction(): Promise<void> {
		if (!this.isBrowseMarketplaceAvailable()) {
			return;
		}

		this.toggleBrowseMode(!this.browseMode);
	}

	private async runPrimaryAddAction(): Promise<void> {
		const [primary] = this.buildAddActions();
		if (primary) {
			await this.runPluginAction(primary);
		}
	}

	private async runCreatePluginAction(): Promise<void> {
		await this.commandService.executeCommand('workbench.action.chat.createPlugin');
	}

	private async runPluginAction(action: ICustomizationItemAction): Promise<void> {
		if (action.enabled !== false) {
			await action.run();
		}
	}

	public showBrowseMarketplace(): void {
		if (!this.isBrowseMarketplaceAvailable()) {
			return;
		}
		if (!this.browseMode) {
			this.toggleBrowseMode(true);
		}
	}

	private toggleBrowseMode(browse: boolean): void {
		this.browseMode = browse;
		this.searchInput.value = '';
		this.searchQuery = '';

		this.browseButton.element.parentElement!.style.display = browse ? 'none' : '';

		this.searchInput.setPlaceHolder(browse
			? localize('searchMarketplacePlaceholder', "Search plugin marketplace...")
			: localize('searchPluginsPlaceholder', "Type to search...")
		);

		if (browse) {
			void this.queryMarketplace();
		} else {
			this.marketplaceCts?.dispose(true);
			this.marketplaceItems = [];
			void this.filterPlugins();
		}

		// Re-layout to account for the back link height change
		if (this.lastHeight > 0) {
			this.layout(this.lastHeight, this.lastWidth);
		}
	}

	private async queryMarketplace(): Promise<void> {
		this.marketplaceCts?.dispose(true);
		const cts = this.marketplaceCts = new CancellationTokenSource();

		// Show loading state
		this.emptyContainer.style.display = 'flex';
		this.listContainer.style.display = 'none';
		this.emptyText.textContent = localize('loadingMarketplace', "Loading marketplace...");
		this.emptySubtext.textContent = '';

		try {
			const plugins = await this.pluginMarketplaceService.fetchMarketplacePlugins(cts.token);

			if (cts.token.isCancellationRequested) {
				return;
			}

			const query = this.searchQuery.toLowerCase().trim();
			const filtered = query
				? plugins.filter(p => p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query))
				: plugins;

			// Filter out already-installed plugins
			const installedUris = new Set(this.agentPluginService.plugins.get().map(p => p.uri.toString()));
			this.marketplaceItems = filtered
				.filter(p => {
					const expectedUri = this.pluginInstallService.getPluginInstallUri(p);
					return !installedUris.has(expectedUri.toString());
				})
				.map(marketplacePluginToItem);

			this.updateMarketplaceList();
		} catch {
			if (!cts.token.isCancellationRequested) {
				this.marketplaceItems = [];
				this.emptyContainer.style.display = 'flex';
				this.listContainer.style.display = 'none';
				this.emptyText.textContent = localize('marketplaceError', "Unable to load marketplace");
				this.emptySubtext.textContent = localize('tryAgainLater', "Check your connection and try again");
			}
		}
	}

	private updateMarketplaceList(): void {
		if (this.marketplaceItems.length === 0) {
			this.emptyContainer.style.display = 'flex';
			this.listContainer.style.display = 'none';
			if (this.searchQuery.trim()) {
				this.emptyText.textContent = localize('noMarketplaceResults', "No plugins match '{0}'", this.searchQuery);
				this.emptySubtext.textContent = localize('tryDifferentSearch', "Try a different search term");
			} else {
				this.emptyText.textContent = localize('emptyMarketplace', "No plugins available");
				this.emptySubtext.textContent = '';
			}
		} else {
			this.emptyContainer.style.display = 'none';
			this.listContainer.style.display = '';
		}

		const entries: IPluginListEntry[] = this.marketplaceItems.map(item => ({ type: 'marketplace-item' as const, item }));
		this.list.splice(0, this.list.length, entries);
	}

	private async getRemotePluginItems(query: string): Promise<readonly ICustomizationItem[]> {
		const provider = this.harnessService.getActiveDescriptor().itemProvider;
		if (!provider) {
			return [];
		}

		try {
			const provided = await provider.provideChatSessionCustomizations(CancellationToken.None) ?? [];
			return provided.filter(item =>
				isPluginCustomizationItem(item)
				&& (!query
					|| item.name.toLowerCase().includes(query)
					|| item.description?.toLowerCase().includes(query)
					|| item.badge?.toLowerCase().includes(query))
			);
		} catch {
			return [];
		}
	}

	private getRemoteGroupMetadata(groupKey: string | undefined): { group: string; label: string; description: string } {
		return {
			group: groupKey ?? 'remote-host',
			label: localize('remoteHostGroup', "Remote"),
			description: localize('remoteHostGroupDescription', "Plugins configured directly on the remote agent host and available without local sync."),
		};
	}

	private appendGroup(entries: IPluginListEntry[], header: { group: string; label: string; description: string }, items: readonly IPluginListEntry[], isFirst: boolean): boolean {
		if (items.length === 0) {
			return isFirst;
		}

		const collapsed = this.collapsedGroups.has(header.group);
		entries.push({
			type: 'group-header',
			id: `plugin-group-${header.group}`,
			group: header.group,
			label: header.label,
			icon: pluginIcon,
			count: items.length,
			isFirst,
			description: header.description,
			collapsed,
		});
		if (!collapsed) {
			entries.push(...items);
		}
		return false;
	}

	private async filterPlugins(): Promise<void> {
		const query = this.searchQuery.toLowerCase().trim();
		const allPlugins = this.agentPluginService.plugins.get();
		this.remoteItems = [...await this.getRemotePluginItems(query)];

		this.installedItems = allPlugins
			.map(p => installedPluginToItem(p, this.labelService))
			.filter(item => !query ||
				item.name.toLowerCase().includes(query) ||
				item.description.toLowerCase().includes(query)
			);

		if (this.remoteItems.length === 0 && this.installedItems.length === 0) {
			this.emptyContainer.style.display = 'flex';
			this.listContainer.style.display = 'none';

			if (this.searchQuery.trim()) {
				this.emptyText.textContent = localize('noMatchingPlugins', "No plugins match '{0}'", this.searchQuery);
				this.emptySubtext.textContent = localize('tryDifferentSearch', "Try a different search term");
			} else if (this.harnessService.getActiveDescriptor().itemProvider) {
				this.emptyText.textContent = localize('noRemotePlugins', "No plugins configured");
				this.emptySubtext.textContent = localize('addRemotePlugins', "Use the toolbar to add remote plugins or install plugins from a source.");
			} else {
				this.emptyText.textContent = localize('noPlugins', "No plugins installed");
				this.emptySubtext.textContent = localize('browseToAdd', "Browse the marketplace to discover and install plugins");
			}
		} else {
			this.emptyContainer.style.display = 'none';
			this.listContainer.style.display = '';
		}

		// Group plugins: enabled vs disabled
		const enabledPlugins = this.installedItems.filter(item => isContributionEnabled(item.plugin.enablement.get()));
		const disabledPlugins = this.installedItems.filter(item => !isContributionEnabled(item.plugin.enablement.get()));

		const entries: IPluginListEntry[] = [];
		let isFirst = true;

		const installedNames = new Set(this.installedItems.map(item => item.name.toLowerCase()));
		const remoteGroups = new Map<string, IPluginRemoteItemEntry[]>();
		for (const item of this.remoteItems) {
			const key = item.groupKey ?? 'remote-host';
			if (key === 'remote-client') {
				continue; // client-synced items are already shown in "Enabled Locally"
			}
			if (item.name && installedNames.has(item.name.toLowerCase())) {
				continue; // plugin is also locally installed; show it once in "Enabled Locally"
			}
			let group = remoteGroups.get(key);
			if (!group) {
				group = [];
				remoteGroups.set(key, group);
			}
			group.push({ type: 'remote-item', item });
		}
		for (const [groupKey, items] of remoteGroups) {
			isFirst = this.appendGroup(entries, this.getRemoteGroupMetadata(groupKey), items, isFirst);
		}

		if (enabledPlugins.length > 0) {
			isFirst = this.appendGroup(
				entries,
				{
					group: 'enabled',
					label: localize('enabledGroup', "Enabled Locally"),
					description: localize('enabledGroupDescription', "Plugins installed in this client and available for syncing to the remote session."),
				},
				enabledPlugins.map(item => ({ type: 'plugin-item' as const, item })),
				isFirst,
			);
		}

		if (disabledPlugins.length > 0) {
			this.appendGroup(
				entries,
				{
					group: 'disabled',
					label: localize('disabledGroup', "Disabled Locally"),
					description: localize('disabledGroupDescription', "Plugins installed in this client but currently disabled."),
				},
				disabledPlugins.map(item => ({ type: 'plugin-item' as const, item })),
				isFirst,
			);
		}

		this.displayEntries = entries;
		this.list.splice(0, this.list.length, this.displayEntries);

		// Compute sidebar badge directly from the data array (same source as group headers)
		this._onDidChangeItemCount.fire(this.itemCount);
	}

	/**
	 * Gets the total item count from the underlying data array
	 * (the same source used to build group headers).
	 */
	get itemCount(): number {
		const installedNames = new Set(this.installedItems.map(item => item.name.toLowerCase()));
		const uniqueRemote = this.remoteItems.filter(item => {
			if (item.groupKey === 'remote-client') {
				return false;
			}
			if (item.name && installedNames.has(item.name.toLowerCase())) {
				return false;
			}
			return true;
		});
		return uniqueRemote.length + this.installedItems.length;
	}

	/**
	 * Re-fires the current item count. Call after subscribing to onDidChangeItemCount
	 * to ensure the subscriber receives the latest count.
	 */
	fireItemCount(): void {
		this._onDidChangeItemCount.fire(this.itemCount);
	}

	private toggleGroup(entry: IPluginGroupHeaderEntry): void {
		if (this.collapsedGroups.has(entry.group)) {
			this.collapsedGroups.delete(entry.group);
		} else {
			this.collapsedGroups.add(entry.group);
		}
		void this.filterPlugins();
	}

	/**
	 * Prepends an element to the search row (left of the search input).
	 */
	prependToSearchRow(element: HTMLElement): void {
		this.searchAndButtonContainer.insertBefore(element, this.searchAndButtonContainer.firstChild);
	}

	/**
	 * Whether the widget is currently in marketplace browse mode.
	 */
	isInBrowseMode(): boolean {
		return this.browseMode;
	}

	/**
	 * Exits marketplace browse mode and returns to the installed plugins list.
	 */
	exitBrowseMode(): void {
		if (this.browseMode) {
			this.toggleBrowseMode(false);
		}
	}

	layout(height: number, width: number): void {
		this.lastHeight = height;
		this.lastWidth = width;

		this.element.style.height = `${height}px`;

		// Measure sibling elements to calculate the list height.
		// When offsetHeight returns 0 the container may have just become visible
		// after display:none and the browser hasn't reflowed yet — defer layout
		// once so measurements are accurate. Only retry once to avoid an endless
		// loop when the widget is created while permanently hidden.
		const searchBarHeight = this.searchAndButtonContainer.offsetHeight;
		if (searchBarHeight === 0 && !this._layoutDeferred) {
			this._layoutDeferred = true;
			DOM.getWindow(this.element).requestAnimationFrame(() => {
				try {
					this.layout(this.lastHeight, this.lastWidth);
				} finally {
					this._layoutDeferred = false;
				}
			});
			return;
		}
		const footerHeight = this.sectionHeader.offsetHeight;
		const listHeight = Math.max(0, height - searchBarHeight - footerHeight);

		this.listContainer.style.height = `${listHeight}px`;
		this.list.layout(listHeight, width);
	}

	focusSearch(): void {
		this.searchInput.focus();
	}

	revealLastItem(): void {
		if (this.list.length > 0) {
			this.list.reveal(this.list.length - 1);
		}
	}

	focus(): void {
		this.list.domFocus();
		if (this.list.length > 0) {
			this.list.setFocus([0]);
		}
	}

	private onContextMenu(e: IListContextMenuEvent<IPluginListEntry>): void {
		if (!e.element || e.element.type === 'group-header' || e.element.type === 'marketplace-item') {
			return;
		}

		const entry = e.element;
		const disposables = new DisposableStore();
		const actions: IAction[] = [];

		if (entry.type === 'plugin-item') {
			const groups = getInstalledPluginContextMenuActions(entry.item.plugin, this.instantiationService);
			for (const menuActions of groups) {
				for (const menuAction of menuActions) {
					actions.push(menuAction);
					if (isDisposable(menuAction)) {
						disposables.add(menuAction);
					}
				}
				actions.push(new Separator());
			}
			if (actions.length > 0 && actions[actions.length - 1] instanceof Separator) {
				actions.pop();
			}
		} else {
			const itemActions = entry.item.actions ?? [];
			for (const itemAction of itemActions) {
				actions.push(new Action(
					itemAction.id,
					itemAction.label,
					itemAction.icon ? ThemeIcon.asClassName(itemAction.icon) : undefined,
					itemAction.enabled !== false,
					() => itemAction.run(),
				));
			}
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => actions,
			onHide: () => disposables.dispose()
		});
	}
}
