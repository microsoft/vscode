/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptSizing } from '@vscode/prompt-tsx';
import { ToolName } from '../../../tools/common/toolNames';
import { InstructionMessage } from '../base/instructionMessage';
import { ResponseTranslationRules } from '../base/responseTranslationRules';
import { Tag } from '../base/tag';
import { ResponseRenderingRules } from '../panel/editorIntegrationRules';
import { DefaultAgentPromptProps, detectToolCapabilities, getEditingReminder, ReminderInstructionsProps, ToolReferencesHintProps } from './defaultAgentInstructions';

/**
 * A deliberately minimal system prompt for capable agentic coding models.
 *
 * The premise: every line of prompt scaffolding encodes an assumption about
 * something the model can't do on its own. As models improve, those assumptions
 * go stale. This prompt keeps only the load-bearing pieces — role, edit-tool
 * preference (vs. printing code blocks), and output formatting — and trusts the
 * tool schemas to convey the rest.
 *
 * Plumb this through from a model's `IAgentPrompt` resolver when you want to
 * strip back scaffolding. Not auto-registered.
 */
export class DefaultMinimalPrompt extends PromptElement<DefaultAgentPromptProps> {
	async render(state: void, sizing: PromptSizing) {
		const tools = detectToolCapabilities(this.props.availableTools);

		return <InstructionMessage>
			<Tag name='instructions'>
				You are a highly capable automated coding agent with expert-level knowledge across many programming languages and frameworks.<br />
				The user will ask a question or request a task. Use the available tools to gather context, take action, and complete the task end-to-end. Don't pause to ask questions you can answer by looking.<br />
				Keep going until the user's request is fully resolved. Only stop when the task is complete or you cannot continue.<br />
				{tools.hasSomeEditTool && <>Use the appropriate edit tool to modify files. Never print a code block of file changes unless the user asked for it.<br /></>}
				{tools[ToolName.CoreRunInTerminal] && <>Use the {ToolName.CoreRunInTerminal} tool to run commands. Never print a code block of a terminal command unless the user asked for it. Never use terminal commands to edit files.<br /></>}
				When invoking a tool that takes a file path, always use the absolute path.
			</Tag>
			<Tag name='outputFormatting'>
				Use Markdown. Wrap file paths and symbols in backticks.<br />
				<ResponseRenderingRules />
			</Tag>
			<ResponseTranslationRules />
		</InstructionMessage>;
	}
}

/**
 * Minimal reminder instructions — just the edit-tool hints from {@link getEditingReminder}.
 * Skips the verbose "keep going" / autonomy nudges that capable models don't need.
 */
export class DefaultMinimalReminderInstructions extends PromptElement<ReminderInstructionsProps> {
	async render(state: void, sizing: PromptSizing) {
		return <>
			{getEditingReminder(this.props.hasEditFileTool, this.props.hasReplaceStringTool, false /* useStrongReplaceStringHint */, this.props.hasMultiReplaceStringTool)}
		</>;
	}
}

/**
 * Minimal tool-references hint — just lists attached tools without extra prose.
 */
export class DefaultMinimalToolReferencesHint extends PromptElement<ToolReferencesHintProps> {
	async render() {
		if (!this.props.toolReferences.length) {
			return;
		}
		return <Tag name='toolReferences'>
			The user attached these tools and they are likely relevant to the request:<br />
			{this.props.toolReferences.map(tool => `- ${tool.name}`).join('\n')}
		</Tag>;
	}
}
