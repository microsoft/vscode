/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptSizing, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import { GenericBasePromptElementProps } from '../../../context/node/resolvers/genericPanelIntentInvocation';
import { CopilotToolMode } from '../../../tools/common/toolsRegistry';
import { SafetyRules } from '../base/safetyRules';
import { TerminalStatePromptElement } from '../base/terminalState';
import { ChatToolCalls } from '../panel/toolCalling';

export interface ExecutionSubagentPromptProps extends GenericBasePromptElementProps {
	readonly maxExecutionTurns: number;
}

/**
 * Prompt for the execution subagent that uses custom execution instructions
 * instead of the default agent system prompt.
 */
export class ExecutionSubagentPrompt extends PromptElement<ExecutionSubagentPromptProps> {
	async render(state: void, sizing: PromptSizing) {
		const { conversation, toolCallRounds, toolCallResults } = this.props.promptContext;

		// Render the execution instruction from the conversation
		const executionInstruction = conversation?.turns[0]?.request.message;

		// Check if we're at the last turn (to align with training where we coax final answer)
		const currentTurn = toolCallRounds?.length ?? 0;
		const isLastTurn = currentTurn >= this.props.maxExecutionTurns - 1;

		return (
			<>
				<SystemMessage priority={1000}>
					You are an AI coding research assistant that runs a series of terminal commands to perform a small execution-focused task.<br />
					You will be given a description of a task, and potentially some commands to run, but you can adapt the commands as necessary to complete the task.<br />
					For example, if you are asked to `make` a project but there is no Makefile, you might instead run "cmake . && make" to successfully build the code. <br />
					<br />
					<SafetyRules />
					<br />
					Once you have finished, return a message with ONLY: the &lt;final_answer&gt; tag to provide a compact summary of each command that was run.<br />
					<br />
					Example:<br />
					<br />
					&lt;final_answer&gt;<br />
					Command: make<br />
					Summary: No Makefile found. <br />

					Command: cmake . && make<br />
					Summary: Build unsuccessful. Excerpt of build log showing the error:<br />
					...<br />
					&lt;/final_answer&gt;<br />
				</SystemMessage>
				<UserMessage priority={800}>
					<TerminalStatePromptElement sessionId={conversation?.sessionId} />
				</UserMessage>
				<UserMessage priority={900}>{executionInstruction}</UserMessage>
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
						OK, your allotted iterations are finished. Show the &lt;final_answer&gt;.
					</UserMessage>
				)}
			</>
		);
	}
}
