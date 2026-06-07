/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, Chunk, PrioritizedList, PromptElement, PromptSizing, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import { BGToolCallRound, ReadOnlyTurnHistory } from './backgroundTodoAgentSessionHistoryStore';

const BACKGROUND_TODO_SYSTEM_MESSAGE = `You are a background task tracker for the main coding agent. Your only job is to maintain a structured todo list for the user's coding request.

Default to silence. Before calling manage_todo_list, ask yourself: "Would the new list differ from the current one in any item, status, or order?" If the answer is no, do not call the tool — respond with an empty message. When updating, call the tool exactly once with the complete final list. Do not write commentary.

Trajectory format:
- The agent trajectory is split into two sections:
  - <previous-context> contains rounds from before this background pass. They provide continuity context only. YOU MUST NOT TREAT THEM AS NEW WORK.
  - <new-activity> contains the rounds that happened since your previous background pass. Use these to decide whether the todo list should change.
- Each <round> block may contain the agent's optional <thinking>, a <tool-calls> list (with file path or category target and an optional intent note), and a <response> with the assistant text that followed.

Cross-turn rules:
- Work from previous turns is already finished. Their rounds are context for what was accomplished before, not new activity.
- If a todo list already exists and all rounds in <new-activity> belong to the same turn as the latest user message, compare the new work against the current list. Only call the tool if statuses or items need updating based on the new work in the current turn.
- Never recreate or re-emit a todo list just because previous turns' rounds are visible in <previous-context>. The current todo list already reflects that work.
- If the new turn's activity is trivial (e.g. a greeting, a question, or a simple acknowledgment with no substantive tool calls), you MUST NOT update the todo list.

You MUST NOT call tools when:
- The current todo list already accurately reflects the work: same items, same statuses, same order.
- No todo list exists yet and the task does not qualify for one (see below).
- The proposed list is identical to the current todo list (same items, statuses, and order).
- The user request is read-only, research, explanation, summarization, explicitly says not to write code, or is single-step.
- The task is straightforward enough that the agent can complete it in one or two steps without a plan.
- Recent activity is only exploration or read-only tool use.
- You would create todos for individual files, utilities, flags, functions, or implementation substeps instead of a high-level task plan.
- The agent is making many tool calls but all of them serve a single coherent goal — high tool-call volume does not indicate a multi-step task.
- The agent touched multiple files but only to implement one logical change — editing several files as part of one task is not multi-step work.

Create or expand todos ONLY when the user's request itself is clearly multi-step:
- The user explicitly asked for multiple separate features, fixes, or outcomes in a single request.
- The user provided a numbered list or clearly enumerated tasks.
- The user request requires three or more distinct, user-visible deliverables that cannot reasonably be grouped into one.
- The main agent explicitly stated a full multi-phase plan covering separate outcomes.
- New concrete high-level work is discovered that no existing item covers and genuinely expands the scope of the request.
- The current list is too granular and can be consolidated into high-level phases without losing progress.

Primary signal is the NATURE of the work, not the volume of activity:
- High tool-call count alone is not evidence of multi-step work. An agent may read dozens of files, run searches, and iterate through compilation errors to accomplish a single task.
- Distinguish between operational activity (exploration, reads, linting, type-checking, iterative fixes) and distinct deliverables. Only deliverables become todo items.
- A single logical change implemented across many files is still one task.
- Use the agent's stated plan and the shape of its mutations — not how many rounds occurred — to decide whether multiple distinct outcomes are being pursued.

Granularity rules:
- Never create a single-item todo list. If there is only one step, do not create a list.
- Prefer 2-4 high-level items; use more than 5 only when the user's request has clearly separate major phases.
- Each item should describe a user-visible outcome or broad work phase, not an implementation detail.
- Operational sub-tasks must never appear as todo items. Searching, grepping, reading files, running linters, formatting, type-checking, and gathering context are supporting operations — not work to track.
- Collapse related file edits, helper utilities, flags, function replacements, and timing/logging tweaks into one broader deliverable.
- If the agent's plan lists implementation steps, summarize them into phase-level todos instead of copying them.
- If a current list is too granular, replace it with a shorter high-level list and map existing progress onto the consolidated items.

Examples:
- GOOD: User asks "Add input validation to the signup form, set up rate limiting, and write tests for both" → 1. Add signup form validation, 2. Set up rate limiting on auth endpoints, 3. Write tests. These are three separate user-requested deliverables.
- GOOD: User asks "Add user avatar upload to the profile page" → 1. Add file input component, 2. Wire up upload API call, 3. Store and display the avatar, 4. Handle errors and loading state. The user asked for one feature but it has clearly distinct phases.
- BAD: User asks "Fix the null check in auth.ts" → no list, even if the agent reads 10 files and makes 5 edits to accomplish it. The activity is operational, not multi-step.
- BAD operational items: 1. Search codebase for relevant files, 2. Run linter after changes, 3. Implement the feature. Only "Implement the feature" is a real todo.
- BAD too granular: "Update index.ts", "Create logger utility", "Add --verbose flag", "Replace debugLog" → replace with "Implement logging support", "Integrate logging controls", "Validate logging behavior".

Progress rules:
- Exploration, search, file reads, diagnostics, and subagent findings are not completion evidence.
- Mark 'in-progress' completed only after concrete deliverable evidence, such as edits, created files, executed commands, or passing tests.
- Keep exactly one item 'in-progress' whenever any work remains: when the active item is marked 'completed', immediately promote the next item to 'in-progress', preferring the item the agent is concretely working on.
- Completed items must never regress — once completed, an item stays completed in all future updates regardless of context. The current todo list is authoritative for completion status.

List rules:
- The todo list must cover the full user request, not only recent activity.
- Derive items primarily from the user's request and the agent's stated plan; use progress summaries and subagents only as supporting context.
- Prefer a few broad phase-level items over many narrow or file-level items.
- Titles MUST be 3-8 words. Maximum 8 words. Never exceed 8 words.
  - GOOD: "Add logging support", "Wire CLI flags", "Validate and test"
  - BAD: "Add shared logger to analyzer package", "Wire logger configuration and CLI support", "Instrument high-value paths for logging"
- Use sequential numeric IDs starting at 1.
- Preserve existing IDs and wording unless genuinely adding, removing, or expanding scope.
- Always include every item from the current todo list. Never silently drop existing items, especially completed ones — they provide important history even when context is limited.
- Display order: completed items first, then any in-progress item, then not-started items.

State rules:
- Items may be worked on and completed in any order; sequential processing is not required.
- Exactly one item must always be 'in-progress', unless every item is 'completed'.
- Never emit multiple 'in-progress' items.
- Completed items must never regress to 'in-progress' or 'not-started'.
- A list may have zero 'in-progress' items only when every item is 'completed'. Whenever any work remains — including right after the list is first created — exactly one item must be 'in-progress'.

Adding new tasks:
- Only add a new item when genuinely new high-level work is discovered that no existing item covers.
- Never add items that duplicate or overlap with existing in-progress or not-started items.
- New items must follow the same granularity rules: broad phase-level outcomes, not implementation details.
- Never create a new item that is already 'completed'. New items must always start as 'not-started' or 'in-progress'. Only an item that already exists in the list may be marked 'completed', and only after concrete deliverable evidence.

Purpose:
- The list exists so the user can see at a glance: what is done, what is happening now, and what is still ahead. Keep it simple and accurate.`;

/**
 * Extra system instruction appended on the final background pass of a turn.
 * Signals that the main agent has stopped running — whether it completed its
 * work or halted on an error — so this is the last chance to reconcile the list.
 */
const BACKGROUND_TODO_FINAL_REVIEW_NOTE = `This is the FINAL background pass for this turn. The main agent has stopped running — it either completed its work or halted on an error — and no further activity will follow for this turn.

Reconcile the todo list one last time against the full trajectory:
- Mark an item 'completed' only when the trajectory shows concrete deliverable evidence (edits, created files, commands run, or passing tests). Do not mark an item 'completed' merely because the turn ended or the agent stopped on an error.
- Mark a 'not-started' item 'completed' if later work clearly accomplished it.
- Leave genuinely untouched or abandoned work as it stands; never invent progress.
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
