/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Mode, IEntryRunContext, IAutoFocus, IQuickNavigateConfiguration, IModel } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenModel, QuickOpenEntry } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { QuickOpenHandler } from 'vs/workbench/browser/quickopen';
import { ITerminalService, ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ContributableActionProvider } from 'vs/workbench/browser/actions';
import { stripWildcards } from 'vs/base/common/strings';
import { matchesFuzzy } from 'vs/base/common/filters';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { CancellationToken } from 'vs/base/common/cancellation';

export class TerminalEntry extends QuickOpenEntry {

	constructor(
		public instance: ITerminalInstance,
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
				this.terminalService.setActiveInstance(this.instance);
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
		@ITerminalService private readonly terminalService: ITerminalService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();
	}

	public getResults(searchValue: string, token: CancellationToken): Promise<QuickOpenModel> {
		searchValue = searchValue.trim();
		const normalizedSearchValueLowercase = stripWildcards(searchValue).toLowerCase();

		const terminalEntries: QuickOpenEntry[] = this.getTerminals();
		terminalEntries.push(new CreateTerminal('$(plus) ' + nls.localize("workbench.action.terminal.newplus", "Create New Integrated Terminal"), this.commandService));

		const entries = terminalEntries.filter(e => {
			if (!searchValue) {
				return true;
			}

			const label = e.getLabel();
			if (!label) {
				return false;
			}
			const highlights = matchesFuzzy(normalizedSearchValueLowercase, label, true);
			if (!highlights) {
				return false;
			}

			e.setHighlights(highlights);

			return true;
		});

		return Promise.resolve(new QuickOpenModel(entries, new ContributableActionProvider()));
	}

	private getTerminals(): TerminalEntry[] {
		return this.terminalService.terminalTabs.reduce((terminals: TerminalEntry[], tab, tabIndex) => {
			const terminalsInTab = tab.terminalInstances.map((terminal, terminalIndex) => {
				const label = `${tabIndex + 1}.${terminalIndex + 1}: ${terminal.title}`;
				return new TerminalEntry(terminal, label, this.terminalService);
			});
			return [...terminals, ...terminalsInTab];
		}, []);
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
