/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptSizing, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import { GenericBasePromptElementProps } from '../../../context/node/resolvers/genericPanelIntentInvocation';
import { ToolName } from '../../../tools/common/toolNames';
import { CopilotToolMode } from '../../../tools/common/toolsRegistry';
import { SafetyRules } from '../base/safetyRules';
import { TerminalStatePromptElement } from '../base/terminalState';
import { ChatToolCalls } from '../panel/toolCalling';

export interface ExecutionSubagentPromptProps extends GenericBasePromptElementProps {
	readonly maxExecutionTurns: number;
	/** True if a previous {@link ToolName.CoreRunInTerminal} call timed out or was
	 * invoked in async/background mode; the model is told to stop calling tools
	 * and emit its `<final_answer>`. */
	readonly hasBackgroundCommand?: boolean;
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
					When calling {ToolName.CoreRunInTerminal}, you MUST follow these rules:<br />
					- Always use mode="sync".<br />
					- Always include "timeout" in milliseconds. Use timeout=30000 for short commands, or timeout=120000 for builds and test suites.<br />
					- Only call {ToolName.CoreRunInTerminal} once per turn. Do NOT call it in parallel.<br />
					- If a command may prompt for confirmation, use flags like --yes, -y, or pipe from `yes` to auto-confirm.<br />
					<br />
					Once you have finished, return a message with ONLY: the &lt;final_answer&gt; tag to provide a compact summary of each command that was run.<br />
					<br />
					Example:<br />
					<br />
					[Call {ToolName.CoreRunInTerminal} with {'{'}"command": "make", "explanation": "Build the project", "goal": "Build the project", "mode": "sync", "timeout": 30000{'}'}]<br />
					<br />
					[Result: No Makefile found.]<br />
					<br />
					[Call {ToolName.CoreRunInTerminal} with {'{'}"command": "cmake . && make", "explanation": "Build with cmake", "goal": "Build the project", "mode": "sync", "timeout": 120000{'}'}]<br />
					<br />
					[Result: Build unsuccessful with errors.]<br />
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
				{!isLastTurn && this.props.hasBackgroundCommand && (
					<UserMessage priority={900}>
						One or more commands are running in the background. You do not have the ability to monitor them. Show the &lt;final_answer&gt;.
					</UserMessage>
				)}
			</>
		);
	}
}