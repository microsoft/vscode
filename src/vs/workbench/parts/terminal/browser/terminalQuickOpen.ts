/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import errors = require('vs/base/common/errors');
import strings = require('vs/base/common/strings');
import scorer = require('vs/base/common/scorer');
import { TPromise } from 'vs/base/common/winjs.base';
import { Mode, IEntryRunContext, IAutoFocus, IQuickNavigateConfiguration, IModel } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenModel, QuickOpenEntryGroup, QuickOpenEntry } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { QuickOpenHandler } from 'vs/workbench/browser/quickopen';
import { ITerminalService } from 'vs/workbench/parts/terminal/common/terminal';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';

export class TerminalEntry extends QuickOpenEntryGroup {

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
		return nls.localize('entryAriaLabel', "{0}, terminal picker", this.getLabel());
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

export class TerminalPickerHandler extends QuickOpenHandler {

	constructor(
		@ITerminalService private terminalService: ITerminalService,
		@IPanelService private panelService: IPanelService
	) {
		super();
	}

	public getResults(searchValue: string): TPromise<QuickOpenModel> {
		searchValue = searchValue.trim();
		const normalizedSearchValueLowercase = strings.stripWildcards(searchValue).toLowerCase();

		const terminalEntries = this.getTerminals();

		const entries = terminalEntries.filter(e => {
			if (!searchValue) {
				return true;
			}

			if (!scorer.matches(e.getLabel(), normalizedSearchValueLowercase) && !scorer.matches(e.getCategory(), normalizedSearchValueLowercase)) {
				return false;
			}

			const { labelHighlights, descriptionHighlights } = QuickOpenEntry.highlight(e, searchValue);
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
				e.setGroupLabel(null);
			}
		});

		return TPromise.as(new QuickOpenModel(entries));
	}

	private getTerminals(): TerminalEntry[] {
		const termninalEntries: TerminalEntry[] = [];
		const terminals = this.terminalService.getInstanceLabels();

		terminals.forEach((terminal, index) => {
			const terminalsCategory = nls.localize('terminals', "Terminal");
			termninalEntries.push(new TerminalEntry(terminal, terminalsCategory, () => {
				this.terminalService.showPanel(true).done(() => {
					this.terminalService.setActiveInstanceByIndex(parseInt(terminal.split(':')[0], 10) - 1);
				}, errors.onUnexpectedError);
			}));
		});
		return termninalEntries;
	}

	public getAutoFocus(searchValue: string, context: { model: IModel<QuickOpenEntry>, quickNavigateConfiguration?: IQuickNavigateConfiguration }): IAutoFocus {
		return {
			autoFocusFirstEntry: !!searchValue || !!context.quickNavigateConfiguration
		};
	}
}