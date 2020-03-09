/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { IQuickPick, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { IQuickAccessProvider } from 'vs/platform/quickinput/common/quickAccess';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IViewDescriptorService, IViewsService, ViewContainer, IViewsRegistry, Extensions as ViewExtensions, IViewContainersRegistry } from 'vs/workbench/common/views';
import { IOutputService } from 'vs/workbench/contrib/output/common/output';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ViewletDescriptor } from 'vs/workbench/browser/viewlet';
import { matchesFuzzy } from 'vs/base/common/filters';
import { fuzzyContains } from 'vs/base/common/strings';
import { withNullAsUndefined } from 'vs/base/common/types';

export const VIEW_QUICK_ACCESS_PREFIX = 'view ';

interface IViewQuickPickItem extends IQuickPickItem {
	containerLabel: string;
	run: () => Promise<unknown>;
}

export class ViewQuickAccessProvider implements IQuickAccessProvider {

	constructor(
		@IViewletService private readonly viewletService: IViewletService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IViewsService private readonly viewsService: IViewsService,
		@IOutputService private readonly outputService: IOutputService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@IPanelService private readonly panelService: IPanelService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
	}

	provide(picker: IQuickPick<IViewQuickPickItem>, token: CancellationToken): IDisposable {
		const disposables = new DisposableStore();

		// Disable filtering & sorting, we control the results
		picker.matchOnLabel = picker.matchOnDescription = picker.matchOnDetail = picker.sortByLabel = false;

		// Add all view items & filter on type
		const updatePickerItems = () => picker.items = this.getViewPickItems(picker.value.trim().substr(VIEW_QUICK_ACCESS_PREFIX.length));
		disposables.add(picker.onDidChangeValue(() => updatePickerItems()));
		updatePickerItems();

		// Open the picked view on accept
		disposables.add(picker.onDidAccept(() => {
			const [item] = picker.selectedItems;
			if (item) {
				picker.hide();
				item.run();
			}
		}));

		return disposables;
	}

	private getViewPickItems(filter: string): Array<IViewQuickPickItem | IQuickPickSeparator> {
		const filteredViewEntries = this.doGetViewPickItems().filter(entry => {
			if (!filter) {
				return true;
			}

			// Match fuzzy on label
			entry.highlights = { label: withNullAsUndefined(matchesFuzzy(filter, entry.label, true)) };

			// Return if we have a match on label or container
			return entry.highlights.label || fuzzyContains(entry.containerLabel, filter);
		});

		// Map entries to container labels
		const mapEntryToContainer = new Map<string, string>();
		for (const entry of filteredViewEntries) {
			if (!mapEntryToContainer.has(entry.label)) {
				mapEntryToContainer.set(entry.label, entry.containerLabel);
			}
		}

		// Add separators for containers
		const filteredViewEntriesWithSeparators: Array<IViewQuickPickItem | IQuickPickSeparator> = [];
		let lastContainer: string | undefined = undefined;
		for (const entry of filteredViewEntries) {
			if (lastContainer !== entry.containerLabel) {
				lastContainer = entry.containerLabel;

				// When the entry container has a parent container, set container
				// label as Parent / Child. For example, `Views / Explorer`.
				let separatorLabel: string;
				if (mapEntryToContainer.has(lastContainer)) {
					separatorLabel = `${mapEntryToContainer.get(lastContainer)} / ${lastContainer}`;
				} else {
					separatorLabel = lastContainer;
				}

				filteredViewEntriesWithSeparators.push({ type: 'separator', label: separatorLabel });

			}

			filteredViewEntriesWithSeparators.push(entry);
		}

		return filteredViewEntriesWithSeparators;
	}

	private doGetViewPickItems(): Array<IViewQuickPickItem> {
		const viewEntries: Array<IViewQuickPickItem> = [];

		const getViewEntriesForViewlet = (viewlet: ViewletDescriptor, viewContainer: ViewContainer): IViewQuickPickItem[] => {
			const views = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).getViews(viewContainer);
			const result: IViewQuickPickItem[] = [];
			for (const view of views) {
				if (this.contextKeyService.contextMatchesRules(view.when)) {
					result.push({
						label: view.name,
						containerLabel: viewlet.name,
						run: () => this.viewsService.openView(view.id, true)
					});
				}
			}

			return result;
		};

		// Viewlets
		const viewlets = this.viewletService.getViewlets();
		for (const viewlet of viewlets) {
			if (this.includeViewlet(viewlet)) {
				viewEntries.push({
					label: viewlet.name,
					containerLabel: localize('views', "Side Bar"),
					run: () => this.viewletService.openViewlet(viewlet.id, true)
				});
			}
		}

		// Panels
		const panels = this.panelService.getPanels();
		for (const panel of panels) {
			viewEntries.push({
				label: panel.name,
				containerLabel: localize('panels', "Panel"),
				run: () => this.panelService.openPanel(panel.id, true)
			});
		}

		// Viewlet Views
		for (const viewlet of viewlets) {
			const viewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).get(viewlet.id);
			if (viewContainer) {
				viewEntries.push(...getViewEntriesForViewlet(viewlet, viewContainer));
			}
		}

		// Terminals
		this.terminalService.terminalTabs.forEach((tab, tabIndex) => {
			tab.terminalInstances.forEach((terminal, terminalIndex) => {
				viewEntries.push({
					label: localize('terminalTitle', "{0}: {1}", `${tabIndex + 1}.${terminalIndex + 1}`, terminal.title),
					containerLabel: localize('terminals', "Terminal"),
					run: async () => {
						await this.terminalService.showPanel(true);

						return this.terminalService.setActiveInstance(terminal);
					}
				});
			});
		});

		// Output Channels
		const channels = this.outputService.getChannelDescriptors();
		for (const channel of channels) {
			viewEntries.push({
				label: channel.log ? localize('logChannel', "Log ({0})", channel.label) : channel.label,
				containerLabel: localize('channels', "Output"),
				run: () => this.outputService.showChannel(channel.id)
			});
		}

		// Add generic ARIA label
		viewEntries.forEach(entry => entry.ariaLabel = localize('entryAriaLabel', "{0}, view picker", entry.label));

		return viewEntries;
	}

	private includeViewlet(viewlet: ViewletDescriptor): boolean {
		const viewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).get(viewlet.id);
		if (viewContainer?.hideIfEmpty) {
			return this.viewDescriptorService.getViewDescriptors(viewContainer).activeViewDescriptors.length > 0;
		}

		return true;
	}
}
