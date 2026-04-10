/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { createCommandUri, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IChatWidgetService } from '../../../../chat/browser/chat.js';
import { IChatService } from '../../../../chat/common/chatService/chatService.js';
import { ToolDataSource, type CountTokensCallback, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type ToolProgress } from '../../../../chat/common/tools/languageModelToolsService.js';
import { ITerminalService } from '../../../../terminal/browser/terminal.js';
import { buildCommandDisplayText, normalizeCommandForExecution } from '../runInTerminalHelpers.js';
import { RunInTerminalTool } from './runInTerminalTool.js';
import { isSessionAutoApproveLevel } from './terminalToolAutoApprove.js';
import { TerminalToolId } from './toolIds.js';

export const SendToTerminalToolData: IToolData = {
	id: TerminalToolId.SendToTerminal,
	toolReferenceName: 'sendToTerminal',
	displayName: localize('sendToTerminalTool.displayName', 'Send to Terminal'),
	modelDescription: `Send input text to a terminal session. This can target either a persistent terminal started with ${TerminalToolId.RunInTerminal} in async mode (using 'id') or any foreground terminal visible in the terminal panel (using 'terminalId'). The 'command' field may be empty or whitespace to press Enter (useful for interactive prompts). After sending, use ${TerminalToolId.GetTerminalOutput} to check updated output for persistent terminals.`,
	icon: Codicon.terminal,
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			id: {
				type: 'string',
				description: `The ID of a persistent terminal session to send a command to (returned by ${TerminalToolId.RunInTerminal} in async mode). Provide either 'id' or 'terminalId', not both.`,
				pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
			},
			terminalId: {
				type: 'number',
				description: 'The numeric instanceId of a terminal. Use this to send input to terminals not started by the agent (e.g., user-created terminals or terminals that need interactive input). Provide either \'id\' or \'terminalId\', not both.'
			},
			command: {
				type: 'string',
				description: 'The input text to send to the terminal. The text is sent followed by Enter. Provide an empty or whitespace string to send just Enter (for interactive prompts).'
			},
		},
		required: [
			'command',
		]
	}
};

export interface ISendToTerminalInputParams {
	id?: string;
	terminalId?: number;
	command: string;
}

const FocusTerminalByIdCommandId = 'workbench.action.terminal.chat.focusTerminalById';
CommandsRegistry.registerCommand(FocusTerminalByIdCommandId, (accessor, instanceId: number) => {
	const terminalService = accessor.get(ITerminalService);
	const instance = terminalService.getInstanceFromId(instanceId);
	if (instance) {
		terminalService.setActiveInstance(instance);
		terminalService.revealActiveTerminal(true);
	}
});

/**
 * Wraps arbitrary text in a markdown inline code span using a backtick fence
 * long enough to safely contain any backtick sequences present in the text.
 */
