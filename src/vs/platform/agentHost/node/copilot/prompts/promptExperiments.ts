/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The opt-in system-prompt experiment for Claude Opus sessions: subagent model
 * guidance. It tells the agent which lighter model to run a subagent on, in
 * place of the instructions to leave the `task` tool's `model` parameter unset.
 * It changes that one thing, so an effect can be attributed to it.
 *
 * No model is named here. The models come from two settings
 * (`CopilotCliConfigKey.SubagentGuidanceDefaultModel` and
 * `CopilotCliConfigKey.SubagentGuidanceLightweightModel`), which an
 * experiment sets, and each is checked against the models the account can use
 * before it reaches the prompt (see {@link resolveSubagentModelMix}).
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

/** The models subagent model guidance names for one session, already checked for that session. */
export interface ISubagentModelMix {
	/** The model a subagent runs on unless the work is review or debugging the agent could not explain. */
	readonly defaultModel: string;
	/** For searching, reading and summarizing, and running commands and reporting their output. */
	readonly lightweightModel?: string;
}

export interface ISubagentModelMixRequest {
	/** The model the session's prompt is resolved for, or `undefined` when none is chosen at launch (e.g. server-side Auto). */
	readonly sessionModelId: string | undefined;
	/** The configured default subagent model, as set. */
	readonly defaultModel: string | undefined;
	/** The configured lightweight subagent model, as set. */
	readonly lightweightModel: string | undefined;
	/** Whether the account can run `modelId`: the provider lists it and policy has not disabled it. */
	isModelAvailable(modelId: string): boolean;
}

export interface ISubagentModelMixResolution {
	/** The models to name, or `undefined` when the guidance is off or does not apply to this session. */
	readonly mix: ISubagentModelMix | undefined;
	/** Why a configured model was left out, for the log. Empty when nothing was configured or all of it applies. */
	readonly notes: readonly string[];
}

/**
 * Decides which configured models, if any, a session's prompt may name.
 *
 * The settings are free text so an experiment can supply any mix, which means
 * they can name a model the account cannot use: one its plan does not include,
 * one an organization policy disabled, or a name that no longer exists. The
 * `task` tool rejects such a model when it is called, so naming it would cost
 * a failed tool call on every delegation. A model is therefore named only when
 * {@link ISubagentModelMixRequest.isModelAvailable} accepts it.
 *
 * Without a usable default model there is no guidance at all, and the session
 * keeps the instructions to leave `model` unset. A lightweight model that is
 * unusable is dropped on its own; the default then covers that work too.
 *
 * Claude Opus sessions only: the guidance asks for models lighter than the
 * session's, and it has only been measured there.
 */
export function resolveSubagentModelMix(request: ISubagentModelMixRequest): ISubagentModelMixResolution {
	const defaultModel = request.defaultModel?.trim();
	const lightweightModel = request.lightweightModel?.trim();
	if (!defaultModel) {
		return { mix: undefined, notes: lightweightModel ? [`lightweight model '${lightweightModel}' is set without a default model`] : [] };
	}
	if (!isClaudeOpusModelId(request.sessionModelId)) {
		return { mix: undefined, notes: [] };
	}
	const unusable = (modelId: string): string | undefined => {
		if (modelId === request.sessionModelId) {
			return `'${modelId}' is the session's own model`;
		}
		return request.isModelAvailable(modelId) ? undefined : `'${modelId}' is not available to this account`;
	};
	const defaultUnusable = unusable(defaultModel);
	if (defaultUnusable) {
		return { mix: undefined, notes: [`default model ${defaultUnusable}`] };
	}
	if (!lightweightModel || lightweightModel === defaultModel) {
		return { mix: { defaultModel }, notes: [] };
	}
	const lightweightUnusable = unusable(lightweightModel);
	return lightweightUnusable
		? { mix: { defaultModel }, notes: [`lightweight model ${lightweightUnusable}`] }
		: { mix: { defaultModel, lightweightModel }, notes: [] };
}

/**
 * The host's subagent lines when model guidance applies. They replace the
 * default "leave `model` unset" lines; the two are alternatives, never both.
 *
 * The lighter model is the default and the session's model is the exception.
 * An earlier wording did it the other way round ("leave `model` unset for work
 * that needs your own level of judgment") and the agent then named a model for
 * about two delegations in five, judging most of a hard task to need its own
 * model.
 *
 * The last sentence is there because the `task` tool's `model` parameter
 * carries its own "leave unset unless the user asks" description, which the
 * host cannot change. Remove it if that description changes in the runtime.
 */
export function subagentModelGuidanceLines(mix: ISubagentModelMix): string {
	const lightweight = mix.lightweightModel
		? ` Use \`${mix.lightweightModel}\` for searching, for reading and summarizing, and for running commands and reporting what they print.`
		: '';
	return [
		'When launching subagents with the task tool, leave the `reasoning_effort` and `context_tier` parameters unset.',
		`When you delegate with the task tool, set \`model\` on the call. Use \`${mix.defaultModel}\` by default: for any work you can hand over with written instructions and a way to tell when it is done, such as implementing a component, writing or extending tests, or building a test harness.${lightweight} Leave \`model\` unset, so the subagent runs on your model, only for reviewing work and for debugging a failure you have already tried and could not explain. Work being intricate is not a reason to leave it unset: say what matters in the subagent's instructions, and take a piece back if the subagent does not finish it. If the user names a model for the subagent, use that one. This guidance applies even though the \`model\` parameter's own description says to leave it unset.`,
	].join('\n');
}

const HARNESS_DEFAULTS_RULE = /^\* Trust the harness defaults for subagents\. Specify a value only when [^\n]*$/m;

const HARNESS_DEFAULTS_RULE_WITHOUT_MODEL = '* For a subagent\'s `reasoning_effort` and `context_tier`, trust the harness defaults. Specify a value only when the user\'s current request or applicable persistent custom instructions (including global instructions) explicitly require that value for the subagent. Do not reuse values from earlier requests or infer unspecified values from the parent configuration.';

/**
 * Narrows the foundation's "Trust the harness defaults for subagents" rule (in
 * `tool_instructions`) to the two parameters model guidance leaves alone, so
 * the prompt does not tell the agent both to choose a model and to leave it
 * unset.
 *
 * This also drops the rule's last sentence, "The runtime resolves `/subagents`
 * preferences when these fields are omitted; do not copy them merely because
 * they appear in `<subagent_model_preferences>`". It is about the model
 * preference, which the guidance now overrides; the `task` tool's parameter
 * descriptions still carry it for the other two parameters.
 */
export function narrowSubagentHarnessDefaultsRule(content: string): string {
	return content.replace(HARNESS_DEFAULTS_RULE, HARNESS_DEFAULTS_RULE_WITHOUT_MODEL);
}

// #endregion
