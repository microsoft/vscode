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
import { WorkbenchList, WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { IListVirtualDelegate, IListRenderer, IListContextMenuEvent } from '../../../../../base/browser/ui/list/list.js';
import { IObjectTreeElement, ITreeContextMenuEvent, ObjectTreeElementCollapseState } from '../../../../../base/browser/ui/tree/tree.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Button, ButtonWithDropdown } from '../../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles, getButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { autorun, derived, IObservable } from '../../../../../base/common/observable.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { URI } from '../../../../../base/common/uri.js';
import { InputBox, MessageType } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Delayer } from '../../../../../base/common/async.js';
import { Action, IAction, Separator } from '../../../../../base/common/actions.js';
import { basename, dirname, isEqual } from '../../../../../base/common/resources.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { IAgentPlugin, IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { ContributionEnablementState, IEnablementModel, isContributionEnabled } from '../../common/enablement.js';
import { getInstalledPluginContextMenuActions, getPluginPolicyEnablement } from '../agentPluginActions.js';
import { IMarketplacePlugin, IPluginMarketplaceService } from '../../common/plugins/pluginMarketplaceService.js';
import { IPluginInstallService } from '../../common/plugins/pluginInstallService.js';
import { AgentPluginItemKind, IAgentPluginItem, IInstalledPluginItem, IMarketplacePluginItem } from '../agentPluginEditor/agentPluginItems.js';
import { formatDisplayName, truncateToFirstLine } from './aiCustomizationListWidget.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { CustomizationGroupHeaderRenderer, ICustomizationGroupHeaderEntry, CUSTOMIZATION_GROUP_HEADER_HEIGHT, CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR } from './customizationGroupHeaderRenderer.js';
import { getCustomizationDisabledLabel, ICustomizationHarnessService, isPluginCustomizationItem, type ICustomizationItem, type ICustomizationItemAction } from '../../common/customizationHarnessService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { CustomizationMarketplaceConfiguration } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { ChatConfiguration } from '../../common/constants.js';
import { IAICustomizationItemsModel } from './aiCustomizationItemsModel.js';
import { UpdateAgentPluginsCommandId } from '../chat.js';
import { Checkbox } from '../../../../../base/browser/ui/toggle/toggle.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { getErrorMessage } from '../../../../../base/common/errors.js';
import { getPluginInclusionLabel } from './aiCustomizationPresentation.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { createCustomizationCardPrimaryAction, CustomizationCardListController, getVirtualizedSectionMinimumHeight, layoutVirtualizedSectionList, layoutVirtualizedSections, setVirtualizedRowActionsTabbable } from './customizationCardList.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ScrollbarVisibility } from '../../../../../base/common/scrollable.js';
import { asTreeRenderer, CustomizationListLayout, CustomizationTreeTabs, getCustomizationListLayout, getSelectedCustomizationGroup, ICustomizationTreeGroup } from './customizationTree.js';
import { CustomizationToggle } from './customizationToggle.js';

const $ = DOM.$;

const PLUGIN_ITEM_HEIGHT = 58;
const PLUGIN_MARKETPLACE_ITEM_HEIGHT = 58;

type PluginMarketplaceSnapshotState = 'uninitialized' | 'loading' | 'loaded' | 'failed';

export class PluginMarketplaceSnapshotModel {

	private _state: PluginMarketplaceSnapshotState = 'uninitialized';
	private _items: readonly IMarketplacePluginItem[] = [];

	get state(): PluginMarketplaceSnapshotState {
		return this._state;
	}

	get items(): readonly IMarketplacePluginItem[] {
		return this._items;
	}

	beginLoading(): boolean {
		if (this._state !== 'uninitialized') {
			return false;
		}
		this._state = 'loading';
		return true;
	}

	complete(items: readonly IMarketplacePluginItem[]): void {
		this._items = items;
		this._state = 'loaded';
	}

	fail(): void {
		this._items = [];
		this._state = 'failed';
	}

	reset(): void {
		this._items = [];
		this._state = 'uninitialized';
	}
}

export function shouldLoadPluginMarketplaceSnapshot(visible: boolean, state: PluginMarketplaceSnapshotState, marketplaceAvailable: boolean): boolean {
	return visible && state === 'uninitialized' && marketplaceAvailable;
}

export function shouldShowLegacyPluginMarketplace(configurationService: IConfigurationService): boolean {
	return configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.MarketplaceEnabled) !== true ||
		configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.PluginMarketplacesEnabled) !== true;
}

export function isCurrentPluginMarketplaceRequest(
	requestQuery: string,
	currentQuery: string,
	requestBrowseMode: boolean,
	currentBrowseMode: boolean,
	isActiveRequest: boolean,
	isCancellationRequested: boolean,
): boolean {
	return isActiveRequest
		&& !isCancellationRequested
		&& requestQuery === currentQuery
		&& requestBrowseMode === currentBrowseMode;
}

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

function getRemotePluginEntryId(entry: IPluginRemoteItemEntry): string {
	return entry.item.itemKey ?? `remote-${entry.item.groupKey ?? 'default'}-${entry.item.uri.toString()}`;
}

function getMarketplacePluginEntryId(entry: IPluginMarketplaceItemEntry): string {
	return `marketplace-${entry.item.marketplaceReference.canonicalId}/${entry.item.source}`;
}

interface IPluginSectionList {
	readonly list: WorkbenchList<IPluginListEntry>;
	readonly entries: readonly IPluginListEntry[];
	readonly container: HTMLElement;
	readonly key: string;
}

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
			return PLUGIN_MARKETPLACE_ITEM_TEMPLATE_ID;
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
	readonly name: HTMLElement;
	readonly source: HTMLElement;
	readonly description: HTMLElement;
	readonly metadata: HTMLElement;
	readonly actions: HTMLElement;
	readonly disposables: DisposableStore;
	currentItemId: string | undefined;
}

class PluginInstalledItemRenderer implements IListRenderer<IPluginInstalledItemEntry, IPluginInstalledItemTemplateData> {
	readonly templateId = 'pluginInstalledItem';
	private readonly _templates = new Set<IPluginInstalledItemTemplateData>();
	private _focusedItemId: string | undefined;

	constructor(
		private readonly _harnessService: ICustomizationHarnessService,
		private readonly _renderActions: (item: IInstalledPluginItem, container: HTMLElement, actions: HTMLElement, disposables: DisposableStore) => void,
		private readonly _showSyncCheckbox = true,
	) { }

	renderTemplate(container: HTMLElement): IPluginInstalledItemTemplateData {
		container.classList.add('plugin-list-item', 'plugin-installed-item');

		const syncCheckboxContainer = DOM.append(container, $('.item-sync-checkbox'));
		const details = DOM.append(container, $('.plugin-list-item-details'));
		const nameRow = DOM.append(details, $('.plugin-list-item-name-row'));
		const name = DOM.append(nameRow, $('.plugin-list-item-name'));
		const source = DOM.append(nameRow, $('.inline-badge.plugin-source-badge'));
		const description = DOM.append(details, $('.plugin-list-item-description'));
		const metadata = DOM.append(details, $('.plugin-list-item-metadata'));
		const actions = DOM.append(container, $('.plugin-list-item-action'));

		const template = { container, syncCheckboxContainer, name, source, description, metadata, actions, disposables: new DisposableStore(), currentItemId: undefined };
		this._templates.add(template);
		return template;
	}

	renderElement(element: IPluginInstalledItemEntry, _index: number, templateData: IPluginInstalledItemTemplateData): void {
		templateData.disposables.clear();
		templateData.currentItemId = element.item.plugin.uri.toString();

		templateData.name.textContent = formatDisplayName(element.item.name);
		templateData.source.textContent = element.item.marketplace ? '' : localize('pluginLocalSourceBadge', "Local");
		templateData.source.title = element.item.marketplace ? '' : localize('pluginLocalSourceTooltip', "Installed from a local source");
		templateData.source.style.display = element.item.marketplace ? 'none' : '';

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

		const syncProvider = this._showSyncCheckbox ? this._harnessService.getActiveDescriptor().syncProvider : undefined;
		if (syncProvider) {
			templateData.syncCheckboxContainer.style.display = '';
			const pluginUri = element.item.plugin.uri;
			const disabled = syncProvider.isDisabled(pluginUri);
			const title = disabled
				? localize('enablePlugin', "Enable {0} for sync", element.item.name)
				: localize('disablePlugin', "Disable {0} from sync", element.item.name);
			const checkbox = templateData.disposables.add(new Checkbox(title, !disabled, defaultCheckboxStyles));
			templateData.syncCheckboxContainer.replaceChildren(checkbox.domNode);
			templateData.disposables.add(checkbox.onChange(() => {
				syncProvider.setDisabled(pluginUri, !checkbox.checked);
			}));
		} else {
			templateData.syncCheckboxContainer.style.display = 'none';
			templateData.syncCheckboxContainer.replaceChildren();
		}
		DOM.clearNode(templateData.actions);
		this._renderActions(element.item, templateData.container, templateData.actions, templateData.disposables);
		setVirtualizedRowActionsTabbable(templateData.actions, templateData.currentItemId === this._focusedItemId);
	}

