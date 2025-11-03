/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IChatAgentRequest, IChatAgentService } from '../chatAgents.js';
import { ChatModel } from '../chatModel.js';
import { IChatProgress, IChatService } from '../chatService.js';
import { LocalChatSessionUri } from '../chatUri.js';
import { ChatAgentLocation, ChatModeKind } from '../constants.js';
import {
	CountTokensCallback,
	IPreparedToolInvocation,
	IToolData,
	IToolImpl,
	IToolInvocation,
	IToolInvocationPreparationContext,
	IToolResult,
	ToolDataSource,
	ToolProgress
} from '../languageModelToolsService.js';
import { createToolSimpleTextResult } from './toolHelpers.js';

export const RunSubagentToolId = 'runSubagent';

export const RunSubagentToolData: IToolData = {
	id: RunSubagentToolId,
	toolReferenceName: 'subagent',
	canBeReferencedInPrompt: true,
	icon: ThemeIcon.fromId(Codicon.organization.id),
	displayName: localize('tool.runSubagent.displayName', 'Run Subagent'),
	userDescription: localize('tool.runSubagent.userDescription', 'Launch a new agent to handle complex, multi-step tasks autonomously'),
	modelDescription: 'Launch a new agent to handle complex, multi-step tasks autonomously. This tool is good at researching complex questions, searching for code, and executing multi-step tasks. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries, use this agent to perform the search for you.\n\n- Agents do not run async or in the background, you will wait for the agent\'s result.\n- When the agent is done, it will return a single message back to you. The result returned by the agent is not visible to the user. To show the user the result, you should send a text message back to the user with a concise summary of the result.\n - Each agent invocation is stateless. You will not be able to send additional messages to the agent, nor will the agent be able to communicate with you outside of its final report. Therefore, your prompt should contain a highly detailed task description for the agent to perform autonomously and you should specify exactly what information the agent should return back to you in its final and only message to you.\n - The agent\'s outputs should generally be trusted\n - Clearly tell the agent whether you expect it to write code or just to do research (search, file reads, web fetches, etc.), since it is not aware of the user\'s intent',
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			prompt: {
				type: 'string',
				description: 'A detailed description of the task for the agent to perform'
			},
			description: {
				type: 'string',
				description: 'A short (3-5 word) description of the task'
			}
		},
		required: ['prompt', 'description']
	}
};

interface IRunSubagentToolInputParams {
	prompt: string;
	description: string;
}

export class RunSubagentTool extends Disposable implements IToolImpl {

	constructor(
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IChatService private readonly chatService: IChatService,
		@ILogService private readonly logService: ILogService
	) {
		super();
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const args = invocation.parameters as IRunSubagentToolInputParams;

		this.logService.debug(`RunSubagentTool: Invoking with prompt: ${args.prompt.substring(0, 100)}...`);

		if (!invocation.context) {
			throw new Error('toolInvocationToken is required for this tool');
		}

		// Get the chat model and request for writing progress
		const model = this.chatService.getSession(LocalChatSessionUri.forSession(invocation.context.sessionId)) as ChatModel | undefined;
		if (!model) {
			throw new Error('Chat model not found for session');
		}

		const request = model?.getRequests().at(-1)!;

		try {
			// Get the default agent
			const defaultAgent = this.chatAgentService.getDefaultAgent(ChatAgentLocation.Chat, ChatModeKind.Agent);
			if (!defaultAgent) {
				return createToolSimpleTextResult('Error: No default agent available');
			}

			// Track whether we should collect markdown (after the last prepare tool invocation)
			const markdownParts: string[] = [];

			const progressCallback = (parts: IChatProgress[]) => {
				for (const part of parts) {
					// Write certain parts immediately to the model
					if (part.kind === 'prepareToolInvocation' || part.kind === 'textEdit' || part.kind === 'notebookEdit') {
						model.acceptResponseProgress(request, part);

						// When we see a prepare tool invocation, reset markdown collection
						if (part.kind === 'prepareToolInvocation') {
							markdownParts.length = 0; // Clear previously collected markdown
						}
					} else if (part.kind === 'markdownContent') {
						// Collect markdown content for the tool result
						markdownParts.push(part.content.value);
					}
				}
			};

			// Build the agent request
			const agentRequest: IChatAgentRequest = {
				sessionId: invocation.context.sessionId,
				requestId: invocation.callId ?? `subagent-${Date.now()}`,
				agentId: defaultAgent.id,
				message: args.prompt,
				variables: { variables: [] },
				location: ChatAgentLocation.Chat,
				isSubagent: true,
				userSelectedModelId: invocation.modelId,
				userSelectedTools: invocation.userSelectedTools
			};

			// Invoke the agent
			const result = await this.chatAgentService.invokeAgent(
				defaultAgent.id,
				agentRequest,
				progressCallback,
				[],
				token
			);

			// Check for errors
			if (result.errorDetails) {
				return createToolSimpleTextResult(`Agent error: ${result.errorDetails.message}`);
			}

			return createToolSimpleTextResult(markdownParts.join('') || 'Agent completed with no output');

		} catch (error) {
			const errorMessage = `Error invoking subagent: ${error instanceof Error ? error.message : 'Unknown error'}`;
			this.logService.error(errorMessage, error);
			return createToolSimpleTextResult(errorMessage);
		}
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const args = context.parameters as IRunSubagentToolInputParams;
		const message = args.description || localize('subagent.launching', "Launching agent");

		return {
			pastTenseMessage: new MarkdownString(message)
		};
	}
}
