/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AssistantMessage, BasePromptElementProps, Chunk, PrioritizedList, PromptElement, PromptSizing, UserMessage } from '@vscode/prompt-tsx';
import { IResultMetadata, Turn } from '../../../prompt/common/conversation';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { Tag } from '../base/tag';
import { ChatVariables } from '../panel/chatVariables';
import { ChatToolCalls } from '../panel/toolCalling';
import { EditedFileEvents, renderedMessageToTsxChildren } from './agentPrompt';

export interface AgentUserMessageInHistoryProps extends BasePromptElementProps {
	readonly turn: Turn;
	/** Tag name used to wrap the user query (e.g., 'userRequest' or 'user_query'). Defaults to 'userRequest'. */
	readonly userQueryTagName?: string;
}

export class AgentUserMessageInHistory extends PromptElement<AgentUserMessageInHistoryProps> {
	constructor(
		props: AgentUserMessageInHistoryProps,
	) {
		super(props);
	}

	override async render(state: void, sizing: PromptSizing) {
		const turn = this.props.turn;
		return <UserMessage>
			{turn.promptVariables && <ChatVariables flexGrow={1} priority={898} chatVariables={turn.promptVariables} isAgent={true} omitReferences />}
			{turn.editedFileEvents?.length &&
				<Tag name='context'>
					<EditedFileEvents flexGrow={2} editedFileEvents={turn.editedFileEvents} />
				</Tag>}
			<Tag name={this.props.userQueryTagName ?? 'userRequest'}>{turn.request.message}</Tag>
		</UserMessage>;
	}
}

export interface AgentConversationHistoryProps extends BasePromptElementProps {
	readonly priority: number;
	readonly promptContext: IBuildPromptContext;
	readonly userQueryTagName?: string;
}

/**
 * Agent conversation history for when summarization/cache breakpoints are disabled.
 */
export class AgentConversationHistory extends PromptElement<AgentConversationHistoryProps> {
	override async render(state: void, sizing: PromptSizing) {
		const history: PromptElement[] = [];
		const contextHistory = this.props.promptContext.history;

		// A summary (e.g. from a manual `/compact`) supersedes every message up to
		// and including the round it is attached to. Find the most recent summarized
		// round so the history it covers is dropped instead of replayed verbatim.
		// Without this, a manual `/compact` has no effect when automatic
		// summarization is disabled and the context window immediately refills on the
		// next turn. `round.summary` is populated for historical rounds by
		// `normalizeSummariesOnRounds`. This only applies an existing summary; it
		// never triggers new summarization (which stays gated behind the setting).
		let summaryTurnIndex = -1;
		let summaryRoundIndex = -1;
		findSummary: for (let t = contextHistory.length - 1; t >= 0; t--) {
			const rounds = contextHistory[t].rounds;
			for (let r = rounds.length - 1; r >= 0; r--) {
				if (rounds[r].summary) {
					summaryTurnIndex = t;
					summaryRoundIndex = r;
					break findSummary;
				}
			}
		}

		for (const [i, turn] of contextHistory.entries()) {
			// Turns fully covered by a later summary are dropped.
			if (i < summaryTurnIndex) {
				continue;
			}

			const metadata = turn.responseChatResult?.metadata as IResultMetadata | undefined;
			const isSummaryTurn = i === summaryTurnIndex;
			// Read both the summary text and the rounds we keep from one source so the
			// summary index stays valid for the slice below. `turn.rounds` is the same
			// reference as `metadata.toolCallRounds` whenever the latter is non-empty,
			// which is always the case on a summary turn (the summary lives on a real round).
			const rounds = turn.rounds;

			if (isSummaryTurn) {
				// The summary stands in for this turn's user message and the rounds up
				// to and including the summarized one.
				history.push(<UserMessage><Tag name='conversation-summary'>{rounds[summaryRoundIndex].summary}</Tag></UserMessage>);
			} else if (metadata?.renderedUserMessage) {
				history.push(<UserMessage><Chunk>{renderedMessageToTsxChildren(metadata.renderedUserMessage, false)}</Chunk></UserMessage>);
			} else {
				history.push(<AgentUserMessageInHistory turn={turn} userQueryTagName={this.props.userQueryTagName} />);
			}

			if (Array.isArray(metadata?.toolCallRounds) && metadata.toolCallRounds?.length > 0) {
				// On the summarized turn, only the rounds after the summary remain.
				const toolCallRounds = isSummaryTurn ? rounds.slice(summaryRoundIndex + 1) : metadata.toolCallRounds;
				if (toolCallRounds.length > 0) {
					// If a tool call limit is exceeded, the tool call from this turn will
					// have been aborted and any result should be found in the next turn.
					const toolCallResultInNextTurn = metadata.maxToolCallsExceeded;
					let toolCallResults = metadata.toolCallResults;
					if (toolCallResultInNextTurn) {
						const nextMetadata = contextHistory.at(i + 1)?.responseChatResult?.metadata as IResultMetadata | undefined;
						const mergeFrom = i === contextHistory.length - 1 ? this.props.promptContext.toolCallResults : nextMetadata?.toolCallResults;
						toolCallResults = { ...toolCallResults, ...mergeFrom };
					}

					history.push(<ChatToolCalls
						promptContext={this.props.promptContext}
						toolCallRounds={toolCallRounds}
						toolCallResults={toolCallResults}
						isHistorical={!(toolCallResultInNextTurn && i === contextHistory.length - 1)}
					/>);
				}
			} else if (!isSummaryTurn && turn.responseMessage) {
				history.push(<AssistantMessage>{turn.responseMessage?.message}</AssistantMessage>);
			}
		}

		return (<PrioritizedList priority={this.props.priority} descending={false}>{history}</PrioritizedList>);
	}
}
