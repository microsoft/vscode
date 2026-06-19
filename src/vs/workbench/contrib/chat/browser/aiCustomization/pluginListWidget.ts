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
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
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
import { formatDisplayName, truncateToFirstLine } from './aiCustomizationListWidget.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { CustomizationGroupHeaderRenderer, ICustomizationGroupHeaderEntry, CUSTOMIZATION_GROUP_HEADER_HEIGHT, CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR } from './customizationGroupHeaderRenderer.js';
import { ICustomizationHarnessService, isPluginCustomizationItem, type ICustomizationItem, type ICustomizationItemAction } from '../../common/customizationHarnessService.js';
import { Checkbox } from '../../../../../base/browser/ui/toggle/toggle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ChatConfiguration } from '../../common/constants.js';
import { IAICustomizationItemsModel } from './aiCustomizationItemsModel.js';

const $ = DOM.$;

const PLUGIN_ITEM_HEIGHT = 66;
const PLUGIN_MARKETPLACE_ITEM_HEIGHT = 68;

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

interface IPluginSearchHeaderEntry {
	readonly type: 'search-header';
	readonly id: string;
	readonly label: string;
}

type IPluginListEntry = IPluginGroupHeaderEntry | IPluginSearchHeaderEntry | IPluginInstalledItemEntry | IPluginMarketplaceItemEntry | IPluginRemoteItemEntry;

//#endregion

//#region Delegate

class PluginItemDelegate implements IListVirtualDelegate<IPluginListEntry> {
	getHeight(element: IPluginListEntry): number {
		if (element.type === 'group-header') {
			return element.isFirst ? CUSTOMIZATION_GROUP_HEADER_HEIGHT : CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR;
		}
		if (element.type === 'search-header') {
			return 32;
		}
		if (element.type === 'marketplace-item') {
			return PLUGIN_MARKETPLACE_ITEM_HEIGHT;
		}
		return PLUGIN_ITEM_HEIGHT;
	}

	getTemplateId(element: IPluginListEntry): string {
		if (element.type === 'group-header') {
			return 'pluginGroupHeader';
		}
		if (element.type === 'search-header') {
			return 'pluginSearchHeader';
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

//#region Search Header Renderer

interface IPluginSearchHeaderTemplateData {
	readonly container: HTMLElement;
	readonly label: HTMLElement;
}

class PluginSearchHeaderRenderer implements IListRenderer<IPluginSearchHeaderEntry, IPluginSearchHeaderTemplateData> {
	readonly templateId = 'pluginSearchHeader';

	renderTemplate(container: HTMLElement): IPluginSearchHeaderTemplateData {
		container.classList.add('plugin-search-header');
		const label = DOM.append(container, $('.plugin-search-header-label'));
		return { container, label };
	}

	renderElement(element: IPluginSearchHeaderEntry, _index: number, templateData: IPluginSearchHeaderTemplateData): void {
		templateData.label.textContent = element.label;
		templateData.container.classList.toggle('available-to-install', element.id === 'plugin-search-available');
	}

	disposeTemplate(): void { }
}

//#endregion

//#region Installed Plugin Renderer (reuses .mcp-server-item CSS)

interface IPluginInstalledItemTemplateData {
	readonly container: HTMLElement;
	readonly syncCheckboxContainer: HTMLElement;
	readonly typeIcon: HTMLElement;
	readonly name: HTMLElement;
	readonly source: HTMLElement;
	readonly description: HTMLElement;
	readonly metadata: HTMLElement;
	readonly disposables: DisposableStore;
}

class PluginInstalledItemRenderer implements IListRenderer<IPluginInstalledItemEntry, IPluginInstalledItemTemplateData> {
	readonly templateId = 'pluginInstalledItem';

	constructor(
		private readonly _harnessService: ICustomizationHarnessService,
	) { }

	renderTemplate(container: HTMLElement): IPluginInstalledItemTemplateData {
		container.classList.add('plugin-list-item', 'plugin-installed-item');

		const syncCheckboxContainer = DOM.append(container, $('.item-sync-checkbox'));
		const typeIcon = DOM.append(container, $('.plugin-list-item-icon'));
		typeIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.plug));

		const details = DOM.append(container, $('.plugin-list-item-details'));
		const nameRow = DOM.append(details, $('.plugin-list-item-name-row'));
		const name = DOM.append(nameRow, $('.plugin-list-item-name'));
		const source = DOM.append(nameRow, $('.inline-badge.plugin-source-badge'));
		const description = DOM.append(details, $('.plugin-list-item-description'));
		const metadata = DOM.append(details, $('.plugin-list-item-metadata'));

		return { container, syncCheckboxContainer, typeIcon, name, source, description, metadata, disposables: new DisposableStore() };
	}

	renderElement(element: IPluginInstalledItemEntry, _index: number, templateData: IPluginInstalledItemTemplateData): void {
		templateData.disposables.clear();

		templateData.name.textContent = formatDisplayName(element.item.name);
		templateData.source.textContent = element.item.marketplace
			? localize('pluginMarketplaceSourceBadge', "Marketplace")
			: localize('pluginLocalSourceBadge', "Local");
		templateData.source.title = element.item.marketplace
			? localize('pluginMarketplaceSourceTooltip', "Installed from {0}", element.item.marketplace)
			: localize('pluginLocalSourceTooltip', "Installed from a local source");

		if (element.item.description) {
			templateData.description.textContent = truncateToFirstLine(element.item.description);
			templateData.description.style.display = '';
		} else {
			templateData.description.style.display = 'none';
		}
		templateData.metadata.textContent = getInstalledPluginMetadata(element.item);
		templateData.metadata.style.display = templateData.metadata.textContent ? '' : 'none';

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
	readonly metadata: HTMLElement;
	readonly status: HTMLElement;
}

class PluginRemoteItemRenderer implements IListRenderer<IPluginRemoteItemEntry, IPluginRemoteItemTemplateData> {
	readonly templateId = 'pluginRemoteItem';

	renderTemplate(container: HTMLElement): IPluginRemoteItemTemplateData {
		container.classList.add('plugin-list-item', 'plugin-remote-item');

		const typeIcon = DOM.append(container, $('.plugin-list-item-icon'));
		typeIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.plug));

		const details = DOM.append(container, $('.plugin-list-item-details'));
		const nameRow = DOM.append(details, $('.plugin-list-item-name-row'));
		const name = DOM.append(nameRow, $('span'));
		const badge = DOM.append(nameRow, $('.inline-badge.item-badge'));
		const description = DOM.append(details, $('.plugin-list-item-description'));
		const metadata = DOM.append(details, $('.plugin-list-item-metadata'));
		const status = DOM.append(container, $('.plugin-list-item-status'));

		return { container, typeIcon, name, badge, description, metadata, status };
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
		templateData.metadata.textContent = localize('remotePluginMetadata', "Remote agent host");
		templateData.status.className = 'plugin-list-item-status';
		if (element.item.enabled === false) {
			templateData.status.textContent = getRemotePluginStatusLabel(element.item);
			templateData.status.classList.add('disabled');
			return;
		}

		switch (element.item.status) {
			case 'loading':
				templateData.status.textContent = getRemotePluginStatusLabel(element.item);
				templateData.status.classList.add('running');
				break;
			case 'loaded':
				templateData.status.textContent = getRemotePluginStatusLabel(element.item);
				templateData.status.classList.add('running');
				break;
			case 'degraded':
				templateData.status.textContent = getRemotePluginStatusLabel(element.item);
				templateData.status.classList.add('disabled');
				break;
			case 'error':
				templateData.status.textContent = getRemotePluginStatusLabel(element.item);
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
	readonly typeIcon: HTMLElement;
	readonly name: HTMLElement;
	readonly recommendedBadge: HTMLElement;
	readonly publisher: HTMLElement;
	readonly description: HTMLElement;
	readonly metadata: HTMLElement;
	readonly installButton: Button;
	readonly elementDisposables: DisposableStore;
	readonly templateDisposables: DisposableStore;
}

class PluginMarketplaceItemRenderer implements IListRenderer<IPluginMarketplaceItemEntry, IPluginMarketplaceItemTemplateData> {
	readonly templateId = 'pluginMarketplaceItem';

	constructor(
		private readonly pluginInstallService: IPluginInstallService,
		private readonly agentPluginService: IAgentPluginService,
		private readonly pluginMarketplaceService: IPluginMarketplaceService,
	) { }

	renderTemplate(container: HTMLElement): IPluginMarketplaceItemTemplateData {
		container.classList.add('plugin-list-item', 'plugin-marketplace-item');
		const typeIcon = DOM.append(container, $('.plugin-list-item-icon'));
		typeIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.plug));
		const details = DOM.append(container, $('.plugin-list-item-details'));
		const nameRow = DOM.append(details, $('.plugin-list-item-name-row'));
		const name = DOM.append(nameRow, $('.plugin-list-item-name'));
		const recommendedBadge = DOM.append(nameRow, $('.inline-badge.plugin-recommended-badge'));
		recommendedBadge.textContent = localize('recommendedBadge', "Recommended");
		const description = DOM.append(details, $('.plugin-list-item-description'));
		const publisher = DOM.append(details, $('.plugin-list-item-source'));
		const metadata = DOM.append(details, $('.plugin-list-item-metadata'));
		const actionContainer = DOM.append(container, $('.plugin-list-item-action'));
		const installButton = new Button(actionContainer, { ...defaultButtonStyles, supportIcons: true });
		installButton.element.classList.add('plugin-list-item-install-button');

		const templateDisposables = new DisposableStore();
		templateDisposables.add(installButton);

		return { container, typeIcon, name, recommendedBadge, publisher, description, metadata, installButton, elementDisposables: new DisposableStore(), templateDisposables };
	}

