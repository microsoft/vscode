/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import * as errors from 'vs/base/common/errors';
import { Mode, IEntryRunContext, IAutoFocus, IQuickNavigateConfiguration, IModel } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenModel, QuickOpenEntryGroup, QuickOpenEntry } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { QuickOpenHandler, QuickOpenAction } from 'vs/workbench/browser/quickopen';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IOutputService } from 'vs/workbench/parts/output/common/output';
import { ITerminalService } from 'vs/workbench/parts/terminal/common/terminal';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { Action } from 'vs/base/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { fuzzyContains, stripWildcards } from 'vs/base/common/strings';
import { matchesFuzzy } from 'vs/base/common/filters';
import { ViewsRegistry, ViewLocation, IViewsViewlet } from 'vs/workbench/common/views';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { VIEWLET_ID as EXPLORER_VIEWLET_ID } from 'vs/workbench/parts/files/common/files';
import { VIEWLET_ID as DEBUG_VIEWLET_ID } from 'vs/workbench/parts/debug/common/debug';
import { VIEWLET_ID as EXTENSIONS_VIEWLET_ID } from 'vs/workbench/parts/extensions/common/extensions';
import { ViewletDescriptor } from 'vs/workbench/browser/viewlet';

export const VIEW_PICKER_PREFIX = 'view ';

export class ViewEntry extends QuickOpenEntryGroup {

	constructor(
		private label: string,
		private category: string,
		private open: () => void
	) {
		super();
	}

	public getLabel(): string {
		return this.label;
	}

	public getCategory(): string {
		return this.category;
	}

	public getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, view picker", this.getLabel());
	}

	public run(mode: Mode, context: IEntryRunContext): boolean {
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

	public static readonly ID = 'workbench.picker.views';

	constructor(
		@IViewletService private viewletService: IViewletService,
		@IOutputService private outputService: IOutputService,
		@ITerminalService private terminalService: ITerminalService,
		@IPanelService private panelService: IPanelService,
		@IContextKeyService private contextKeyService: IContextKeyService,
	) {
		super();
	}

	public getResults(searchValue: string): TPromise<QuickOpenModel> {
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

		let lastCategory: string;
		entries.forEach((e, index) => {
			if (lastCategory !== e.getCategory()) {
				lastCategory = e.getCategory();

				e.setShowBorder(index > 0);
				e.setGroupLabel(lastCategory);
			} else {
				e.setShowBorder(false);
				e.setGroupLabel(void 0);
			}
		});

		return TPromise.as(new QuickOpenModel(entries));
	}

	private getViewEntries(): ViewEntry[] {
		const viewEntries: ViewEntry[] = [];

		const getViewEntriesForViewlet = (viewlet: ViewletDescriptor, viewLocation: ViewLocation): ViewEntry[] => {
			const views = ViewsRegistry.getViews(viewLocation);
			const result: ViewEntry[] = [];
			if (views.length) {
				for (const view of views) {
					if (this.contextKeyService.contextMatchesRules(view.when)) {
						result.push(new ViewEntry(view.name, viewlet.name, () => this.viewletService.openViewlet(viewlet.id, true).done(viewlet => (<IViewsViewlet>viewlet).openView(view.id, true), errors.onUnexpectedError)));
					}
				}
			}
			return result;
		};

		// Viewlets
		const viewlets = this.viewletService.getViewlets();
		viewlets.forEach((viewlet, index) => viewEntries.push(new ViewEntry(viewlet.name, nls.localize('views', "Views"), () => this.viewletService.openViewlet(viewlet.id, true).done(null, errors.onUnexpectedError))));

		// Panels
		const panels = this.panelService.getPanels();
		panels.forEach((panel, index) => viewEntries.push(new ViewEntry(panel.name, nls.localize('panels', "Panels"), () => this.panelService.openPanel(panel.id, true).done(null, errors.onUnexpectedError))));

		// Views
		viewlets.forEach((viewlet, index) => {
			const viewLocation: ViewLocation = ViewLocation.get(viewlet.id);
			if (viewLocation) {
				const viewEntriesForViewlet: ViewEntry[] = getViewEntriesForViewlet(viewlet, viewLocation);
				viewEntries.push(...viewEntriesForViewlet);
			}
		});

		// Terminals
		const terminals = this.terminalService.terminalInstances;
		terminals.forEach((terminal, index) => {
			const terminalsCategory = nls.localize('terminals', "Terminal");
			const entry = new ViewEntry(nls.localize('terminalTitle', "{0}: {1}", index + 1, terminal.title), terminalsCategory, () => {
				this.terminalService.showPanel(true).done(() => {
					this.terminalService.setActiveInstance(terminal);
				}, errors.onUnexpectedError);
			});

			viewEntries.push(entry);
		});

		// Output Channels
		const channels = this.outputService.getChannels();
		channels.forEach((channel, index) => {
			const outputCategory = nls.localize('channels', "Output");
			const entry = new ViewEntry(channel.label, outputCategory, () => this.outputService.showChannel(channel.id).done(null, errors.onUnexpectedError));

			viewEntries.push(entry);
		});

		return viewEntries;
	}

	public getAutoFocus(searchValue: string, context: { model: IModel<QuickOpenEntry>, quickNavigateConfiguration?: IQuickNavigateConfiguration }): IAutoFocus {
		return {
			autoFocusFirstEntry: !!searchValue || !!context.quickNavigateConfiguration
		};
	}
}

export class OpenViewPickerAction extends QuickOpenAction {

	public static readonly ID = 'workbench.action.openView';
	public static readonly LABEL = nls.localize('openView', "Open View");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService quickOpenService: IQuickOpenService
	) {
		super(id, label, VIEW_PICKER_PREFIX, quickOpenService);
	}
}

export class QuickOpenViewPickerAction extends Action {

	public static readonly ID = 'workbench.action.quickOpenView';
	public static readonly LABEL = nls.localize('quickOpenView', "Quick Open View");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IKeybindingService private keybindingService: IKeybindingService
	) {
		super(id, label);
	}

	public run(): TPromise<boolean> {
		const keys = this.keybindingService.lookupKeybindings(this.id);

		this.quickOpenService.show(VIEW_PICKER_PREFIX, { quickNavigateConfiguration: { keybindings: keys } });

		return TPromise.as(true);
	}
}
