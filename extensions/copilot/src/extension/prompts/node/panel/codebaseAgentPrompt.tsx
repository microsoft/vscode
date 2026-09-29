/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptSizing } from '@vscode/prompt-tsx';
import { IWorkspaceChunkSearchService } from '../../../../platform/workspaceChunkSearch/node/workspaceChunkSearchService';
import { GenericBasePromptElementProps } from '../../../context/node/resolvers/genericPanelIntentInvocation';
import { ToolName } from '../../../tools/common/toolNames';
import { CopilotToolMode } from '../../../tools/common/toolsRegistry';
import { InstructionMessage } from '../base/instructionMessage';
import { Tag } from '../base/tag';
import { ChatVariablesAndQuery } from './chatVariables';
import { HistoryWithInstructions } from './conversationHistory';
import { ChatToolCalls } from './toolCalling';
import { WorkspaceFoldersHint } from './workspace/workspaceFoldersHint';
import { MultirootWorkspaceStructure } from './workspace/workspaceStructure';

export class CodebaseAgentPrompt extends PromptElement<GenericBasePromptElementProps> {
	constructor(
		props: GenericBasePromptElementProps,
		@IWorkspaceChunkSearchService private readonly workspaceChunkSearch: IWorkspaceChunkSearchService,
	) {
		super(props);
	}

	async render(state: void, sizing: PromptSizing) {
		const { query, chatVariables, history, toolCallRounds, toolCallResults } = this.props.promptContext;
		const hasSemanticSearch = await this.workspaceChunkSearch.isAvailable();
		return (
			<>
				<HistoryWithInstructions flexGrow={1} passPriority historyPriority={700} history={history}>
					<InstructionMessage>
						<Tag name='context'>
							<WorkspaceFoldersHint />
							<MultirootWorkspaceStructure maxSize={2000} excludeDotFiles={true} /><br />
							This view of the workspace structure may be truncated. You can use tools to collect more context if needed.
						</Tag>
						<Tag name='instructions'>
							You are a code search expert.<br />
							A developer needs to find some code in their codebase so that they can resolve a question or complete a task. You have full access to their codebase and can run tools to find code in it. Their request may contain hints for some of the files needed. It may require just one tool or many tools to collect the full context required.<br />
							First, analyze the developer's request to determine how complicated their task is. Keep your search focused on the developer's request, and don't run extra tools if the developer's request clearly can be satisfied by just one.<br />
							If the developer wants to implement a feature and they have not specified the relevant files, first break down the developer's request into smaller concepts and think about the kinds of files you need to grasp each concept.<br />
							If you cannot infer the project type (languages, frameworks, and libraries) from the developer's request or the context that you have, run the `{ToolName.ReadProjectStructure}` tool to get the lay of the land and read additional files to understand the project setup.<br />
							If you aren't sure which tool is relevant, you can call multiple tools. You can call tools repeatedly to take actions or gather as much context as needed.<br />
							Don't make assumptions about the situation. Gather enough context to address the developer's request without going overboard.<br />
							Your only task is to help the developer find context. Do not write code for the developer's request.<br />
							Your response will be read by your colleague who is an expert in editing files, not the developer, so do not offer to edit files or perform additional follow up actions at the end of your response.
						</Tag>
						<Tag name='toolUseInstructions'>
							Remember that you can call multiple tools in one response.<br />
							If you think running multiple tools can answer the user's question, prefer calling them in parallel whenever possible{hasSemanticSearch && ` but do not call \`${ToolName.Codebase}\` in parallel`}.<br />
							{hasSemanticSearch && `Use \`${ToolName.Codebase}\` to search for high level concepts or descriptions of functionality in the user's question.`}<br />
							Prefer `{ToolName.SearchWorkspaceSymbols}` over `{ToolName.FindTextInFiles}` when you have precise code identifiers to search for.<br />
							Prefer `{ToolName.FindTextInFiles}` over `{ToolName.Codebase}` when you have precise keywords to search for.<br />
							When using a tool, follow the JSON schema very carefully and make sure to include all required fields.<br />
							If a tool exists to do a task, use the tool instead of asking the developer to manually take an action.<br />
							If you say that you will take an action, then go ahead and use the tool to do it.<br />
							The tools `{ToolName.FindFiles}`, `{ToolName.FindTextInFiles}`, and `{ToolName.GetScmChanges}` are deterministic and comprehensive, so do not repeatedly invoke them with the same arguments.<br />
							Never use multi_tool_use.parallel or any tool that does not exist. Use tools using the proper procedure. DO NOT write out a JSON codeblock with the tool inputs.
						</Tag>
					</InstructionMessage>
				</HistoryWithInstructions>
				<ChatToolCalls priority={899} flexGrow={3} promptContext={this.props.promptContext} toolCallRounds={toolCallRounds} toolCallResults={toolCallResults} toolCallMode={CopilotToolMode.FullContext} />
				<ChatVariablesAndQuery flexGrow={2} priority={900} chatVariables={chatVariables} query={`The developer's request is: ${query}\n\nFind all code in the workspace relevant to the following request.`} includeFilepath={true} embeddedInsideUserMessage={false} />
			</>
		);
	}
}
