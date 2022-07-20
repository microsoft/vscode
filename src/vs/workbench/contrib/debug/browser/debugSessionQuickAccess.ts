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
	private headerSessions: IDebugSession[] = [];
	constructor(
		@IDebugService private readonly _debugService: IDebugService,
		@IViewsService private readonly _viewsService: IViewsService,
		@ICommandService private readonly _commandService: ICommandService,
	) {
		super(DEBUG_CONSOLE_QUICK_ACCESS_PREFIX, { canAcceptInBackground: true });
	}

	protected _getPicks(filter: string, disposables: DisposableStore, token: CancellationToken): Picks<IPickerQuickAccessItem> | Promise<Picks<IPickerQuickAccessItem>> | FastAndSlowPicks<IPickerQuickAccessItem> | null {
		const debugConsolePicks: Array<IPickerQuickAccessItem | IQuickPickSeparator> = [];
		this.headerSessions = [];

		const sessions = this._debugService.getModel().getSessions(false);

		sessions.forEach((session) => {
			if (session.compact && session.parentSession) {
				this.headerSessions.push(session.parentSession);
			}
		});

		sessions.forEach((session, index) => {
			const isHeader = this._isHeaderSession(session);
			if (!session.parentSession) {
				debugConsolePicks.push({ type: 'separator', label: isHeader ? session.name : undefined });
			}

			if (!isHeader) {
				const pick = this._createPick(session, filter);
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

	private _isHeaderSession(session: IDebugSession) {
		return this.headerSessions.includes(session);
	}

	private _getSessionInfo(session: IDebugSession): { label: string; description: string; ariaLabel: string } {
		const label = session.configuration.name.length === 0 ? session.name : session.configuration.name;
		const parentName = this._isHeaderSession(session) ? session.parentSession?.configuration.name : undefined;
		let description;
		let ariaLabel;
		if (parentName) {
			const prefixAriaString = localize("workbench.action.debug.spawnFrom", "which was spawn from");
			ariaLabel = `${prefixAriaString} ${parentName}`;
			description = parentName;
		} else {
			description = '';
			ariaLabel = '';
		}

		return { label, description, ariaLabel };
	}

	private _createPick(session: IDebugSession, filter: string): IPickerQuickAccessItem | undefined {
		const pickInfo = this._getSessionInfo(session);
		const highlights = matchesFuzzy(filter, pickInfo.label, true);
		if (highlights) {
			return {
				label: pickInfo.label,
				description: pickInfo.description,
				ariaLabel: pickInfo.ariaLabel,
				highlights: { label: highlights },
				accept: () => {
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
