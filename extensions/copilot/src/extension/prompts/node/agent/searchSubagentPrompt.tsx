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
	/** Thoroughness level requested by the caller. Influences the speed vs. thoroughness guidance in the system prompt. */
	readonly thoroughness?: 'normal' | 'deep';
}

const THOROUGHNESS_GUIDANCE: Record<NonNullable<SearchSubagentPromptProps['thoroughness']>, string> = {
	normal: 'Use a balanced approach: parallelize where possible and stop when you have sufficient context.',
	deep: 'Go broad to narrow: start with semantic or glob search to discover relevant areas, then narrow with text search. Parallelize tool calls. Read files when you need full context.',
};

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

		const thoroughnessGuidance = this.props.thoroughness ? THOROUGHNESS_GUIDANCE[this.props.thoroughness] : undefined;

		return (
			<>
				<SystemMessage priority={1000}>
					You are an AI coding research assistant that uses search tools to gather information. You can call tools to search for information and read files across a codebase.<br />
					<br />
					{thoroughnessGuidance && (<>{thoroughnessGuidance}<br /><br /></>)}
					Once you have searched the repository, return a message with ONLY: the &lt;final_answer&gt; tag to provide paths and line ranges of relevant code snippets.<br />
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
