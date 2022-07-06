/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from 'vs/base/common/codicons';
import { CancellationToken } from 'vs/base/common/cancellation';
import { matchesFuzzy } from 'vs/base/common/filters';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { FastAndSlowPicks, IPickerQuickAccessItem, PickerQuickAccessProvider, Picks } from 'vs/platform/quickinput/browser/pickerQuickAccess';
import { IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { IViewsService } from 'vs/workbench/common/views';
import { DEBUG_CONSOLE_QUICK_ACCESS_PREFIX, SELECT_AND_START_ID } from 'vs/workbench/contrib/debug/browser/debugCommands';
import { IDebugService, IDebugSession, REPL_VIEW_ID } from 'vs/workbench/contrib/debug/common/debug';

export class DebugConsoleQuickAccess extends PickerQuickAccessProvider<IPickerQuickAccessItem> {

	constructor(
		@IDebugService private readonly _debugService: IDebugService,
		@IViewsService private readonly _viewsService: IViewsService,
		@ICommandService private readonly _commandService: ICommandService,
	) {
		super(DEBUG_CONSOLE_QUICK_ACCESS_PREFIX, { canAcceptInBackground: true });
	}

	protected _getPicks(filter: string, disposables: DisposableStore, token: CancellationToken): Picks<IPickerQuickAccessItem> | Promise<Picks<IPickerQuickAccessItem>> | FastAndSlowPicks<IPickerQuickAccessItem> | null {
		const debugConsolePicks: Array<IPickerQuickAccessItem | IQuickPickSeparator> = [];
		let currHeader: string | undefined;
		this._debugService.getModel().getSessions(false).forEach((session, index) => {



			if (!session.parentSession) {
				currHeader = session.name;
				debugConsolePicks.push({ type: 'separator', label: session.name });
			} else {
				const pick = this._createPick(session, filter, currHeader);
				if (pick) {
					debugConsolePicks.push(pick);
				}
			}
		});


		if (debugConsolePicks.length > 0) {
			debugConsolePicks.push({ type: 'separator' });
		}

		const createTerminalLabel = localize("workbench.action.debug.startDebug", "Start a New Debug Session");
		debugConsolePicks.push({
			label: `$(plus) ${createTerminalLabel}`,
			ariaLabel: createTerminalLabel,
			accept: () => this._commandService.executeCommand(SELECT_AND_START_ID)
		});
		return debugConsolePicks;
	}

	private _createParentTree(session: IDebugSession) {
		const parentTree = [];
		let currSession = session;

		while (currSession.parentSession !== undefined) {
			parentTree.push(currSession);
			currSession = currSession.parentSession;
		}
		return parentTree;
	}

	private getSessionHierarchyString(session: IDebugSession): { description: string; ariaLabel: string } {
		const parentTree = this._createParentTree(session);
		const allHierarchyStrings: String[] = [];
		parentTree.forEach((session) => allHierarchyStrings.push(session.configuration.name));
		const iconId = Codicon.arrowSmallLeft.id;
		let desc;
		let ariaLabel;
		const separatorAriaString = localize("workbench.action.debug.spawnFrom", "which was spawn from");

		if (allHierarchyStrings.length === 0) {
			return { description: '', ariaLabel: '' };
		}
		else if (allHierarchyStrings.length === 1) {
			desc = '';
			ariaLabel = '';
		} else {
			ariaLabel = allHierarchyStrings.join(` ${separatorAriaString} `);
			desc = `$(${iconId}) ` + allHierarchyStrings.splice(1).join(` $(${iconId}) `);
		}

		return { description: desc, ariaLabel: ariaLabel };
	}

	private _createPick(session: IDebugSession, filter: string, header: string | undefined): IPickerQuickAccessItem | undefined {
		let label = session.configuration.name;

		if (label.length === 0) {
			if (header) {
				label = session.name.replace(`${header}: `, '');
			} else {
				label = session.name;
			}
		}
		const labels = this.getSessionHierarchyString(session);
		const highlights = matchesFuzzy(filter, label, true);
		if (highlights) {
			return {
				label,
				description: labels.description,
				ariaLabel: labels.ariaLabel,
				highlights: { label: highlights },
				accept: (keyMod, event) => {
					this._debugService.focusStackFrame(undefined, undefined, session, { explicit: true });
					if (!this._viewsService.isViewVisible(REPL_VIEW_ID)) {
						this._viewsService.openView(REPL_VIEW_ID, true);
					}
				}
			};
		}
		return undefined;
	}
}
