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
import { ITerminalInstance, ITerminalService } from '../../../../workbench/contrib/terminal/browser/terminal.js';
import { Menus } from '../../../browser/menus.js';
import { ISessionsConfigurationService, ISessionScript } from './sessionsConfigurationService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';



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

	/** Maps `cwd.toString() + '\n' + script.command` to the terminal instance for reuse. */
	private readonly _scriptTerminals = new Map<string, number>();

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

		this._register(this._terminalService.onDidDisposeInstance(instance => {
			for (const [key, id] of this._scriptTerminals) {
				if (id === instance.instanceId) {
					this._scriptTerminals.delete(key);
					break;
				}
			}
		}));

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
			const addRunActionDisabledTooltip = session.worktree ? undefined : localize('configureScriptTooltipDisabled', "Actions can not be added in empty sessions");

			if (scripts.length === 0) {
				// No scripts configured - show a "Run Action" button that opens the configure quick pick
				reader.store.add(registerAction2(class extends Action2 {
					constructor() {
						super({
							id: RUN_SCRIPT_ACTION_ID,
							title: localize('runScriptNoAction', "Run Action..."),
							tooltip: localize('runScriptTooltipNoAction', "Configure action"),
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
								tooltip: localize('runActionTooltip', "Run '{0}' in terminal", script.name),
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
						title: localize2('configureDefaultRunAction', "Add Action..."),
						tooltip: addRunActionDisabledTooltip,
						category: localize2('agentSessions', 'Agent Sessions'),
						icon: Codicon.play,
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
		const key = this._terminalKey(cwd, script);
		let terminal = this._getReusableTerminal(key);

		if (!terminal) {
			terminal = await this._terminalService.createTerminal({
				location: TerminalLocation.Panel,
				config: {
					name: script.name
				},
				cwd
			});
			this._scriptTerminals.set(key, terminal.instanceId);
		}

		await terminal.sendText(script.command, true);
		this._terminalService.setActiveInstance(terminal);
		await this._terminalService.revealActiveTerminal();
	}

	private _terminalKey(cwd: URI, script: ISessionScript): string {
		return `${cwd.toString()}\n${script.command}`;
	}

	private _getReusableTerminal(key: string): ITerminalInstance | undefined {
		const instanceId = this._scriptTerminals.get(key);
		if (instanceId === undefined) {
			return undefined;
		}

		const instance = this._terminalService.getInstanceFromId(instanceId);
		if (!instance || instance.isDisposed || instance.exitCode !== undefined) {
			this._scriptTerminals.delete(key);
			return undefined;
		}

		// Only reuse if the cwd hasn't changed from the initial cwd and nothing is actively running
		if (instance.cwd !== instance.initialCwd || instance.hasChildProcesses) {
			this._scriptTerminals.delete(key);
			return undefined;
		}

		return instance;
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
	when: IsAuxiliaryWindowContext.toNegated()
});
