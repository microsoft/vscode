/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { IJSONSchema, IJSONSchemaMap } from '../../../../../base/common/jsonSchema.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IChatAgentRequest, IChatAgentService } from '../chatAgents.js';
import { ChatModel, IChatRequestModeInstructions } from '../chatModel.js';
import { IChatModeService } from '../chatModes.js';
import { IChatProgress, IChatService } from '../chatService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../constants.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../languageModels.js';
import {
	CountTokensCallback,
	ILanguageModelToolsService,
	IPreparedToolInvocation,
	IToolData,
	IToolImpl,
	IToolInvocation,
	IToolInvocationPreparationContext,
	IToolResult,
	ToolDataSource,
	ToolProgress,
	ToolSet,
	VSCodeToolReference
} from '../languageModelToolsService.js';
import { ManageTodoListToolToolId } from './manageTodoListTool.js';
import { createToolSimpleTextResult } from './toolHelpers.js';

export const RunSubagentToolId = 'runSubagent';

const BaseModelDescription = `Launch a new agent to handle complex, multi-step tasks autonomously. This tool is good at researching complex questions, searching for code, and executing multi-step tasks. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries, use this agent to perform the search for you.

- Agents do not run async or in the background, you will wait for the agent\'s result.
- When the agent is done, it will return a single message back to you. The result returned by the agent is not visible to the user. To show the user the result, you should send a text message back to the user with a concise summary of the result.
- Each agent invocation is stateless. You will not be able to send additional messages to the agent, nor will the agent be able to communicate with you outside of its final report. Therefore, your prompt should contain a highly detailed task description for the agent to perform autonomously and you should specify exactly what information the agent should return back to you in its final and only message to you.
- The agent's outputs should generally be trusted
- Clearly tell the agent whether you expect it to write code or just to do research (search, file reads, web fetches, etc.), since it is not aware of the user\'s intent`;

interface IRunSubagentToolInputParams {
	prompt: string;
	description: string;
	agentName?: string;
}

export class RunSubagentTool extends Disposable implements IToolImpl {

	readonly onDidUpdateToolData: Event<IConfigurationChangeEvent>;

