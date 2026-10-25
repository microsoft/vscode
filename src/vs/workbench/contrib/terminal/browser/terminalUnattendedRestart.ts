/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { GeneralShellType, PosixShellType, TerminalShellType, WindowsShellType } from '../../../../platform/terminal/common/terminal.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IUnattendedRestartService } from '../../../services/lifecycle/common/unattendedRestart.js';
import { ITerminalConfigurationService, ITerminalService } from './terminal.js';

/**
 * Shells whose state is limited to what reviving a terminal restores. Any other process in
 * the terminal (a REPL, an ssh session, an agent CLI, an unknown program) would be lost.
 */
const INTERACTIVE_SHELLS: ReadonlySet<TerminalShellType> = new Set<TerminalShellType>([
	PosixShellType.Bash,
	PosixShellType.Csh,
	PosixShellType.Fish,
	PosixShellType.Ksh,
	PosixShellType.Sh,
	PosixShellType.Zsh,
	WindowsShellType.CommandPrompt,
	WindowsShellType.GitBash,
	WindowsShellType.Wsl,
	GeneralShellType.NuShell,
	GeneralShellType.PowerShell,
	GeneralShellType.Xonsh,
]);

/**
 * Blocks an unattended restart while a terminal runs anything but an idle shell, when a
 * terminal would not be revived after the restart, or when quitting would ask for confirmation.
 */
export class TerminalUnattendedRestartParticipant extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'terminal.unattendedRestartParticipant';

	constructor(
		@IUnattendedRestartService unattendedRestartService: IUnattendedRestartService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalConfigurationService private readonly _terminalConfigurationService: ITerminalConfigurationService,
	) {
		super();

		this._register(unattendedRestartService.registerParticipant({ check: () => this._check() }));
	}

	private _check(): string | undefined {
		const instances = this._terminalService.instances.filter(instance => !instance.isDisposed);
		if (instances.length === 0) {
			return undefined;
		}

		if (instances.some(instance => instance.hasChildProcesses || !INTERACTIVE_SHELLS.has(instance.shellType))) {
			return 'terminal.runningProcess';
		}

		const { enablePersistentSessions, persistentSessionReviveProcess, confirmOnExit } = this._terminalConfigurationService.config;
		if (confirmOnExit === 'always' && this._terminalService.foregroundInstances.length > 0) {
			return 'terminal.confirmOnExit';
		}

		if (!enablePersistentSessions || persistentSessionReviveProcess === 'never' || instances.some(instance => !instance.shouldPersist)) {
			return 'terminal.notRestorable';
		}

		return undefined;
	}
}
