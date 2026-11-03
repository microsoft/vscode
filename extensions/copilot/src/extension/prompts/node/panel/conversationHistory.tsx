/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AssistantMessage, BasePromptElementProps, Chunk, PrioritizedList, PromptElement, PromptPiece, PromptSizing, TokenLimit, UserMessage } from '@vscode/prompt-tsx';
import { modelPrefersInstructionsAfterHistory } from '../../../../platform/endpoint/common/chatModelCapabilities';
import { URI } from '../../../../util/vs/base/common/uri';
import { Location } from '../../../../vscodeTypes';
import { ChatVariablesCollection, PromptVariable } from '../../../prompt/common/chatVariablesCollection';
import { IResultMetadata, Turn, TurnStatus } from '../../../prompt/common/conversation';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { AgentUserMessageInHistory } from '../agent/agentConversationHistory';
import { renderedMessageToTsxChildren } from '../agent/agentPrompt';
import { InstructionMessage } from '../base/instructionMessage';
import { IPromptEndpoint } from '../base/promptRenderer';
import { ChatVariablesAndQuery } from './chatVariables';
import { ChatToolCalls } from './toolCalling';

interface ConversationHistoryProps extends BasePromptElementProps {
	history: readonly Turn[];
	priority: number;
	/**
	 * Signal that is used to roll up the history into a single message, only requests
	 * are considered (and historical responses are assumed to be source code).
	 */
	inline?: boolean;
	currentTurnVars?: ChatVariablesCollection;
	omitPromptVariables?: boolean;
}

/**
 * This element should wrap instructions specific to any given model. It should
 * include any {@link InstructionMessage}, and depending on the model it
 * either includes the history before or after the instruction message.
 *
 * You should use `passPriority` with this: https://github.com/microsoft/vscode-prompt-tsx?tab=readme-ov-file#passing-priority
 *
 * @example
 *
 * <HistoryWithInstructions passPriority priority={700} history={history}>
 *   <InstructionMessage>Do the thing</InstructionMessage>
 * </HistoryWithInstructions>
 */
export class HistoryWithInstructions extends PromptElement<Omit<ConversationHistoryProps, 'priority'> & { historyPriority: number }> {
	constructor(
		props: Omit<ConversationHistoryProps, 'priority'> & { historyPriority: number },
		@IPromptEndpoint private readonly promptEndpoint: IPromptEndpoint
	) {
		super(props);
	}
	override render(_state: void, sizing: PromptSizing): PromptPiece {
		const ep = this.promptEndpoint;
		const { children, ...props } = this.props;
		if (!children?.some(c => typeof c === 'object' && c.ctor === InstructionMessage)) {
			// This is a sanity check, and could be removed if we eventually want to
			// have wrappers around InstructionMessages, but for now this is useful.
			throw new Error(`HistoryWithInstructions must have an InstructionMessage child`);
		}

		const after = modelPrefersInstructionsAfterHistory(ep.family);
		return <>
			{after ? <ConversationHistory  {...props} passPriority={false} priority={this.props.historyPriority} /> : undefined}
			{...children}
			{after ? undefined : <ConversationHistory  {...props} passPriority={false} priority={this.props.historyPriority} />}
		</>;
	}
}

/**
 * @deprecated use `HistoryWithInstructions` instead
 */