	constructor(
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IChatService private readonly chatService: IChatService,
		@IChatModeService private readonly chatModeService: IChatModeService,
		@ILanguageModelToolsService private readonly languageModelToolsService: ILanguageModelToolsService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@ILogService private readonly logService: ILogService,
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this.onDidUpdateToolData = Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ChatConfiguration.SubagentToolCustomAgents));
	}

	getToolData(): IToolData {
		let modelDescription = BaseModelDescription;
		const inputSchema: IJSONSchema & { properties: IJSONSchemaMap } = {
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
		};

		if (this.configurationService.getValue(ChatConfiguration.SubagentToolCustomAgents)) {
			inputSchema.properties.agentName = {
				type: 'string',
				description: 'Optional name of a specific agent to invoke. If not provided, uses the current agent.'
			};
			modelDescription += `\n- If the user asks for a certain agent, you MUST provide that EXACT agent name (case-sensitive) to invoke that specific agent.`;
		}
		const runSubagentToolData: IToolData = {
			id: RunSubagentToolId,
			toolReferenceName: VSCodeToolReference.runSubagent,
			icon: ThemeIcon.fromId(Codicon.organization.id),
			displayName: localize('tool.runSubagent.displayName', 'Run Subagent'),
			userDescription: localize('tool.runSubagent.userDescription', 'Run a task within an isolated subagent context to enable efficient organization of tasks and context window management.'),
			modelDescription: modelDescription,
			source: ToolDataSource.Internal,
			inputSchema: inputSchema
		};
		return runSubagentToolData;
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const args = invocation.parameters as IRunSubagentToolInputParams;

		this.logService.debug(`RunSubagentTool: Invoking with prompt: ${args.prompt.substring(0, 100)}...`);

		if (!invocation.context) {
			throw new Error('toolInvocationToken is required for this tool');
		}

		// Get the chat model and request for writing progress
		const model = this.chatService.getSession(invocation.context.sessionResource) as ChatModel | undefined;
		if (!model) {
			throw new Error('Chat model not found for session');
		}

		const request = model.getRequests().at(-1)!;

		try {
			// Get the default agent
			const defaultAgent = this.chatAgentService.getDefaultAgent(ChatAgentLocation.Chat, ChatModeKind.Agent);
			if (!defaultAgent) {
				return createToolSimpleTextResult('Error: No default agent available');
			}

			// Resolve mode-specific configuration if subagentId is provided
			let modeModelId = invocation.modelId;
			let modeTools = invocation.userSelectedTools;
			let modeInstructions: IChatRequestModeInstructions | undefined;

			if (args.agentName) {
				const mode = this.chatModeService.findModeByName(args.agentName);
				if (mode) {
					// Use mode-specific model if available
					const modeModelQualifiedName = mode.model?.get();
					if (modeModelQualifiedName) {
						// Find the actual model identifier from the qualified name
						const modelIds = this.languageModelsService.getLanguageModelIds();
						for (const modelId of modelIds) {
							const metadata = this.languageModelsService.lookupLanguageModel(modelId);
							if (metadata && ILanguageModelChatMetadata.matchesQualifiedName(modeModelQualifiedName, metadata)) {
								modeModelId = modelId;
								break;
							}
						}
					}

					// Use mode-specific tools if available
					const modeCustomTools = mode.customTools?.get();
					if (modeCustomTools) {
						// Convert the mode's custom tools (array of qualified names) to UserSelectedTools format
						const enablementMap = this.languageModelToolsService.toToolAndToolSetEnablementMap(modeCustomTools, mode.target?.get());
						// Convert enablement map to UserSelectedTools (Record<string, boolean>)
						modeTools = {};
						for (const [tool, enabled] of enablementMap) {
							if (!(tool instanceof ToolSet)) {
								modeTools[tool.id] = enabled;
							}
						}
					}

					const instructions = mode.modeInstructions?.get();
					modeInstructions = instructions && {
						name: mode.name.get(),
						content: instructions.content,
						toolReferences: this.toolsService.toToolReferences(instructions.toolReferences),
						metadata: instructions.metadata,
					};
				} else {
					this.logService.warn(`RunSubagentTool: Agent '${args.agentName}' not found, using current configuration`);
				}
			}

			// Track whether we should collect markdown (after the last prepare tool invocation)
			const markdownParts: string[] = [];

			let inEdit = false;
			const progressCallback = (parts: IChatProgress[]) => {
				for (const part of parts) {
					// Write certain parts immediately to the model
					if (part.kind === 'prepareToolInvocation' || part.kind === 'textEdit' || part.kind === 'notebookEdit' || part.kind === 'codeblockUri') {
						if (part.kind === 'codeblockUri' && !inEdit) {
							inEdit = true;
							model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('```\n'), fromSubagent: true });
						}
						model.acceptResponseProgress(request, part);

						// When we see a prepare tool invocation, reset markdown collection
						if (part.kind === 'prepareToolInvocation') {
							markdownParts.length = 0; // Clear previously collected markdown
						}
					} else if (part.kind === 'markdownContent') {
						if (inEdit) {
							model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('\n```\n\n'), fromSubagent: true });
							inEdit = false;
						}

						// Collect markdown content for the tool result
						markdownParts.push(part.content.value);
					}
				}
			};

			if (modeTools) {
				modeTools[RunSubagentToolId] = false;
				modeTools[ManageTodoListToolToolId] = false;
			}

			// Build the agent request
			const agentRequest: IChatAgentRequest = {
				sessionResource: invocation.context.sessionResource,
				requestId: invocation.callId ?? `subagent-${Date.now()}`,
				agentId: defaultAgent.id,
				message: args.prompt,
				variables: { variables: [] },
				location: ChatAgentLocation.Chat,
				isSubagent: true,
				userSelectedModelId: modeModelId,
				userSelectedTools: modeTools,
				modeInstructions,
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

		return {
			invocationMessage: args.description,
		};
	}
}
