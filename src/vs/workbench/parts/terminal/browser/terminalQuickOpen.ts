/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { Mode, IEntryRunContext, IAutoFocus, IQuickNavigateConfiguration, IModel } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenModel, QuickOpenEntry } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { QuickOpenHandler } from 'vs/workbench/browser/quickopen';
import { ITerminalService } from 'vs/workbench/parts/terminal/common/terminal';
import { ContributableActionProvider } from 'vs/workbench/browser/actions';
import { stripWildcards } from 'vs/base/common/strings';
import { matchesFuzzy } from 'vs/base/common/filters';
import { ICommandService } from 'vs/platform/commands/common/commands';

export class TerminalEntry extends QuickOpenEntry {

	constructor(
		private label: string,
		private terminalService: ITerminalService
	) {
		super();
	}

	public getLabel(): string {
		return this.label;
	}

	public getAriaLabel(): string {
		return nls.localize('termEntryAriaLabel', "{0}, terminal picker", this.getLabel());
	}

	public run(mode: Mode, context: IEntryRunContext): boolean {
		if (mode === Mode.OPEN) {
			setTimeout(() => {
				this.terminalService.setActiveInstanceByIndex(parseInt(this.label.split(':')[0], 10) - 1);
				this.terminalService.showPanel(true);
			}, 0);
			return true;
		}

		return super.run(mode, context);
	}
}

export class CreateTerminal extends QuickOpenEntry {

	constructor(
		private label: string,
		private commandService: ICommandService
	) {
		super();
	}

	public getLabel(): string {
		return this.label;
	}

	public getAriaLabel(): string {
		return nls.localize('termCreateEntryAriaLabel', "{0}, create new terminal", this.getLabel());
	}

	public run(mode: Mode, context: IEntryRunContext): boolean {
		if (mode === Mode.OPEN) {
			setTimeout(() => this.commandService.executeCommand('workbench.action.terminal.new'), 0);
			return true;
		}

		return super.run(mode, context);
	}
}

export class TerminalPickerHandler extends QuickOpenHandler {

	public static readonly ID = 'workbench.picker.terminals';

	constructor(
		@ITerminalService private terminalService: ITerminalService,
		@ICommandService private commandService: ICommandService,
	) {
		super();
	}

	public getResults(searchValue: string): TPromise<QuickOpenModel> {
		searchValue = searchValue.trim();
		const normalizedSearchValueLowercase = stripWildcards(searchValue).toLowerCase();

		const terminalEntries: QuickOpenEntry[] = this.getTerminals();
		terminalEntries.push(new CreateTerminal(nls.localize("workbench.action.terminal.newplus", "$(plus) Create New Integrated Terminal"), this.commandService));

		const entries = terminalEntries.filter(e => {
			if (!searchValue) {
				return true;
			}

			const highlights = matchesFuzzy(normalizedSearchValueLowercase, e.getLabel(), true);
			if (!highlights) {
				return false;
			}

			e.setHighlights(highlights);

			return true;
		});

		return TPromise.as(new QuickOpenModel(entries, new ContributableActionProvider()));
	}

	private getTerminals(): TerminalEntry[] {
		const terminals = this.terminalService.getTabLabels();
		const terminalEntries = terminals.map(terminal => {
			return new TerminalEntry(terminal, this.terminalService);
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