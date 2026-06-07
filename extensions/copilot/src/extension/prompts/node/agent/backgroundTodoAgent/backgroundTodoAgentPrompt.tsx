/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, Chunk, PrioritizedList, PromptElement, PromptSizing, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import { BGToolCallRound, ReadOnlyTurnHistory } from './backgroundTodoAgentSessionHistoryStore';

const BACKGROUND_TODO_SYSTEM_MESSAGE = `You are a background task tracker for the main coding agent. Your only job is to maintain a structured todo list for the user's coding request by calling manage_todo_list.

Default to silence. Only call manage_todo_list when the resulting list would actually differ from the current one in some item, status, or order. If nothing would change, reply with an empty message and no commentary. When you do update, call the tool exactly once with the complete final list.

Trajectory format:
- <previous-context>: rounds from before this pass, given as continuity context only. NEVER treat them as new work, and never recreate a list just because old rounds are visible - the current list already reflects them.
- <new-activity>: rounds since your last pass. Use these to decide whether the list should change.
- Each <round> may contain <thinking>, a <tool-calls> list, and a <response>. Work from previous turns is already finished.

Do NOT call the tool when:
- The current list already matches the work: same items, statuses, and order.
- No list exists and the request is read-only, research, explanation, a question, a greeting, or a single step.
- The activity is only exploration: searching, reading files, diagnostics, linting, formatting, type-checking, or iterative fixes toward one goal.
- Many tool calls or many edited files all serve one logical change. High volume is NOT multi-step work.

Create or expand the list ONLY when the user's request itself is clearly multi-step:
- The user asked for several separate deliverables, or gave a numbered or enumerated list.
- The request needs three or more distinct, user-visible outcomes.
- The agent stated a multi-phase plan, or genuinely new high-level work appears that no existing item covers.
Judge by the NATURE of the work, not the volume of activity. Operational activity (exploration, reads, diagnostics, iterative fixes) is never a deliverable; only distinct user-visible outcomes are.

Granularity:
- Track user-visible outcomes or broad phases, never implementation details.
- Never list operational steps (search, read, lint, format, type-check, gather context) as items.
- Prefer 2-4 items; never create a single-item list; exceed 5 only for clearly separate major phases.
- Collapse related edits, helpers, flags, and tweaks into one item. Consolidate an over-granular list into high-level phases, preserving progress.

Status (each item is not-started, in-progress, or completed):
- Mark an item completed ONLY with concrete evidence in the trajectory: edits, created files, commands run, or passing tests. Exploration, searches, reads, and findings are NOT evidence.
- Keep exactly one item in-progress while any work remains (items may be done in any order); when you complete an item, promote the next. Only when every item is completed may there be zero in-progress, and never more than one.
- Completed items NEVER regress - once completed, always completed. The current list is authoritative for completion.
- Order items as completed, then in-progress, then not-started.

Never create a completed item:
- A brand-new list has NO completed items: exactly one item is in-progress and the rest are not-started, even when the trajectory shows that work is already done.
- A newly added item starts not-started. Only an item already present in the current list may become completed, and only on a later pass once evidence exists.
- Example - first creating the list after the agent already finished step 1:
  WRONG: 1. Add validation [completed], 2. Set up rate limiting [not-started], 3. Write tests [not-started]
  RIGHT: 1. Add validation [in-progress], 2. Set up rate limiting [not-started], 3. Write tests [not-started]
  Mark step 1 completed on a later pass, never when the item first appears.

Format:
- Titles are 3-8 words naming an outcome ("Add logging support", not "Add shared logger to analyzer package"). Maximum 8 words.
- Use sequential numeric IDs starting at 1. Keep existing IDs and wording unless scope genuinely changes, and always include every existing item, especially completed ones.

The list must cover the whole user request so the user can see at a glance what is done, what is happening now, and what is still ahead.`;

/**
 * Extra system instruction appended on the final background pass of a turn.
 * Signals that the main agent has stopped running — whether it completed its
 * work or halted on an error — so this is the last chance to reconcile the list.
 */
const BACKGROUND_TODO_FINAL_REVIEW_NOTE = `This is the FINAL pass for this turn. The main agent has stopped - it either finished or halted on an error - and no further activity will follow.

Reconcile the list one last time against the full trajectory:
- Mark an item completed only when the trajectory shows concrete evidence (edits, created files, commands run, or passing tests). Do not mark anything completed merely because the turn ended or the agent errored.
- Mark a not-started item completed if later work clearly accomplished it.
- Leave genuinely untouched or abandoned work as-is; never invent progress.
- If the list already reflects the final state, do not call the tool.`;


export interface BackgroundTodoPromptProps extends BasePromptElementProps {
	/** Current todo list state as rendered markdown, or undefined if no todos exist yet. */
	readonly currentTodos: string | undefined;
	/** Final todo list carried over from the previous turn as rendered markdown, or undefined if the previous turn had none. */
	readonly previousTurnTodos: string | undefined;
	/** The user's original request message. */
	readonly userRequest: string | undefined;
	/** Round-first conversation history for the background todo agent. */
	readonly history: ReadOnlyTurnHistory;
	/** When true, this is the last pass for the turn because the main agent has finished running. */
	readonly isFinalReview?: boolean;
}

