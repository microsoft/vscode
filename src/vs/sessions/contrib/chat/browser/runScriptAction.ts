/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { MenuId, registerAction2, Action2, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IActiveSessionItem, ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { ITerminalService } from '../../../../workbench/contrib/terminal/browser/terminal.js';
import { Menus } from '../../../browser/menus.js';
import { ISessionsConfigurationService, ISessionScript } from './sessionsConfigurationService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';


// Menu IDs - exported for use in auxiliary bar part
export const RunScriptDropdownMenuId = MenuId.for('AgentSessionsRunScriptDropdown');

// Action IDs
const RUN_SCRIPT_ACTION_ID = 'workbench.action.agentSessions.runScript';
const CONFIGURE_DEFAULT_RUN_ACTION_ID = 'workbench.action.agentSessions.configureDefaultRunAction';

interface IRunScriptActionContext {
	readonly session: IActiveSessionItem;
	readonly scripts: readonly ISessionScript[];
	readonly cwd: URI;
}

/**
 * Workbench contribution that adds a split dropdown action to the auxiliary bar title
 * for running a custom command.
 */
export class RunScriptContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentSessions.runScript';

	private readonly _activeRunState: IObservable<IRunScriptActionContext | undefined>;

	constructor(
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ISessionsManagementService private readonly _activeSessionService: ISessionsManagementService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@ISessionsConfigurationService private readonly _sessionsConfigService: ISessionsConfigurationService,
	) {
		super();

		this._activeRunState = derived(this, reader => {
			const activeSession = this._activeSessionService.activeSession.read(reader);
			const cwd = activeSession?.worktree ?? activeSession?.repository;
			if (!activeSession || !cwd) {
				return undefined;
			}

			const scripts = this._sessionsConfigService.getScripts(activeSession).read(reader);
			return { session: activeSession, scripts, cwd };
		});

		this._registerActions();
	}

	private _registerActions(): void {
		const that = this;

		this._register(autorun(reader => {
			const activeSession = this._activeRunState.read(reader);
			if (!activeSession) {
				return;
			}

			const { scripts, cwd, session } = activeSession;
			const configureScriptPrecondition = session.worktree ? ContextKeyExpr.true() : ContextKeyExpr.false();

			if (scripts.length === 0) {
				// No scripts configured - show a "Run Script" button that opens the configure quick pick
				reader.store.add(registerAction2(class extends Action2 {
					constructor() {
						super({
							id: RUN_SCRIPT_ACTION_ID,
							title: localize('runScriptNoAction', "Run Script"),
							tooltip: localize('runScriptTooltipNoAction', "Configure run action"),
							icon: Codicon.play,
							category: localize2('agentSessions', 'Agent Sessions'),
							precondition: configureScriptPrecondition,
							menu: [{
								id: RunScriptDropdownMenuId,
								when: configureScriptPrecondition,
								group: 'navigation',
								order: 0,
							}]
						});
					}

					async run(): Promise<void> {
						await that._showConfigureQuickPick(session, cwd);
					}
				}));
			} else {
				// Register an action for each script
				for (let i = 0; i < scripts.length; i++) {
					const script = scripts[i];
					const actionId = `${RUN_SCRIPT_ACTION_ID}.${i}`;

					reader.store.add(registerAction2(class extends Action2 {
						constructor() {
							super({
								id: actionId,
								title: script.name,
								tooltip: localize('runScriptTooltip', "Run '{0}' in terminal", script.name),
								icon: Codicon.play,
								category: localize2('agentSessions', 'Agent Sessions'),
								menu: [{
									id: RunScriptDropdownMenuId,
									group: '0_scripts',
									order: i,
								}]
							});
						}

						async run(): Promise<void> {
							await that._runScript(cwd, script);
						}
					}));
				}
			}

			// Configure run action (always shown in dropdown)
			reader.store.add(registerAction2(class extends Action2 {
				constructor() {
					super({
						id: CONFIGURE_DEFAULT_RUN_ACTION_ID,
						title: localize2('configureDefaultRunAction', "Add Run Script..."),
						category: localize2('agentSessions', 'Agent Sessions'),
						icon: Codicon.add,
						precondition: configureScriptPrecondition,
						menu: [{
							id: RunScriptDropdownMenuId,
							group: '1_configure',
							order: 0
						}]
					});
				}

				async run(): Promise<void> {
					await that._showConfigureQuickPick(session, cwd);
				}
			}));
		}));
	}

	private async _showConfigureQuickPick(session: IActiveSessionItem, cwd: URI): Promise<void> {
		const command = await this._quickInputService.input({
			placeHolder: localize('enterCommandPlaceholder', "Enter command (e.g., npm run dev)"),
			prompt: localize('enterCommandPrompt', "This command will be run in the integrated terminal")
		});

		if (command) {
			const script: ISessionScript = { name: command, command };
			await this._sessionsConfigService.addScript(script, session);
			await this._runScript(cwd, script);
		}
	}

	private async _runScript(cwd: URI, script: ISessionScript): Promise<void> {
		const terminal = await this._terminalService.createTerminal({
			location: TerminalLocation.Panel,
			config: {
				name: script.name
			},
			cwd
		});

		terminal.sendText(script.command, true);
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
