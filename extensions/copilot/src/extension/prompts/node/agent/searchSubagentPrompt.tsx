/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { PromptElement, PromptSizing, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import { GenericBasePromptElementProps } from '../../../context/node/resolvers/genericPanelIntentInvocation';
import { CopilotToolMode } from '../../../tools/common/toolsRegistry';
import { ChatToolCalls } from '../panel/toolCalling';

export interface SearchSubagentPromptProps extends GenericBasePromptElementProps {
	readonly maxSearchTurns: number;
}

/**
 * Prompt for the search subagent that uses custom search instructions
 * instead of the default agent system prompt.
 */
export class SearchSubagentPrompt extends PromptElement<SearchSubagentPromptProps> {
	async render(state: void, sizing: PromptSizing) {
		const { conversation, toolCallRounds, toolCallResults } = this.props.promptContext;

		// Render the search instruction from the conversation
		const searchInstruction = conversation?.turns[0]?.request.message;

		// Check if we're at the last turn (to align with training where we coax final answer)
		const currentTurn = toolCallRounds?.length ?? 0;
		const isLastTurn = currentTurn >= this.props.maxSearchTurns - 1;

		return (
			<>
				<SystemMessage priority={1000}>
					You are an AI coding research assistant that uses search tools to gather information. You can call tools to search for information and read files across a codebase.<br />
					<br />
					Once you have thoroughly searched the repository, return a message with ONLY: the &lt;final_answer&gt; tag to provide paths and line ranges of relevant code snippets.<br />
					<br />
					Example:<br />
					<br />
					&lt;final_answer&gt;<br />
					/absolute/path/to/file.py:10-20<br />
					/absolute/path/to/another/file.cc:100-120<br />
					&lt;/final_answer&gt;
				</SystemMessage>
				<UserMessage priority={900}>{searchInstruction}</UserMessage>
				<ChatToolCalls
					priority={899}
					flexGrow={2}
					promptContext={this.props.promptContext}
					toolCallRounds={toolCallRounds}
					toolCallResults={toolCallResults}
					toolCallMode={CopilotToolMode.FullContext}
				/>
				{isLastTurn && (
					<UserMessage priority={900}>
						OK, your allotted iterations are finished -- you must produce a list of code references as the final answer, starting and ending with &lt;final_answer&gt;.
					</UserMessage>
				)}
			</>
		);
	}
}