export class ConversationHistory extends PromptElement<ConversationHistoryProps> {
	override render(_state: void, _sizing: PromptSizing): PromptPiece<any, any> | undefined {
		// exclude turns from the history that errored due to prompt filtration
		let turnHistory = this.props.history.filter(turn => turn.responseStatus !== TurnStatus.PromptFiltered);

		if (this.props.inline && turnHistory.length > 0) {
			const historyMessage = `The current code is a result of a previous interaction with you. Here are my previous messages: \n- ${turnHistory.map(r => r.request.message).join('\n- ')}`;
			turnHistory = [new Turn(undefined, { message: historyMessage, type: 'user' }, undefined)];
		}

		const history: (UserMessage | AssistantMessage)[] = [];
		turnHistory.forEach((turn, index) => {
			if (turn.request.type === 'user') {
				const promptVariables = (turn.promptVariables && !this.props.omitPromptVariables) ? this.removeDuplicateVars(turn.promptVariables, this.props.currentTurnVars, turnHistory.slice(index + 1)) : new ChatVariablesCollection([]);
				history.push(<ChatVariablesAndQuery priority={900} chatVariables={promptVariables} query={turn.request.message} omitReferences={true} embeddedInsideUserMessage={false} />);
			}
			if (turn.responseMessage?.type === 'model' && ![TurnStatus.OffTopic, TurnStatus.Filtered].includes(turn.responseStatus)) {
				history.push(<AssistantMessage name={turn.responseMessage.name}>{turn.responseMessage.message}</AssistantMessage>);
			}
		});

		return (
			// Conversation history is currently limited to 32k tokens to avoid
			// unnecessarily pushing into the larger and slower token SKUs
			<TokenLimit max={32768}>
				<PrioritizedList priority={this.props.priority} descending={false}>{history}</PrioritizedList>
			</TokenLimit>
		);
	}

	private removeDuplicateVars(historyVars: ChatVariablesCollection, currentTurnVars: ChatVariablesCollection | undefined, followingMessages: Turn[]): ChatVariablesCollection {
		// TODO this is very simple, maybe we could use getUniqueReferences to merge ranges and be smarter. But it would take some rewriting of history for the model to
		// understand what each history message was referring to.
		return historyVars.filter(v1 => {
			if (followingMessages.some(m => m.promptVariables?.find(v2 => variableEquals(v1, v2)))) {
				return false;
			}

			if (currentTurnVars?.find(v2 => variableEquals(v1, v2))) {
				return false;
			}

			return true;
		});
	}
}

function variableEquals(v1: PromptVariable, v2: PromptVariable) {
	if (v1.uniqueName !== v2.uniqueName) {
		return false;
	}

	if (URI.isUri(v1.value) && URI.isUri(v2.value)) {
		return v1.value.toString() === v2.value.toString();
	}

	if (v1.value instanceof Location && v2.value instanceof Location) {
		return JSON.stringify(v1.value) === JSON.stringify(v2.value);
	}

	return false;
}

export interface ConversationHistoryWithToolsProps extends BasePromptElementProps {
	readonly priority: number;
	readonly promptContext: IBuildPromptContext;
}

/**
 * This is conversation history including tool calls, but not summaries. New usages should use SummarizedConversationHistory instead.
 */
export class ConversationHistoryWithTools extends PromptElement<ConversationHistoryWithToolsProps> {
	override async render(state: void, sizing: PromptSizing) {
		const history: PromptElement[] = [];
		const contextHistory = this.props.promptContext.history;
		for (const [i, turn] of contextHistory.entries()) {
			const metadata = turn.responseChatResult?.metadata as IResultMetadata | undefined;

			if (metadata?.renderedUserMessage) {
				history.push(<UserMessage><Chunk>{renderedMessageToTsxChildren(metadata.renderedUserMessage, false)}</Chunk></UserMessage>);
			} else {
				history.push(<AgentUserMessageInHistory turn={turn} />);
			}

			if (Array.isArray(metadata?.toolCallRounds) && metadata.toolCallRounds?.length > 0) {
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
					toolCallRounds={metadata.toolCallRounds}
					toolCallResults={toolCallResults}
					isHistorical={!(toolCallResultInNextTurn && i === contextHistory.length - 1)}
				/>);
			} else if (turn.responseMessage) {
				history.push(<AssistantMessage>{turn.responseMessage?.message}</AssistantMessage>);
			}
		}

		return (<PrioritizedList priority={this.props.priority} descending={false}>{history}</PrioritizedList>);
	}
}
