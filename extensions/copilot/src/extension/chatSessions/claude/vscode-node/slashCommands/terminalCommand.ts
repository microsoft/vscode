/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { ILogService } from '../../../../../platform/log/common/logService';
import { CapturingToken } from '../../../../../platform/requestLogger/common/capturingToken';
import { ITerminalService } from '../../../../../platform/terminal/common/terminalService';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { generateUuid } from '../../../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { ClaudeLanguageModelServer } from '../../node/claudeLanguageModelServer';
import { IClaudeSessionStateService } from '../../common/claudeSessionStateService';
import { IClaudeSlashCommandHandler, registerClaudeSlashCommand } from './claudeSlashCommandRegistry';

const execFileAsync = promisify(execFile);

/**
 * Slash command handler for creating a terminal session with Claude CLI configured
 * to use Copilot Chat's endpoints.
 *
 * This command starts a ClaudeLanguageModelServer instance (if not already running)
 * and creates a new terminal with ANTHROPIC_BASE_URL and ANTHROPIC_API_KEY environment
 * variables set to proxy requests through Copilot Chat's chat endpoints.
 *
 * ## Usage
 * 1. In a Claude Agent chat session, type `/terminal`
 * 2. A new terminal will be created with the environment variables configured
 * 3. Run `claude` in the terminal to start Claude Code
 * 4. Claude Code will use Copilot Chat's endpoints for all LLM requests
 *
 * ## Requirements
 * - Claude CLI (`claude`) must be installed and available in PATH
 * - The terminal inherits the environment with ANTHROPIC_BASE_URL and ANTHROPIC_API_KEY set
 * - The language model server runs on localhost with a random available port
 */
export class TerminalSlashCommand implements IClaudeSlashCommandHandler {
	readonly commandName = 'terminal';
	readonly description = vscode.l10n.t('Launch Claude Code CLI using your GitHub Copilot subscription');
	readonly commandId = 'copilot.claude.terminal';

	private _langModelServer: ClaudeLanguageModelServer | undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@IClaudeSessionStateService private readonly sessionStateService: IClaudeSessionStateService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	async handle(
		_args: string,
		stream: vscode.ChatResponseStream | undefined,
		_token: CancellationToken
	): Promise<vscode.ChatResult> {
		stream?.markdown(vscode.l10n.t('Creating Claude CLI instance...'));

		try {
			// Check which CLI is available
			const cliCommand = await this._getClaudeCliCommand();
			if (!cliCommand) {
				const installUrl = 'https://code.claude.com';
				const downloadLabel = vscode.l10n.t('Download Claude CLI');
				if (stream) {
					stream.markdown(vscode.l10n.t('Claude CLI is not installed. Download Claude CLI to get started.'));
					stream.button({ command: 'vscode.open', arguments: [vscode.Uri.parse(installUrl)], title: downloadLabel });
				} else {
					vscode.window.showErrorMessage(
						vscode.l10n.t('Claude CLI is not installed.'),
						downloadLabel
					).then(selection => {
						if (selection === downloadLabel) {
							vscode.env.openExternal(vscode.Uri.parse(installUrl));
						}
					});
				}
				return {};
			}

			// Get or create the language model server
			const server = await this._getLanguageModelServer();
			const config = server.getConfig();

			// Generate a unique session ID for this terminal session
			const sessionId = generateUuid();

			// Create terminal with environment variables configured
			const terminal = this.terminalService.createTerminal({
				name: 'Claude',
				message: formatMessageForTerminal(vscode.l10n.t('This instance of Claude CLI is configured to use your GitHub Copilot subscription.'), { loudFormatting: true }),
				env: {
					ANTHROPIC_BASE_URL: `http://localhost:${config.port}`,
					ANTHROPIC_AUTH_TOKEN: `${config.nonce}.${sessionId}`,
					// Hide account info banner in CLI since it's redundant with the message above
					CLAUDE_CODE_HIDE_ACCOUNT_INFO: '1',
				}
			});

			// Show the terminal
			terminal.show();

			// Send the appropriate command to the terminal with the session ID
			terminal.sendText(`${cliCommand} --session-id ${sessionId}`);

			// Set capturing token only after terminal is successfully created to avoid leaking stale session state
			this.sessionStateService.setCapturingTokenForSession(
				sessionId,
				new CapturingToken(`Claude CLI (${sessionId})`, 'claude')
			);

			this.logService.info(`[TerminalSlashCommand] Created terminal with Claude CLI configured on port ${config.port}, command: ${cliCommand}, sessionId: ${sessionId}`);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logService.error('[TerminalSlashCommand] Error creating terminal:', error);
			if (stream) {
				stream.markdown(vscode.l10n.t('Error creating terminal: {0}', errorMessage));
			} else {
				vscode.window.showErrorMessage(vscode.l10n.t('Error creating terminal: {0}', errorMessage));
			}
		}

		return {};
	}

	/**
	 * Check which Claude CLI command is available.
	 * Returns 'claude' if available, 'agency claude' if agency is available, or undefined if neither.
	 * TODO: support some way to specify custom path to CLI in case it's not in PATH
	 */
	private async _getClaudeCliCommand(): Promise<string | undefined> {
		const whichCommand = process.platform === 'win32' ? 'where' : 'which';

		// Check if 'claude' is available
		if (await this._isCommandAvailable(whichCommand, 'claude')) {
			return 'claude';
		}

		// Check if 'agency' is available (fallback)
		if (await this._isCommandAvailable(whichCommand, 'agency')) {
			return 'agency claude';
		}

		return undefined;
	}

	/**
	 * Check if a command is available in PATH
	 */
	private async _isCommandAvailable(whichCommand: string, command: string): Promise<boolean> {
		try {
			await execFileAsync(whichCommand, [command]);
			return true;
		} catch {
			return false;
		}
	}

	private async _getLanguageModelServer(): Promise<ClaudeLanguageModelServer> {
		if (!this._langModelServer) {
			this._langModelServer = this.instantiationService.createInstance(ClaudeLanguageModelServer);
			await this._langModelServer.start();
		}

		return this._langModelServer;
	}
}

// Taken from
// https://github.com/microsoft/vscode/blob/30cd06b93d47b98d2cfa7c32be721d3c20aa0761/src/vs/platform/terminal/common/terminalStrings.ts#L18-L34

export interface ITerminalFormatMessageOptions {
	/**
	 * Whether to exclude the new line at the start of the message. Defaults to false.
	 */
	excludeLeadingNewLine?: boolean;
	/**
	 * Whether to use "loud" formatting, this is for more important messages where the it's
	 * desirable to visually break the buffer up. Defaults to false.
	 */
	loudFormatting?: boolean;
}

/**
 * Formats a message from the product to be written to the terminal.
 */
export function formatMessageForTerminal(message: string, options: ITerminalFormatMessageOptions = {}): string {
	let result = '';
	if (!options.excludeLeadingNewLine) {
		result += '\r\n';
	}
	result += '\x1b[0m\x1b[7m * ';
	if (options.loudFormatting) {
		result += '\x1b[0;104m';
	} else {
		result += '\x1b[0m';
	}
	result += ` ${message} \x1b[0m\n\r`;
	return result;
}

registerClaudeSlashCommand(TerminalSlashCommand);
