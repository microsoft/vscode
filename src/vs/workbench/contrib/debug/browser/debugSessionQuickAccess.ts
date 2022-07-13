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
import { IViewsService } from 'vs/workbench/common/views';
import { DEBUG_CONSOLE_QUICK_ACCESS_PREFIX, SELECT_AND_START_ID } from 'vs/workbench/contrib/debug/browser/debugCommands';
import { IDebugService, IDebugSession, REPL_VIEW_ID } from 'vs/workbench/contrib/debug/common/debug';

export class DebugSessionQuickAccess extends PickerQuickAccessProvider<IPickerQuickAccessItem> {

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

	private _getNonRootParent(session: IDebugSession) {

		// don't return a parent if it's the launch task nane
		if (session.parentSession) {
			if (session.parentSession.parentSession) {
				return session.parentSession;
			}
		}
		return undefined;

	}
	private _getSessionParentString(session: IDebugSession): { description: string; ariaLabel: string } {
		const parentName = this._getNonRootParent(session)?.configuration.name;
		let desc;
		let ariaLabel;
		if (parentName) {
			const prefixAriaString = localize("workbench.action.debug.spawnFrom", "which was spawn from");
			ariaLabel = `${prefixAriaString} ${parentName}`;
			desc = parentName;
		} else {
			desc = '';
			ariaLabel = '';
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
		const labels = this._getSessionParentString(session);
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
