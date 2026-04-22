/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { commands, window } from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { IAuthenticationChatUpgradeService } from '../../../platform/authentication/common/authenticationUpgrade';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { ILogService } from '../../../platform/log/common/logService';
import { Event } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';

/**
 * The main entry point for the authentication contribution.
 */
export class AuthenticationContrib extends Disposable {
	constructor(@IInstantiationService private readonly instantiationService: IInstantiationService) {
		super();
		this.askToUpgradeAuthPermissions();
	}
	private async askToUpgradeAuthPermissions() {
		const authUpgradeAsk = this._register(this.instantiationService.createInstance(AuthUpgradeAsk));
		await authUpgradeAsk.run();
	}
}

/**
 * This contribution ensures we have a token that is good enough for making API calls for current workspace.
 */
class AuthUpgradeAsk extends Disposable {
	private static readonly AUTH_UPGRADE_ASK_KEY = 'copilot.shownPermissiveTokenModal';

	constructor(
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@ILogService private readonly _logService: ILogService,
		@IVSCodeExtensionContext private readonly _extensionContext: IVSCodeExtensionContext,
		@IAuthenticationChatUpgradeService private readonly _authenticationChatUpgradeService: IAuthenticationChatUpgradeService,
	) {
		super();
		this._register(commands.registerCommand('github.copilot.chat.triggerPermissiveSignIn', async () => {
			await this._authenticationChatUpgradeService.showPermissiveSessionModal(true);
		}));
	}

	async run() {
		await this.waitForChatEnabled();
		this.registerListeners();
		await this.showPrompt();
	}

	private async waitForChatEnabled() {
		try {
			await this._authenticationService.getCopilotToken();
		} catch (error) {
			// likely due to the user canceling the auth flow
			this._logService.error(error, 'Failed to get copilot token');
		}

		await Event.toPromise(
			Event.filter(
				this._authenticationService.onDidAuthenticationChange,
				() => this._authenticationService.copilotToken !== undefined
			)
		);
	}

	private registerListeners() {
		this._register(this._authenticationService.onDidAuthenticationChange(async () => {
			if (this._authenticationService.permissiveGitHubSession) {
				return;
			}
			if (!this._authenticationService.anyGitHubSession) {
				// We signed out, so we should show the prompt again
				this._extensionContext.globalState.update(AuthUpgradeAsk.AUTH_UPGRADE_ASK_KEY, false);
				return;
			}
			if (window.state.focused) {
				await this.showPrompt();
			} else {
				// Wait for the window to get focus before trying to show the prompt
				const disposable = window.onDidChangeWindowState(async (e) => {
					if (e.focused) {
						disposable.dispose();
						await this.showPrompt();
					}
				});
			}
		}));
	}

	private async showPrompt() {
		if (
			// Already asked in a previous session
			this._extensionContext.globalState.get(AuthUpgradeAsk.AUTH_UPGRADE_ASK_KEY, false)
			// Some other criteria for not showing the prompt
			|| !(await this._authenticationChatUpgradeService.shouldRequestPermissiveSessionUpgrade())
		) {
			return;
		}
		if (await this._authenticationChatUpgradeService.showPermissiveSessionModal()) {
			this._logService.debug('Got permissive GitHub token');
		} else {
			this._logService.debug('Did not get permissive GitHub token');
		}
		this._extensionContext.globalState.update(AuthUpgradeAsk.AUTH_UPGRADE_ASK_KEY, true);
	}
}
