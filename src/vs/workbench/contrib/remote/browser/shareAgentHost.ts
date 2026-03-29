/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ITerminalService } from '../../../contrib/terminal/browser/terminal.js';

export class ShareAgentHostContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.shareAgentHost';
	static readonly COMMAND_ID = 'workbench.action.remote.shareAgentHost';

	constructor(
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@INotificationService private readonly notificationService: INotificationService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@ILogService private readonly logService: ILogService,
		@IProductService private readonly productService: IProductService,
		@ITerminalService private readonly terminalService: ITerminalService,
	) {
		super();
		this.registerCommand();
		this.registerMenuEntry();
	}

	private registerCommand(): void {
		this._register(CommandsRegistry.registerCommand(ShareAgentHostContribution.COMMAND_ID, async () => {
			await this.shareAgentHost();
		}));
	}

	private registerMenuEntry(): void {
		MenuRegistry.appendMenuItem(MenuId.StatusBarRemoteIndicatorMenu, {
			group: 'remote_90_agenthost_share',
			command: {
				id: ShareAgentHostContribution.COMMAND_ID,
				title: nls.localize('shareAgentHost', "Share Agent Host"),
			},
			order: 1
		});
	}

	private async shareAgentHost(): Promise<void> {
		try {
			// 1. Get GitHub token — needed for the agent host to register
			// itself with the host registry
			const githubToken = await this.getGitHubToken();
			if (!githubToken) {
				this.notificationService.notify({
					severity: Severity.Warning,
					message: nls.localize('shareAgentHost.noToken', "GitHub sign-in is required to share the agent host."),
				});
				return;
			}

			// 2. Start the agent host server in a terminal with self-registration.
			// The agent host server will:
			//   - Generate a secure connection token
			//   - Listen on a WebSocket port (8081)
			//   - Register itself with the host registry (including the token)
			//   - Heartbeat every 30s to keep the registration alive
			//   - Unregister on shutdown
			//   - Persist sessions in SQLite for continuity across restarts
			const registryUrl = this.getRegistryUrl();
			const hostName = this.getHostName();

			const command = [
				'VSCODE_SKIP_PRELAUNCH=1',
				'/Users/osvaldortega/Projects/vscode/scripts/code-agent-host.sh',
				'--registry-url', `'${registryUrl}'`,
				'--github-token', `'${githubToken}'`,
				'--host-name', `'${hostName}'`,
			].join(' ');

			this.logService.info('[ShareAgentHost] Starting agent host server with self-registration');

			const terminal = await this.terminalService.createTerminal({
				config: {
					name: 'Agent Host Server',
				},
			});
			terminal.sendText(command, true);

			// 3. Notify user
			const sessionsUrl = this.getSessionsBaseUrl();
			await this.clipboardService.writeText(sessionsUrl);

			this.notificationService.notify({
				severity: Severity.Info,
				message: nls.localize(
					'shareAgentHost.success',
					"Agent host starting! Open vscode.dev/sessions on any device and sign in with GitHub to connect."
				),
			});

		} catch (error) {
			this.logService.error('[ShareAgentHost] Failed to share agent host:', error);
			this.notificationService.notify({
				severity: Severity.Error,
				message: nls.localize('shareAgentHost.error', "Failed to share agent host: {0}", (error as Error).message),
			});
		}
	}

	private async getGitHubToken(): Promise<string | undefined> {
		try {
			let sessions = await this.authenticationService.getSessions('github', [], { silent: true });
			if (!sessions || sessions.length === 0) {
				sessions = await this.authenticationService.getSessions('github', [], { createIfNone: true });
			}
			return sessions?.[0]?.accessToken;
		} catch (error) {
			this.logService.warn('[ShareAgentHost] Failed to get GitHub token:', error);
			return undefined;
		}
	}

	private getRegistryUrl(): string {
		return 'http://127.0.0.1:3000/sessions/api/hosts';
	}

	private getSessionsBaseUrl(): string {
		return 'http://127.0.0.1:3000/sessions';
	}

	private getHostName(): string {
		const productName = this.productService.nameShort || 'VS Code';
		return `${productName} Dev Agent Host`;
	}
}
