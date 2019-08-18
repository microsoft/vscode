/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Mode, IEntryRunContext, IAutoFocus, IQuickNavigateConfiguration, IModel } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenModel, QuickOpenEntryGroup, QuickOpenEntry } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { QuickOpenHandler, QuickOpenAction } from 'vs/workbench/browser/quickopen';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IOutputService } from 'vs/workbench/contrib/output/common/output';
import { ITerminalService } from 'vs/workbench/contrib/terminal/common/terminal';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { Action } from 'vs/base/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { fuzzyContains, stripWildcards } from 'vs/base/common/strings';
import { matchesFuzzy } from 'vs/base/common/filters';
import { IViewsRegistry, ViewContainer, IViewsService, IViewContainersRegistry, Extensions as ViewExtensions } from 'vs/workbench/common/views';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ViewletDescriptor } from 'vs/workbench/browser/viewlet';
import { Registry } from 'vs/platform/registry/common/platform';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IStringDictionary } from 'vs/base/common/collections';

export const VIEW_PICKER_PREFIX = 'view ';

export class ViewEntry extends QuickOpenEntryGroup {

	constructor(
		private label: string,
		private category: string,
		private open: () => void
	) {
		super();
	}

	getLabel(): string {
		return this.label;
	}

	getCategory(): string {
		return this.category;
	}

	getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, view picker", this.getLabel());
	}

	run(mode: Mode, context: IEntryRunContext): boolean {
		if (mode === Mode.OPEN) {
			return this.runOpen(context);
		}

		return super.run(mode, context);
	}

	private runOpen(context: IEntryRunContext): boolean {
		setTimeout(() => {
			this.open();
		}, 0);

		return true;
	}
}

export class ViewPickerHandler extends QuickOpenHandler {

	static readonly ID = 'workbench.picker.views';

	constructor(
		@IViewletService private readonly viewletService: IViewletService,
		@IViewsService private readonly viewsService: IViewsService,
		@IOutputService private readonly outputService: IOutputService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@IPanelService private readonly panelService: IPanelService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();
	}

	getResults(searchValue: string, token: CancellationToken): Promise<QuickOpenModel> {
		searchValue = searchValue.trim();
		const normalizedSearchValueLowercase = stripWildcards(searchValue).toLowerCase();

		const viewEntries = this.getViewEntries();

		const entries = viewEntries.filter(e => {
			if (!searchValue) {
				return true;
			}

			const highlights = matchesFuzzy(normalizedSearchValueLowercase, e.getLabel(), true);
			if (highlights) {
				e.setHighlights(highlights);
			}

			if (!highlights && !fuzzyContains(e.getCategory(), normalizedSearchValueLowercase)) {
				return false;
			}

			return true;
		});

		const entryToCategory: IStringDictionary<string> = {};
		entries.forEach(e => {
			if (!entryToCategory[e.getLabel()]) {
				entryToCategory[e.getLabel()] = e.getCategory();
			}
		});

		let lastCategory: string;
		entries.forEach((e, index) => {
			if (lastCategory !== e.getCategory()) {
				lastCategory = e.getCategory();

				e.setShowBorder(index > 0);
				e.setGroupLabel(lastCategory);

				// When the entry category has a parent category, set group label as Parent / Child. For example, Views / Explorer.
				if (entryToCategory[lastCategory]) {
					e.setGroupLabel(`${entryToCategory[lastCategory]} / ${lastCategory}`);
				}
			} else {
				e.setShowBorder(false);
				e.setGroupLabel(undefined);
			}
		});

		return Promise.resolve(new QuickOpenModel(entries));
	}

	private getViewEntries(): ViewEntry[] {
		const viewEntries: ViewEntry[] = [];

		const getViewEntriesForViewlet = (viewlet: ViewletDescriptor, viewContainer: ViewContainer): ViewEntry[] => {
			const views = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).getViews(viewContainer);
			const result: ViewEntry[] = [];
			if (views.length) {
				for (const view of views) {
					if (this.contextKeyService.contextMatchesRules(view.when)) {
						result.push(new ViewEntry(view.name, viewlet.name, () => this.viewsService.openView(view.id, true)));
					}
				}
			}
			return result;
		};