	setFocusedItemId(itemId: string | undefined): void {
		this._focusedItemId = itemId;
		for (const template of this._templates) {
			setVirtualizedRowActionsTabbable(template.actions, template.currentItemId === itemId);
		}
	}

	disposeTemplate(templateData: IPluginInstalledItemTemplateData): void {
		this._templates.delete(templateData);
		templateData.disposables.dispose();
	}
}

//#endregion

//#region Remote Plugin Renderer

interface IPluginRemoteItemTemplateData {
	readonly container: HTMLElement;
	readonly name: HTMLElement;
	readonly badge: HTMLElement;
	readonly description: HTMLElement;
	readonly metadata: HTMLElement;
	readonly status: HTMLElement;
	readonly actions: HTMLElement;
	readonly disposables: DisposableStore;
	currentItemId: string | undefined;
}

class PluginRemoteItemRenderer implements IListRenderer<IPluginRemoteItemEntry, IPluginRemoteItemTemplateData> {
	readonly templateId = 'pluginRemoteItem';
	private readonly _templates = new Set<IPluginRemoteItemTemplateData>();
	private _focusedItemId: string | undefined;

	constructor(
		private readonly _renderActions: (item: ICustomizationItem, actions: HTMLElement, disposables: DisposableStore) => void,
	) { }

	renderTemplate(container: HTMLElement): IPluginRemoteItemTemplateData {
		container.classList.add('plugin-list-item', 'plugin-remote-item');

		const details = DOM.append(container, $('.plugin-list-item-details'));
		const nameRow = DOM.append(details, $('.plugin-list-item-name-row'));
		const name = DOM.append(nameRow, $('span'));
		const badge = DOM.append(nameRow, $('.inline-badge.item-badge'));
		const description = DOM.append(details, $('.plugin-list-item-description'));
		const metadata = DOM.append(details, $('.plugin-list-item-metadata'));
		const status = DOM.append(container, $('.plugin-list-item-status'));
		const actions = DOM.append(container, $('.plugin-list-item-action'));

		const template = { container, name, badge, description, metadata, status, actions, disposables: new DisposableStore(), currentItemId: undefined };
		this._templates.add(template);
		return template;
	}

	renderElement(element: IPluginRemoteItemEntry, _index: number, templateData: IPluginRemoteItemTemplateData): void {
		templateData.disposables.clear();
		templateData.currentItemId = getRemotePluginEntryId(element);
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
			templateData.status.textContent = getRemotePluginDisabledLabel(element.item);
			templateData.status.classList.add('disabled');
		} else {
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
		DOM.clearNode(templateData.actions);
		this._renderActions(element.item, templateData.actions, templateData.disposables);
		setVirtualizedRowActionsTabbable(templateData.actions, templateData.currentItemId === this._focusedItemId);
	}

	setFocusedItemId(itemId: string | undefined): void {
		this._focusedItemId = itemId;
		for (const template of this._templates) {
			setVirtualizedRowActionsTabbable(template.actions, template.currentItemId === itemId);
		}
	}

	disposeTemplate(templateData: IPluginRemoteItemTemplateData): void {
		this._templates.delete(templateData);
		templateData.disposables.dispose();
	}
}

export function getRemotePluginDisabledLabel(item: Pick<ICustomizationItem, 'disabledReason'>): string {
	return getCustomizationDisabledLabel(item.disabledReason);
}

//#endregion

//#region Marketplace Plugin Renderer (reuses .mcp-gallery-item CSS)

interface IPluginMarketplaceItemTemplateData {
	readonly container: HTMLElement;
	readonly name: HTMLElement;
	readonly recommendedBadge: HTMLElement;
	readonly publisher: HTMLElement;
	readonly description: HTMLElement;
	readonly metadata: HTMLElement;
	readonly installButton: Button;
	readonly elementDisposables: DisposableStore;
	readonly templateDisposables: DisposableStore;
	currentItemId: string | undefined;
}

const PLUGIN_MARKETPLACE_ITEM_TEMPLATE_ID = 'pluginMarketplaceItem';

class PluginMarketplaceItemRenderer implements IListRenderer<IPluginMarketplaceItemEntry, IPluginMarketplaceItemTemplateData> {
	readonly templateId = PLUGIN_MARKETPLACE_ITEM_TEMPLATE_ID;
	private readonly _templates = new Set<IPluginMarketplaceItemTemplateData>();
	private _focusedItemId: string | undefined;

	constructor(
		private readonly pluginInstallService: IPluginInstallService,
		private readonly agentPluginService: IAgentPluginService,
		private readonly pluginMarketplaceService: IPluginMarketplaceService,
		private readonly notificationService: INotificationService,
		private readonly showRecommendedBadge = true,
	) { }

	renderTemplate(container: HTMLElement): IPluginMarketplaceItemTemplateData {
		container.classList.add('plugin-list-item', 'plugin-marketplace-item');
		const details = DOM.append(container, $('.plugin-list-item-details'));
		const nameRow = DOM.append(details, $('.plugin-list-item-name-row'));
		const name = DOM.append(nameRow, $('.plugin-list-item-name'));
		const recommendedBadge = DOM.append(nameRow, $('.inline-badge.plugin-recommended-badge'));
		recommendedBadge.textContent = localize('recommendedBadge', "Recommended");
		const description = DOM.append(details, $('.plugin-list-item-description'));
		const publisher = DOM.append(details, $('.plugin-list-item-source'));
		const metadata = DOM.append(details, $('.plugin-list-item-metadata'));
		const actionContainer = DOM.append(container, $('.plugin-list-item-action'));
		const installButton = new Button(actionContainer, { ...defaultButtonStyles, secondary: true });
		installButton.element.classList.add('plugin-list-item-install-button');

		const templateDisposables = new DisposableStore();
		templateDisposables.add(installButton);
		templateDisposables.add(DOM.addDisposableGenericMouseDownListener(installButton.element, event => DOM.EventHelper.stop(event, true)));

		const template = { container, name, recommendedBadge, publisher, description, metadata, installButton, elementDisposables: new DisposableStore(), templateDisposables, currentItemId: undefined };
		this._templates.add(template);
		return template;
	}