	renderElement(element: IPluginMarketplaceItemEntry, _index: number, templateData: IPluginMarketplaceItemTemplateData): void {
		templateData.elementDisposables.clear();

		templateData.name.textContent = element.item.name;
		templateData.recommendedBadge.style.display = this.isRecommended(element.item) ? '' : 'none';
		templateData.publisher.textContent = '';
		templateData.publisher.style.display = 'none';
		templateData.description.textContent = element.item.description || '';
		templateData.metadata.textContent = '';
		templateData.metadata.style.display = 'none';

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

	private isRecommended(item: IMarketplacePluginItem): boolean {
		return this.pluginMarketplaceService.recommendedPlugins.get().has(getMarketplaceRecommendationKey(item));
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

function getMarketplaceRecommendationKey(plugin: Pick<IMarketplacePluginItem, 'name' | 'marketplace'>): string {
	return `${plugin.name}@${plugin.marketplace}`;
}

const curatedMarketplaceSnapshotOrder = ['figma', 'linear', 'sentry', 'notion', 'stripe', 'vercel', 'datadog', 'launchdarkly'];

function sortMarketplaceSnapshotItems(items: IMarketplacePluginItem[]): IMarketplacePluginItem[] {
	return [...items].sort((a, b) => getMarketplaceSnapshotRank(a) - getMarketplaceSnapshotRank(b));
}

function getMarketplaceSnapshotRank(item: IMarketplacePluginItem): number {
	const index = curatedMarketplaceSnapshotOrder.indexOf(item.name.toLowerCase());
	return index === -1 ? curatedMarketplaceSnapshotOrder.length : index;
}

function getInstalledPluginMetadata(item: IInstalledPluginItem): string {
	const metadata: string[] = [];
	const contributionSummary = getInstalledPluginContributionSummary(item);
	if (contributionSummary) {
		metadata.push(contributionSummary);
	}
	return metadata.join(' • ');
}

interface IPluginContributionEntry {
	readonly label: string;
	readonly items: readonly { name: string; description?: string }[];
}

function getInstalledPluginContributionEntries(item: IInstalledPluginItem): IPluginContributionEntry[] {
	const plugin = item.plugin;
	const entries: IPluginContributionEntry[] = [];
	appendContributionEntry(entries, formatContributionLabel(plugin.agents.get().length, localize('oneAgentContribution', "1 agent"), localize('manyAgentContributions', "{0} agents", plugin.agents.get().length)), plugin.agents.get());
	appendContributionEntry(entries, formatContributionLabel(plugin.skills.get().length, localize('oneSkillContribution', "1 skill"), localize('manySkillContributions', "{0} skills", plugin.skills.get().length)), plugin.skills.get());
	appendContributionEntry(entries, formatContributionLabel(plugin.commands.get().length, localize('oneCommandContribution', "1 command"), localize('manyCommandContributions', "{0} commands", plugin.commands.get().length)), plugin.commands.get());
	appendContributionEntry(entries, formatContributionLabel(plugin.instructions.get().length, localize('oneInstructionContribution', "1 instruction"), localize('manyInstructionContributions', "{0} instructions", plugin.instructions.get().length)), plugin.instructions.get());
	appendContributionEntry(entries, formatContributionLabel(plugin.mcpServerDefinitions.get().length, localize('oneMcpContribution', "1 MCP server"), localize('manyMcpContributions', "{0} MCP servers", plugin.mcpServerDefinitions.get().length)), plugin.mcpServerDefinitions.get().map(server => ({ name: server.name })));
	appendContributionEntry(entries, formatContributionLabel(plugin.hooks.get().length, localize('oneHookContribution', "1 hook"), localize('manyHookContributions', "{0} hooks", plugin.hooks.get().length)), plugin.hooks.get().map(hook => ({ name: hook.originalId, description: localize('hookCommandCount', "{0} commands", hook.hooks.length) })));
	return entries;
}

function appendContributionEntry(entries: IPluginContributionEntry[], label: string | undefined, items: readonly { name: string; description?: string }[]): void {
	if (label && items.length > 0) {
		entries.push({ label, items });
	}
}

function formatContributionLabel(count: number, singular: string, plural: string): string | undefined {
	if (count === 0) {
		return undefined;
	}
	return count === 1 ? singular : plural;
}

function getRemotePluginStatusLabel(item: ICustomizationItem): string {
	if (item.enabled === false) {
		return localize('remotePluginDisabled', "Disabled");
	}

	switch (item.status) {
		case 'loading':
			return localize('remotePluginLoading', "Loading");
		case 'loaded':
			return localize('remotePluginLoaded', "Loaded");
		case 'degraded':
			return localize('remotePluginDegraded', "Warning");
		case 'error':
			return localize('remotePluginError', "Error");
		default:
			return '';
	}
}

function getInstalledPluginContributionSummary(item: IInstalledPluginItem): string | undefined {
	return getInstalledPluginContributionEntries(item).map(entry => entry.label).slice(0, 2).join(' • ');
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

	private sectionTitleHeader!: HTMLElement;
	private sectionLink!: HTMLAnchorElement;
	private searchAndButtonContainer!: HTMLElement;
	private searchInput!: InputBox;
	private cardContainer!: HTMLElement;
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
	private backButtonContainer!: HTMLElement;
	private backButton!: Button;
	private browseButton!: Button;
	private addButtonContainer!: HTMLElement;
	private addButtonSimple!: Button;
	private addButton!: ButtonWithDropdown;
	private createPluginButton!: Button;
	private readonly addDropdownActions = this._register(new DisposableStore());
	private readonly cardDisposables = this._register(new DisposableStore());

	private installedItems: IInstalledPluginItem[] = [];
	private remoteItems: ICustomizationItem[] = [];
	private displayEntries: IPluginListEntry[] = [];
	private marketplaceItems: IMarketplacePluginItem[] = [];
	private searchQuery: string = '';
	private browseMode: boolean = false;
	private firstCardFocusElement: HTMLElement | undefined;
	private lastHeight: number = 0;
	private lastWidth: number = 0;
	private lastHeaderHeight = 0;
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
		@IAICustomizationItemsModel private readonly itemsModel: IAICustomizationItemsModel,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this.element = $('.mcp-list-widget.plugin-list-widget'); // reuse MCP shell, add plugin-specific row styling
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
		// Section title header (title + description with inline learn more) at the top.
		this.sectionTitleHeader = DOM.append(this.element, $('.section-title-header'));
		const titleRow = DOM.append(this.sectionTitleHeader, $('.section-title-row'));
		const sectionTitle = DOM.append(titleRow, $('h2.section-title'));
		sectionTitle.textContent = localize('plugins', "Plugins");
		const sectionTitleDescription = DOM.append(this.sectionTitleHeader, $('p.section-title-description'));
		const sectionTitleDescriptionText = DOM.append(sectionTitleDescription, $('span.section-title-description-text'));
		sectionTitleDescriptionText.textContent = localize('pluginsDescription', "Extend your AI agent with plugins that add commands, skills, agents, hooks, and MCP servers from reusable packages.");
		// Real whitespace text node between description and link so the gap collapses
		// when the link wraps to a new line (a CSS margin-left would push it inward).
		sectionTitleDescription.appendChild(document.createTextNode(' '));
		this.sectionLink = DOM.append(sectionTitleDescription, $('a.section-title-link')) as HTMLAnchorElement;
		this.sectionLink.textContent = localize('learnMorePlugins', "Learn more about agent plugins");
		this.sectionLink.href = 'https://code.visualstudio.com/docs/agent-customization/agent-plugins?referrer=in-product';
		this._register(DOM.addDisposableListener(this.sectionLink, 'click', (e) => {
			e.preventDefault();
			const href = this.sectionLink.href;
			if (href) {
				this.openerService.open(URI.parse(href));
			}
		}));

		// Re-layout when the header height changes so the list's allotted
		// height stays in sync with the actual on-screen header size. Only
		// relayout when the header height actually changed to avoid redundant
		// work on DPR changes or width-only resizes.
		const targetWindow = DOM.getWindow(this.element);
		const headerObserver = this._register(new DOM.DisposableResizeObserver(
			'PluginListWidget.sectionTitleHeader',
			() => {
				if (this.lastWidth <= 0 || this.lastHeight <= 0) {
					return;
				}
				const headerHeight = this.sectionTitleHeader.offsetHeight;
				if (headerHeight === this.lastHeaderHeight) {
					return;
				}
				this.layout(this.lastHeight, this.lastWidth);
			},
			targetWindow,
		));
		this._register(headerObserver.observe(this.sectionTitleHeader));

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
			} else if (this.searchQuery.trim()) {
				this.delayedMarketplaceSearch.trigger(() => this.queryPluginSearch());
			} else {
				this.delayedFilter.trigger(() => this.filterPlugins());
			}
		}));

		// Button container (Browse Marketplace + Add actions + Create Plugin)
		this.buttonContainer = DOM.append(this.searchAndButtonContainer, $('.list-button-group'));

		this.backButtonContainer = DOM.append(this.buttonContainer, $('.list-add-button-container'));
		const backToInstalledLabel = localize('backToInstalledPlugins', "Back to Installed");
		this.backButton = this._register(new Button(this.backButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: backToInstalledLabel, ariaLabel: backToInstalledLabel }));
		this.backButton.element.classList.add('list-add-button');
		this.backButton.label = `$(${Codicon.arrowLeft.id}) ${backToInstalledLabel}`;
		this._register(this.backButton.onDidClick(() => this.toggleBrowseMode(false)));

		const browseButtonContainer = DOM.append(this.buttonContainer, $('.list-add-button-container'));
		const browseMarketplaceLabel = localize('browseMarketplace', "Browse Marketplace");
		this.browseButton = this._register(new Button(browseButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: browseMarketplaceLabel, ariaLabel: browseMarketplaceLabel }));
		this.browseButton.element.classList.add('list-add-button');
		browseButtonContainer.style.display = 'none';

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
		this.createPluginButton.element.classList.add('list-add-button');
		this.createPluginButton.label = `$(${Codicon.newFile.id}) ${createPluginLabel}`;
		this._register(this.createPluginButton.onDidClick(() => this.runCreatePluginAction()));

		// Empty state
		this.emptyContainer = DOM.append(this.element, $('.mcp-empty-state'));
		const emptyHeader = DOM.append(this.emptyContainer, $('.empty-state-header'));
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

		this.cardContainer = DOM.append(this.element, $('.plugin-card-container'));
		this.cardContainer.style.display = 'none';

		// List container
		this.listContainer = DOM.append(this.element, $('.mcp-list-container'));

		// Section footer (removed — see section-title-header at top)

		// Create list
		const delegate = new PluginItemDelegate();
		const groupHeaderRenderer = new CustomizationGroupHeaderRenderer<IPluginGroupHeaderEntry>('pluginGroupHeader', this.hoverService);
		const searchHeaderRenderer = new PluginSearchHeaderRenderer();
		const installedRenderer = new PluginInstalledItemRenderer(this.harnessService);
		const remoteRenderer = new PluginRemoteItemRenderer();
		const marketplaceRenderer = new PluginMarketplaceItemRenderer(this.pluginInstallService, this.agentPluginService, this.pluginMarketplaceService);

		this.list = this._register(this.instantiationService.createInstance(
			WorkbenchList<IPluginListEntry>,
			'PluginManagementList',
			this.listContainer,
			delegate,
			[groupHeaderRenderer, searchHeaderRenderer, installedRenderer, remoteRenderer, marketplaceRenderer],
			{
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				horizontalScrolling: false,
				accessibilityProvider: {
					getAriaLabel: (element: IPluginListEntry) => {
						if (element.type === 'group-header') {
							return localize('pluginGroupAriaLabel', "{0}, {1} items, {2}", element.label, element.count, element.collapsed ? localize('collapsed', "collapsed") : localize('expanded', "expanded"));
						}
						if (element.type === 'search-header') {
							return element.label;
						}
						const name = formatDisplayName(element.item.name);
						const description = element.item.description ? truncateToFirstLine(element.item.description) : undefined;
						const nameAndDesc = description
							? localize('pluginItemAriaLabel', "{0}. {1}", name, description)
							: name;
						if (element.type === 'plugin-item') {
							const enabled = isContributionEnabled(element.item.plugin.enablement.get());
							const metadata = getInstalledPluginMetadata(element.item);
							const withMetadata = metadata
								? localize('pluginInstalledItemAriaLabelWithMetadata', "{0}. {1}", nameAndDesc, metadata)
								: nameAndDesc;
							return enabled
								? localize('pluginInstalledItemAriaLabelEnabled', "{0}. Enabled", withMetadata)
								: localize('pluginInstalledItemAriaLabelDisabled', "{0}. Disabled", withMetadata);
						}
						if (element.type === 'remote-item') {
							const status = getRemotePluginStatusLabel(element.item);
							return status
								? localize('pluginRemoteItemAriaLabelWithStatus', "{0}. Remote agent host. Status: {1}", nameAndDesc, status)
								: localize('pluginRemoteItemAriaLabel', "{0}. Remote agent host", nameAndDesc);
						}
						if (element.type === 'marketplace-item') {
							const recommended = this.pluginMarketplaceService.recommendedPlugins.get().has(getMarketplaceRecommendationKey(element.item));
							const label = localize('pluginMarketplaceItemAriaLabel', "{0}. From {1}", nameAndDesc, element.item.marketplace);
							return recommended
								? localize('pluginMarketplaceItemAriaLabelRecommended', "{0}. Recommended for this workspace", label)
								: label;
						}
						return nameAndDesc;
					},
					getWidgetAriaLabel: () => {
						return localize('pluginsListAriaLabel', "Plugins");
					}
				},
				openOnSingleClick: true,
				identityProvider: {
					getId(element: IPluginListEntry) {
						if (element.type === 'group-header') {
							return element.id;
						}
						if (element.type === 'search-header') {
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
				} else if (e.element.type === 'search-header') {
					// Section label only.
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
			void this.refresh();
		}));
		this._register(this.pluginMarketplaceService.onDidChangeMarketplaces(() => {
			this.marketplaceItems = [];
			void this.refresh();
		}));
		this._register(autorun(reader => {
			this.pluginMarketplaceService.recommendedPlugins.read(reader);
			if (this.browseMode) {
				this.updateMarketplaceList();
			} else if (!this.searchQuery.trim()) {
				this.renderPluginHome();
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
		} else if (this.searchQuery.trim()) {
			await this.queryPluginSearch();
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
			this.disabledIcon.classList.add(...ThemeIcon.asClassNameArray(policyLocked ? Codicon.shield : Codicon.plug));

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

		this.backButtonContainer.style.display = this.browseMode ? '' : 'none';
		this.backButtonContainer.style.display = 'none';
		this.browseButton.element.parentElement!.style.display = 'none';
		this.browseButton.label = `$(${Codicon.library.id}) ${localize('browseMarketplace', "Browse Marketplace")}`;
		this.browseButton.enabled = browseMarketplaceAvailable;
		const browseTitle = browseMarketplaceAvailable
			? localize('browseMarketplace', "Browse Marketplace")
			: localize('browseMarketplaceUnsupportedWeb', "Browse Marketplace is not available in VS Code for the Web.");
		this.browseButton.setTitle(browseTitle);
		this.browseButton.element.setAttribute('aria-label', browseTitle);

		this.updateAddButton();
		this.createPluginButton.element.style.display = this.browseMode ? 'none' : '';
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
		return this.pluginActions;
	}

	private getAddDropdownActions(): Action[] {
		this.addDropdownActions.clear();
		return this.buildAddActions().slice(1).map((action, index) => this.addDropdownActions.add(new Action(`plugin_add_${index}`, this.formatActionLabel(action), undefined, action.enabled !== false, () => this.runPluginAction(action))));
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

	private async runInstallFromSourceAction(): Promise<void> {
		await this.commandService.executeCommand('workbench.action.chat.installPluginFromSource');
	}

	private async runPluginAction(action: ICustomizationItemAction): Promise<void> {
		if (action.enabled !== false) {
			await action.run();
		}
	}

	private showCardSurface(): void {
		this.emptyContainer.style.display = 'none';
		this.listContainer.style.display = 'none';
		this.cardContainer.style.display = '';
	}

	private showListSurface(): void {
		this.emptyContainer.style.display = 'none';
		this.cardContainer.style.display = 'none';
		this.listContainer.style.display = '';
	}

	private showEmptySurface(): void {
		this.cardContainer.style.display = 'none';
		this.listContainer.style.display = 'none';
		this.emptyContainer.style.display = 'flex';
	}

	private addCardActivation(card: HTMLElement, label: string, callback: () => void): void {
		card.tabIndex = 0;
		card.setAttribute('role', 'button');
		card.setAttribute('aria-label', label);
		this.rememberCardFocusElement(card);
		this.cardDisposables.add(DOM.addDisposableListener(card, 'click', e => {
			if (e.defaultPrevented) {
				return;
			}
			callback();
		}));
		this.cardDisposables.add(DOM.addDisposableListener(card, 'keydown', e => {
			if (e.target !== card) {
				return;
			}
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				callback();
			}
		}));
	}

	private addCardActionButtonClick(button: Button, callback: () => void | Promise<void>): void {
		this.cardDisposables.add(DOM.addDisposableListener(button.element, 'click', e => {
			e.preventDefault();
			e.stopPropagation();
		}));
		this.cardDisposables.add(button.onDidClick(callback));
	}

	private renderCardSection(parent: HTMLElement, title: string, description: string | undefined, className?: string): HTMLElement {
		const section = DOM.append(parent, $('.plugin-card-section'));
		if (className) {
			section.classList.add(className);
		}
		const header = DOM.append(section, $('.plugin-card-section-header'));
		const text = DOM.append(header, $('.plugin-card-section-text'));
		const heading = DOM.append(text, $('h3.plugin-card-section-title'));
		heading.textContent = title;
		if (description) {
			const descriptionEl = DOM.append(text, $('.plugin-card-section-description'));
			descriptionEl.textContent = description;
		}
		return DOM.append(section, $('.plugin-card-grid'));
	}

	private renderPluginHome(): void {
		if (this.browseMode || this.searchQuery.trim()) {
			return;
		}

		this.cardDisposables.clear();
		this.firstCardFocusElement = undefined;
		DOM.clearNode(this.cardContainer);
		this.showCardSurface();

		const content = DOM.append(this.cardContainer, $('.plugin-card-scroll'));
		const enabledPlugins = this.installedItems.filter(item => isContributionEnabled(item.plugin.enablement.get()));
		const disabledPlugins = this.installedItems.filter(item => !isContributionEnabled(item.plugin.enablement.get()));
		const installedPlugins = [...enabledPlugins, ...disabledPlugins];

		if (installedPlugins.length > 0) {
			const installedGrid = this.renderCardSection(
				content,
				localize('installedPluginsSection', "Installed"),
				localize('installedPluginsSectionDescription', "Plugins available in this client and ready to extend your agent."),
				'installed-plugins-section'
			);
			for (const item of installedPlugins) {
				this.appendInstalledPluginCard(installedGrid, item);
			}
		} else {
			const installedGrid = this.renderCardSection(
				content,
				localize('installedPluginsSection', "Installed"),
				localize('installedPluginsSectionDescription', "Plugins available in this client and ready to extend your agent."),
				'installed-plugins-section'
			);
			this.appendPluginHomeEmptyState(installedGrid);
		}

		const installedNames = new Set(this.installedItems.map(item => item.name.toLowerCase()));
		const remoteItems = this.remoteItems.filter(item => item.groupKey !== 'remote-client' && (!item.name || !installedNames.has(item.name.toLowerCase())));
		if (remoteItems.length > 0) {
			const remoteGrid = this.renderCardSection(
				content,
				localize('remotePluginsSection', "Remote session plugins"),
				localize('remotePluginsSectionDescription', "Plugins configured directly on the active remote agent host."),
				'remote-plugins-section'
			);
			for (const item of remoteItems) {
				this.appendRemotePluginCard(remoteGrid, item);
			}
		}

		this.renderDiscoverySnapshot(content);
		if (this.marketplaceItems.length === 0 && this.isBrowseMarketplaceAvailable()) {
			void this.queryMarketplaceSnapshot();
		}
	}

	private appendPluginHomeEmptyState(parent: HTMLElement): void {
		const empty = DOM.append(parent, $('.plugin-home-empty-card'));
		const title = DOM.append(empty, $('h3.plugin-home-empty-title'));
		title.textContent = localize('pluginHomeEmptyTitle', "No plugins installed yet");
		const description = DOM.append(empty, $('.plugin-home-empty-description'));
		description.textContent = localize('pluginHomeEmptyDescription', "Browse marketplace plugins or install one from a source to add skills, commands, MCP servers, and other agent capabilities.");
		const actions = DOM.append(empty, $('.plugin-card-actions'));
		const browse = this.cardDisposables.add(new Button(actions, { ...defaultButtonStyles, supportIcons: true, ariaLabel: localize('browseMarketplace', "Browse Marketplace") }));
		browse.label = `$(${Codicon.library.id}) ${localize('browseMarketplace', "Browse Marketplace")}`;
		browse.enabled = this.isBrowseMarketplaceAvailable();
		this.rememberCardFocusElement(browse.element);
		this.cardDisposables.add(browse.onDidClick(() => this.showBrowseMarketplace()));
		const add = this.cardDisposables.add(new Button(actions, { ...defaultButtonStyles, secondary: true, supportIcons: true, ariaLabel: localize('installFromSource', "Install Plugin from Source") }));
		add.element.classList.add('plugin-install-from-source-button');
		add.label = `$(${Codicon.add.id}) ${localize('installFromSource', "Install Plugin from Source")}`;
		this.cardDisposables.add(add.onDidClick(() => this.runInstallFromSourceAction()));
	}

	private appendInstalledPluginCard(parent: HTMLElement, item: IInstalledPluginItem): void {
		const card = DOM.append(parent, $('.plugin-card.plugin-installed-card'));
		const enabled = isContributionEnabled(item.plugin.enablement.get());
		card.classList.toggle('disabled', !enabled);
		this.addCardActivation(card, localize('openPluginDetails', "Open details for {0}", item.name), () => this._onDidSelectPlugin.fire(item));
		const header = DOM.append(card, $('.plugin-card-header'));
		const icon = DOM.append(header, $('.plugin-card-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.plug));
		const titleBlock = DOM.append(header, $('.plugin-card-title-block'));
		const name = DOM.append(titleBlock, $('.plugin-card-title'));
		name.textContent = formatDisplayName(item.name);
		name.title = item.name;
		const source = DOM.append(titleBlock, $('.plugin-card-subtitle'));
		source.textContent = truncateToFirstLine(item.description || localize('pluginNoDescription', "No description provided."));
		const actions = DOM.append(header, $('.plugin-card-actions'));
		const more = this.cardDisposables.add(new Button(actions, { ...defaultButtonStyles, secondary: true, supportIcons: true, ariaLabel: localize('pluginMoreActionsAria', "More actions for {0}", item.name) }));
		more.element.classList.add('plugin-card-ghost-button', 'plugin-card-icon-button');
		more.label = `$(${Codicon.ellipsis.id})`;
		this.addCardActionButtonClick(more, () => this.showInstalledPluginActions(item, more.element));
		this.appendContributionPreview(card, item);
	}

	private appendRemotePluginCard(parent: HTMLElement, item: ICustomizationItem): void {
		const card = DOM.append(parent, $('.plugin-card.plugin-remote-card'));
		card.setAttribute('role', 'group');
		card.setAttribute('aria-label', localize('pluginRemoteCardAria', "{0}. Remote plugin", item.name));
		const header = DOM.append(card, $('.plugin-card-header'));
		const icon = DOM.append(header, $('.plugin-card-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.plug));
		const titleBlock = DOM.append(header, $('.plugin-card-title-block'));
		const name = DOM.append(titleBlock, $('.plugin-card-title'));
		name.textContent = formatDisplayName(item.name);
		const source = DOM.append(titleBlock, $('.plugin-card-subtitle'));
		source.textContent = localize('remotePluginMetadata', "Remote agent host");
		const status = DOM.append(card, $('.plugin-card-badges'));
		const statusLabel = getRemotePluginStatusLabel(item);
		if (statusLabel) {
			this.appendCardBadge(status, statusLabel);
		}
		const description = DOM.append(card, $('.plugin-card-description'));
		description.textContent = item.description || localize('pluginNoDescription', "No description provided.");
		if (item.actions?.length) {
			const actions = DOM.append(header, $('.plugin-card-actions'));
			const more = this.cardDisposables.add(new Button(actions, { ...defaultButtonStyles, secondary: true, supportIcons: true, ariaLabel: localize('pluginMoreActionsAria', "More actions for {0}", item.name) }));
			more.element.classList.add('plugin-card-ghost-button', 'plugin-card-icon-button');
			more.label = `$(${Codicon.ellipsis.id})`;
			this.rememberCardFocusElement(more.element);
			this.addCardActionButtonClick(more, () => this.showRemotePluginActions(item, more.element));
		}
	}

	private appendMarketplacePluginCard(parent: HTMLElement, item: IMarketplacePluginItem): void {
		const card = DOM.append(parent, $('.plugin-card.plugin-marketplace-card'));
		this.addCardActivation(card, localize('openPluginDetails', "Open details for {0}", item.name), () => this._onDidSelectPlugin.fire(item));
		const header = DOM.append(card, $('.plugin-card-header'));
		const icon = DOM.append(header, $('.plugin-card-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.plug));
		const titleBlock = DOM.append(header, $('.plugin-card-title-block'));
		const name = DOM.append(titleBlock, $('.plugin-card-title'));
		name.textContent = item.name;
		name.title = item.name;
		const descriptionLine = DOM.append(titleBlock, $('.plugin-card-subtitle'));
		descriptionLine.textContent = truncateToFirstLine(item.description || localize('pluginNoDescription', "No description provided."));
		const actions = DOM.append(header, $('.plugin-card-actions'));
		const install = this.cardDisposables.add(new Button(actions, { ...defaultButtonStyles, supportIcons: true, ariaLabel: localize('installPluginAria', "Install {0}", item.name) }));
		install.label = localize('install', "Install");
		this.addCardActionButtonClick(install, () => this.installMarketplacePlugin(item, install));
		const badges = DOM.append(card, $('.plugin-card-badges'));
		if (this.pluginMarketplaceService.recommendedPlugins.get().has(getMarketplaceRecommendationKey(item))) {
			this.appendCardBadge(badges, localize('recommendedBadge', "Recommended"));
		}
	}

	private rememberCardFocusElement(element: HTMLElement): void {
		this.firstCardFocusElement ??= element;
	}

	private appendCardBadge(parent: HTMLElement, label: string): void {
		const badge = DOM.append(parent, $('.inline-badge.plugin-card-badge'));
		badge.textContent = label;
	}

	private appendContributionPreview(parent: HTMLElement, item: IInstalledPluginItem): void {
		const contributions = getInstalledPluginContributionEntries(item);
		if (contributions.length === 0) {
			if (!isContributionEnabled(item.plugin.enablement.get())) {
				const preview = DOM.append(parent, $('.plugin-card-contribution-preview'));
				this.appendCardBadge(preview, localize('pluginDetailDisabledBadge', "Disabled"));
			}
			return;
		}
		const preview = DOM.append(parent, $('.plugin-card-contribution-preview'));
		if (!isContributionEnabled(item.plugin.enablement.get())) {
			this.appendCardBadge(preview, localize('pluginDetailDisabledBadge', "Disabled"));
		}
		for (const contribution of contributions.slice(0, 3)) {
			const chip = DOM.append(preview, $('.inline-badge.plugin-card-contribution-chip'));
			chip.textContent = contribution.label;
			chip.title = contribution.items.map(i => i.name).join(', ');
		}
	}

	private renderDiscoverySnapshot(parent: HTMLElement): void {
		const marketplaceItems = this.getUninstalledMarketplaceItems();
		if (marketplaceItems.length === 0) {
			return;
		}
		const recommendedKeys = this.pluginMarketplaceService.recommendedPlugins.get();
		const recommended = marketplaceItems.filter(item => recommendedKeys.has(getMarketplaceRecommendationKey(item)));
		const snapshotItems = [
			...sortMarketplaceSnapshotItems(recommended),
			...sortMarketplaceSnapshotItems(marketplaceItems.filter(item => !recommendedKeys.has(getMarketplaceRecommendationKey(item)))),
		].slice(0, 12);
		const section = DOM.append(parent, $('.plugin-card-section.plugin-discovery-section'));
		const header = DOM.append(section, $('.plugin-card-section-header'));
		const text = DOM.append(header, $('.plugin-card-section-text'));
		const title = DOM.append(text, $('h3.plugin-card-section-title'));
		title.textContent = localize('discoverMorePlugins', "Discover more");
		const description = DOM.append(text, $('.plugin-card-section-description'));
		description.textContent = localize('discoverMorePluginsDescription', "A curated snapshot from configured marketplaces.");
		const installFromSource = this.cardDisposables.add(new Button(header, { ...defaultButtonStyles, secondary: true, supportIcons: true, ariaLabel: localize('installFromSource', "Install Plugin from Source") }));
		installFromSource.element.classList.add('plugin-card-ghost-button', 'plugin-install-from-source-button');
		installFromSource.label = `$(${Codicon.add.id}) ${localize('installFromSource', "Install Plugin from Source")}`;
		this.cardDisposables.add(installFromSource.onDidClick(() => this.runInstallFromSourceAction()));
		const action = this.cardDisposables.add(new Button(header, { ...defaultButtonStyles, secondary: true, supportIcons: true, ariaLabel: localize('browseAllPlugins', "Browse All Plugins") }));
		action.element.classList.add('plugin-browse-all-button');
		action.label = `$(${Codicon.library.id}) ${localize('browseAllPlugins', "Browse All Plugins")}`;
		this.cardDisposables.add(action.onDidClick(() => this.showBrowseMarketplace()));
		const grid = DOM.append(section, $('.plugin-card-grid'));
		for (const item of snapshotItems) {
			this.appendMarketplacePluginCard(grid, item);
		}
	}

	private renderBrowseMarketplaceCards(): void {
		this.cardDisposables.clear();
		this.firstCardFocusElement = undefined;
		DOM.clearNode(this.cardContainer);
		const marketplaceItems = this.getUninstalledMarketplaceItems();
		if (marketplaceItems.length === 0) {
			this.showEmptySurface();
			this.emptyText.textContent = localize('emptyMarketplace', "No plugins available");
			this.emptySubtext.textContent = '';
			return;
		}

		this.showCardSurface();
		const content = DOM.append(this.cardContainer, $('.plugin-card-scroll'));
		const header = DOM.append(content, $('.plugin-marketplace-page-header'));
		const back = this.cardDisposables.add(new Button(header, { ...defaultButtonStyles, secondary: true, supportIcons: true, ariaLabel: localize('backToInstalledPlugins', "Back to Installed") }));
		back.element.classList.add('plugin-card-ghost-button');
		back.label = `$(${Codicon.arrowLeft.id}) ${localize('backToInstalledPlugins', "Back to Installed")}`;
		this.rememberCardFocusElement(back.element);
		this.cardDisposables.add(back.onDidClick(() => this.toggleBrowseMode(false)));
		const recommendedKeys = this.pluginMarketplaceService.recommendedPlugins.get();
		const recommended = marketplaceItems.filter(item => recommendedKeys.has(getMarketplaceRecommendationKey(item)));
		const allPlugins = marketplaceItems.filter(item => !recommendedKeys.has(getMarketplaceRecommendationKey(item)));
		if (recommended.length > 0) {
			const recommendedGrid = this.renderCardSection(
				content,
				localize('recommendedGroup', "Recommended for this workspace"),
				localize('recommendedGroupDescription', "Plugins recommended by workspace configuration."),
				'plugin-marketplace-recommended-section'
			);
			for (const item of recommended) {
				this.appendMarketplacePluginCard(recommendedGrid, item);
			}
		}
		const allGrid = this.renderCardSection(
			content,
			localize('allMarketplaceGroup', "All plugins"),
			localize('allMarketplaceGroupDescription', "Plugins available from configured marketplaces."),
			'plugin-marketplace-all-section'
		);
		for (const item of allPlugins) {
			this.appendMarketplacePluginCard(allGrid, item);
		}
	}

	private getUninstalledMarketplaceItems(): IMarketplacePluginItem[] {
		const installedUris = new Set(this.agentPluginService.plugins.get().map(p => p.uri.toString()));
		return this.marketplaceItems.filter(item => {
			const expectedUri = this.pluginInstallService.getPluginInstallUri({
				name: item.name,
				description: item.description,
				version: '',
				source: item.source,
				sourceDescriptor: item.sourceDescriptor,
				marketplace: item.marketplace,
				marketplaceReference: item.marketplaceReference,
				marketplaceType: item.marketplaceType,
			});
			return !installedUris.has(expectedUri.toString());
		});
	}

	private async installMarketplacePlugin(item: IMarketplacePluginItem, button: Button): Promise<void> {
		button.label = localize('installing', "Installing...");
		button.enabled = false;
		try {
			await this.pluginInstallService.installPlugin({
				name: item.name,
				description: item.description,
				version: '',
				sourceDescriptor: item.sourceDescriptor,
				source: item.source,
				marketplace: item.marketplace,
				marketplaceReference: item.marketplaceReference,
				marketplaceType: item.marketplaceType,
				readmeUri: item.readmeUri,
			});
			button.label = localize('installed', "Installed");
			void this.refresh();
		} catch {
			button.label = localize('install', "Install");
			button.enabled = true;
		}
	}

	private async queryMarketplaceSnapshot(): Promise<void> {
		this.marketplaceCts?.dispose(true);
		const cts = this.marketplaceCts = new CancellationTokenSource();
		try {
			const plugins = await this.pluginMarketplaceService.fetchMarketplacePlugins(cts.token);
			if (cts.token.isCancellationRequested || this.browseMode || this.searchQuery.trim()) {
				return;
			}
			this.marketplaceItems = plugins.map(marketplacePluginToItem);
			this.renderPluginHome();
		} catch {
			// Discovery is a progressive enhancement on the home surface.
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
		this.element.classList.toggle('browse-mode', browse);
		this.searchInput.value = '';
		this.searchQuery = '';

		this.updateToolbarActions();

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
		this.showEmptySurface();
		this.emptyText.textContent = localize('loadingMarketplace', "Loading marketplace...");
		this.emptySubtext.textContent = '';

		try {
			const plugins = await this.pluginMarketplaceService.fetchMarketplacePlugins(cts.token);

			if (cts.token.isCancellationRequested) {
				return;
			}

			const query = this.searchQuery.toLowerCase().trim();
			if (query) {
				const allPlugins = this.agentPluginService.plugins.get();
				this.installedItems = allPlugins
					.map(p => installedPluginToItem(p, this.labelService))
					.filter(item => item.name.toLowerCase().includes(query) || item.description.toLowerCase().includes(query));
				this.remoteItems = [...await this.getRemotePluginItems(query)];
			}
			const filtered = query
				? plugins.filter(p => p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query) || p.marketplace.toLowerCase().includes(query))
				: plugins;

			// Filter out already-installed plugins
			const installedUris = new Set(this.agentPluginService.plugins.get().map(p => p.uri.toString()));
			this.marketplaceItems = filtered
				.filter(p => {
					const expectedUri = this.pluginInstallService.getPluginInstallUri(p);
					return !installedUris.has(expectedUri.toString());
				})
				.map(marketplacePluginToItem);

			if (query) {
				this.updateSearchResultsList();
			} else {
				this.updateMarketplaceList();
			}
		} catch {
			if (!cts.token.isCancellationRequested) {
				this.marketplaceItems = [];
				this.showEmptySurface();
				this.emptyText.textContent = localize('marketplaceError', "Unable to load marketplace");
				this.emptySubtext.textContent = localize('tryAgainLater', "Check your connection and try again");
			}
		}
	}

	private async queryPluginSearch(): Promise<void> {
		this.marketplaceCts?.dispose(true);
		const cts = this.marketplaceCts = new CancellationTokenSource();
		try {
			const plugins = await this.pluginMarketplaceService.fetchMarketplacePlugins(cts.token);
			if (cts.token.isCancellationRequested || this.browseMode) {
				return;
			}
			const query = this.searchQuery.toLowerCase().trim();
			const filtered = query
				? plugins.filter(p => p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query) || p.marketplace.toLowerCase().includes(query))
				: plugins;
			const installedUris = new Set(this.agentPluginService.plugins.get().map(p => p.uri.toString()));
			this.marketplaceItems = filtered
				.filter(p => {
					const expectedUri = this.pluginInstallService.getPluginInstallUri(p);
					return !installedUris.has(expectedUri.toString());
				})
				.map(marketplacePluginToItem);
		} catch {
			this.marketplaceItems = [];
		}
		await this.filterPlugins();
	}

	private updateMarketplaceList(): void {
		if (this.marketplaceItems.length === 0) {
			this.showEmptySurface();
			if (this.searchQuery.trim()) {
				this.emptyText.textContent = localize('noMarketplaceResults', "No plugins match '{0}'", this.searchQuery);
				this.emptySubtext.textContent = localize('tryDifferentSearch', "Try a different search term");
			} else {
				this.emptyText.textContent = localize('emptyMarketplace', "No plugins available");
				this.emptySubtext.textContent = '';
			}
			this.list.splice(0, this.list.length, []);
			return;
		}

		const query = this.searchQuery.trim();
		if (!query) {
			this.renderBrowseMarketplaceCards();
			this.list.splice(0, this.list.length, []);
			return;
		} else {
			this.updateSearchResultsList();
		}
	}

	private updateSearchResultsList(): void {
		const installedNames = new Set(this.installedItems.map(item => item.name.toLowerCase()));
		const remoteItems = this.remoteItems.filter(item => item.groupKey !== 'remote-client' && (!item.name || !installedNames.has(item.name.toLowerCase())));
		const marketplaceEntries = this.marketplaceItems.map(item => ({ type: 'marketplace-item' as const, item }));
		const entries: IPluginListEntry[] = [];
		const installedEntries: IPluginListEntry[] = [
			...this.installedItems.map(item => ({ type: 'plugin-item' as const, item })),
			...remoteItems.map(item => ({ type: 'remote-item' as const, item })),
		];
		if (installedEntries.length > 0) {
			entries.push({ type: 'search-header', id: 'plugin-search-installed', label: localize('installedSearchHeader', "Installed") });
			entries.push(...installedEntries);
		}
		if (marketplaceEntries.length > 0) {
			entries.push({ type: 'search-header', id: 'plugin-search-available', label: localize('availableSearchHeader', "Available to install") });
			entries.push(...marketplaceEntries);
		}
		if (entries.length === 0) {
			this.showEmptySurface();
			this.emptyText.textContent = localize('noMatchingPlugins', "No plugins match '{0}'", this.searchQuery);
			this.emptySubtext.textContent = localize('tryDifferentSearch', "Try a different search term");
		} else {
			this.showListSurface();
		}
		this.displayEntries = entries;
		this.list.splice(0, this.list.length, this.displayEntries);
	}

	private async getRemotePluginItems(query: string): Promise<readonly ICustomizationItem[]> {
		if (!this.harnessService.getActiveDescriptor().itemProvider) {
			return [];
		}

		try {
			const provided = await this.itemsModel.getActiveItemSource().fetchProviderItems();
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

		if (!query) {
			this.renderPluginHome();
			this._onDidChangeItemCount.fire(this.itemCount);
			return;
		}

		this.updateSearchResultsList();

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
		const headerHeight = this.sectionTitleHeader.offsetHeight;
		this.lastHeaderHeight = headerHeight;
		const listHeight = Math.max(0, height - searchBarHeight - headerHeight);

		this.cardContainer.style.height = `${listHeight}px`;
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
		if (this.cardContainer.style.display !== 'none') {
			this.firstCardFocusElement?.focus();
		} else if (this.list.length > 0) {
			this.list.domFocus();
			this.list.setFocus([0]);
		}
	}

	private getInstalledPluginActions(item: IInstalledPluginItem, disposables: DisposableStore): IAction[] {
		const actions: IAction[] = [];
		const groups = getInstalledPluginContextMenuActions(item.plugin, this.instantiationService);
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
		return actions;
	}

	private getRemotePluginActions(item: ICustomizationItem): IAction[] {
		const actions: IAction[] = [];
		for (const itemAction of item.actions ?? []) {
			actions.push(new Action(
				itemAction.id,
				itemAction.label,
				itemAction.icon ? ThemeIcon.asClassName(itemAction.icon) : undefined,
				itemAction.enabled !== false,
				() => itemAction.run(),
			));
		}
		return actions;
	}

	private showInstalledPluginActions(item: IInstalledPluginItem, anchor: HTMLElement): void {
		const disposables = new DisposableStore();
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => this.getInstalledPluginActions(item, disposables),
			onHide: () => disposables.dispose()
		});
	}

	private showRemotePluginActions(item: ICustomizationItem, anchor: HTMLElement): void {
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => this.getRemotePluginActions(item),
		});
	}

	private onContextMenu(e: IListContextMenuEvent<IPluginListEntry>): void {
		if (!e.element || e.element.type === 'group-header' || e.element.type === 'search-header' || e.element.type === 'marketplace-item') {
			return;
		}

		const entry = e.element;
		const disposables = new DisposableStore();
		const actions = entry.type === 'plugin-item'
			? this.getInstalledPluginActions(entry.item, disposables)
			: this.getRemotePluginActions(entry.item);

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => actions,
			onHide: () => disposables.dispose()
		});
	}
}
