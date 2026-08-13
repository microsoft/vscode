/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Id of the per-widget contribution that owns the prompt timeline surfaces. */
export const PROMPT_TIMELINE_CONTRIB_ID = 'chat.promptTimeline';

/** Setting that controls how the prompt timeline is displayed next to the chat transcript. Agents window only. */
export const PROMPT_TIMELINE_DISPLAY_SETTING = 'sessions.chatTimeline.display';

/** Setting that controls whether sticky scroll pins the current prompt while scrolling. */
export const PROMPT_TIMELINE_STICKY_SCROLL_SETTING = 'chat.stickyScroll.enabled';

/**
 * The display styles the {@link PROMPT_TIMELINE_DISPLAY_SETTING} can select:
 * - `off` — no rail.
 * - `ruler` — an overview-ruler beside the transcript scrollbar that fans into prompt pills.
 * - `gutter` — a minimal three-dot handle in the transcript's left gutter that opens a prompt list on hover.
 */
export type PromptTimelineRailStyle = 'off' | 'ruler' | 'gutter';

/** The selectable rail-style values, for the setting's `enum`. */
export const PROMPT_TIMELINE_RAIL_STYLES: readonly PromptTimelineRailStyle[] = ['off', 'ruler', 'gutter'];

/** Minimum number of user prompts before the timeline surfaces (rail and sticky header) are shown. */
export const MIN_PROMPTS = 2;