function toMarkdownInlineCode(text: string): string {
	const longestBacktickRun = Math.max(0, ...(text.match(/`+/g) ?? []).map(m => m.length));
	const fence = '`'.repeat(longestBacktickRun + 1);
	const needsSpace = text.startsWith('`') || text.endsWith('`');
	const content = needsSpace ? ` ${text} ` : text;
	return `${fence}${content}${fence}`;
}

export class SendToTerminalTool extends Disposable implements IToolImpl {

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IChatService private readonly _chatService: IChatService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@ITerminalService private readonly _terminalService: ITerminalService,
	) {
		super();
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const args = context.parameters as ISendToTerminalInputParams;
		const isEmptyInput = !args.command || !args.command.trim();

		// Resolve a human-friendly terminal label from the instance title
		const terminalLabel = this._getTerminalLabel(args);

		const invocationMessage = new MarkdownString();
		const pastTenseMessage = new MarkdownString();
		if (isEmptyInput) {
			invocationMessage.appendMarkdown(localize('send.progressive.enter', "Pressing `Enter` in terminal"));
			pastTenseMessage.appendMarkdown(localize('send.past.enter', "Pressed `Enter` in terminal"));
		} else {
			const displayCommand = buildCommandDisplayText(args.command);
			const safeInlineCode = toMarkdownInlineCode(displayCommand);
			invocationMessage.appendMarkdown(localize('send.progressive', "Sending {0} to terminal", safeInlineCode));
			pastTenseMessage.appendMarkdown(localize('send.past', "Sent {0} to terminal", safeInlineCode));
		}

		// Build the confirmation message with a "Focus Terminal" command link
		const instanceId = this._getTerminalInstanceId(args);
		const confirmationMessage = new MarkdownString('', { isTrusted: { enabledCommands: [FocusTerminalByIdCommandId] } });
		const safeTerminalLabel = toMarkdownInlineCode(terminalLabel);
		const baseMessage = isEmptyInput
			? localize('send.confirm.message.enter', "Press `Enter` in terminal {0}", safeTerminalLabel)
			: localize('send.confirm.message', "Run {0} in terminal {1}", toMarkdownInlineCode(buildCommandDisplayText(args.command)), safeTerminalLabel);
		if (instanceId !== undefined) {
			const focusUri = createCommandUri(FocusTerminalByIdCommandId, instanceId);
			confirmationMessage.appendMarkdown(`${baseMessage} — [$(terminal) ${localize('focusTerminal', "Focus Terminal")}](${focusUri})`);
		} else {
			confirmationMessage.appendMarkdown(baseMessage);
		}

		// Determine auto-approval, aligned with runInTerminal
		const chatSessionResource = context.chatSessionResource;
		const isSessionAutoApproved = chatSessionResource && isSessionAutoApproveLevel(chatSessionResource, this._configurationService, this._chatWidgetService, this._chatService);

		// send_to_terminal always requires confirmation in default approvals mode.
		// Unlike run_in_terminal, the text sent here may be arbitrary input to a
		// waiting prompt (e.g. a name, password, or confirmation) rather than a
		// shell command, so the command-line auto-approve analyzer cannot reliably
		// determine safety.
		const shouldShowConfirmation = !isSessionAutoApproved || context.forceConfirmationReason !== undefined;
		const confirmationMessages = shouldShowConfirmation ? {
			title: localize('send.confirm.title', "Send to Terminal"),
			message: confirmationMessage,
			allowAutoConfirm: undefined,
		} : undefined;

		return {
			invocationMessage,
			pastTenseMessage,
			confirmationMessages,
		};
	}

	/**
	 * Returns a human-friendly label for the target terminal, using the
	 * terminal instance title (which reflects the running process) instead
	 * of the raw UUID or numeric id.
	 */
	private _getTerminalLabel(args: ISendToTerminalInputParams): string {
		if (args.id) {
			const execution = RunInTerminalTool.getExecution(args.id);
			if (execution) {
				return execution.instance.title;
			}
		}
		if (args.terminalId !== undefined) {
			const instance = this._terminalService.getInstanceFromId(args.terminalId);
			if (instance) {
				return instance.title;
			}
		}
		return args.id ?? String(args.terminalId ?? '');
	}

	/**
	 * Returns the numeric terminal instanceId for the target terminal, used
	 * to build command URIs for the "Focus Terminal" link.
	 */
	private _getTerminalInstanceId(args: ISendToTerminalInputParams): number | undefined {
		if (args.terminalId !== undefined) {
			return args.terminalId;
		}
		if (args.id) {
			const execution = RunInTerminalTool.getExecution(args.id);
			if (execution) {
				return execution.instance.instanceId;
			}
		}
		return undefined;
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const args = invocation.parameters as ISendToTerminalInputParams;

		if (!args.id && args.terminalId === undefined) {
			return {
				content: [{
					kind: 'text',
					value: 'Error: Either \'id\' (persistent terminal UUID) or \'terminalId\' (foreground terminal instanceId) must be provided.'
				}]
			};
		}

		// Foreground terminal path — only when no persistent id is provided
		if (args.terminalId !== undefined && !args.id) {
			const instance = this._terminalService.getInstanceFromId(args.terminalId);
			if (!instance) {
				return {
					content: [{
						kind: 'text',
						value: `Error: No terminal found with instanceId ${args.terminalId}. The terminal may have been closed.`
					}]
				};
			}

			await instance.sendText(normalizeCommandForExecution(args.command), true);

			return {
				content: [{
					kind: 'text',
					value: `Successfully sent command to foreground terminal ${args.terminalId}. Use ${TerminalToolId.GetTerminalOutput} with terminalId ${args.terminalId} to check for updated output.`
				}]
			};
		}

		// Persistent (background) terminal path
		const execution = RunInTerminalTool.getExecution(args.id!);
		if (!execution) {
			return {
				content: [{
					kind: 'text',
					value: `Error: No active terminal execution found with ID ${args.id}. The terminal may have already been killed or the ID is invalid. The ID must be the exact value returned by ${TerminalToolId.RunInTerminal}.`
				}]
			};
		}

		await execution.instance.sendText(normalizeCommandForExecution(args.command), true);

		return {
			content: [{
				kind: 'text',
				value: `Successfully sent command to terminal ${args.id}. Use ${TerminalToolId.GetTerminalOutput} to check for updated output.`
			}]
		};
	}
}
