/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ModelSelection } from '../../../common/state/protocol/state.js';
import { isAutoModel } from '../modelIdentifiers.js';

/** Like Copilot Chat's OpenAI routing, matches GPT families and the OpenAI alias, including legacy o-series IDs. */
export function isOpenAIModel(model: ModelSelection): boolean {
	const family = model.id.toLowerCase();
	return family.startsWith('gpt-') || family === 'openai' || /^o[134](?:-|$)/.test(family);
}

/**
 * Whether a session launched with `model` gets {@link AGENT_HOST_PROGRESS_UPDATES_INSTRUCTIONS}
 * when the experiment enables them: GPT models, and Auto (no model, or the synthetic Auto entry),
 * whose turns mostly route to GPT.
 */
export function isProgressUpdatesPromptModel(model: ModelSelection | undefined): boolean {
	return !model || isAutoModel(model.id) || isOpenAIModel(model);
}

/**
 * Asks for the short user-visible updates Copilot Chat's GPT prompts require, so a turn shows
 * text before its first tool call instead of only reasoning and tool rows. Each update shares a
 * response with its tool call, which keeps it compatible with the runtime's preamble gate.
 */
export const AGENT_HOST_PROGRESS_UPDATES_INSTRUCTIONS = [
	'<progress_updates>',
	'When a request needs tool calls, start the turn with one short user-visible sentence that acknowledges the request and states your first step, in the same response as your first tool call. This takes precedence over guidance to stay silent before the first tool call.',
	'While exploring or working through several tool calls, send a short update in the same response as the next tool call whenever you finish a phase or learn something that changes your plan. Keep each update to one or two sentences, and vary their phrasing.',
	'Skip these updates when a request needs no tools; answer directly.',
	'</progress_updates>',
].join('\n');
