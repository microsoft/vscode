/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import errors = require('vs/base/common/errors');
import strings = require('vs/base/common/strings');
import scorer = require('vs/base/common/scorer');
import { Mode, IEntryRunContext, IAutoFocus, IQuickNavigateConfiguration } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenModel, QuickOpenEntryGroup, QuickOpenEntry } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { QuickOpenHandler, QuickOpenAction } from 'vs/workbench/browser/quickopen';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IOutputService, OUTPUT_PANEL_ID } from 'vs/workbench/parts/output/common/output';
import { ITerminalService, TERMINAL_PANEL_ID } from 'vs/workbench/parts/terminal/common/terminal';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { Action } from 'vs/base/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

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

	constructor(
		@IViewletService private viewletService: IViewletService,
		@IOutputService private outputService: IOutputService,
		@ITerminalService private terminalService: ITerminalService,
		@IPanelService private panelService: IPanelService
	) {
		super();
	}

	public getResults(searchValue: string): TPromise<QuickOpenModel> {
		searchValue = searchValue.trim();
		const normalizedSearchValueLowercase = strings.stripWildcards(searchValue).toLowerCase();

		const viewEntries = this.getViewEntries();

		const entries = viewEntries.filter(e => {
			if (!searchValue) {
				return true;
			}

			if (!scorer.matches(e.getLabel(), normalizedSearchValueLowercase) && !scorer.matches(e.getCategory(), normalizedSearchValueLowercase)) {
				return false;
			}

			const {labelHighlights, descriptionHighlights} = QuickOpenEntry.highlight(e, searchValue);
			e.setHighlights(labelHighlights, descriptionHighlights);

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

		// Viewlets
		const viewlets = this.viewletService.getViewlets();
		viewlets.forEach((viewlet, index) => {
			const viewsCategory = nls.localize('views', "Views");
			const entry = new ViewEntry(viewlet.name, viewsCategory, () => this.viewletService.openViewlet(viewlet.id, true).done(null, errors.onUnexpectedError));
			viewEntries.push(entry);
		});

		const terminals = this.terminalService.terminalInstances;

		// Panels
		const panels = this.panelService.getPanels().filter(p => {
			if (p.id === OUTPUT_PANEL_ID) {
				return false; // since we already show output channels below
			}

			if (p.id === TERMINAL_PANEL_ID && terminals.length > 0) {
				return false; // since we already show terminal instances below
			}

			return true;
		});
		panels.forEach((panel, index) => {
			const panelsCategory = nls.localize('panels', "Panels");
			const entry = new ViewEntry(panel.name, panelsCategory, () => this.panelService.openPanel(panel.id, true).done(null, errors.onUnexpectedError));

			viewEntries.push(entry);
		});

		// Terminals
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
			const entry = new ViewEntry(channel.label, outputCategory, () => this.outputService.getChannel(channel.id).show().done(null, errors.onUnexpectedError));

			viewEntries.push(entry);
		});

		return viewEntries;
	}

	public getAutoFocus(searchValue: string, quickNavigateConfiguration: IQuickNavigateConfiguration): IAutoFocus {
		return {
			autoFocusFirstEntry: !!searchValue || !!quickNavigateConfiguration
		};
	}
}

export class OpenViewPickerAction extends QuickOpenAction {

	public static ID = 'workbench.action.openView';
	public static LABEL = nls.localize('openView', "Open View");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService quickOpenService: IQuickOpenService
	) {
		super(id, label, VIEW_PICKER_PREFIX, quickOpenService);
	}
}

export class QuickOpenViewPickerAction extends Action {

	public static ID = 'workbench.action.quickOpenView';
	public static LABEL = nls.localize('quickOpenView', "Quick Open View");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IKeybindingService private keybindingService: IKeybindingService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const keys = this.keybindingService.lookupKeybindings(this.id);

		this.quickOpenService.show(VIEW_PICKER_PREFIX, { quickNavigateConfiguration: { keybindings: keys } });

		return TPromise.as(true);
	}
}
