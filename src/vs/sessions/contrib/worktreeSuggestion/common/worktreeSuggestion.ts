/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Experiment-controlled setting that selects how the new-session composer suggests a worktree. */
export const WORKTREE_SUGGESTION_SETTING = 'sessions.chat.worktreeSuggestion';

/**
 * How the new-session composer suggests a new worktree, in which the agent works on a separate copy of
 * the files, when Branch isolation is selected in a folder with uncommitted changes.
 */
export const enum WorktreeSuggestionVariant {
	Off = 'off',
	/** Spotlights the isolation picker once, as the user sends a request, offering to send it in a new worktree. */
	SpotlightOnSend = 'spotlightOnSend',
	/**
	 * Shows a hint below the input once the user starts typing, until they close it. Its action opens the
	 * isolation picker with New Worktree recommended and focused.
	 */
	InlineHint = 'inlineHint',
	/**
	 * Shows the number of uncommitted files after Branch in the isolation picker, which lists a few of them
	 * below Branch and New Worktree.
	 */
	UncommittedFilesCount = 'uncommittedFilesCount',
}

export const WORKTREE_SUGGESTION_VARIANTS: readonly WorktreeSuggestionVariant[] = [
	WorktreeSuggestionVariant.Off,
	WorktreeSuggestionVariant.SpotlightOnSend,
	WorktreeSuggestionVariant.InlineHint,
	WorktreeSuggestionVariant.UncommittedFilesCount,
];

export function isWorktreeSuggestionVariant(value: unknown): value is WorktreeSuggestionVariant {
	return typeof value === 'string' && (WORKTREE_SUGGESTION_VARIANTS as readonly string[]).includes(value);
}

/** Suggestions only target people who already started at least this many sessions in the Agents window. */
export const WORKTREE_SUGGESTION_MIN_CREATED_SESSIONS = 3;

/** Onboarding scenario that spotlights the isolation picker for {@link WorktreeSuggestionVariant.SpotlightOnSend}. */
export const WORKTREE_SUGGESTION_TOUR_ID = 'sessions.worktreeSuggestion';
