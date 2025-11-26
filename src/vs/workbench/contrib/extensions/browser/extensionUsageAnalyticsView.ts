/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/extensionUsageAnalyticsView.css';
import { localize } from '../../../../nls.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { append, $ } from '../../../../base/browser/dom.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ViewPane, IViewPaneOptions, getLocationBasedViewColors } from '../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../browser/parts/views/viewsViewlet.js';
import { WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { IListVirtualDelegate, IListRenderer, IListContextMenuEvent } from '../../../../base/browser/ui/list/list.js';
import {
	IExtensionUsageAnalyticsService,
	IExtensionUsageRecord,
	UsageFrequency,
	UsageAnalyticsSortBy,
	UsageAnalyticsFilter
} from '../common/extensionUsageAnalytics.js';
import { IExtensionsWorkbenchService, IExtension } from '../common/extensions.js';
import { fromNow } from '../../../../base/common/date.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { Action, IAction, Separator } from '../../../../base/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';

interface IUsageAnalyticsItem {
	record: IExtensionUsageRecord;
	extension: IExtension | undefined;
	usageFrequency: UsageFrequency;
}

interface IUsageAnalyticsTemplateData {
	container: HTMLElement;
	icon: HTMLElement;
	nameContainer: HTMLElement;
	name: HTMLElement;
	extensionId: HTMLElement;
	statsContainer: HTMLElement;
	usageCount: HTMLElement;
	lastUsed: HTMLElement;
	disposables: DisposableStore;
}

class UsageAnalyticsDelegate implements IListVirtualDelegate<IUsageAnalyticsItem> {
	getHeight(): number {
		return 62;
	}

	getTemplateId(): string {
		return 'usageAnalyticsItem';
	}
}

class UsageAnalyticsRenderer implements IListRenderer<IUsageAnalyticsItem, IUsageAnalyticsTemplateData> {
	static readonly TEMPLATE_ID = 'usageAnalyticsItem';

	get templateId(): string {
		return UsageAnalyticsRenderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): IUsageAnalyticsTemplateData {
		container.classList.add('usage-analytics-item');

		const icon = append(container, $('.usage-indicator'));
		const contentContainer = append(container, $('.usage-content'));
		const nameContainer = append(contentContainer, $('.usage-name-container'));
		const name = append(nameContainer, $('.usage-name'));
		const extensionId = append(nameContainer, $('.usage-extension-id'));
		const statsContainer = append(contentContainer, $('.usage-stats'));
		const usageCount = append(statsContainer, $('.usage-count'));
		const lastUsed = append(statsContainer, $('.usage-last-used'));

		return {
			container,
			icon,
			nameContainer,
			name,
			extensionId,
			statsContainer,
			usageCount,
			lastUsed,
			disposables: new DisposableStore()
		};
	}

	renderElement(element: IUsageAnalyticsItem, _index: number, templateData: IUsageAnalyticsTemplateData): void {
		templateData.disposables.clear();

		// Usage indicator icon
		templateData.icon.className = 'usage-indicator';
		switch (element.usageFrequency) {
			case UsageFrequency.Frequent:
				templateData.icon.classList.add('frequent');
				// allow-any-unicode-next-line
				templateData.icon.textContent = '🟢';
				templateData.icon.title = localize('frequent', "Frequently used");
				break;
			case UsageFrequency.Occasional:
				templateData.icon.classList.add('occasional');
				// allow-any-unicode-next-line
				templateData.icon.textContent = '🟡';
				templateData.icon.title = localize('occasional', "Occasionally used");
				break;
			case UsageFrequency.Rare:
				templateData.icon.classList.add('rare');
				// allow-any-unicode-next-line
				templateData.icon.textContent = '🔴';
				templateData.icon.title = localize('rare', "Rarely or never used");
				break;
		}

		// Extension name
		const displayName = element.extension?.displayName || element.record.extensionId.split('.').pop() || element.record.extensionId;
		templateData.name.textContent = displayName;
		templateData.name.title = displayName;

		// Extension ID
		templateData.extensionId.textContent = element.record.extensionId;
		templateData.extensionId.title = element.record.extensionId;

		// Usage count
		const totalUsage = element.record.activationCount + element.record.commandExecutions;
		templateData.usageCount.textContent = localize('usageCount', "Used {0} times", totalUsage);

		// Last used
		const lastUsedTime = Math.max(element.record.lastActivated, element.record.lastCommandExecuted);
		if (lastUsedTime > 0) {
			templateData.lastUsed.textContent = localize('lastUsed', "Last: {0}", fromNow(lastUsedTime, true, true));
		} else {
			templateData.lastUsed.textContent = localize('neverUsed', "Never used");
		}
	}

	disposeTemplate(templateData: IUsageAnalyticsTemplateData): void {
		templateData.disposables.dispose();
	}
}

export class ExtensionUsageAnalyticsView extends ViewPane {

	static readonly ID = 'workbench.views.extensions.usageAnalytics';

	private list: WorkbenchList<IUsageAnalyticsItem> | undefined;
	private listContainer: HTMLElement | undefined;
	private messageContainer: HTMLElement | undefined;
	private items: IUsageAnalyticsItem[] = [];
	private sortBy: UsageAnalyticsSortBy = UsageAnalyticsSortBy.UsageCount;
	private filter: UsageAnalyticsFilter = UsageAnalyticsFilter.All;

	constructor(
		options: object,
		viewletViewOptions: IViewletViewOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IExtensionUsageAnalyticsService private readonly usageAnalyticsService: IExtensionUsageAnalyticsService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super(viewletViewOptions as IViewPaneOptions, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this._register(this.usageAnalyticsService.onDidChangeUsageData(() => this.refresh()));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		container.classList.add('extension-usage-analytics-view');

		this.messageContainer = append(container, $('.message-container'));
		this.listContainer = append(container, $('.usage-analytics-list'));

		const delegate = new UsageAnalyticsDelegate();
		const renderer = new UsageAnalyticsRenderer();

		this.list = this._register(this.instantiationService.createInstance(
			WorkbenchList,
			'ExtensionUsageAnalytics',
			this.listContainer,
			delegate,
			[renderer],
			{
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				horizontalScrolling: false,
				accessibilityProvider: {
					getAriaLabel: (item: IUsageAnalyticsItem) => {
						const totalUsage = item.record.activationCount + item.record.commandExecutions;
						return localize('usageAriaLabel', "{0}, used {1} times", item.record.extensionId, totalUsage);
					},
					getWidgetAriaLabel: () => localize('usageAnalytics', "Extension Usage Analytics")
				},
				overrideStyles: getLocationBasedViewColors(this.viewDescriptorService.getViewLocationById(this.id)).listOverrideStyles,
			}
		) as WorkbenchList<IUsageAnalyticsItem>);

		this._register(this.list.onDidOpen(e => {
			if (e.element) {
				this.openExtension(e.element);
			}
		}));

		this._register(this.list.onContextMenu(e => {
			if (e.element) {
				this.showContextMenu(e.element, e);
			}
		}));

		this.refresh();
	}

	private async refresh(): Promise<void> {
		if (!this.usageAnalyticsService.isEnabled()) {
			this.showMessage(localize('disabled', "Usage analytics is disabled. Enable it in settings."));
			return;
		}

		const records = this.usageAnalyticsService.getUsageRecords();
		const localExtensions = this.extensionsWorkbenchService.local;

		// Build items with extension info
		this.items = records.map(record => {
			const extension = localExtensions.find(ext =>
				ext.identifier.id.toLowerCase() === record.extensionId.toLowerCase()
			);
			return {
				record,
				extension,
				usageFrequency: this.usageAnalyticsService.getUsageFrequency(record.extensionId)
			};
		});

		// Apply filter
		this.items = this.applyFilter(this.items);

		// Apply sort
		this.items = this.applySort(this.items);

		if (this.items.length === 0) {
			this.showMessage(localize('noData', "No usage data yet. Use extensions to see analytics."));
		} else {
			this.hideMessage();
			this.list?.splice(0, this.list.length, this.items);
		}

		this.updateBadge();
	}

	private applyFilter(items: IUsageAnalyticsItem[]): IUsageAnalyticsItem[] {
		switch (this.filter) {
			case UsageAnalyticsFilter.FrequentlyUsed:
				return items.filter(i => i.usageFrequency === UsageFrequency.Frequent);
			case UsageAnalyticsFilter.OccasionallyUsed:
				return items.filter(i => i.usageFrequency === UsageFrequency.Occasional);
			case UsageAnalyticsFilter.RarelyUsed:
				return items.filter(i => i.usageFrequency === UsageFrequency.Rare);
			default:
				return items;
		}
	}

	private applySort(items: IUsageAnalyticsItem[]): IUsageAnalyticsItem[] {
		const sorted = [...items];
		switch (this.sortBy) {
			case UsageAnalyticsSortBy.UsageCount:
				sorted.sort((a, b) => {
					const aUsage = a.record.activationCount + a.record.commandExecutions;
					const bUsage = b.record.activationCount + b.record.commandExecutions;
					return bUsage - aUsage;
				});
				break;
			case UsageAnalyticsSortBy.LastUsed:
				sorted.sort((a, b) => {
					const aLast = Math.max(a.record.lastActivated, a.record.lastCommandExecuted);
					const bLast = Math.max(b.record.lastActivated, b.record.lastCommandExecuted);
					return bLast - aLast;
				});
				break;
			case UsageAnalyticsSortBy.Name:
				sorted.sort((a, b) => {
					const aName = a.extension?.displayName || a.record.extensionId;
					const bName = b.extension?.displayName || b.record.extensionId;
					return aName.localeCompare(bName);
				});
				break;
		}
		return sorted;
	}

	private showMessage(message: string): void {
		if (this.messageContainer) {
			this.messageContainer.style.display = 'flex';
			this.messageContainer.textContent = message;
		}
		if (this.listContainer) {
			this.listContainer.style.display = 'none';
		}
	}

	private hideMessage(): void {
		if (this.messageContainer) {
			this.messageContainer.style.display = 'none';
		}
		if (this.listContainer) {
			this.listContainer.style.display = 'block';
		}
	}

	private updateBadge(): void {
		// Badge showing count of rarely used extensions
		const rareCount = this.items.filter(i => i.usageFrequency === UsageFrequency.Rare).length;
		this.updateTitleDescription(rareCount > 0 ? localize('rareCount', "{0} rarely used", rareCount) : '');
	}

	private openExtension(item: IUsageAnalyticsItem): void {
		if (item.extension) {
			this.extensionsWorkbenchService.open(item.extension);
		}
	}

	private showContextMenu(item: IUsageAnalyticsItem, e: IListContextMenuEvent<IUsageAnalyticsItem>): void {
		const actions: IAction[] = [];

		if (item.extension) {
			actions.push(new Action(
				'extension.open',
				localize('openExtension', "Open Extension"),
				undefined,
				true,
				() => this.openExtension(item)
			));

			actions.push(new Separator());

			actions.push(new Action(
				'extension.disable',
				localize('disableExtension', "Disable Extension"),
				undefined,
				true,
				() => this.commandService.executeCommand('workbench.extensions.action.disableAll', item.record.extensionId)
			));

			actions.push(new Action(
				'extension.uninstall',
				localize('uninstallExtension', "Uninstall Extension"),
				undefined,
				true,
				() => this.commandService.executeCommand('workbench.extensions.uninstallExtension', item.record.extensionId)
			));
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => actions
		});
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.list?.layout(height, width);
	}

	getViewActions(): IAction[] {
		return [
			...this.getSortActions(),
			new Separator(),
			...this.getFilterActions(),
			new Separator(),
			this.getClearDataAction()
		];
	}

	private getSortActions(): IAction[] {
		return [
			new Action(
				'usageAnalytics.sortByUsage',
				localize('sortByUsage', "Sort by Usage"),
				this.sortBy === UsageAnalyticsSortBy.UsageCount ? ThemeIcon.asClassName(Codicon.check) : undefined,
				true,
				() => { this.sortBy = UsageAnalyticsSortBy.UsageCount; this.refresh(); }
			),
			new Action(
				'usageAnalytics.sortByLastUsed',
				localize('sortByLastUsed', "Sort by Last Used"),
				this.sortBy === UsageAnalyticsSortBy.LastUsed ? ThemeIcon.asClassName(Codicon.check) : undefined,
				true,
				() => { this.sortBy = UsageAnalyticsSortBy.LastUsed; this.refresh(); }
			),
			new Action(
				'usageAnalytics.sortByName',
				localize('sortByName', "Sort by Name"),
				this.sortBy === UsageAnalyticsSortBy.Name ? ThemeIcon.asClassName(Codicon.check) : undefined,
				true,
				() => { this.sortBy = UsageAnalyticsSortBy.Name; this.refresh(); }
			)
		];
	}

	private getFilterActions(): IAction[] {
		return [
			new Action(
				'usageAnalytics.filterAll',
				localize('filterAll', "Show All"),
				this.filter === UsageAnalyticsFilter.All ? ThemeIcon.asClassName(Codicon.check) : undefined,
				true,
				() => { this.filter = UsageAnalyticsFilter.All; this.refresh(); }
			),
			new Action(
				'usageAnalytics.filterFrequent',
				localize('filterFrequent', "Show Frequently Used"),
				this.filter === UsageAnalyticsFilter.FrequentlyUsed ? ThemeIcon.asClassName(Codicon.check) : undefined,
				true,
				() => { this.filter = UsageAnalyticsFilter.FrequentlyUsed; this.refresh(); }
			),
			new Action(
				'usageAnalytics.filterOccasional',
				localize('filterOccasional', "Show Occasionally Used"),
				this.filter === UsageAnalyticsFilter.OccasionallyUsed ? ThemeIcon.asClassName(Codicon.check) : undefined,
				true,
				() => { this.filter = UsageAnalyticsFilter.OccasionallyUsed; this.refresh(); }
			),
			new Action(
				'usageAnalytics.filterRare',
				localize('filterRare', "Show Rarely Used"),
				this.filter === UsageAnalyticsFilter.RarelyUsed ? ThemeIcon.asClassName(Codicon.check) : undefined,
				true,
				() => { this.filter = UsageAnalyticsFilter.RarelyUsed; this.refresh(); }
			)
		];
	}

	private getClearDataAction(): IAction {
		return new Action(
			'usageAnalytics.clearData',
			localize('clearData', "Clear Usage Data"),
			ThemeIcon.asClassName(Codicon.trash),
			true,
			() => this.usageAnalyticsService.clearAllData()
		);
	}
}

