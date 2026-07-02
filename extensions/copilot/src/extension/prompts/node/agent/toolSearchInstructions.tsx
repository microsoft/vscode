/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptElementProps, PromptSizing } from '@vscode/prompt-tsx';
import type { LanguageModelToolInformation } from 'vscode';
import { CUSTOM_TOOL_SEARCH_NAME } from '../../../../platform/networking/common/anthropic';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { IToolDeferralService } from '../../../../platform/networking/common/toolDeferralService';
import { Tag } from '../base/tag';

export interface ToolSearchToolPromptProps extends BasePromptElementProps {
	readonly availableTools: readonly LanguageModelToolInformation[] | undefined;
}

export interface DeferredToolListReminderProps extends BasePromptElementProps {
	readonly availableTools: readonly LanguageModelToolInformation[] | undefined;
}

/**
 * True when `availableTools` contains at least one tool that the deferral
 * service treats as deferred. Shared between the system-prompt guidance and
 * the global-context list so they appear/disappear together.
 */
export function hasDeferredTool(
	availableTools: readonly LanguageModelToolInformation[] | undefined,
	toolDeferralService: IToolDeferralService,
): boolean {
	return !!availableTools?.some(tool => !toolDeferralService.isNonDeferredTool(tool.name));
}

/**
 * Condensed tool search instructions shared across model prompts.
 * Renders deferred-tool search *guidance* when the endpoint supports tool
 * search and at least one deferred tool is available. The list itself is
 * rendered by `DeferredToolListReminder` inside the global agent context.
 */
export class ToolSearchToolPromptOptimized extends PromptElement<ToolSearchToolPromptProps> {
	constructor(
		props: PromptElementProps<ToolSearchToolPromptProps>,
		@IToolDeferralService private readonly toolDeferralService: IToolDeferralService,
	) {
		super(props);
	}

	async render(state: void, sizing: PromptSizing) {
		const endpoint = sizing.endpoint as IChatEndpoint | undefined;
		if (!endpoint?.supportsToolSearch || !hasDeferredTool(this.props.availableTools, this.toolDeferralService)) {
			return;
		}

		return <Tag name='toolSearchInstructions'>
			You MUST use {CUSTOM_TOOL_SEARCH_NAME} to load deferred tools BEFORE calling them. Calling a deferred tool without loading it first will fail.<br />
			<br />
			Describe what capability you need in natural language. The search uses semantic similarity to find the most relevant tools.<br />
			<br />
			Do NOT call {CUSTOM_TOOL_SEARCH_NAME} again for a tool already returned by a previous search. If a search returns no matching tools, the tool is not available. Do not retry with different patterns.<br />
		</Tag>;
	}
}

/**
 * Emits the list of deferred tools. Rendered inside `GlobalAgentContext` so it
 * appears once at the start of the conversation and is then frozen for the
 * remainder of the session via `GlobalContextMessageMetadata` — keeps the
 * list out of every per-turn user message and out of the system prompt prefix.
 *
 * Self-gates on `endpoint.supportsToolSearch`. The surrounding `<Tag>` name
 * matches the reference used by `tool_search`'s tool description.
 *
 * Note: the snapshot is taken at first render. Tools that become available
 * later in the conversation (e.g. MCP servers connecting mid-session) won't
 * appear in this list.
 */
export class DeferredToolListReminder extends PromptElement<DeferredToolListReminderProps> {
	constructor(
		props: PromptElementProps<DeferredToolListReminderProps>,
		@IToolDeferralService private readonly toolDeferralService: IToolDeferralService,
	) {
		super(props);
	}

	async render(state: void, sizing: PromptSizing) {
		const endpoint = sizing.endpoint as IChatEndpoint | undefined;
		if (!endpoint?.supportsToolSearch || !this.props.availableTools) {
			return;
		}

		const deferredTools = this.props.availableTools
			.filter(tool => !this.toolDeferralService.isNonDeferredTool(tool.name))
			.map(tool => tool.name)
			.sort();

		if (deferredTools.length === 0) {
			return;
		}

		return <Tag name='availableDeferredTools'>
			Available deferred tools (must be loaded with {CUSTOM_TOOL_SEARCH_NAME} before use):<br />
			{deferredTools.join('\n')}
		</Tag>;
	}
}

export { CUSTOM_TOOL_SEARCH_NAME };
