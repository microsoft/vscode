/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableSignal } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { MenuId, registerAction2, Action2, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { ITerminalService } from '../../../../workbench/contrib/terminal/browser/terminal.js';
import { Menus } from '../../../browser/menus.js';


// Storage keys
const STORAGE_KEY_DEFAULT_RUN_ACTION = 'workbench.agentSessions.defaultRunAction';

// Menu IDs - exported for use in auxiliary bar part
export const RunScriptDropdownMenuId = MenuId.for('AgentSessionsRunScriptDropdown');

// Action IDs
const RUN_SCRIPT_ACTION_ID = 'workbench.action.agentSessions.runScript';
const CONFIGURE_DEFAULT_RUN_ACTION_ID = 'workbench.action.agentSessions.configureDefaultRunAction';

// Types for stored default action
interface IStoredRunAction {
	readonly name: string;
	readonly command: string;
}

interface IRunScriptActionContext {
	readonly storageKey: string;
	readonly action: IStoredRunAction | undefined;
	readonly cwd: URI;
}

/**
 * Workbench contribution that adds a split dropdown action to the auxiliary bar title
 * for running a custom command.
 */
export class RunScriptContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentSessions.runScript';

	private readonly _activeRunState: IObservable<IRunScriptActionContext | undefined>;
	private readonly _updateSignal = observableSignal(this);

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ISessionsManagementService activeSessionService: ISessionsManagementService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
	) {
		super();

		this._activeRunState = derived(this, reader => {
			const activeSession = activeSessionService.activeSession.read(reader);
			if (!activeSession || !activeSession.repository) {
				return undefined;
			}

			this._updateSignal.read(reader);
			const storageKey = `${STORAGE_KEY_DEFAULT_RUN_ACTION}.${activeSession.repository.toString()}`;
			const action = this._getStoredDefaultAction(storageKey);

			return {
				storageKey,
				action,
				cwd: activeSession.worktree ?? activeSession.repository
			};
		});

		this._registerActions();
	}

	private _getStoredDefaultAction(storageKey: string): IStoredRunAction | undefined {
		const stored = this._storageService.get(storageKey, StorageScope.WORKSPACE);
		if (stored) {
			try {
				const parsed = JSON.parse(stored);
				if (typeof parsed?.name === 'string' && typeof parsed?.command === 'string') {
					return parsed;
				}
			} catch {
				return undefined;
			}
		}
		return undefined;
	}

	private _setStoredDefaultAction(storageKey: string, action: IStoredRunAction): void {
		this._storageService.store(storageKey, JSON.stringify(action), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		this._updateSignal.trigger(undefined);
	}

	private _registerActions(): void {
		const that = this;

		// Main play action
		this._register(autorun(reader => {
			const activeSession = this._activeRunState.read(reader);
			if (!activeSession) {
				return;
			}

			const title = activeSession.action ? activeSession.action.name : localize('runScriptNoAction', "Run Script");
			const tooltip = activeSession.action ?
				localize('runScriptTooltip', "Run '{0}' in terminal", activeSession.action.name)
				: localize('runScriptTooltipNoAction', "Configure run action");

			reader.store.add(registerAction2(class extends Action2 {
				constructor() {
					super({
						id: RUN_SCRIPT_ACTION_ID,
						title: title,
						tooltip: tooltip,
						icon: Codicon.play,
						category: localize2('agentSessions', 'Agent Sessions'),
						menu: [{
							id: RunScriptDropdownMenuId,
							group: 'navigation',
							order: 0,
						}]
					});
				}

				async run(): Promise<void> {
					if (activeSession.action) {
						await that._runScript(activeSession.cwd, activeSession.action);
					} else {
						// Open quick pick to configure run action
						await that._showConfigureQuickPick(activeSession);
					}
				}
			}));

			// Configure run action (shown in dropdown)
			reader.store.add(registerAction2(class extends Action2 {
				constructor() {
					super({
						id: CONFIGURE_DEFAULT_RUN_ACTION_ID,
						title: localize2('configureDefaultRunAction', "Configure Run Action..."),
						category: localize2('agentSessions', 'Agent Sessions'),
						icon: Codicon.play,
						menu: [{
							id: RunScriptDropdownMenuId,
							group: '0_configure',
							order: 0
						}]
					});
				}

				async run(): Promise<void> {
					await that._showConfigureQuickPick(activeSession);
				}
			}));
		}));
	}

	private async _showConfigureQuickPick(activeSession: IRunScriptActionContext): Promise<void> {

		// Show input box for command
		const command = await this._quickInputService.input({
			placeHolder: localize('enterCommandPlaceholder', "Enter command (e.g., npm run dev)"),
			prompt: localize('enterCommandPrompt', "This command will be run in the integrated terminal")
		});

		if (command) {
			const storedAction: IStoredRunAction = {
				name: command,
				command
			};
			this._setStoredDefaultAction(activeSession.storageKey, storedAction);
			await this._runScript(activeSession.cwd, storedAction);
		}
	}

	private async _runScript(cwd: URI, action: IStoredRunAction): Promise<void> {
		// Create a new terminal and run the command
		const terminal = await this._terminalService.createTerminal({
			location: TerminalLocation.Panel,
			config: {
				name: action.name
			},
			cwd
		});

		terminal.sendText(action.command, true);
		await this._terminalService.revealTerminal(terminal);
	}
}

// Register the Run split button submenu on the workbench title bar
MenuRegistry.appendMenuItem(Menus.TitleBarRight, {
	submenu: RunScriptDropdownMenuId,
	isSplitButton: true,
	title: localize2('run', "Run"),
	icon: Codicon.play,
	group: 'navigation',
	order: 8,
});
