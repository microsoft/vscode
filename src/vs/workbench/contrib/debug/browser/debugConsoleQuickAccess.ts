/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from 'vs/base/common/cancellation';
import { matchesFuzzy } from 'vs/base/common/filters';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { FastAndSlowPicks, IPickerQuickAccessItem, PickerQuickAccessProvider, Picks } from 'vs/platform/quickinput/browser/pickerQuickAccess';
import { IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';
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

		this._debugService.getModel().getSessions(true).filter(s => s.hasSeparateRepl()).forEach((session, index) => {
			const pick = this._createPick(session, index, filter);
			if (pick) {
				debugConsolePicks.push(pick);
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

	private _createPick(session: IDebugSession, sessionIndex: number, filter: string): IPickerQuickAccessItem | undefined {
		const label = session.name;

		const highlights = matchesFuzzy(filter, label, true);
		if (highlights) {
			return {
				label,
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