		// Viewlets
		const viewlets = this.viewletService.getViewlets();
		viewlets.forEach((viewlet, index) => {
			if (this.hasToShowViewlet(viewlet)) {
				viewEntries.push(new ViewEntry(viewlet.name, nls.localize('views', "Side Bar"), () => this.viewletService.openViewlet(viewlet.id, true)));
			}
		});

		// Panels
		const panels = this.panelService.getPanels();
		panels.forEach((panel, index) => viewEntries.push(new ViewEntry(panel.name, nls.localize('panels', "Panel"), () => this.panelService.openPanel(panel.id, true))));

		// Viewlet Views
		viewlets.forEach((viewlet, index) => {
			const viewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).get(viewlet.id);
			if (viewContainer) {
				const viewEntriesForViewlet: ViewEntry[] = getViewEntriesForViewlet(viewlet, viewContainer);
				viewEntries.push(...viewEntriesForViewlet);
			}
		});

		// Terminals
		const terminalsCategory = nls.localize('terminals', "Terminal");
		this.terminalService.terminalTabs.forEach((tab, tabIndex) => {
			tab.terminalInstances.forEach((terminal, terminalIndex) => {
				const index = `${tabIndex + 1}.${terminalIndex + 1}`;
				const entry = new ViewEntry(nls.localize('terminalTitle', "{0}: {1}", index, terminal.title), terminalsCategory, () => {
					this.terminalService.showPanel(true).then(() => {
						this.terminalService.setActiveInstance(terminal);
					});
				});

				viewEntries.push(entry);
			});
		});

		// Output Channels
		const channels = this.outputService.getChannelDescriptors();
		channels.forEach((channel, index) => {
			const outputCategory = nls.localize('channels', "Output");
			const entry = new ViewEntry(channel.log ? nls.localize('logChannel', "Log ({0})", channel.label) : channel.label, outputCategory, () => this.outputService.showChannel(channel.id));

			viewEntries.push(entry);
		});

		return viewEntries;
	}

	private hasToShowViewlet(viewlet: ViewletDescriptor): boolean {
		const viewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).get(viewlet.id);
		if (viewContainer && viewContainer.hideIfEmpty) {
			const viewsCollection = this.viewsService.getViewDescriptors(viewContainer);
			return !!viewsCollection && viewsCollection.activeViewDescriptors.length > 0;
		}
		return true;
	}

	getAutoFocus(searchValue: string, context: { model: IModel<QuickOpenEntry>, quickNavigateConfiguration?: IQuickNavigateConfiguration }): IAutoFocus {
		return {
			autoFocusFirstEntry: !!searchValue || !!context.quickNavigateConfiguration
		};
	}
}

export class OpenViewPickerAction extends QuickOpenAction {

	static readonly ID = 'workbench.action.openView';
	static readonly LABEL = nls.localize('openView', "Open View");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService quickOpenService: IQuickOpenService
	) {
		super(id, label, VIEW_PICKER_PREFIX, quickOpenService);
	}
}

export class QuickOpenViewPickerAction extends Action {

	static readonly ID = 'workbench.action.quickOpenView';
	static readonly LABEL = nls.localize('quickOpenView', "Quick Open View");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private readonly quickOpenService: IQuickOpenService,
		@IKeybindingService private readonly keybindingService: IKeybindingService
	) {
		super(id, label);
	}

	run(): Promise<boolean> {
		const keys = this.keybindingService.lookupKeybindings(this.id);

		this.quickOpenService.show(VIEW_PICKER_PREFIX, { quickNavigateConfiguration: { keybindings: keys } });

		return Promise.resolve(true);
	}
}
