/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement } from '@vscode/prompt-tsx';
import type { LanguageModelToolInformation } from 'vscode';
import { ToolName } from '../../../tools/common/toolNames';
import { Tag } from '../base/tag';
import { detectToolCapabilities } from './defaultAgentInstructions';

export interface PreferSemanticSearchInstructionsProps extends BasePromptElementProps {
	readonly availableTools: readonly LanguageModelToolInformation[] | undefined;
}

/**
 * Instructions that push the agent to reach for {@link ToolName.Codebase} before spending context on
 * exploratory reads and text searches. Rendered by `AgentPrompt` when the codebase tool is available
 * and {@link ConfigKey.SemanticSearchToolMode} is `preferred`.
 */
export class PreferSemanticSearchInstructions extends PromptElement<PreferSemanticSearchInstructionsProps> {
	render() {
		const tools = detectToolCapabilities(this.props.availableTools);
		const subagentTools = [ToolName.SearchSubagent, ToolName.ExploreSubagent, ToolName.CoreRunSubagent].filter(name => tools[name]);
		const subagentToolList = subagentTools.map(name => `\`${name}\``).join(' or ');

		return <Tag name='semantic_search_requirements'>
			`{ToolName.Codebase}` locates code by meaning rather than by exact text. Use it when you need to find relevant code but do not know which files contain it or which exact terms the repository uses. This is more efficient than speculative file reads or a trail of guessed keyword searches.<br />
			<br />
			Rules:<br />
			- For unknown-location exploration that you perform yourself, use `{ToolName.Codebase}` before guessing file paths or keywords.<br />
			{tools[ToolName.ReadFile] && <>- When a file path is already known, read that file directly with `{ToolName.ReadFile}`.<br /></>}
			{tools[ToolName.FindTextInFiles] && <>- When you know the exact text to find, search for it directly with `{ToolName.FindTextInFiles}`. Do not use a chain of guessed keyword searches as a substitute for one semantic search.<br /></>}
			{tools[ToolName.ReadFile] && <>- After semantic search identifies relevant code, read only the files and regions needed for the task.<br /></>}
			{subagentTools.length > 0 && <>- If other instructions tell you to delegate codebase exploration to {subagentToolList}, follow those instructions instead of calling `{ToolName.Codebase}` yourself.<br /></>}
			- Keep each query to a single concept and phrase it with enough context to convey intent, for example "how websocket connections are authenticated" rather than "websocket". Split a multi-concept question into separate focused queries.<br />
		</Tag>;
	}
}