	renderElement(element: IPluginMarketplaceItemEntry, _index: number, templateData: IPluginMarketplaceItemTemplateData): void {
		templateData.elementDisposables.clear();
		templateData.currentItemId = getMarketplacePluginEntryId(element);

		templateData.name.textContent = element.item.name;
		templateData.recommendedBadge.style.display = this.showRecommendedBadge && this.isRecommended(element.item) ? '' : 'none';
		templateData.publisher.textContent = '';
		templateData.publisher.style.display = 'none';
		templateData.description.textContent = element.item.description || '';
		templateData.metadata.textContent = '';
		templateData.metadata.style.display = 'none';

		const installUri = this.pluginInstallService.getPluginInstallUri({
			name: element.item.name,
			description: element.item.description,
			version: element.item.version ?? '',
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
			this.updateInstallButtonTabbability(templateData);
			return;
		}

		templateData.installButton.label = localize('install', "Install");
		templateData.installButton.enabled = true;
		this.updateInstallButtonTabbability(templateData);

		templateData.elementDisposables.add(templateData.installButton.onDidClick(async event => {
			DOM.EventHelper.stop(event, true);
			templateData.installButton.label = localize('installing', "Installing...");
			templateData.installButton.enabled = false;
			try {
				await this.pluginInstallService.installPlugin({
					name: element.item.name,
					description: element.item.description,
					version: element.item.version ?? '',
					sourceDescriptor: element.item.sourceDescriptor,
					source: element.item.source,
					marketplace: element.item.marketplace,
					marketplaceReference: element.item.marketplaceReference,
					marketplaceType: element.item.marketplaceType,
					readmeUri: element.item.readmeUri,
				});
				templateData.installButton.label = localize('installed', "Installed");
				this.updateInstallButtonTabbability(templateData);
			} catch (error) {
				templateData.installButton.label = localize('install', "Install");
				templateData.installButton.enabled = true;
				this.updateInstallButtonTabbability(templateData);
				this.notificationService.error(localize('pluginInstallFailed', "Unable to install plugin: {0}", getErrorMessage(error)));
			}
		}));
	}

	setFocusedItemId(itemId: string | undefined): void {
		this._focusedItemId = itemId;
		for (const template of this._templates) {
			this.updateInstallButtonTabbability(template);
		}
	}

	private updateInstallButtonTabbability(templateData: IPluginMarketplaceItemTemplateData): void {
		templateData.installButton.element.tabIndex = templateData.installButton.enabled && templateData.currentItemId === this._focusedItemId ? 0 : -1;
	}

	private isRecommended(item: IMarketplacePluginItem): boolean {
		return this.pluginMarketplaceService.recommendedPlugins.get().has(getMarketplaceRecommendationKey(item));
	}

	disposeTemplate(templateData: IPluginMarketplaceItemTemplateData): void {
		this._templates.delete(templateData);
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
		version: plugin.version,
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

function compareInstalledPluginItems(a: IInstalledPluginItem, b: IInstalledPluginItem): number {
	return formatDisplayName(a.name).localeCompare(formatDisplayName(b.name));
}

export function partitionInstalledPluginItemsByScope(items: readonly IInstalledPluginItem[]): { readonly user: IInstalledPluginItem[]; readonly workspace: IInstalledPluginItem[] } {
	const workspace = items.filter(item => {
		const state = item.plugin.enablement.get();
		return state === ContributionEnablementState.EnabledWorkspace || state === ContributionEnablementState.DisabledWorkspace;
	});
	return {
		user: items.filter(item => !workspace.includes(item)),
		workspace,
	};
}

export function getInstalledPluginMetadata(item: IInstalledPluginItem): string {
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
		return getRemotePluginDisabledLabel(item);
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

export function getToggledPluginEnablementState(state: ContributionEnablementState): ContributionEnablementState {
	switch (state) {
		case ContributionEnablementState.EnabledWorkspace:
			return ContributionEnablementState.DisabledWorkspace;
		case ContributionEnablementState.DisabledWorkspace:
			return ContributionEnablementState.EnabledWorkspace;
		case ContributionEnablementState.EnabledProfile:
			return ContributionEnablementState.DisabledProfile;
		case ContributionEnablementState.DisabledProfile:
			return ContributionEnablementState.EnabledProfile;
	}
}

export function setPluginEnablementAndReadEffective(model: IEnablementModel, key: string, state: ContributionEnablementState): ContributionEnablementState {
	model.setEnabled(key, state);
	return model.readEnabled(key);
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
	private marketplaceBackContainer!: HTMLElement;
	private searchAndButtonContainer!: HTMLElement;
	private searchInput!: InputBox;
	private cardContainer!: HTMLElement;
	private cardScrollable!: DomScrollableElement;
	private cardScrollableNode!: HTMLElement;
	private sectionLayoutContainer: HTMLElement | undefined;
	private listContainer!: HTMLElement;
	private list!: WorkbenchObjectTree<IPluginListEntry>;
	private treeTabs!: CustomizationTreeTabs;
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
	private installedCreateButton: Button | undefined;
	private updatePluginsButton!: Button;
	private readonly addDropdownActions = this._register(new DisposableStore());
	private readonly cardDisposables = this._register(new DisposableStore());
	private readonly pendingSectionLayout = this._register(new MutableDisposable());
	private readonly cardListControllers = new WeakMap<HTMLElement, CustomizationCardListController>();
	private sectionLists: IPluginSectionList[] = [];

	private installedItems: IInstalledPluginItem[] = [];
	private remoteItems: ICustomizationItem[] = [];
	private marketplaceItems: IMarketplacePluginItem[] = [];
	private readonly marketplaceSnapshot = new PluginMarketplaceSnapshotModel();
	private searchQuery: string = '';
	private selectedGroupKey: string | undefined;
	private currentTreeGroups: readonly ICustomizationTreeGroup<IPluginListEntry>[] = [];
	private browseMode: boolean = false;
	private visible = false;
	private firstCardFocusElement: HTMLElement | undefined;
	private narrowLayout = false;
	private wideLayout = false;
	private lastHeight: number = 0;
	private lastWidth: number = 0;
	private lastHeaderHeight = 0;
	private _layoutDeferred = false;
	private readonly revealLastItemScheduler = this._register(new MutableDisposable());
	private marketplaceCts: CancellationTokenSource | undefined;
	private marketplaceSnapshotCts: CancellationTokenSource | undefined;
	private readonly delayedFilter = new Delayer<void>(200);
	private readonly delayedMarketplaceSearch = new Delayer<void>(400);
	private filterGeneration = 0;

	constructor(
		private readonly marketplaceBrowsingAvailable = !isWeb,
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
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this.element = $('.mcp-list-widget.plugin-list-widget'); // reuse MCP shell, add plugin-specific row styling
		this.create();
		const resizeObserver = this._register(new DOM.DisposableResizeObserver(
			'PluginListWidget',
			() => this.updateResponsiveLayout(this.element.offsetWidth),
			DOM.getWindow(this.element),
		));
		this._register(resizeObserver.observe(this.element));
		this.updateAccessState();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.PluginsEnabled)) {
				this.updateAccessState();
			}
			if (e.affectsConfiguration(CustomizationMarketplaceConfiguration.PluginMarketplacesEnabled) ||
				e.affectsConfiguration(CustomizationMarketplaceConfiguration.MarketplaceEnabled)) {
				this.marketplaceCts?.dispose(true);
				this.marketplaceSnapshotCts?.dispose(true);
				this.marketplaceSnapshot.reset();
				this.marketplaceItems = [];
				if (!shouldShowLegacyPluginMarketplace(this.configurationService) && this.browseMode) {
					this.toggleBrowseMode(false);
				}
				void this.refresh();
			}
			if (e.affectsConfiguration(ChatConfiguration.ChatCustomizationsListLayout)) {
				this.renderPluginTree();
				this.layout(this.lastHeight, this.lastWidth);
			}
		}));
		this._register({
			dispose: () => {
				this.delayedFilter.cancel();
				this.delayedMarketplaceSearch.cancel();
				this.marketplaceCts?.dispose(true);
				this.marketplaceCts = undefined;
				this.marketplaceSnapshotCts?.dispose(true);
				this.marketplaceSnapshotCts = undefined;
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

		this.marketplaceBackContainer = DOM.append(this.element, $('.plugin-marketplace-back-container'));
		this.marketplaceBackContainer.style.display = 'none';
		const backToInstalledLabel = localize('backToInstalledPlugins', "Back to Installed");
		this.backButtonContainer = DOM.append(this.marketplaceBackContainer, $('.list-add-button-container'));
		this.backButton = this._register(new Button(this.backButtonContainer, {
			...getButtonStyles({
				buttonSecondaryBackground: undefined,
				buttonSecondaryForeground: undefined,
				buttonSecondaryHoverBackground: undefined,
				buttonSecondaryBorder: undefined,
			}),
			secondary: true,
			supportIcons: true,
			title: backToInstalledLabel,
			ariaLabel: backToInstalledLabel,
		}));
		this.backButton.element.classList.add('list-add-button', 'plugin-card-ghost-button');
		this.backButton.label = `$(${Codicon.arrowLeft.id}) ${backToInstalledLabel}`;
		this._register(this.backButton.onDidClick(() => this.toggleBrowseMode(false)));

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
			this.marketplaceCts?.dispose(true);
			this.marketplaceCts = undefined;
			if (this.browseMode) {
				this.delayedMarketplaceSearch.trigger(() => this.queryMarketplace());
			} else if (this.searchQuery.trim()) {
				this.delayedMarketplaceSearch.trigger(() => this.queryPluginSearch());
			} else {
				this.delayedMarketplaceSearch.cancel();
				this.marketplaceItems = [];
				this.searchInput.hideMessage();
				this.delayedFilter.trigger(() => this.filterPlugins());
			}
		}));

		// Button container (Browse Marketplace + Add actions + Create Plugin + Update Plugins)
		this.buttonContainer = DOM.append(this.searchAndButtonContainer, $('.list-button-group'));

