/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { ChatFetchResponseType } from '../../../platform/chat/common/commonTypes';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { CapturingToken } from '../../../platform/requestLogger/common/capturingToken';
import { IRequestLogger } from '../../../platform/requestLogger/common/requestLogger';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ChatResponseStreamImpl } from '../../../util/common/chatResponseStreamImpl';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatResponseNotebookEditPart, ChatResponseTextEditPart, ChatToolInvocationPart, ExtendedLanguageModelToolResult, LanguageModelTextPart, MarkdownString } from '../../../vscodeTypes';
import { Conversation, Turn } from '../../prompt/common/conversation';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { ExecutionSubagentToolCallingLoop, IBackgroundCommand } from '../../prompt/node/executionSubagentToolCallingLoop';
import { ToolName } from '../common/toolNames';
import { CopilotToolMode, ICopilotTool, ToolRegistry } from '../common/toolsRegistry';

export interface IExecutionSubagentParams {

	/** What to execute, and what to look for in the output. Can include exact commands to run, or a description of an execution task. */
	query: string;
	/** User-visible description shown while invoking */
	description: string;
}

class ExecutionSubagentTool implements ICopilotTool<IExecutionSubagentParams> {
	public static readonly toolName = ToolName.ExecutionSubagent;
	public static readonly nonDeferred = true;
	private _inputContext: IBuildPromptContext | undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IRequestLogger private readonly requestLogger: IRequestLogger,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExperimentationService private readonly experimentationService: IExperimentationService
	) { }
	async invoke(options: vscode.LanguageModelToolInvocationOptions<IExecutionSubagentParams>, token: vscode.CancellationToken) {
		const executionInstruction = [
			'Execution query: ',
			`${options.input.query}`,
			'',
		].join('\n');

		if (!this._inputContext) {
			throw new Error('ExecutionSubagentTool: _inputContext is not set. Ensure resolveInput is called before invoke.');
		}

		const request = this._inputContext.request!;
		const parentSessionId = this._inputContext.conversation?.sessionId ?? generateUuid();
		// Generate a stable session ID for this subagent invocation that will be used:
		// 1. As subAgentInvocationId in the subagent's tool context
		// 2. As subAgentInvocationId in toolMetadata for parent trajectory linking
		// 3. As the session_id in the subagent's own trajectory
		const subAgentInvocationId = generateUuid();

		const toolCallLimit = this.configurationService.getExperimentBasedConfig(ConfigKey.Advanced.ExecutionSubagentToolCallLimit, this.experimentationService);

		const loop = this.instantiationService.createInstance(ExecutionSubagentToolCallingLoop, {
			toolCallLimit,
			conversation: new Conversation(parentSessionId, [new Turn(generateUuid(), { type: 'user', message: executionInstruction })]),
			request: request,
			location: request.location,
			promptText: options.input.query,
			subAgentInvocationId: subAgentInvocationId,
			parentToolCallId: options.chatStreamToolCallId,
			parentHeaderRequestId: this._inputContext?.parentHeaderRequestId,
		});

		const stream = this._inputContext?.stream && ChatResponseStreamImpl.filter(
			this._inputContext.stream,
			part => part instanceof ChatToolInvocationPart || part instanceof ChatResponseTextEditPart || part instanceof ChatResponseNotebookEditPart
		);

		// Create a new capturing token to group this execution subagent and all its nested tool calls
		// Similar to how DefaultIntentRequestHandler does it
		// Pass the subAgentInvocationId so the trajectory uses this ID for explicit linking
		const executionSubagentToken = new CapturingToken(
			`Execution: ${options.input.query.substring(0, 50)}${options.input.query.length > 50 ? '...' : ''}`,
			'execution',
			subAgentInvocationId,
			'execution'  // subAgentName for trajectory tracking
		);

		// Wrap the loop execution in captureInvocation with the new token
		// All nested tool calls will now be logged under this same CapturingToken
		const loopResult = await this.requestLogger.captureInvocation(executionSubagentToken, () => loop.run(stream, token));

		// Build subagent trajectory metadata that will be logged via toolMetadata
		// All nested tool calls are already logged by ToolCallingLoop.logToolResult()
		const toolMetadata = {
			query: options.input.query,
			description: options.input.description,
			// The subAgentInvocationId links this tool call to the subagent's trajectory
			subAgentInvocationId: subAgentInvocationId,
			agentName: 'execution'
		};

		let subagentResponse = '';
		if (loopResult.response.type === ChatFetchResponseType.Success) {
			subagentResponse = loopResult.toolCallRounds.at(-1)?.response ?? loopResult.round.response ?? '';
		} else {
			subagentResponse = `The execution subagent request failed with this message:\n${loopResult.response.type}: ${loopResult.response.reason}`;
		}

		// If any terminal commands moved to the background (timeout or async) during
		// the subagent's run, append a Note line for each on the line(s) immediately
		// after the final </final_answer>.
		subagentResponse = appendBackgroundCommandNotesToFinalAnswer(subagentResponse, loop.backgroundCommands);

		// toolMetadata will be automatically included in exportAllPromptLogsAsJsonCommand
		const result = new ExtendedLanguageModelToolResult([new LanguageModelTextPart(subagentResponse)]);
		result.toolMetadata = toolMetadata;
		result.toolResultMessage = new MarkdownString(l10n.t`Execution complete: ${options.input.description}`);
		return result;
	}

	prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<IExecutionSubagentParams>, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation> {
		return {
			invocationMessage: options.input.description,
		};
	}

	async resolveInput(input: IExecutionSubagentParams, promptContext: IBuildPromptContext, _mode: CopilotToolMode): Promise<IExecutionSubagentParams> {
		this._inputContext = promptContext;
		return input;
	}
}

ToolRegistry.registerTool(ExecutionSubagentTool);

/**
 * Appends a `Note: ...` line for each stopped terminal command (timed out or
 * invoked in async/background mode) on the line(s) immediately after the final
 * `</final_answer>` of the subagent's response. If no `<final_answer>` block is
 * present, appends the notes to the end of the response.
 */
function appendBackgroundCommandNotesToFinalAnswer(
	response: string,
	backgroundCommands: readonly IBackgroundCommand[],
): string {
	if (backgroundCommands.length === 0) {
		return response;
	}

	const notes = backgroundCommands.map(c => {
		if (c.reason === 'timeout') {
			const timeoutText = c.timeoutMs !== undefined ? ` after ${c.timeoutMs} ms` : '';
			return `Note: The command \`${c.command}\` timed out${timeoutText}. It may still be running in terminal ID ${c.termId}.`;
		}
		return `Note: The command \`${c.command}\` was started in the background. It may still be running in terminal ID ${c.termId}.`;
	}).join('\n');

	const closingTag = '</final_answer>';
	const closeIdx = response.lastIndexOf(closingTag);
	if (closeIdx === -1) {
		return response.length > 0 ? `${response}\n\n${notes}` : notes;
	}
	const insertAt = closeIdx + closingTag.length;
	const before = response.slice(0, insertAt);
	const after = response.slice(insertAt).replace(/^\s*/, '');
	return after.length > 0 ? `${before}\n${notes}\n${after}` : `${before}\n${notes}`;
}
