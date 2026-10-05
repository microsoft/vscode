/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SubagentModelGuidanceSetting } from '../../../common/copilotCliConfig.js';

/**
 * Opt-in system-prompt experiments for Claude Opus sessions. Each one changes a
 * single thing and has its own setting, so an effect can be attributed to it:
 *
 *  - subagent model guidance ({@link CopilotCliConfigKey.SubagentModelGuidance}):
 *    tells the agent which lighter model to run a subagent on, in place of the
 *    instructions to leave the `task` tool's `model` parameter unset;
 *  - omitting verification instructions
 *    ({@link CopilotCliConfigKey.OmitVerificationInstructions}): removes the
 *    three general "verify before you finish" sentences.
 *
 * Every edit here matches a whole sentence or bullet of the SDK foundation
 * prompt. If the foundation rewords one, the edit leaves the text in place
 * rather than mangling its neighbours — which also means it silently stops
 * applying, so `promptExperiments.test.ts` pins each pattern against the text
 * it is meant to match.
 */

/** Whether `modelId` is a Claude Opus model (SDK dashed ids and CAPI dotted ids both start with `claude-opus`). */
export function isClaudeOpusModelId(modelId: string | undefined): boolean {
	return modelId !== undefined && modelId.startsWith('claude-opus');
}

// #region Subagent model guidance

interface ISubagentModelMix {
	/** For searching, reading and summarizing, and running commands and reporting their output. */
	readonly lightweight: string;
	/** For a well-defined piece of implementation. */
	readonly versatile: string;
}

/**
 * The lighter models each mix names. Model ids go stale as the lineup changes;
 * the durable form of this guidance is for the runtime to list the models that
 * cost less than the session's, which it already knows.
 */
const SUBAGENT_MODEL_MIXES: Readonly<Record<Exclude<SubagentModelGuidanceSetting, 'off'>, ISubagentModelMix>> = {
	sameProvider: { lightweight: 'claude-haiku-4.5', versatile: 'claude-sonnet-5.5' },
	crossProvider: { lightweight: 'gpt-6-luna', versatile: 'gpt-5.6-terra' },
};

/**
 * The host's subagent lines when model guidance is on, or `undefined` when it
 * is off or the session is not a Claude Opus one (the mixes are lighter than
 * Opus; for a smaller session model they would not be).
 *
 * The last sentence is there because the `task` tool's `model` parameter
 * carries its own "leave unset unless the user asks" description, which the
 * host cannot change. Remove it if that description changes in the runtime.
 */
export function subagentModelGuidanceLines(setting: SubagentModelGuidanceSetting | undefined, modelId: string | undefined): string | undefined {
	if (setting === undefined || setting === 'off' || !isClaudeOpusModelId(modelId)) {
		return undefined;
	}
	const mix = SUBAGENT_MODEL_MIXES[setting];
	if (!mix) {
		return undefined;
	}
	return [
		'When launching subagents with the task tool, leave the `reasoning_effort` and `context_tier` parameters unset.',
		`When you delegate with the task tool, choose the model the subagent runs on. For searching, for reading and summarizing, and for running commands and reporting what they print, set \`model\` to \`${mix.lightweight}\`. For a well-defined piece of implementation with clear inputs and a clear definition of done, set \`model\` to \`${mix.versatile}\`. For work that needs your own level of judgment, such as open-ended implementation, debugging and review, leave \`model\` unset; the subagent then runs on your model. If the user names a model for the subagent, use that one. This guidance applies even though the \`model\` parameter's own description says to leave it unset.`,
	].join('\n');
}

const HARNESS_DEFAULTS_RULE = /^\* Trust the harness defaults for subagents\. Specify a value only when [^\n]*$/m;

const HARNESS_DEFAULTS_RULE_WITHOUT_MODEL = '* For a subagent\'s `reasoning_effort` and `context_tier`, trust the harness defaults. Specify a value only when the user\'s current request or applicable persistent custom instructions (including global instructions) explicitly require that value for the subagent. Do not reuse values from earlier requests or infer unspecified values from the parent configuration.';

/**
 * Narrows the foundation's "Trust the harness defaults for subagents" rule (in
 * `tool_instructions`) to the two parameters model guidance leaves alone, so
 * the prompt does not tell the agent both to choose a model and to leave it
 * unset.
 */
export function narrowSubagentHarnessDefaultsRule(content: string): string {
	return content.replace(HARNESS_DEFAULTS_RULE, HARNESS_DEFAULTS_RULE_WITHOUT_MODEL);
}

// #endregion

// #region Omitting verification instructions

/**
 * Drops "Validate that your changes preserve existing behavior" from
 * `code_change_rules`. The bullet shares its line with the closing tag in the
 * foundation prompt; either form is handled and the tag is kept.
 */
export function omitCodeChangeVerification(content: string): string {
	return content
		.replace(/\r?\n\* Validate that your changes preserve existing behavior(?=<\/rules_for_code_changes>)/, '')
		.replace(/^\* Validate that your changes preserve existing behavior\r?\n/m, '');
}

/**
 * Drops the two general verification mandates from `last_instructions`: the
 * closing sentence of the "deliver complete, working solutions" paragraph and
 * the first `<task_completion>` bullet.
 *
 * Kept on purpose: "After starting a background process, verify it is running
 * and responsive", which covers a different situation, and everything about
 * which checks to run.
 */
export function omitLastInstructionsVerification(content: string): string {
	return content
		.replace(/(Don't settle for partial fixes\.) Verify your changes actually work before considering the task done\./, '$1')
		.replace(/^\* A task is not complete until the expected outcome is verified and persistent\r?\n/m, '');
}

// #endregion
