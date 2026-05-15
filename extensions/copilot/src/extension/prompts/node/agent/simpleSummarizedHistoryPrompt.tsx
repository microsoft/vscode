/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Chunk, PrioritizedList, PromptElement, PromptElementProps, UserMessage } from '@vscode/prompt-tsx';
import type { LanguageModelToolResult } from 'vscode';
import { truncate } from '../../../../util/vs/base/common/strings';
import { IToolCall, IToolCallRound } from '../../../prompt/common/intents';
import { Tag } from '../base/tag';
import { ToolResult } from '../panel/toolCalling';
import { DefaultOpenAIKeepGoingReminder } from './openai/defaultOpenAIPrompt';
import { SummarizedAgentHistoryProps } from './summarizedConversationHistory';

/**
 * "SimpleSummarizedHistory" is a fallback for when the main history summarization fails, either due to the conversation history being longer than the context window, or some other reason.
 * We can end up with history too long to summarize normally in a few ways:
 * - User switched from a model with a larger context window to one with a smaller context window.
 * - The context window size was changed for a model.
 * - A previous summarization failed for some reason or was cancelled.
 * - Switching from ask mode (no summarization) to agent mode.
 * - Upgrading from an earlier version with no summarization.
 * - Toggling the summarization setting.
 *
 * We could deal with this by summarizing recursively over context-window-sized chunks, but I don't want to make the user wait for multiple rounds of summarization.
 * Instead, the fallback strategy is basically this:
 * - Render one UserMessage with a text-based summary of the conversation. Attachments and other large extra context is omitted.
 * - Very large tool results and arguments are truncated.
 * - Pack the context window with as much of the history as possible in a PrioritizedList, but give the first user message the highest priority.
 *
 * This should let us strike a balance between speed and reliability and summarization fidelity.
 */
export class SimpleSummarizedHistory extends PromptElement<SummarizedAgentHistoryProps> {
	override async render() {
		const historyEntries = this.getEntriesToRender();
		const firstEntry = historyEntries.at(0);
		const restEntries = historyEntries.slice(1);

		return <UserMessage priority={this.props.priority}>
			The following is a compressed version of the preceeding history in the current conversation. The first message is kept, some history may be truncated after that:<br />
			{firstEntry && this.renderEntry(firstEntry, Number.MAX_SAFE_INTEGER)}
			<PrioritizedList priority={5000} descending={false}>
				{...restEntries.map(entry => this.renderEntry(entry))}
			</PrioritizedList>
		</UserMessage>;
	}

	private getEntriesToRender(): (IRoundHistoryEntry | string)[] {
		const entries: (IRoundHistoryEntry | string)[] = [];

		for (const round of Array.from(this.props.promptContext.toolCallRounds ?? []).reverse()) {
			entries.unshift({ round, results: this.props.promptContext.toolCallResults });
			if (round.summary) {
				return entries;
			}
		}

		if (this.props.promptContext.query) {
			entries.unshift(this.props.promptContext.query);
		}

		for (const turn of Array.from(this.props.promptContext.history ?? []).reverse()) {
			for (const round of Array.from(turn.rounds).reverse()) {
				const results = turn.resultMetadata?.toolCallResults;
				entries.unshift({ round, results });
				if (round.summary) {
					return entries;
				}
			}
			entries.unshift(turn.request.message);
		}

		return entries;
	}

	private renderEntry(entry: IRoundHistoryEntry | string, priorityOverride?: number) {
		if (typeof entry === 'string') {
			return <ChunkTag name='user' priority={priorityOverride}>
				{entry}
			</ChunkTag>;
		}

		if (entry.round.summary) {
			return <ChunkTag name='conversation-summary' priority={priorityOverride}>
				{entry.round.summary}
				{this.props.endpoint.family === 'gpt-4.1' && <Tag name='reminderInstructions'>
					<DefaultOpenAIKeepGoingReminder />
				</Tag>}
			</ChunkTag>;
		}

		return this.renderRound(entry.round, entry.results ?? {});
	}

	private renderRound(round: IToolCallRound, results: Record<string, LanguageModelToolResult>) {
		const asstMsg = round.response ?
			<ChunkTag name='assistant'>
				{round.response}
			</ChunkTag> :
			<ChunkTag name='assistant' />;
		return [
			asstMsg,
			...round.toolCalls.map(toolCall => this.renderToolCall(toolCall, results[toolCall.id]))
		];
	}

	private renderToolCall(toolCall: IToolCall, result: LanguageModelToolResult | undefined) {
		return <ChunkTag name='tool'>
			Used tool "{toolCall.name}" with arguments: {truncate(toolCall.arguments, 200)}<br />
			{result ?
				<ToolResult content={result.content} truncate={this.props.maxToolResultLength / 2} toolCallId={toolCall.id} sessionId={this.props.promptContext.request?.sessionId} /> :
				<>Tool result empty</>}
		</ChunkTag>;
	}
}

type ChunkTagProps = PromptElementProps<{
	readonly name: string;
	readonly attrs?: Record<string, string | undefined | boolean | number>;
}>;

class ChunkTag extends PromptElement<ChunkTagProps> {
	render() {
		const { name, children, attrs = {} } = this.props;

		return <Chunk>
			<Tag name={name} attrs={attrs}>
				{children}
			</Tag>
		</Chunk>;
	}
}

interface IRoundHistoryEntry {
	readonly round: IToolCallRound;
	readonly results?: Record<string, LanguageModelToolResult>;
}
