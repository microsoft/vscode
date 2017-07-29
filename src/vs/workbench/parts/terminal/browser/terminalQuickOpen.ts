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
import { ContributableActionProvider } from 'vs/workbench/browser/actions';

export class TerminalEntry extends QuickOpenEntryGroup {

	constructor(
		private label: string,
		private open: () => void
	) {
		super();
	}

	public getLabel(): string {
		return this.label;
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

			if (!scorer.matches(e.getLabel(), normalizedSearchValueLowercase)) {
				return false;
			}

			const { labelHighlights, descriptionHighlights } = QuickOpenEntry.highlight(e, searchValue);
			e.setHighlights(labelHighlights, descriptionHighlights);

			return true;
		});

		return TPromise.as(new QuickOpenModel(entries, new ContributableActionProvider()));
	}

	private getTerminals(): TerminalEntry[] {
		const terminals = this.terminalService.getInstanceLabels();
		const terminalEntries = terminals.map(terminal => {
			return new TerminalEntry(terminal, () => {
				this.terminalService.showPanel(true).done(() => {
					this.terminalService.setActiveInstanceByIndex(parseInt(terminal.split(':')[0], 10) - 1);
				}, errors.onUnexpectedError);
			});
		});
		return terminalEntries;
	}

	public getAutoFocus(searchValue: string, context: { model: IModel<QuickOpenEntry>, quickNavigateConfiguration?: IQuickNavigateConfiguration }): IAutoFocus {
		return {
			autoFocusFirstEntry: !!searchValue || !!context.quickNavigateConfiguration
		};
	}

	public getEmptyLabel(searchString: string): string {
		if (searchString.length > 0) {
			return nls.localize('noTerminalsMatching', "No terminals matching");
		}
		return nls.localize('noTerminalsFound', "No terminals open");
	}
}