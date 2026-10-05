/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { type ITerminalBackend } from '../../../../../platform/terminal/common/terminal.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../../../../common/contributions.js';
import { ITerminalInstanceService } from '../../../terminal/browser/terminal.js';
import { TERMINAL_CONFIG_SECTION } from '../../../terminal/common/terminal.js';
import { TerminalAutoRepliesSettingId, type ITerminalAutoRepliesConfiguration } from '../common/terminalAutoRepliesConfiguration.js';

// #region Workbench contributions

export class TerminalAutoRepliesContribution extends Disposable implements IWorkbenchContribution {
	static ID = 'terminalAutoReplies';

	private readonly _ownerId = generateUuid();

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITerminalInstanceService terminalInstanceService: ITerminalInstanceService,
	) {
		super();

		for (const backend of terminalInstanceService.getRegisteredBackends()) {
			this._installListenersOnBackend(backend);
		}
		this._register(terminalInstanceService.onDidRegisterBackend(async e => this._installListenersOnBackend(e)));
	}

	private _installListenersOnBackend(backend: ITerminalBackend): void {
		this._register(toDisposable(() => { backend.uninstallAllAutoReplies(this._ownerId); }));

		// Listen for config changes
		const initialConfig = this._configurationService.getValue<ITerminalAutoRepliesConfiguration>(TERMINAL_CONFIG_SECTION);
		for (const match of Object.keys(initialConfig.autoReplies)) {
			// Ensure the reply is valid
			const reply = initialConfig.autoReplies[match] as string | null;
			if (reply) {
				backend.installAutoReply(match, reply, this._ownerId);
			}
		}

		this._register(this._configurationService.onDidChangeConfiguration(async e => {
			if (e.affectsConfiguration(TerminalAutoRepliesSettingId.AutoReplies)) {
				backend.uninstallAllAutoReplies(this._ownerId);
				const config = this._configurationService.getValue<ITerminalAutoRepliesConfiguration>(TERMINAL_CONFIG_SECTION);
				for (const match of Object.keys(config.autoReplies)) {
					// Ensure the reply is valid
					const reply = config.autoReplies[match] as string | null;
					if (reply) {
						backend.installAutoReply(match, reply, this._ownerId);
					}
				}
			}
		}));
	}
}

registerWorkbenchContribution2(TerminalAutoRepliesContribution.ID, TerminalAutoRepliesContribution, WorkbenchPhase.AfterRestored);

// #endregion Contributions
