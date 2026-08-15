/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import type { CreateTerminalParams } from '../../common/state/protocol/commands.js';
import { TerminalClaimKind, type TerminalSessionClaim } from '../../common/state/protocol/state.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { isAhpChatChannel, parseRequiredSessionUriFromChatUri, ToolCallConfirmationReason, ToolResultContentType, type ToolResultContent, type URI as ProtocolURI } from '../../common/state/sessionState.js';
import { parseBangCommand } from '../agentHostBangCommand.js';
import { DEFAULT_SHELL_COMMAND_TIMEOUT_MS, executeShellCommand, shellTypeForExecutable, type IShellCommandResult } from '../shared/shellCommandExecution.js';
import { ILocalChatCommand, ILocalChatCommandContext, ILocalChatCommandHandling, ILocalChatCommandRequest, LocalChatCommandRegistry } from './localChatCommand.js';

/**
 * The generic `!command` command: runs the message as a terminal command via
 * the {@link IAgentHostTerminalManager} shell integration and surfaces it as a
 * terminal tool call in the transcript, instead of forwarding it to the agent
 * SDK. Runs immediately (the user typed it explicitly — no confirmation).
 */
export class BangLocalCommand extends Disposable implements ILocalChatCommand {

	readonly name = 'bang';
	readonly recordsLocalTurn = true;

	/** Terminals kept alive for transcript output; disposed with this command. */
	private readonly _terminals = new Set<string>();

	constructor(private readonly _context: ILocalChatCommandContext) {
		super();
		this._register(toDisposable(() => {
			for (const terminalUri of this._terminals) {
				this._context.terminalManager.disposeTerminal(terminalUri);
			}
			this._terminals.clear();
		}));
	}

	tryHandle(request: ILocalChatCommandRequest): ILocalChatCommandHandling | undefined {
		const command = parseBangCommand(request.text);
		if (command === undefined) {
			return undefined;
		}
		// The raw command doubles as a provisional title so a brand-new session
		// isn't left untitled until the first real (non-command) request.
		return { run: () => this._run(request.turnChannel, request.turnId, command), suggestedTitle: command };
	}

	private async _run(turnChannel: ProtocolURI, turnId: string, command: string): Promise<void> {
		const ctx = this._context;
		const sessionChannel = isAhpChatChannel(turnChannel) ? parseRequiredSessionUriFromChatUri(turnChannel) : turnChannel;
		const toolCallId = generateUuid();
		const terminalUri = `agenthost-terminal://bang/${generateUuid()}`;
		const displayName = localize('agentHostBang.terminal', "Terminal");
		let terminalCreated = false;
		try {
			const workingDirStr = ctx.getState(sessionChannel)?.workingDirectories?.[0];
			const cwd = workingDirStr ? URI.parse(workingDirStr).fsPath : undefined;
			const shellPath = await ctx.terminalManager.getDefaultShell();
			const shellType = shellTypeForExecutable(shellPath);

			// Surface the command as a tool call and transition it straight to
			// running — the user typed it explicitly, so no confirmation.
			ctx.dispatch(turnChannel, {
				type: ActionType.ChatToolCallStart,
				turnId,
				toolCallId,
				toolName: 'terminal',
				displayName,
				intention: command,
			});
			ctx.dispatch(turnChannel, {
				type: ActionType.ChatToolCallReady,
				turnId,
				toolCallId,
				invocationMessage: command,
				toolInput: command,
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});

			const claim: TerminalSessionClaim = {
				kind: TerminalClaimKind.Session,
				session: sessionChannel,
				turnId,
				toolCallId,
			};
			const params: CreateTerminalParams = { channel: terminalUri, claim, name: displayName, cwd };
			await ctx.terminalManager.createTerminal(params, { shell: shellPath, preventShellHistory: true, nonInteractive: true });
			terminalCreated = true;
			this._terminals.add(terminalUri);

			// Reference the terminal so the client can stream live output while
			// the command runs.
			const terminalContent: ToolResultContent = { type: ToolResultContentType.Terminal, resource: terminalUri, title: displayName };
			ctx.dispatch(turnChannel, {
				type: ActionType.ChatToolCallContentChanged,
				turnId,
				toolCallId,
				content: [terminalContent],
			});

			const result = await executeShellCommand({ terminalUri, shellType }, command, DEFAULT_SHELL_COMMAND_TIMEOUT_MS, ctx.terminalManager, ctx.logService);
			const { success, pastTenseMessage } = this._summarizeResult(result);
			const content: ToolResultContent[] = [terminalContent];
			if (result.output) {
				content.push({ type: ToolResultContentType.Text, text: result.output });
			}
			ctx.dispatch(turnChannel, {
				type: ActionType.ChatToolCallComplete,
				turnId,
				toolCallId,
				result: { success, pastTenseMessage, content },
			});
		} catch (err) {
			ctx.logService.error(`[BangLocalCommand] Command failed for session=${sessionChannel}: ${err instanceof Error ? err.message : String(err)}`, err);
			if (terminalCreated) {
				ctx.terminalManager.disposeTerminal(terminalUri);
				this._terminals.delete(terminalUri);
			}
			ctx.dispatch(turnChannel, {
				type: ActionType.ChatToolCallComplete,
				turnId,
				toolCallId,
				result: {
					success: false,
					pastTenseMessage: localize('agentHostBang.failed', "Failed to run command"),
					error: { message: err instanceof Error ? err.message : String(err) },
				},
			});
		}
	}

	/**
	 * Maps a shell command result to a success flag and past-tense summary for
	 * the completed tool call.
	 */
	private _summarizeResult(result: IShellCommandResult): { success: boolean; pastTenseMessage: string } {
		switch (result.status) {
			case 'completed': {
				const exitCode = result.exitCode ?? 0;
				return exitCode === 0
					? { success: true, pastTenseMessage: localize('agentHostBang.ran', "Ran command") }
					: { success: false, pastTenseMessage: localize('agentHostBang.exited', "Command exited with code {0}", exitCode) };
			}
			case 'timeout':
				return { success: false, pastTenseMessage: localize('agentHostBang.timedOut', "Command timed out") };
			case 'shellExited':
				return { success: false, pastTenseMessage: localize('agentHostBang.shellExited', "Shell exited unexpectedly") };
			case 'background':
				return { success: true, pastTenseMessage: localize('agentHostBang.background', "Command is running in the background") };
			case 'altBuffer':
				return { success: true, pastTenseMessage: localize('agentHostBang.interactive', "Command opened an interactive terminal") };
		}
	}
}

LocalChatCommandRegistry.register(BangLocalCommand);