		const browseButtonContainer = DOM.append(this.buttonContainer, $('.list-add-button-container'));
		const browseMarketplaceLabel = localize('browseMarketplace', "Browse Marketplace");
		this.browseButton = this._register(new Button(browseButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: browseMarketplaceLabel, ariaLabel: browseMarketplaceLabel }));
		this.browseButton.element.classList.add('list-add-button');
		browseButtonContainer.style.display = 'none';

		this.addButtonContainer = DOM.append(this.buttonContainer, $('.list-add-button-container'));
		const addPluginLabel = localize('addPlugin', "Add Plugin");
		this.addButtonSimple = this._register(new Button(this.addButtonContainer, { ...defaultButtonStyles, secondary: true, title: addPluginLabel, ariaLabel: addPluginLabel }));
		this.addButtonSimple.element.classList.add('list-add-button');
		this._register(this.addButtonSimple.onDidClick(() => this.runPrimaryAddAction()));

		this.addButton = this._register(new ButtonWithDropdown(this.addButtonContainer, {
			...defaultButtonStyles,
			secondary: true,
			contextMenuProvider: this.contextMenuService,
			addPrimaryActionToDropdown: false,
			actions: { getActions: () => this.getAddDropdownActions() },
			title: addPluginLabel,
			ariaLabel: addPluginLabel,
		}));
		this.addButton.element.classList.add('list-add-button');
		this._register(this.addButton.onDidClick(() => this.runPrimaryAddAction()));

		const updatePluginsLabel = localize('updatePlugins', "Update Plugins");
		this.updatePluginsButton = this._register(new Button(this.buttonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: updatePluginsLabel, ariaLabel: updatePluginsLabel }));
		this.updatePluginsButton.element.classList.add('list-icon-button');
		this.updatePluginsButton.label = `$(${Codicon.refresh.id})`;
		this._register(this.updatePluginsButton.onDidClick(() => this.runUpdatePluginsAction()));

		this.treeTabs = this._register(new CustomizationTreeTabs(this.element, localize('pluginGroups', "Plugin Groups")));
		this._register(this.treeTabs.onDidSelect(groupKey => {
			this.selectedGroupKey = groupKey;
			this.renderPluginTree();
		}));

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

		this.cardContainer = $('.plugin-card-container');
		this.cardScrollable = this._register(new DomScrollableElement(this.cardContainer, {
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Auto,
			useShadows: false,
		}));
		this._register(DOM.addDisposableListener(this.cardContainer, DOM.EventType.SCROLL, () => {
			this.cardScrollable.setScrollPosition({ scrollTop: this.cardContainer.scrollTop });
		}));
		this.cardScrollableNode = this.cardScrollable.getDomNode();
		this.cardScrollableNode.classList.add('plugin-card-scrollable');
		this.cardScrollableNode.style.display = 'none';
		this.element.appendChild(this.cardScrollableNode);
		const cardResizeObserver = this._register(new DOM.DisposableResizeObserver(
			'PluginListWidget.cardScrollable',
			() => this.cardScrollable.scanDomNode(),
		));
		this._register(cardResizeObserver.observe(this.cardScrollableNode));

		// List container
		this.listContainer = DOM.append(this.element, $('.mcp-list-container.customization-tree-container'));

		// Section footer (removed — see section-title-header at top)

		// Create list
		const delegate = new PluginItemDelegate();
		const groupHeaderRenderer = new CustomizationGroupHeaderRenderer<IPluginGroupHeaderEntry>(
			'pluginGroupHeader',
			this.hoverService,
			(entry, container, disposables) => this.renderPluginTreeGroupActions(entry, container, disposables),
		);
		const searchHeaderRenderer = new PluginSearchHeaderRenderer();
		const installedRenderer = new PluginInstalledItemRenderer(this.harnessService, (item, container, actions, disposables) => this.renderInstalledListActions(item, container, actions, disposables), false);
		const remoteRenderer = new PluginRemoteItemRenderer((item, actions, disposables) => this.renderRemoteListActions(item, actions, disposables));
		const marketplaceRenderer = new PluginMarketplaceItemRenderer(this.pluginInstallService, this.agentPluginService, this.pluginMarketplaceService, this.notificationService);

		this.list = this._register(this.instantiationService.createInstance(
			WorkbenchObjectTree<IPluginListEntry>,
			'PluginManagementList',
			this.listContainer,
			delegate,
			[
				asTreeRenderer(groupHeaderRenderer),
				asTreeRenderer(searchHeaderRenderer),
				asTreeRenderer(installedRenderer),
				asTreeRenderer(remoteRenderer),
				asTreeRenderer(marketplaceRenderer),
			],
			{
				indent: 8,
				hideTwistiesOfChildlessElements: false,
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				horizontalScrolling: false,
				accessibilityProvider: {
					getAriaLabel: element => this.getPluginEntryAriaLabel(element),
					getWidgetAriaLabel: () => {
						return localize('pluginsListAriaLabel', "Plugins");
					}
				},
				openOnSingleClick: true,
				identityProvider: { getId: element => this.getPluginEntryId(element) },
			}
		));

		this._register(this.list.onDidOpen(e => {
			if (e.element) {
				if (e.element.type === 'group-header') {
					return;
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
		this._register(this.list.onDidChangeFocus(event => {
			const entry = event.elements[0];
			installedRenderer.setFocusedItemId(entry?.type === 'plugin-item' ? entry.item.plugin.uri.toString() : undefined);
			remoteRenderer.setFocusedItemId(entry?.type === 'remote-item' ? getRemotePluginEntryId(entry) : undefined);
			marketplaceRenderer.setFocusedItemId(entry?.type === 'marketplace-item' ? getMarketplacePluginEntryId(entry) : undefined);
		}));

		// Handle context menu
		this._register(this.list.onContextMenu(e => this.onContextMenu(e)));

		// Listen to plugin service changes
		this._register(autorun(reader => {
			this.agentPluginService.plugins.read(reader);
			void this.refresh();
		}));
		this._register(this.pluginMarketplaceService.onDidChangeMarketplaces(() => {
			this.marketplaceItems = [];
			this.marketplaceSnapshotCts?.dispose(true);
			this.marketplaceSnapshot.reset();
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

		this.marketplaceBackContainer.style.display = this.browseMode ? '' : 'none';
		this.browseButton.element.parentElement!.style.display = 'none';
		this.browseButton.label = `$(${Codicon.library.id}) ${localize('browseMarketplace', "Browse Marketplace")}`;
		this.browseButton.enabled = browseMarketplaceAvailable;
		const browseTitle = browseMarketplaceAvailable
			? localize('browseMarketplace', "Browse Marketplace")
			: localize('browseMarketplaceUnsupportedWeb', "Browse Marketplace is not available in VS Code for the Web.");
		this.browseButton.setTitle(browseTitle);
		this.browseButton.element.setAttribute('aria-label', browseTitle);

		this.addButton.element.style.display = 'none';
		this.addButtonSimple.element.style.display = 'none';
		this.updatePluginsButton.element.style.display = 'none';
		this.updateInstalledCreateButtonLabel();
	}

	private updateInstalledCreateButtonLabel(): void {
		if (this.installedCreateButton) {
			this.installedCreateButton.label = this.narrowLayout
				? localize('createPluginNarrow', "Create")
				: localize('createPlugin', "Create Plugin");
		}
	}

	private updateResponsiveLayout(width: number): void {
		const narrow = width < 500;
		const wide = width >= 600;
		if (this.narrowLayout === narrow) {
			if (this.wideLayout !== wide) {
				this.wideLayout = wide;
				this.element.classList.toggle('wide-layout', wide);
			}
			return;
		}
		this.narrowLayout = narrow;
		this.wideLayout = wide;
		this.element.classList.toggle('narrow-layout', narrow);
		this.element.classList.toggle('wide-layout', wide);
		this.updateToolbarActions();
	}

	private isBrowseMarketplaceAvailable(): boolean {
		return this.marketplaceBrowsingAvailable;
	}

	private buildAddActions(): readonly ICustomizationItemAction[] {
		return [
			...this.pluginActions,
			{
				id: 'plugin.installFromSource',
				label: localize('installFromSourceShort', "Install from Source"),
				tooltip: localize('installFromSource', "Install Plugin from Source"),
				run: async () => {
					const installed = await this.commandService.executeCommand<boolean>('workbench.action.chat.installPluginFromSource', { skipReveal: true });
					// Return to the installed list so the newly installed plugin is
					// visible — source-installed plugins may not appear in the marketplace.
					if (installed && this.browseMode) {
						this.exitBrowseMode();
					}
				},
			},
		];
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

	private async runUpdatePluginsAction(button = this.updatePluginsButton): Promise<void> {
		button.enabled = false;
		try {
			await this.commandService.executeCommand(UpdateAgentPluginsCommandId);
		} finally {
			button.enabled = true;
		}
	}

	private async runPluginAction(action: ICustomizationItemAction): Promise<void> {
		if (action.enabled !== false) {
			await action.run();
		}
	}

	private showEmptySurface(): void {
		this.cardScrollableNode.style.display = 'none';
		this.listContainer.style.display = 'none';
		this.emptyContainer.style.display = 'flex';
	}

	private addSurfaceActivation(surface: HTMLElement, label: string, callback: () => void, ...classNames: string[]): HTMLButtonElement {
		const primaryAction = createCustomizationCardPrimaryAction(surface, label, ...classNames);
		this.rememberCardFocusElement(primaryAction);
		this.cardDisposables.add(DOM.addDisposableListener(primaryAction, 'click', callback));
		return primaryAction;
	}

	private getPluginEntryAriaLabel(element: IPluginListEntry): string | IObservable<string> {
		if (element.type === 'group-header') {
			return localize('pluginGroupAriaLabel', "{0}, {1} items", element.label, element.count);
		}
		if (element.type === 'search-header') {
			return element.label;
		}
		const name = formatDisplayName(element.item.name);
		const description = element.item.description ? truncateToFirstLine(element.item.description) : undefined;
		const nameAndDescription = description ? localize('pluginItemAriaLabel', "{0}. {1}", name, description) : name;
		if (element.type === 'plugin-item') {
			const metadata = getInstalledPluginMetadata(element.item);
			const withMetadata = metadata ? localize('pluginInstalledItemAriaLabelWithMetadata', "{0}. {1}", nameAndDescription, metadata) : nameAndDescription;
			return derived(this, reader => isContributionEnabled(element.item.plugin.enablement.read(reader))
				? localize('pluginInstalledItemAriaLabelEnabled', "{0}. Enabled", withMetadata)
				: localize('pluginInstalledItemAriaLabelDisabled', "{0}. Disabled", withMetadata));
		}
		if (element.type === 'remote-item') {
			const statusLabel = getRemotePluginStatusLabel(element.item);
			return statusLabel
				? localize('pluginRemoteItemAriaLabelWithStatus', "{0}. Remote agent host. Status: {1}", nameAndDescription, statusLabel)
				: localize('pluginRemoteItemAriaLabel', "{0}. Remote agent host", nameAndDescription);
		}
		const marketplaceLabel = localize('pluginMarketplaceItemAriaLabel', "{0}. From {1}", nameAndDescription, element.item.marketplace);
		return this.pluginMarketplaceService.recommendedPlugins.get().has(getMarketplaceRecommendationKey(element.item))
			? localize('pluginMarketplaceItemAriaLabelRecommended', "{0}. Recommended for this workspace", marketplaceLabel)
			: marketplaceLabel;
	}

	private getPluginEntryId(element: IPluginListEntry): string {
		if (element.type === 'group-header' || element.type === 'search-header') {
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

	private renderInstalledListActions(item: IInstalledPluginItem, row: HTMLElement, actions: HTMLElement, disposables: DisposableStore): void {
		let renderedState = item.plugin.enablement.get();
		const toggle = disposables.add(this.instantiationService.createInstance(CustomizationToggle, { ariaLabel: item.name, checked: isContributionEnabled(renderedState) }));
		DOM.append(actions, toggle.domNode);
		disposables.add(DOM.addDisposableGenericMouseDownListener(toggle.domNode, event => DOM.EventHelper.stop(event, true)));
		const update = (state: ContributionEnablementState, policyEnablement: boolean | undefined) => {
			renderedState = state;
			const checked = isContributionEnabled(state);
			const managed = policyEnablement !== undefined;
			const workspaceScope = state === ContributionEnablementState.EnabledWorkspace || state === ContributionEnablementState.DisabledWorkspace;
			const toggleLabel = checked
				? (workspaceScope ? localize('excludePluginWorkspaceAria', "Exclude {0} from Workspace", item.name) : localize('excludePluginProfileAria', "Exclude {0} from Profile", item.name))
				: (workspaceScope ? localize('includePluginWorkspaceAria', "Include {0} in Workspace", item.name) : localize('includePluginProfileAria', "Include {0} for Profile", item.name));
			toggle.disabled = managed;
			toggle.checked = checked;
			toggle.setAriaLabel(
				managed ? localize('pluginManagedByOrganizationAria', "{0} is managed by your organization", item.name) : toggleLabel,
				managed ? localize('pluginPolicyBlockedSwitch', "This plugin is managed by your organization.") : toggleLabel,
			);
			row.classList.toggle('disabled', !checked);
		};
		disposables.add(autorun(reader => update(item.plugin.enablement.read(reader), getPluginPolicyEnablement(item.plugin, reader))));
		disposables.add(toggle.onChange(() => {
			const policyEnablement = getPluginPolicyEnablement(item.plugin);
			if (policyEnablement !== undefined) {
				update(renderedState, policyEnablement);
				return;
			}
			const nextState = getToggledPluginEnablementState(renderedState);
			const effectiveState = setPluginEnablementAndReadEffective(this.agentPluginService.enablementModel, item.plugin.uri.toString(), nextState);
			update(effectiveState, getPluginPolicyEnablement(item.plugin));
			status(localize('pluginInclusionChanged', "{0}. {1}.", item.name, getPluginInclusionLabel(item.plugin)));
		}));

		const more = disposables.add(new Button(actions, {
			...getButtonStyles({ buttonSecondaryBackground: undefined, buttonSecondaryBorder: undefined }),
			secondary: true,
			supportIcons: true,
			ariaLabel: localize('pluginMoreActionsAria', "More actions for {0}", item.name),
		}));
		more.element.classList.add('plugin-card-icon-button');
		more.label = `$(${Codicon.ellipsis.id})`;
		disposables.add(DOM.addDisposableGenericMouseDownListener(more.element, event => DOM.EventHelper.stop(event, true)));
		disposables.add(more.onDidClick(event => {
			DOM.EventHelper.stop(event, true);
			this.showInstalledPluginActions(item, more.element);
		}));
	}

	private renderRemoteListActions(item: ICustomizationItem, actions: HTMLElement, disposables: DisposableStore): void {
		if (!item.actions?.length) {
			actions.style.display = 'none';
			return;
		}
		actions.style.display = '';
		const more = disposables.add(new Button(actions, {
			...getButtonStyles({ buttonSecondaryBackground: undefined, buttonSecondaryBorder: undefined }),
			secondary: true,
			supportIcons: true,
			ariaLabel: localize('pluginMoreActionsAria', "More actions for {0}", item.name),
		}));
		more.element.classList.add('plugin-card-icon-button');
		more.label = `$(${Codicon.ellipsis.id})`;
		disposables.add(DOM.addDisposableGenericMouseDownListener(more.element, event => DOM.EventHelper.stop(event, true)));
		disposables.add(more.onDidClick(event => {
			DOM.EventHelper.stop(event, true);
			this.showRemotePluginActions(item, more.element);
		}));
	}

	private layoutPluginSectionLists(): void {
		const delegate = new PluginItemDelegate();
		const content = this.sectionLayoutContainer;
		if (!content) {
			return;
		}
		const heights = layoutVirtualizedSections(content, this.sectionLists.map(section => ({
			container: section.container,
			contentHeight: section.entries.reduce((height, entry) => height + delegate.getHeight(entry), 0),
			minimumHeight: getVirtualizedSectionMinimumHeight(section.entries, entry => delegate.getHeight(entry)),
		})));
		for (let index = 0; index < this.sectionLists.length; index++) {
			const section = this.sectionLists[index];
			const height = heights[index];
			layoutVirtualizedSectionList(section.list, section.container, height, section.container.clientWidth || undefined);
		}
	}

	private schedulePluginSectionLayout(): void {
		this.pendingSectionLayout.value = DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.element), () => {
			this.layoutPluginSectionLists();
			this.cardScrollable.scanDomNode();
		});
	}

	private renderPluginTree(): void {
		if (!this.treeTabs || !this.list) {
			return;
		}

		const layout = getCustomizationListLayout(this.configurationService);
		this.element.classList.toggle('tabs-layout', layout === CustomizationListLayout.Tabs);
		this.element.classList.toggle('tree-layout', layout === CustomizationListLayout.Tree);
		const partitionedInstalledItems = partitionInstalledPluginItemsByScope(this.installedItems);
		const installedEntries = this.installedItems.map(item => ({ type: 'plugin-item' as const, item }));
		const workspaceEntries = partitionedInstalledItems.workspace.map(item => ({ type: 'plugin-item' as const, item }));
		const userEntries = partitionedInstalledItems.user.map(item => ({ type: 'plugin-item' as const, item }));
		const installedNames = new Set(this.installedItems.map(item => item.name.toLowerCase()));
		const remoteEntries = this.remoteItems
			.filter(item => item.groupKey !== 'remote-client' && (!item.name || !installedNames.has(item.name.toLowerCase())))
			.map(item => ({ type: 'remote-item' as const, item }));
		const showLegacyMarketplace = shouldShowLegacyPluginMarketplace(this.configurationService);
		const availableItems = !showLegacyMarketplace ? [] : this.browseMode || this.searchQuery.trim()
			? this.marketplaceItems : this.getUninstalledMarketplaceItems(this.marketplaceSnapshot.items);
		const availableEntries = availableItems.map(item => ({ type: 'marketplace-item' as const, item }));
		const tabDefinitions = [
			{
				id: 'user',
				label: localize('userPluginsGroup', "User"),
				description: localize('userPluginsGroupDescription', "Plugins installed for your profile and available across workspaces."),
				icon: Codicon.account,
				children: userEntries,
			},
			{
				id: 'workspace',
				label: localize('workspacePluginsGroup', "Workspace"),
				description: localize('workspacePluginsGroupDescription', "Plugins included or excluded specifically for this workspace."),
				icon: Codicon.folder,
				children: workspaceEntries,
			},
			{
				id: 'remote',
				label: localize('remotePluginsSection', "Remote Session"),
				description: localize('remotePluginsSectionDescription', "Plugins configured directly on the active remote agent host."),
				icon: Codicon.remote,
				children: remoteEntries,
			},
			{
				id: 'available',
				label: localize('availablePluginsSection', "Available"),
				description: localize('availablePluginsSectionDescription', "Browse and install plugins from your marketplaces."),
				icon: Codicon.extensions,
				children: availableEntries,
			},
		].filter(group => (group.id === 'available' ? showLegacyMarketplace : group.id === 'user' || group.id === 'workspace' || group.children.length > 0));
		const definitions = layout === CustomizationListLayout.Tree
			? [
				{
					id: 'installed',
					label: localize('installedPluginsSection', "Installed"),
					description: localize('installedPluginsSectionDescription', "Plugins installed locally or configured by the active remote session."),
					icon: Codicon.plug,
					children: [...installedEntries, ...remoteEntries],
				},
				...tabDefinitions.filter(group => group.id === 'available'),
			]
			: tabDefinitions;

		this.currentTreeGroups = definitions.map((group, index): ICustomizationTreeGroup<IPluginListEntry> => {
			const element: IPluginGroupHeaderEntry = {
				type: 'group-header',
				id: `plugin-group-${group.id}`,
				group: group.id,
				label: group.label,
				icon: group.icon,
				count: group.children.length,
				isFirst: index === 0,
				description: group.description,
				collapsed: false,
			};
			return {
				id: group.id,
				label: group.label,
				description: group.description,
				count: group.children.length,
				element,
				children: group.children,
			};
		});

		this.cardScrollableNode.style.display = 'none';
		this.treeTabs.element.style.display = layout === CustomizationListLayout.Tabs ? '' : 'none';
		if (layout === CustomizationListLayout.Tabs) {
			const selected = getSelectedCustomizationGroup(this.currentTreeGroups, this.selectedGroupKey);
			this.selectedGroupKey = selected?.id;
			if (selected) {
				this.treeTabs.setGroups(this.currentTreeGroups, selected.id);
				this.list.setChildren(null, selected.children.map(element => ({ element })));
				this.updatePluginTabActions(selected.id);
				this.updatePluginTreeEmptyState(selected.children.length);
			}
		} else {
			this.buttonContainer.style.display = 'none';
			const children: IObjectTreeElement<IPluginListEntry>[] = this.currentTreeGroups.map(group => ({
				element: group.element,
				collapsible: true,
				collapsed: ObjectTreeElementCollapseState.PreserveOrExpanded,
				children: group.children.map(element => ({ element })),
			}));
			this.list.setChildren(null);
			this.list.setChildren(null, children);
			this.updateToolbarActions();
			this.updatePluginTreeEmptyState(this.currentTreeGroups.reduce((count, group) => count + group.children.length, 0));
		}
	}

	private updatePluginTabActions(groupId: string): void {
		this.treeTabs.clearActions();
		this.treeTabs.actionsElement.appendChild(this.buttonContainer);
		this.buttonContainer.style.display = '';
		this.updateToolbarActions();
		const available = groupId === 'available';
		const remote = groupId === 'remote';
		this.browseButton.element.parentElement!.style.display = available && this.isBrowseMarketplaceAvailable() ? '' : 'none';
		this.updatePluginAddButtons(!remote);
		this.updatePluginsButton.element.style.display = !available && !remote && this.pluginMarketplaceService.installedPlugins.get().length > 0 ? '' : 'none';
	}

	private renderPluginTreeGroupActions(entry: IPluginGroupHeaderEntry, container: HTMLElement, disposables: DisposableStore): void {
		if (getCustomizationListLayout(this.configurationService) !== CustomizationListLayout.Tree) {
			return;
		}
		if (entry.group === 'installed') {
			this.renderPluginAddAction(container, disposables);
			if (this.pluginMarketplaceService.installedPlugins.get().length > 0) {
				this.renderPluginUpdateAction(container, disposables);
			}
		} else if (entry.group === 'available') {
			this.renderPluginAddAction(container, disposables);
			if (this.isBrowseMarketplaceAvailable()) {
				this.renderBrowseMarketplaceAction(container, disposables);
			}
		}
	}

	private updatePluginAddButtons(visible: boolean): void {
		const actions = this.buildAddActions();
		const [primary, ...dropdown] = actions;
		this.addButtonContainer.style.display = visible && primary ? '' : 'none';
		this.addButton.element.style.display = visible && primary && dropdown.length > 0 ? '' : 'none';
		this.addButtonSimple.element.style.display = visible && primary && dropdown.length === 0 ? '' : 'none';
		if (!primary) {
			return;
		}
		const label = this.formatActionLabel(primary);
		if (dropdown.length > 0) {
			this.addButton.label = label;
			this.addButton.enabled = primary.enabled !== false;
		} else {
			this.addButtonSimple.label = label;
			this.addButtonSimple.enabled = primary.enabled !== false;
		}
	}

	private renderPluginAddAction(container: HTMLElement, disposables: DisposableStore): void {
		const actions = this.buildAddActions();
		const [primary, ...secondary] = actions;
		if (!primary) {
			return;
		}
		const label = this.formatActionLabel(primary);
		if (secondary.length > 0) {
			const secondaryActions = secondary.map((action, index) => disposables.add(new Action(
				`plugin_tree_add_${index}`,
				this.formatActionLabel(action),
				undefined,
				action.enabled !== false,
				() => this.runPluginAction(action),
			)));
			const button = disposables.add(new ButtonWithDropdown(container, {
				...defaultButtonStyles,
				secondary: true,
				contextMenuProvider: this.contextMenuService,
				addPrimaryActionToDropdown: false,
				actions: { getActions: () => secondaryActions },
				title: primary.tooltip ?? label,
				ariaLabel: primary.tooltip ?? label,
			}));
			button.element.classList.add('plugin-installed-action');
			button.label = label;
			button.enabled = primary.enabled !== false;
			disposables.add(button.onDidClick(() => this.runPluginAction(primary)));
			return;
		}
		const button = disposables.add(new Button(container, {
			...defaultButtonStyles,
			secondary: true,
			title: primary.tooltip ?? label,
			ariaLabel: primary.tooltip ?? label,
		}));
		button.element.classList.add('plugin-installed-action');
		button.label = label;
		button.enabled = primary.enabled !== false;
		disposables.add(button.onDidClick(() => this.runPluginAction(primary)));
	}

	private renderPluginUpdateAction(container: HTMLElement, disposables: DisposableStore): void {
		const label = localize('checkForAndApplyPluginUpdates', "Check for and Apply Updates");
		const button = disposables.add(new Button(container, {
			...defaultButtonStyles,
			secondary: true,
			supportIcons: true,
			title: label,
			ariaLabel: label,
		}));
		button.element.classList.add('plugin-card-icon-button', 'plugin-update-button');
		button.label = `$(${Codicon.refresh.id})`;
		disposables.add(button.onDidClick(() => this.runUpdatePluginsAction(button)));
	}

	private renderBrowseMarketplaceAction(container: HTMLElement, disposables: DisposableStore): void {
		const label = localize('browseMarketplace', "Browse Marketplace");
		const button = disposables.add(new Button(container, {
			...defaultButtonStyles,
			secondary: true,
			supportIcons: true,
			title: label,
			ariaLabel: label,
		}));
		button.element.classList.add('plugin-installed-action');
		button.label = `$(${Codicon.library.id}) ${label}`;
		disposables.add(button.onDidClick(() => this.toggleBrowseMode(true)));
	}

	private updatePluginTreeEmptyState(itemCount: number): void {
		const empty = itemCount === 0;
		this.listContainer.style.display = empty ? 'none' : '';
		this.emptyContainer.style.display = empty ? 'flex' : 'none';
		if (empty) {
			this.emptyText.textContent = this.searchQuery.trim()
				? localize('noMatchingPlugins', "No plugins match '{0}'", this.searchQuery)
				: localize('noPluginsInGroup', "No plugins in this group");
			this.emptySubtext.textContent = this.searchQuery.trim() ? localize('tryDifferentSearch', "Try a different search term") : '';
		}
	}

	private getVisiblePluginEntries(): readonly IPluginListEntry[] {
		const layout = getCustomizationListLayout(this.configurationService);
		if (layout === CustomizationListLayout.Tabs) {
			return getSelectedCustomizationGroup(this.currentTreeGroups, this.selectedGroupKey)?.children ?? [];
		}
		return this.currentTreeGroups.flatMap(group => [group.element, ...group.children]);
	}

	private renderPluginHome(): void {
		if (this.browseMode || this.searchQuery.trim()) {
			return;
		}

		this.renderPluginTree();

		if (shouldLoadPluginMarketplaceSnapshot(this.visible, this.marketplaceSnapshot.state, this.isBrowseMarketplaceAvailable() && shouldShowLegacyPluginMarketplace(this.configurationService))) {
			void this.queryMarketplaceSnapshot();
		}
	}

	protected appendInstalledPluginRow(parent: HTMLElement, item: IInstalledPluginItem): void {
		const row = DOM.append(parent, $('.plugin-list-item.plugin-home-row.plugin-installed-item'));
		const primaryAction = this.addSurfaceActivation(row, localize('installedPluginRowAriaLabel', "{0}. {1}", item.name, getPluginInclusionLabel(item.plugin)), () => this._onDidSelectPlugin.fire(item));

		const details = DOM.append(primaryAction, $('.plugin-list-item-details'));
		const nameRow = DOM.append(details, $('.plugin-list-item-name-row'));
		const name = DOM.append(nameRow, $('.plugin-list-item-name'));
		name.textContent = formatDisplayName(item.name);
		name.title = item.name;
		if (!item.marketplace) {
			const source = DOM.append(nameRow, $('.inline-badge.plugin-source-badge'));
			source.textContent = localize('pluginLocalSourceBadge', "Local");
			source.title = localize('pluginLocalSourceTooltip', "Installed from a local source");
		}

		const description = DOM.append(details, $('.plugin-list-item-description'));
		description.textContent = truncateToFirstLine(item.description || localize('pluginNoDescription', "No description provided."));
		const metadata = DOM.append(details, $('.plugin-list-item-metadata'));
		metadata.textContent = getInstalledPluginMetadata(item);
		metadata.style.display = metadata.textContent ? '' : 'none';

		const actions = DOM.append(row, $('.plugin-list-item-action'));
		const toggle = this.appendInstalledPluginToggle(actions, row, primaryAction, item);
		const more = this.cardDisposables.add(new Button(actions, { ...getButtonStyles({ buttonSecondaryBackground: undefined, buttonSecondaryBorder: undefined }), secondary: true, supportIcons: true, ariaLabel: localize('pluginMoreActionsAria', "More actions for {0}", item.name) }));
		more.element.classList.add('plugin-card-icon-button');
		more.label = `$(${Codicon.ellipsis.id})`;
		this.cardDisposables.add(more.onDidClick(() => this.showInstalledPluginActions(item, more.element)));
		this.cardListControllers.get(parent)?.addItem({
			row,
			primaryAction,
			label: item.name,
			actions: [toggle, more.element],
			contextMenuAction: more.element,
		});
	}

	private appendInstalledPluginToggle(parent: HTMLElement, row: HTMLElement, primaryAction: HTMLElement, item: IInstalledPluginItem): HTMLElement {
		let renderedState = item.plugin.enablement.get();
		const toggle = this.cardDisposables.add(this.instantiationService.createInstance(CustomizationToggle, { ariaLabel: item.name }));
		const switchElement = toggle.domNode;
		DOM.append(parent, switchElement);
		const update = (state: ContributionEnablementState, policyEnablement: boolean | undefined) => {
			renderedState = state;
			const checked = isContributionEnabled(state);
			const managed = policyEnablement !== undefined;
			const workspaceScope = state === ContributionEnablementState.EnabledWorkspace || state === ContributionEnablementState.DisabledWorkspace;
			const toggleLabel = checked
				? (workspaceScope ? localize('excludePluginWorkspaceAria', "Exclude {0} from Workspace", item.name) : localize('excludePluginProfileAria', "Exclude {0} from Profile", item.name))
				: (workspaceScope ? localize('includePluginWorkspaceAria', "Include {0} in Workspace", item.name) : localize('includePluginProfileAria', "Include {0} for Profile", item.name));
			const accessibleLabel = managed ? localize('pluginManagedByOrganizationAria', "{0} is managed by your organization", item.name) : toggleLabel;
			toggle.disabled = managed;
			toggle.checked = checked;
			toggle.setAriaLabel(accessibleLabel, managed ? localize('pluginPolicyBlockedSwitch', "This plugin is managed by your organization.") : toggleLabel);
			row.classList.toggle('disabled', !checked);
			primaryAction.setAttribute('aria-label', localize('installedPluginRowAriaLabel', "{0}. {1}", item.name, getPluginInclusionLabel(item.plugin)));
		};
		this.cardDisposables.add(autorun(reader => {
			const state = item.plugin.enablement.read(reader);
			update(state, getPluginPolicyEnablement(item.plugin, reader));
		}));
		this.cardDisposables.add(toggle.onChange(() => {
			const policyEnablement = getPluginPolicyEnablement(item.plugin);
			if (policyEnablement !== undefined) {
				update(renderedState, policyEnablement);
				return;
			}
			const nextState = getToggledPluginEnablementState(renderedState);
			const effectiveState = setPluginEnablementAndReadEffective(this.agentPluginService.enablementModel, item.plugin.uri.toString(), nextState);
			update(effectiveState, getPluginPolicyEnablement(item.plugin));
			status(localize('pluginInclusionChanged', "{0}. {1}.", item.name, getPluginInclusionLabel(item.plugin)));
		}));
		return switchElement;
	}

	protected appendRemotePluginRow(parent: HTMLElement, item: ICustomizationItem): void {
		const row = DOM.append(parent, $('.plugin-list-item.plugin-home-row.plugin-remote-item'));
		row.setAttribute('role', 'listitem');
		row.setAttribute('aria-label', localize('pluginRemoteCardAria', "{0}. Remote plugin", item.name));
		row.classList.toggle('disabled', item.enabled === false);

		const details = DOM.append(row, $('.plugin-list-item-details'));
		const nameRow = DOM.append(details, $('.plugin-list-item-name-row'));
		const name = DOM.append(nameRow, $('.plugin-list-item-name'));
		name.textContent = formatDisplayName(item.name);
		const source = DOM.append(nameRow, $('.inline-badge.plugin-source-badge'));
		source.textContent = localize('remotePluginSource', "Remote");
		source.title = localize('remotePluginMetadata', "Remote agent host");
		const description = DOM.append(details, $('.plugin-list-item-description'));
		description.textContent = item.description || localize('pluginNoDescription', "No description provided.");
		const metadata = DOM.append(details, $('.plugin-list-item-metadata'));
		metadata.textContent = localize('remotePluginConfigurationSource', "Configured on the active remote agent host");

		const status = DOM.append(row, $('.plugin-list-item-status'));
		const statusLabel = getRemotePluginStatusLabel(item);
		if (statusLabel) {
			status.textContent = statusLabel;
			status.classList.toggle('disabled', item.enabled === false || item.status === 'degraded' || item.status === 'error');
		} else {
			status.style.display = 'none';
		}
		let more: Button | undefined;
		if (item.actions?.length) {
			const actions = DOM.append(row, $('.plugin-list-item-action'));
			const moreButton = this.cardDisposables.add(new Button(actions, { ...defaultButtonStyles, secondary: true, supportIcons: true, ariaLabel: localize('pluginMoreActionsAria', "More actions for {0}", item.name) }));
			moreButton.element.classList.add('plugin-card-icon-button');
			moreButton.label = `$(${Codicon.ellipsis.id})`;
			this.rememberCardFocusElement(moreButton.element);
			this.cardDisposables.add(moreButton.onDidClick(() => this.showRemotePluginActions(item, moreButton.element)));
			more = moreButton;
		}
		this.cardListControllers.get(parent)?.addItem({
			row,
			primaryAction: row,
			label: item.name,
			actions: more ? [more.element] : [],
			contextMenuAction: more?.element,
		});
	}

	protected appendMarketplacePluginRow(parent: HTMLElement, item: IMarketplacePluginItem): void {
		const row = DOM.append(parent, $('.plugin-list-item.plugin-home-row.plugin-marketplace-home-row'));
		const primaryAction = this.addSurfaceActivation(row, localize('marketplacePluginRowAriaLabel', "{0}. Available to install from {1}.", item.name, item.marketplace), () => this._onDidSelectPlugin.fire(item));

		const details = DOM.append(primaryAction, $('.plugin-list-item-details'));
		const nameRow = DOM.append(details, $('.plugin-list-item-name-row'));
		const name = DOM.append(nameRow, $('.plugin-list-item-name'));
		name.textContent = item.name;
		name.title = item.name;
		const description = DOM.append(details, $('.plugin-list-item-description'));
		description.textContent = truncateToFirstLine(item.description || localize('pluginNoDescription', "No description provided."));

		const actions = DOM.append(row, $('.plugin-list-item-action'));
		const install = this.cardDisposables.add(new Button(actions, { ...defaultButtonStyles, secondary: true, ariaLabel: localize('installPluginAria', "Install {0}", item.name) }));
		install.element.classList.add('plugin-list-item-install-button');
		install.label = localize('install', "Install");
		this.cardDisposables.add(install.onDidClick(() => this.installMarketplacePlugin(item, install)));
		this.cardListControllers.get(parent)?.addItem({
			row,
			primaryAction,
			label: item.name,
			actions: [install.element],
		});
	}

	private rememberCardFocusElement(element: HTMLElement): void {
		this.firstCardFocusElement ??= element;
	}

	private getUninstalledMarketplaceItems(items: readonly IMarketplacePluginItem[] = this.marketplaceItems): IMarketplacePluginItem[] {
		const installedUris = new Set(this.agentPluginService.plugins.get().map(p => p.uri.toString()));
		return items.filter(item => {
			const expectedUri = this.pluginInstallService.getPluginInstallUri({
				name: item.name,
				description: item.description,
				version: item.version ?? '',
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
				version: item.version ?? '',
				sourceDescriptor: item.sourceDescriptor,
				source: item.source,
				marketplace: item.marketplace,
				marketplaceReference: item.marketplaceReference,
				marketplaceType: item.marketplaceType,
				readmeUri: item.readmeUri,
			});
			button.label = localize('installed', "Installed");
			void this.refresh();
		} catch (error) {
			button.label = localize('install', "Install");
			button.enabled = true;
			this.notificationService.error(localize('pluginInstallFailed', "Unable to install plugin: {0}", getErrorMessage(error)));
		}
	}

	private async queryMarketplaceSnapshot(): Promise<void> {
		if (!this.marketplaceSnapshot.beginLoading()) {
			return;
		}
		this.marketplaceSnapshotCts?.dispose(true);
		const cts = this.marketplaceSnapshotCts = new CancellationTokenSource();
		try {
			const plugins = await this.pluginMarketplaceService.fetchMarketplacePlugins(cts.token);
			if (this.marketplaceSnapshotCts !== cts) {
				return;
			}
			if (cts.token.isCancellationRequested) {
				this.marketplaceSnapshot.reset();
				return;
			}
			this.marketplaceSnapshot.complete(plugins.map(marketplacePluginToItem));
			if (!this.browseMode && !this.searchQuery.trim()) {
				this.renderPluginHome();
			}
		} catch {
			if (this.marketplaceSnapshotCts === cts && !cts.token.isCancellationRequested) {
				this.marketplaceSnapshot.fail();
				if (!this.browseMode && !this.searchQuery.trim()) {
					this.renderPluginHome();
				}
			}
		}
	}

	public showBrowseMarketplace(): void {
		if (!this.isBrowseMarketplaceAvailable() || !shouldShowLegacyPluginMarketplace(this.configurationService)) {
			return;
		}
		if (!this.browseMode) {
			this.toggleBrowseMode(true);
		}
	}

	setVisible(visible: boolean): void {
		if (this.visible === visible) {
			return;
		}
		this.visible = visible;
		if (visible) {
			void this.refresh();
		}
	}

	private toggleBrowseMode(browse: boolean): void {
		this.delayedMarketplaceSearch.cancel();
		this.marketplaceCts?.dispose(true);
		this.marketplaceCts = undefined;
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
			this.marketplaceItems = [];
			void this.filterPlugins();
		}

		// Re-layout to account for the back link height change
		if (this.lastHeight > 0) {
			this.layout(this.lastHeight, this.lastWidth);
		}
	}

	private async queryMarketplace(): Promise<void> {
		if (!shouldShowLegacyPluginMarketplace(this.configurationService)) {
			return;
		}
		this.marketplaceCts?.dispose(true);
		const cts = this.marketplaceCts = new CancellationTokenSource();
		const query = this.searchQuery.toLowerCase().trim();
		const browseMode = this.browseMode;

		// Show loading state
		this.showEmptySurface();
		this.emptyText.textContent = localize('loadingMarketplace', "Loading marketplace...");
		this.emptySubtext.textContent = '';

		try {
			const plugins = await this.pluginMarketplaceService.fetchMarketplacePlugins(cts.token);

			if (!this.isCurrentMarketplaceRequest(cts, query, browseMode)) {
				return;
			}

			if (query) {
				const allPlugins = this.agentPluginService.plugins.get();
				const installedItems = allPlugins
					.map(p => installedPluginToItem(p, this.labelService))
					.filter(item => item.name.toLowerCase().includes(query) || item.description.toLowerCase().includes(query))
					.sort(compareInstalledPluginItems);
				const remoteItems = [...await this.getRemotePluginItems(query)];
				if (!this.isCurrentMarketplaceRequest(cts, query, browseMode)) {
					return;
				}
				this.installedItems = installedItems;
				this.remoteItems = remoteItems;
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
			if (this.isCurrentMarketplaceRequest(cts, query, browseMode)) {
				this.marketplaceItems = [];
				this.showEmptySurface();
				this.emptyText.textContent = localize('marketplaceError', "Unable to load marketplace");
				this.emptySubtext.textContent = localize('tryAgainLater', "Check your connection and try again");
			}
		}
	}

	private async queryPluginSearch(): Promise<void> {
		if (!this.isBrowseMarketplaceAvailable() || !shouldShowLegacyPluginMarketplace(this.configurationService)) {
			this.marketplaceItems = [];
			await this.filterPlugins();
			return;
		}

		const query = this.searchQuery.toLowerCase().trim();
		if (!query || this.browseMode) {
			return;
		}
		this.marketplaceCts?.dispose(true);
		const cts = this.marketplaceCts = new CancellationTokenSource();
		try {
			const plugins = await this.pluginMarketplaceService.fetchMarketplacePlugins(cts.token);
			if (!this.isCurrentMarketplaceRequest(cts, query, false)) {
				return;
			}
			const installedItems = this.agentPluginService.plugins.get()
				.map(p => installedPluginToItem(p, this.labelService))
				.filter(item => item.name.toLowerCase().includes(query) || item.description.toLowerCase().includes(query))
				.sort(compareInstalledPluginItems);
			const remoteItems = [...await this.getRemotePluginItems(query)];
			if (!this.isCurrentMarketplaceRequest(cts, query, false)) {
				return;
			}
			const filtered = query
				? plugins.filter(p => p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query) || p.marketplace.toLowerCase().includes(query))
				: plugins;
			const installedUris = new Set(this.agentPluginService.plugins.get().map(p => p.uri.toString()));
			const marketplaceItems = filtered
				.filter(p => {
					const expectedUri = this.pluginInstallService.getPluginInstallUri(p);
					return !installedUris.has(expectedUri.toString());
				})
				.map(marketplacePluginToItem);
			if (!this.isCurrentMarketplaceRequest(cts, query, false)) {
				return;
			}
			this.installedItems = installedItems;
			this.remoteItems = remoteItems;
			this.marketplaceItems = marketplaceItems;
			this.searchInput.hideMessage();
		} catch {
			if (!this.isCurrentMarketplaceRequest(cts, query, false)) {
				return;
			}
			this.marketplaceItems = [];
			this.searchInput.showMessage({
				content: localize('pluginSearchMarketplaceUnavailable', "Marketplace results are unavailable. Showing installed plugins only."),
				type: MessageType.WARNING,
			});
			await this.filterPlugins();
			return;
		}
		if (this.isCurrentMarketplaceRequest(cts, query, false)) {
			this.updateSearchResultsList();
			this._onDidChangeItemCount.fire(this.itemCount);
		}
	}

	private isCurrentMarketplaceRequest(cts: CancellationTokenSource, query: string, browseMode: boolean): boolean {
		return isCurrentPluginMarketplaceRequest(
			query,
			this.searchQuery.toLowerCase().trim(),
			browseMode,
			this.browseMode,
			this.marketplaceCts === cts,
			cts.token.isCancellationRequested,
		);
	}

	private updateMarketplaceList(): void {
		this.selectedGroupKey = 'available';
		this.renderPluginTree();
	}

	private updateSearchResultsList(): void {
		this.renderPluginTree();
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
		const generation = ++this.filterGeneration;
		const query = this.searchQuery.toLowerCase().trim();
		const browseMode = this.browseMode;
		const allPlugins = this.agentPluginService.plugins.get();
		const remoteItems = [...await this.getRemotePluginItems(query)];
		if (generation !== this.filterGeneration || this.searchQuery.toLowerCase().trim() !== query || this.browseMode !== browseMode) {
			return;
		}
		this.remoteItems = remoteItems;

		this.installedItems = allPlugins
			.map(p => installedPluginToItem(p, this.labelService))
			.filter(item => !query ||
				item.name.toLowerCase().includes(query) ||
				item.description.toLowerCase().includes(query)
			)
			.sort(compareInstalledPluginItems);

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
		if (!this.visible || this.element.parentElement?.style.display === 'none') {
			return;
		}

		this.element.style.height = `${height}px`;
		this.updateResponsiveLayout(width);

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
		const backHeight = this.marketplaceBackContainer.offsetHeight;
		const tabsHeight = this.treeTabs.element.style.display === 'none' ? 0 : this.treeTabs.element.offsetHeight;
		const listHeight = Math.max(0, height - searchBarHeight - headerHeight - backHeight - tabsHeight);

		this.cardScrollableNode.style.height = `${listHeight}px`;
		this.listContainer.style.height = `${listHeight}px`;
		this.list.layout(listHeight, width);
		this.schedulePluginSectionLayout();
	}

	focusSearch(): void {
		this.searchInput.focus();
	}

	revealLastItem(): void {
		if (this.cardScrollableNode.style.display !== 'none') {
			const reveal = () => {
				const section = this.sectionLists.at(-1);
				if (section?.entries.length) {
					section.list.reveal(section.entries.length - 1);
				}
				this.cardScrollable.scanDomNode();
				this.cardScrollable.setScrollPosition({ scrollTop: this.cardContainer.scrollHeight });
			};
			reveal();
			this.revealLastItemScheduler.value = DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.element), reveal);
			return;
		}
		const entries = this.getVisiblePluginEntries();
		if (entries.length > 0) {
			this.list.reveal(entries[entries.length - 1]);
		}
	}

	focus(): void {
		if (this.cardScrollableNode.style.display !== 'none') {
			if (this.firstCardFocusElement) {
				this.firstCardFocusElement.focus();
			} else {
				const section = this.sectionLists[0];
				if (section?.entries.length) {
					section.list.setFocus([0]);
					section.list.domFocus();
				}
			}
		} else {
			const entries = this.getVisiblePluginEntries();
			if (entries.length === 0) {
				return;
			}
			this.list.domFocus();
			const firstItem = entries.find(entry => entry.type !== 'group-header');
			if (firstItem) {
				this.list.setFocus([firstItem]);
			}
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
			onHide: () => disposables.dispose(),
		});
	}

	private showRemotePluginActions(item: ICustomizationItem, anchor: HTMLElement): void {
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => this.getRemotePluginActions(item),
		});
	}

	private onContextMenu(e: IListContextMenuEvent<IPluginListEntry> | ITreeContextMenuEvent<IPluginListEntry | null>): void {
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
