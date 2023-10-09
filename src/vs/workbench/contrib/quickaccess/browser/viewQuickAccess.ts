/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IQuickPickSeparator, IQuickInputService, ItemActivation } from 'vs/platform/quickinput/common/quickInput';
import { IPickerQuickAccessItem, PickerQuickAccessProvider } from 'vs/platform/quickinput/browser/pickerQuickAccess';
import { IViewDescriptorService, IViewsService, ViewContainer, ViewContainerLocation } from 'vs/workbench/common/views';
import { IOutputService } from 'vs/workbench/services/output/common/output';
import { ITerminalGroupService, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { PaneCompositeDescriptor } from 'vs/workbench/browser/panecomposite';
import { matchesFuzzy } from 'vs/base/common/filters';
import { fuzzyContains } from 'vs/base/common/strings';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { Action2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { IDebugService, REPL_VIEW_ID } from 'vs/workbench/contrib/debug/common/debug';

interface IViewQuickPickItem extends IPickerQuickAccessItem {
	containerLabel: string;
}

export class ViewQuickAccessProvider extends PickerQuickAccessProvider<IViewQuickPickItem> {

	static PREFIX = 'view ';

	constructor(
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IViewsService private readonly viewsService: IViewsService,
		@IOutputService private readonly outputService: IOutputService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@ITerminalGroupService private readonly terminalGroupService: ITerminalGroupService,
		@IDebugService private readonly debugService: IDebugService,
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super(ViewQuickAccessProvider.PREFIX, {
			noResultsPick: {
				label: localize('noViewResults', "No matching views"),
				containerLabel: ''
			}
		});
	}

	protected _getPicks(filter: string): Array<IViewQuickPickItem | IQuickPickSeparator> {
		const filteredViewEntries = this.doGetViewPickItems().filter(entry => {
			if (!filter) {
				return true;
			}

			// Match fuzzy on label
			entry.highlights = { label: matchesFuzzy(filter, entry.label, true) ?? undefined };

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

		const getViewEntriesForPaneComposite = (paneComposite: PaneCompositeDescriptor, viewContainer: ViewContainer): IViewQuickPickItem[] => {
			const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
			const result: IViewQuickPickItem[] = [];
			for (const view of viewContainerModel.allViewDescriptors) {
				if (this.contextKeyService.contextMatchesRules(view.when)) {
					result.push({
						label: view.name,
						containerLabel: viewContainerModel.title,
						accept: () => this.viewsService.openView(view.id, true)
					});
				}
			}

			return result;
		};

		const addPaneComposites = (location: ViewContainerLocation, containerLabel: string) => {
			const paneComposites = this.paneCompositeService.getPaneComposites(location);
			const visiblePaneCompositeIds = this.paneCompositeService.getVisiblePaneCompositeIds(location);

			paneComposites.sort((a, b) => {
				let aIndex = visiblePaneCompositeIds.findIndex(id => a.id === id);
				let bIndex = visiblePaneCompositeIds.findIndex(id => b.id === id);

				if (aIndex < 0) {
					aIndex = paneComposites.indexOf(a) + visiblePaneCompositeIds.length;
				}

				if (bIndex < 0) {
					bIndex = paneComposites.indexOf(b) + visiblePaneCompositeIds.length;
				}

				return aIndex - bIndex;
			});

			for (const paneComposite of paneComposites) {
				if (this.includeViewContainer(paneComposite)) {
					const viewContainer = this.viewDescriptorService.getViewContainerById(paneComposite.id);
					if (viewContainer) {
						viewEntries.push({
							label: this.viewDescriptorService.getViewContainerModel(viewContainer).title,
							containerLabel,
							accept: () => this.paneCompositeService.openPaneComposite(paneComposite.id, location, true)
						});
					}
				}
			}
		};

		// Viewlets / Panels
		addPaneComposites(ViewContainerLocation.Sidebar, localize('views', "Side Bar"));
		addPaneComposites(ViewContainerLocation.Panel, localize('panels', "Panel"));
		addPaneComposites(ViewContainerLocation.AuxiliaryBar, localize('secondary side bar', "Secondary Side Bar"));

		const addPaneCompositeViews = (location: ViewContainerLocation) => {
			const paneComposites = this.paneCompositeService.getPaneComposites(location);
			for (const paneComposite of paneComposites) {
				const viewContainer = this.viewDescriptorService.getViewContainerById(paneComposite.id);
				if (viewContainer) {
					viewEntries.push(...getViewEntriesForPaneComposite(paneComposite, viewContainer));
				}
			}
		};

		// Side Bar / Panel Views
		addPaneCompositeViews(ViewContainerLocation.Sidebar);
		addPaneCompositeViews(ViewContainerLocation.Panel);
		addPaneCompositeViews(ViewContainerLocation.AuxiliaryBar);

		// Terminals
		this.terminalGroupService.groups.forEach((group, groupIndex) => {
			group.terminalInstances.forEach((terminal, terminalIndex) => {
				const label = localize('terminalTitle', "{0}: {1}", `${groupIndex + 1}.${terminalIndex + 1}`, terminal.title);
				viewEntries.push({
					label,
					containerLabel: localize('terminals', "Terminal"),
					accept: async () => {
						await this.terminalGroupService.showPanel(true);
						this.terminalService.setActiveInstance(terminal);
					}
				});
			});
		});

		// Debug Consoles
		this.debugService.getModel().getSessions(true).filter(s => s.hasSeparateRepl()).forEach((session, _) => {
			const label = session.name;
			viewEntries.push({
				label,
				containerLabel: localize('debugConsoles', "Debug Console"),
				accept: async () => {
					await this.debugService.focusStackFrame(undefined, undefined, session, { explicit: true });

					if (!this.viewsService.isViewVisible(REPL_VIEW_ID)) {
						await this.viewsService.openView(REPL_VIEW_ID, true);
					}
				}
			});

		});

		// Output Channels
		const channels = this.outputService.getChannelDescriptors();
		for (const channel of channels) {
			viewEntries.push({
				label: channel.label,
				containerLabel: localize('channels', "Output"),
				accept: () => this.outputService.showChannel(channel.id)
			});
		}

		return viewEntries;
	}

	private includeViewContainer(container: PaneCompositeDescriptor): boolean {
		const viewContainer = this.viewDescriptorService.getViewContainerById(container.id);
		if (viewContainer?.hideIfEmpty) {
			return this.viewDescriptorService.getViewContainerModel(viewContainer).activeViewDescriptors.length > 0;
		}

		return true;
	}
}


//#region Actions

export class OpenViewPickerAction extends Action2 {

	static readonly ID = 'workbench.action.openView';

	constructor() {
		super({
			id: OpenViewPickerAction.ID,
			title: { value: localize('openView', "Open View"), original: 'Open View' },
			category: Categories.View,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		accessor.get(IQuickInputService).quickAccess.show(ViewQuickAccessProvider.PREFIX);
	}
}

export class QuickAccessViewPickerAction extends Action2 {

	static readonly ID = 'workbench.action.quickOpenView';
	static readonly KEYBINDING = {
		primary: KeyMod.CtrlCmd | KeyCode.KeyQ,
		mac: { primary: KeyMod.WinCtrl | KeyCode.KeyQ },
		linux: { primary: 0 }
	};

	constructor() {
		super({
			id: QuickAccessViewPickerAction.ID,
			title: { value: localize('quickOpenView', "Quick Open View"), original: 'Quick Open View' },
			category: Categories.View,
			f1: false, // hide quick pickers from command palette to not confuse with the other entry that shows a input field
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: undefined,
				...QuickAccessViewPickerAction.KEYBINDING
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const keybindingService = accessor.get(IKeybindingService);
		const quickInputService = accessor.get(IQuickInputService);

		const keys = keybindingService.lookupKeybindings(QuickAccessViewPickerAction.ID);

		quickInputService.quickAccess.show(ViewQuickAccessProvider.PREFIX, { quickNavigateConfiguration: { keybindings: keys }, itemActivation: ItemActivation.FIRST });
	}
}

//#endregion