export class BackgroundTodoPrompt extends PromptElement<BackgroundTodoPromptProps> {
	async render(_state: void, _sizing: PromptSizing) {
		const { currentTodos, previousTurnTodos, userRequest, history, isFinalReview } = this.props;
		const hasProcessedRounds = history.old.length > 0;

		return (
			<>
				<SystemMessage priority={1000}>{BACKGROUND_TODO_SYSTEM_MESSAGE}</SystemMessage>

				{isFinalReview && (
					<SystemMessage priority={990}>{BACKGROUND_TODO_FINAL_REVIEW_NOTE}</SystemMessage>
				)}

				<UserMessage priority={950}>
					The user asked the main agent:{'\n'}
					{userRequest}
				</UserMessage>

				{currentTodos && (
					<UserMessage priority={900}>
						Current todo list:{'\n'}
						{escapeForPromptTag(currentTodos)}
					</UserMessage>
				)}

				{previousTurnTodos && (
					<UserMessage priority={870}>
						{'<previous-turn-todos>\n'}
						This is the todo list as it stood at the end of the previous turn, shown only so you know what was already accomplished. Those items are finished — do NOT re-add or re-display the completed todos in the new list. Track only work that belongs to the current turn.{'\n'}
						{escapeForPromptTag(previousTurnTodos)}
						{'\n</previous-turn-todos>'}
					</UserMessage>
				)}

				{hasProcessedRounds && (
					<UserMessage priority={850} flexGrow={1}>
						{'<previous-context>\n'}
						<PrioritizedList descending={false} passPriority={true}>
							{history.old.map(round => (
								<PreviousContextRoundChunk
									round={round}
									totalPreviousRounds={history.old.length}
								/>
							))}
						</PrioritizedList>
						{'\n</previous-context>'}
					</UserMessage>
				)}

				<UserMessage priority={880}>
					{'<new-activity>\nUse these rounds to decide whether the todo list needs updating:\n'}
					{renderRounds(history.new)}
					{'\n</new-activity>'}
				</UserMessage>
			</>
		);
	}
}

interface PreviousContextRoundChunkProps extends BasePromptElementProps {
	readonly round: BGToolCallRound;
	readonly totalPreviousRounds: number;
}

/**
 * Prompt element rendering a single previous-context round as its own
 * Chunk so that prompt-tsx can drop older rounds independently under
 * budget pressure.  Each chunk is self-contained: it wraps its round
 * in `<turn>` tags so that pruning any subset of rounds never produces
 * unbalanced or mis-nested tags.
 */
class PreviousContextRoundChunk extends PromptElement<PreviousContextRoundChunkProps> {
	render() {
		const priority = computeRoundPriority(this.props.round, this.props.totalPreviousRounds);
		const { round } = this.props;
		return (
			<Chunk priority={priority} flexGrow={1}>
				{renderBackgroundTodoRound(round)}
			</Chunk>
		);
	}
}

export function renderRounds(rounds: readonly BGToolCallRound[]): string {
	if (rounds.length === 0) {
		return '';
	}
	const lines: string[] = [];
	for (const round of rounds) {
		lines.push(renderBackgroundTodoRound(round));
	}
	return lines.join('\n');
}

/**
 * Render a round into a stable, parseable text block. Used by the
 * prompt-tsx round chunk so the model sees a uniform shape per round.
 */
export function renderBackgroundTodoRound(round: BGToolCallRound): string {
	const lines: string[] = [`<round index="${round.index}">`];

	if (round.thinking) {
		lines.push('<thinking>');
		lines.push(escapeForPromptTag(round.thinking));
		lines.push('</thinking>');
	}

	if (round.toolCalls.length > 0) {
		lines.push('<tool-calls>');
		for (const tc of round.toolCalls) {
			const name = escapeInlineForPromptTag(tc.name);
			const args = escapeInlineForPromptTag(tc.arguments);
			lines.push(`Tool Call Name: ${name}`);
			lines.push(`Arguments: ${args}`);
		}
		lines.push('</tool-calls>');
	}

	if (round.response) {
		lines.push('<response>');
		lines.push(escapeForPromptTag(round.response));
		lines.push('</response>');
	}

	lines.push('</round>');
	return lines.join('\n');
}

 /*
 * Neutralize angle brackets in user-controllable text so it cannot
 * forge or close any of the tags emitted around the trajectory
 * (`<round>`, `<thinking>`, `<tool-calls>`, `<response>`,
 * `<previous-context>`, `<new-activity>`, `<full-trajectory>`,
 * `<previous-turn-todos>`).
 */
function escapeForPromptTag(text: string): string {
	return text.replace(/</g, '\u2039').replace(/>/g, '\u203A');
}

function escapeInlineForPromptTag(text: string): string {
	return escapeForPromptTag(text.replace(/\s+/g, ' ').trim());
}

/**
 * Compute a prompt-tsx priority for a previous-context round so newer
 * rounds survive budget pressure ahead of older history. Values are
 * clamped to the [700, 879] range so they stay below the system
 * message (1000), user request (950), current todos (900), and the
 * new-activity block (880). New-activity rounds are rendered without
 * pruning so they don't need a priority helper.
 */
export function computeRoundPriority(round: BGToolCallRound, totalPreviousRounds: number): number {
	// 700 base + monotonic index boost so newer context survives longer,
	// capped strictly below the new-activity priority.
	return Math.min(879, 700 + Math.min(round.index, totalPreviousRounds));
}
