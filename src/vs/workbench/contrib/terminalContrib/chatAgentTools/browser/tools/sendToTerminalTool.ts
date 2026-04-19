/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../../base/common/async.js';
import type { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { appendEscapedMarkdownInlineCode, createCommandUri, isMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { IChatWidgetService } from '../../../../chat/browser/chat.js';
import { IChatService, IChatMultiSelectAnswer, IChatQuestionAnswerValue, IChatQuestionCarousel, IChatSingleSelectAnswer } from '../../../../chat/common/chatService/chatService.js';
import { ToolDataSource, type CountTokensCallback, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type ToolProgress } from '../../../../chat/common/tools/languageModelToolsService.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ITerminalChatService, ITerminalService } from '../../../../terminal/browser/terminal.js';
import { getOutput } from '../outputHelpers.js';
import { buildCommandDisplayText, normalizeCommandForExecution } from '../runInTerminalHelpers.js';
import { RunInTerminalTool } from './runInTerminalTool.js';
import { isSessionAutoApproveLevel } from './terminalToolAutoApprove.js';
import { TerminalToolId } from './toolIds.js';

export const SendToTerminalToolData: IToolData = {
	id: TerminalToolId.SendToTerminal,
	toolReferenceName: 'sendToTerminal',
	displayName: localize('sendToTerminalTool.displayName', 'Send to Terminal'),
	modelDescription: `Send input text to a terminal session. This can target either a persistent terminal started with ${TerminalToolId.RunInTerminal} in async mode (using 'id') or any foreground terminal visible in the terminal panel (using 'terminalId'). The 'command' field may be empty or whitespace to press Enter (useful for interactive prompts). The result includes the last few lines of terminal output captured shortly after sending.`,
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
CommandsRegistry.registerCommand(FocusTerminalByIdCommandId, async (accessor, instanceId: number) => {
	const terminalService = accessor.get(ITerminalService);
	const instance = terminalService.getInstanceFromId(instanceId);
	if (instance) {
		terminalService.setActiveInstance(instance);
		await terminalService.revealActiveTerminal();
		instance.focus();
	}
});

const FocusTerminalByExecutionIdCommandId = 'workbench.action.terminal.chat.focusTerminalByExecutionId';
CommandsRegistry.registerCommand(FocusTerminalByExecutionIdCommandId, async (accessor, executionId: string) => {
	const execution = RunInTerminalTool.getExecution(executionId);
	if (execution) {
		const terminalService = accessor.get(ITerminalService);
		terminalService.setActiveInstance(execution.instance);
		await terminalService.revealActiveTerminal();
		execution.instance.focus();
	}
});

export class SendToTerminalTool extends Disposable implements IToolImpl {

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IChatService private readonly _chatService: IChatService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@ITerminalChatService private readonly _terminalChatService: ITerminalChatService,
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

		// Look for the question that prompted this send_to_terminal call
		const questionText = this._getQuestionContextForTerminal(context.chatSessionResource, args);

		if (isEmptyInput) {
			invocationMessage.appendMarkdown(localize('send.progressive.enter', "Pressing `Enter` in terminal"));
			pastTenseMessage.appendMarkdown(localize('send.past.enter', "Pressed `Enter` in terminal"));
		} else {
			const displayCommand = buildCommandDisplayText(args.command);
			const safeInlineCode = appendEscapedMarkdownInlineCode(displayCommand);
			invocationMessage.appendMarkdown(localize('send.progressive', "Sending {0} to terminal", safeInlineCode));
			pastTenseMessage.appendMarkdown(localize('send.past', "Sent {0} to terminal", safeInlineCode));
		}

		if (questionText) {
			const replyPrefix = ` (${localize('send.replyingTo', "replying to: ")}`;
			invocationMessage.appendMarkdown(replyPrefix);
			invocationMessage.appendText(questionText);
			invocationMessage.appendMarkdown(')');
			pastTenseMessage.appendMarkdown(replyPrefix);
			pastTenseMessage.appendText(questionText);
			pastTenseMessage.appendMarkdown(')');
		}

		// Build the confirmation message with a "Focus Terminal" command link
		const instanceId = this._getTerminalInstanceId(args);
		const confirmationMessage = new MarkdownString('', { isTrusted: { enabledCommands: [FocusTerminalByIdCommandId] } });
		const safeTerminalLabel = appendEscapedMarkdownInlineCode(terminalLabel);
		const baseMessage = isEmptyInput
			? localize('send.confirm.message.enter', "Press `Enter` in terminal {0}", safeTerminalLabel)
			: localize('send.confirm.message', "Run {0} in terminal {1}", appendEscapedMarkdownInlineCode(buildCommandDisplayText(args.command)), safeTerminalLabel);
		if (instanceId !== undefined) {
			const focusUri = createCommandUri(FocusTerminalByIdCommandId, instanceId);
			confirmationMessage.appendMarkdown(`${baseMessage} — [${localize('focusTerminal', "Focus Terminal")}](${focusUri})`);
		} else {
			confirmationMessage.appendMarkdown(baseMessage);
		}

		// Determine auto-approval, aligned with runInTerminal
		const chatSessionResource = context.chatSessionResource;
		const isSessionAutoApproved = chatSessionResource && (
			isSessionAutoApproveLevel(chatSessionResource, this._configurationService, this._chatWidgetService, this._chatService) ||
			this._terminalChatService.hasChatSessionAutoApproval(chatSessionResource)
		);

		// send_to_terminal normally requires confirmation in default approvals mode
		// because the text may be arbitrary input (passwords, confirmations, etc.)
		// that the command-line auto-approve analyzer cannot assess. However, when
		// the text being sent was just collected via askQuestions for the same
		// terminal, the user already explicitly provided the answer so a second
		// confirmation is redundant.
		const isAnsweringQuestion = questionText !== undefined;
		const shouldShowConfirmation = (!isSessionAutoApproved && !isAnsweringQuestion) || context.forceConfirmationReason !== undefined;
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

	/**
	 * Searches the current session's responses for the most recent question
	 * carousel associated with the target terminal, then uses positional
	 * matching to return the specific question that this send_to_terminal
	 * call is answering.
	 *
	 * When a carousel contains multiple questions, the model calls
	 * send_to_terminal once per answer in order. This method counts prior
	 * send_to_terminal invocations since the carousel to determine the
	 * current question index, then verifies the command matches the answer
	 * at that position.
	 */
	private _getQuestionContextForTerminal(chatSessionResource: URI | undefined, args: ISendToTerminalInputParams): string | undefined {
		if (!chatSessionResource) {
			return undefined;
		}

		const model = this._chatService.getSession(chatSessionResource);
		if (!model) {
			return undefined;
		}

		// Resolve the terminal ID that will match the carousel's terminalId
		if (!args.id && args.terminalId === undefined) {
			return undefined;
		}

		const commandText = args.command?.trim();

		// Walk requests in reverse to find the most recent carousel for this terminal
		const requests = model.getRequests();
		for (let i = requests.length - 1; i >= 0; i--) {
			const response = requests[i].response;
			if (!response) {
				continue;
			}
			const parts = response.response.value;

			// First, find the carousel for this terminal (searching backwards)
			let carouselIndex = -1;
			let carousel: IChatQuestionCarousel | undefined;
			for (let j = parts.length - 1; j >= 0; j--) {
				const part = parts[j];
				if (part.kind === 'questionCarousel') {
					const candidate = part as IChatQuestionCarousel;
					if (!candidate.terminalId || candidate.questions.length === 0) {
						continue;
					}
					const matchesById = !!args.id && candidate.terminalId === args.id;
					const matchesByInstanceId = args.terminalId !== undefined &&
						RunInTerminalTool.getExecution(candidate.terminalId)?.instance.instanceId === args.terminalId;
					if (matchesById || matchesByInstanceId) {
						carouselIndex = j;
						carousel = candidate;
						break;
					}
				}
			}

			if (!carousel || carouselIndex === -1) {
				continue;
			}

			// Count send_to_terminal tool invocations after the carousel to
			// determine which question this call corresponds to (positional).
			let sendCount = 0;
			for (let j = carouselIndex + 1; j < parts.length; j++) {
				if (parts[j].kind === 'toolInvocation' && (parts[j] as { toolId?: string }).toolId === TerminalToolId.SendToTerminal) {
					sendCount++;
				}
			}

			const questionIndex = sendCount;
			if (questionIndex >= carousel.questions.length) {
				return undefined;
			}

			const question = carousel.questions[questionIndex];

			// Verify the command matches the answer at this position so that
			// unrelated send_to_terminal calls don't skip confirmation.
			if (carousel.data) {
				const answer = carousel.data[question.id];
				if (this._answerMatchesCommand(answer, commandText)) {
					return this._getQuestionText(question);
				}
			}

			return undefined;
		}
		return undefined;
	}

	private _getQuestionText(question: IChatQuestionCarousel['questions'][0]): string {
		const text = question.message ?? question.title;
		return isMarkdownString(text) ? text.value : text;
	}

	/**
	 * Checks whether a carousel answer value matches the command text being sent.
	 */
	private _answerMatchesCommand(answer: IChatQuestionAnswerValue | undefined, commandText: string): boolean {
		if (answer === undefined) {
			return false;
		}
		if (typeof answer === 'string') {
			return answer.trim() === commandText;
		}
		// answer is now IChatSingleSelectAnswer | IChatMultiSelectAnswer
		if (hasKey(answer, { selectedValues: true })) {
			const multi = answer as IChatMultiSelectAnswer;
			if (multi.selectedValues.some(v => v.trim() === commandText)) {
				return true;
			}
			return multi.freeformValue?.trim() === commandText;
		}
		if (hasKey(answer, { selectedValue: true })) {
			const single = answer as IChatSingleSelectAnswer;
			return single.selectedValue?.trim() === commandText || single.freeformValue?.trim() === commandText;
		}
		return false;
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

			await timeout(100);
			const recentOutput = getOutput(instance, undefined, { lastNLines: 5 });

			return {
				content: [{
					kind: 'text',
					value: `Successfully sent command to foreground terminal ${args.terminalId}.${recentOutput ? `\n\nTerminal output (last 5 lines):\n${recentOutput}` : ''}`
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

		await timeout(100);
		const recentOutput = getOutput(execution.instance, undefined, { lastNLines: 5 });

		return {
			content: [{
				kind: 'text',
				value: `Successfully sent command to terminal ${args.id}.${recentOutput ? `\n\nTerminal output (last 5 lines):\n${recentOutput}` : ''}`
			}]
		};
	}
}
