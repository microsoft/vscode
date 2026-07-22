/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Id of the per-widget contribution that owns the prompt timeline rail. */
export const PROMPT_TIMELINE_CONTRIB_ID = 'sessions.promptTimeline';

/** Setting that controls whether the timeline rail (the scrollbar that fans into prompt pills) is shown. */
export const PROMPT_TIMELINE_RAIL_SETTING = 'sessions.promptTimeline.rail';

/** Setting that controls whether the sticky prompt header pins the current prompt while scrolling. */
export const PROMPT_TIMELINE_STICKY_HEADER_SETTING = 'sessions.promptTimeline.stickyHeader';

/** Minimum number of user prompts before the rail is shown. */
export const MIN_PROMPTS = 2;
