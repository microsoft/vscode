/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { type ITerminalBackend } from '../../../../../platform/terminal/common/terminal.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../../../../common/contributions.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { ITerminalInstanceService } from '../../../terminal/browser/terminal.js';
import { TERMINAL_CONFIG_SECTION } from '../../../terminal/common/terminal.js';
import { TerminalAutoRepliesSettingId, type ITerminalAutoRepliesConfiguration } from '../common/terminalAutoRepliesConfiguration.js';

const enum Constants {
	/**
	 * How long shutdown waits for a backend to remove this window's auto replies. A pty host that
	 * never answers must not block quitting, reloading or closing the window.
	 */
	ShutdownCleanupTimeout = 2000
}

// #region Workbench contributions

export class TerminalAutoRepliesContribution extends Disposable implements IWorkbenchContribution {
	static ID = 'terminalAutoReplies';

	private readonly _ownerId = generateUuid();

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITerminalInstanceService terminalInstanceService: ITerminalInstanceService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
	) {
		super();

		for (const backend of terminalInstanceService.getRegisteredBackends()) {
			this._installListenersOnBackend(backend);
		}
		this._register(terminalInstanceService.onDidRegisterBackend(async e => this._installListenersOnBackend(e)));
	}

	private _installListenersOnBackend(backend: ITerminalBackend): void {
		// Only replies this window installed need removing on shutdown, so most windows never call
		// into the backend while shutting down
		let hasInstalledAutoReplies = false;

		// Listen for config changes
		const initialConfig = this._configurationService.getValue<ITerminalAutoRepliesConfiguration>(TERMINAL_CONFIG_SECTION);
		for (const match of Object.keys(initialConfig.autoReplies)) {
			// Ensure the reply is valid
			const reply = initialConfig.autoReplies[match] as string | null;
			if (reply) {
				backend.installAutoReply(match, reply, this._ownerId);
				hasInstalledAutoReplies = true;
			}
		}

		const configListener = this._register(this._configurationService.onDidChangeConfiguration(async e => {
			if (e.affectsConfiguration(TerminalAutoRepliesSettingId.AutoReplies)) {
				backend.uninstallAllAutoReplies(this._ownerId);
				const config = this._configurationService.getValue<ITerminalAutoRepliesConfiguration>(TERMINAL_CONFIG_SECTION);
				for (const match of Object.keys(config.autoReplies)) {
					// Ensure the reply is valid
					const reply = config.autoReplies[match] as string | null;
					if (reply) {
						backend.installAutoReply(match, reply, this._ownerId);
						hasInstalledAutoReplies = true;
					}
				}
			}
		}));
		this._register(this._lifecycleService.onWillShutdown(e => {
			configListener.dispose();
			if (!hasInstalledAutoReplies) {
				return;
			}
			// Finish while remote IPC is still connected, before the final disconnect joiner.
			e.join(raceTimeout(backend.uninstallAllAutoReplies(this._ownerId), Constants.ShutdownCleanupTimeout), {
				id: 'join.terminalAutoReplies',
				label: localize('removeTerminalAutoReplies', "Remove Terminal Auto Replies")
			});
		}));
	}
}

registerWorkbenchContribution2(TerminalAutoRepliesContribution.ID, TerminalAutoRepliesContribution, WorkbenchPhase.AfterRestored);

// #endregion Contributions
