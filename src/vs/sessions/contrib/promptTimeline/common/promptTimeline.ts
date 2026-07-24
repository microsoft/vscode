/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Id of the per-widget contribution that owns the prompt timeline rail. */
export const PROMPT_TIMELINE_CONTRIB_ID = 'sessions.promptTimeline';

/** Setting that controls which prompt timeline rail (if any) is shown next to the chat transcript. */
export const PROMPT_TIMELINE_RAIL_SETTING = 'sessions.promptTimeline.rail';

/** Setting that controls whether the sticky prompt header pins the current prompt while scrolling. */
export const PROMPT_TIMELINE_STICKY_HEADER_SETTING = 'sessions.promptTimeline.stickyHeader';

/**
 * The rail styles the {@link PROMPT_TIMELINE_RAIL_SETTING} can select:
 * - `off` — no rail.
 * - `ruler` — an overview-ruler beside the transcript scrollbar that fans into prompt pills.
 * - `dock` — a minimal three-dot handle on the transcript's left edge that opens a prompt list on hover.
 */
export type PromptTimelineRailStyle = 'off' | 'ruler' | 'dock';

/** The selectable rail-style values, for the setting's `enum`. */
export const PROMPT_TIMELINE_RAIL_STYLES: readonly PromptTimelineRailStyle[] = ['off', 'ruler', 'dock'];

/** Minimum number of user prompts before the rail is shown. */
export const MIN_PROMPTS = 2;
