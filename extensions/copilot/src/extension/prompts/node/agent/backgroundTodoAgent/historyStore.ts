/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThinkingData } from '../../../../../platform/thinking/common/thinking';
import { IBuildPromptContext, IToolCall, IToolCallRound } from '../../../../prompt/common/intents';
import { ToolName } from '../../../../tools/common/toolNames';

export type ToolCategory = 'substantive' | 'excluded';

type BGToolCall = Pick<IToolCall, 'name' | 'arguments'> & { category: ToolCategory };
export type BGToolCallRound = Pick<IToolCallRound, 'id' | 'response'> & { index: number; toolCalls: BGToolCall[]; thinking?: string };

type TurnHistory = {
	old: BGToolCallRound[];
	new: BGToolCallRound[];
	unprocessedSubstantiveRoundCount: number;
};

export type ReadOnlyTurnHistory = {
	old: ReadonlyArray<Readonly<BGToolCallRound>>;
	new: ReadonlyArray<Readonly<BGToolCallRound>>;
	unprocessedSubstantiveRoundCount: number;
};

export class BackgroundTodoAgentSessionHistoryStore {
	private trackedToolCallRoundIds = new Set<string>();
	private turnHistories = new Map<string, TurnHistory>();
	private turnUserRequest = new Map<string, string>();

	// An index for tool calls that is sequentiall incrememented
	// The assumption is that all tool calls are seen and itereated in order.
	private index = 0;

	trackPromptContext(turnId: string, promptContext: IBuildPromptContext) {
		if (!this.turnUserRequest.has(turnId)) {
			this.turnUserRequest.set(turnId, promptContext.query);
		}
		this.trackToolCalls(turnId, promptContext.toolCallRounds ?? []);
	}

	private trackToolCalls(turnId: string, toolCallRounds: readonly IToolCallRound[]) {
		let turnHistory = this.turnHistories.get(turnId);
		if (turnHistory === undefined) {
			turnHistory = { old: [], new: [], unprocessedSubstantiveRoundCount: 0 };
			this.turnHistories.set(turnId, turnHistory);
		}
		const processedToolCalls: BGToolCallRound[] = [];
		toolCallRounds.forEach((tcr => {
			// Only process previously unseen tool calls
			if (!this.trackedToolCallRoundIds.has(tcr.id)) {
				const { toolCallRound, substantiveToolCallCount } = processToolCallRound(this.index++, tcr);
				// Count the round once if it has any substantive tool call; multiple
				// calls can occur per round but should advance readiness by one round.
				if (substantiveToolCallCount > 0) {
					turnHistory.unprocessedSubstantiveRoundCount++;
				}
				processedToolCalls.push(toolCallRound);
				this.trackedToolCallRoundIds.add(tcr.id);
			}
		}));
		turnHistory.new.push(...processedToolCalls);
	}

	getTurnHistory(turnId: string): ReadOnlyTurnHistory | undefined {
		const history = this.turnHistories.get(turnId);
		if (history === undefined) {
			return undefined;
		}
		return { ...history };
	}

	markToolCallsAsProcessed(turnId: string, toolCallRoundIds: ReadonlyArray<Readonly<BGToolCallRound>>) {
		const turnHistory = this.turnHistories.get(turnId);
		if (turnHistory === undefined) {
			//TODO throw new error
			return;
		}

		const toolCallIdSet = new Set<string>(toolCallRoundIds.map(t => t.id));
		const unprocessedToolCallRounds: BGToolCallRound[] = [];
		for (const toolCallRound of turnHistory.new) {
			if (toolCallIdSet.has(toolCallRound.id)) {
				turnHistory.old.push(toolCallRound);
				// Stored rounds only retain substantive tool calls, so a non-empty
				// list means this round counted toward the substantive round total.
				if (toolCallRound.toolCalls.length > 0) {
					turnHistory.unprocessedSubstantiveRoundCount--;
				}
			} else {
				unprocessedToolCallRounds.push(toolCallRound);
			}
		}
		turnHistory.new = unprocessedToolCallRounds;
	}
}

function processToolCallRound(index: number, toolCall: IToolCallRound): {
	toolCallRound: BGToolCallRound;
	substantiveToolCallCount: number;
} {
	let substantiveToolCallCount = 0;

	const toolCallRound = {
		id: toolCall.id,
		index: index,
		response: toolCall.response,
		thinking: processThinkingData(toolCall.thinking),
		toolCalls: toolCall.toolCalls.map(t => {
			const category = classifyTool(t);
			if (category === 'substantive') {
				substantiveToolCallCount++;
			}

			return {
				name: t.name,
				arguments: t.arguments.trim().slice(0, 100),
				category: category
			};
		}).filter(t => t.category === 'substantive') // drop excluded
	};

	return { toolCallRound, substantiveToolCallCount };
}

function processThinkingData(thinkingData: ThinkingData | undefined) {
	const thinkingText = thinkingData?.text;
	if (thinkingText === undefined || typeof thinkingText === 'string') {
		return thinkingText?.trim();
	}
	return thinkingText.join('\n').trim();
}

/** Non Exhaustive list of infrastructure tools that are not progress signals. */
const EXCLUDED_TOOLS: ReadonlySet<string> = new Set([
	ToolName.CoreManageTodoList,
	ToolName.ToolSearch,
	ToolName.CoreAskQuestions,
	ToolName.SwitchAgent,
	ToolName.CoreConfirmationTool,
	ToolName.CoreConfirmationToolWithOptions,
	ToolName.CoreTerminalConfirmationTool,
	ToolName.ResolveMemoryFileUri,
	ToolName.Memory,
	ToolName.Skill,
	ToolName.SessionStoreSql,
	ToolName.EditFilesPlaceholder,
]);

function classifyTool(toolCall: IToolCall): ToolCategory {
	return EXCLUDED_TOOLS.has(toolCall.name) ? 'excluded' : 'substantive';
}
