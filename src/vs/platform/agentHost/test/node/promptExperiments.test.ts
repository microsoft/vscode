/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isClaudeOpusModelId, narrowSubagentHarnessDefaultsRule, resolveSubagentModelMix, subagentModelGuidanceLines } from '../../node/copilot/prompts/promptExperiments.js';

/**
 * The edits in `promptExperiments.ts` match sentences of the SDK foundation
 * prompt. The fixtures below are those sentences as the foundation prompt
 * rendered them for a Claude Opus 5.5 session (VS Code 1.141.0 Insiders,
 * 4 October 2026). If the foundation rewords one, the edit stops applying
 * without an error; refresh the fixture from a current request and update the
 * pattern together.
 */
suite('promptExperiments', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const FOUNDATION_TASK_BULLETS = [
		'* Prefer custom agents over built-ins.',
		'* Trust the harness defaults for subagents. Specify a value only when the user\'s current request or applicable persistent custom instructions (including global instructions) explicitly require that value for the subagent. Do not reuse values from earlier requests or infer unspecified values from the parent configuration. The runtime resolves `/subagents` preferences when these fields are omitted; do not copy them merely because they appear in `<subagent_model_preferences>`.',
		'* Give a bounded objective/stop; request execution, not advice.',
	].join('\n');

	test('isClaudeOpusModelId matches dashed and dotted Opus ids only', () => {
		assert.deepStrictEqual(
			['claude-opus-5.5', 'claude-opus-5-5', 'claude-opus-4.8', 'claude-sonnet-5.5', 'claude-haiku-4.5', 'gpt-5.6-sol', undefined].map(isClaudeOpusModelId),
			[true, true, true, false, false, false, false]
		);
	});

	/** Resolves a mix for an account that can run exactly `available`. */
	function resolve(sessionModelId: string | undefined, defaultModel: string | undefined, lightweightModel: string | undefined, available: readonly string[]) {
		return resolveSubagentModelMix({ sessionModelId, defaultModel, lightweightModel, isModelAvailable: modelId => available.includes(modelId) });
	}

	test('subagent model guidance names the models it is given and no others', () => {
		const lines = subagentModelGuidanceLines({ defaultModel: 'model-default', lightweightModel: 'model-light' });
		assert.deepStrictEqual({
			lines,
			modelsNamed: lines.match(/`model-[a-z]+`/g),
			withoutLightweight: subagentModelGuidanceLines({ defaultModel: 'model-default' }),
		}, {
			lines: [
				'When launching subagents with the task tool, leave the `reasoning_effort` and `context_tier` parameters unset.',
				'When you delegate with the task tool, set `model` on the call. Use `model-default` by default: for any work you can hand over with written instructions and a way to tell when it is done, such as implementing a component, writing or extending tests, or building a test harness. Use `model-light` for searching, for reading and summarizing, and for running commands and reporting what they print. Leave `model` unset, so the subagent runs on your model, only for reviewing work and for debugging a failure you have already tried and could not explain. Work being intricate is not a reason to leave it unset: say what matters in the subagent\'s instructions, and take a piece back if the subagent does not finish it. If the user names a model for the subagent, use that one. This guidance applies even though the `model` parameter\'s own description says to leave it unset.',
			].join('\n'),
			modelsNamed: ['`model-default`', '`model-light`'],
			withoutLightweight: [
				'When launching subagents with the task tool, leave the `reasoning_effort` and `context_tier` parameters unset.',
				'When you delegate with the task tool, set `model` on the call. Use `model-default` by default: for any work you can hand over with written instructions and a way to tell when it is done, such as implementing a component, writing or extending tests, or building a test harness. Leave `model` unset, so the subagent runs on your model, only for reviewing work and for debugging a failure you have already tried and could not explain. Work being intricate is not a reason to leave it unset: say what matters in the subagent\'s instructions, and take a piece back if the subagent does not finish it. If the user names a model for the subagent, use that one. This guidance applies even though the `model` parameter\'s own description says to leave it unset.',
			].join('\n'),
		});
	});

	test('a configured model is named only when the account can run it', () => {
		const opus = 'claude-opus-5.5';
		assert.deepStrictEqual({
			bothAvailable: resolve(opus, 'mid', 'light', ['mid', 'light', opus]),
			trimmed: resolve(opus, '  mid ', ' light\n', ['mid', 'light']),
			defaultOnly: resolve(opus, 'mid', undefined, ['mid']),
			lightweightEmpty: resolve(opus, 'mid', '  ', ['mid']),
			lightweightSameAsDefault: resolve(opus, 'mid', 'mid', ['mid']),
			lightweightUnavailable: resolve(opus, 'mid', 'light', ['mid']),
			defaultUnavailable: resolve(opus, 'mid', 'light', ['light']),
			nothingAvailable: resolve(opus, 'mid', 'light', []),
		}, {
			bothAvailable: { mix: { defaultModel: 'mid', lightweightModel: 'light' }, notes: [] },
			trimmed: { mix: { defaultModel: 'mid', lightweightModel: 'light' }, notes: [] },
			defaultOnly: { mix: { defaultModel: 'mid' }, notes: [] },
			lightweightEmpty: { mix: { defaultModel: 'mid' }, notes: [] },
			lightweightSameAsDefault: { mix: { defaultModel: 'mid' }, notes: [] },
			lightweightUnavailable: { mix: { defaultModel: 'mid' }, notes: ['lightweight model \'light\' is not available to this account'] },
			// Without a usable default there is no guidance, even if the lightweight model is usable.
			defaultUnavailable: { mix: undefined, notes: ['default model \'mid\' is not available to this account'] },
			nothingAvailable: { mix: undefined, notes: ['default model \'mid\' is not available to this account'] },
		});
	});

	test('the guidance is off unless a default model is configured for a Claude Opus session', () => {
		const available = ['mid', 'light', 'claude-opus-5.5', 'claude-sonnet-5.5'];
		assert.deepStrictEqual({
			nothingConfigured: resolve('claude-opus-5.5', undefined, undefined, available),
			emptyDefault: resolve('claude-opus-5.5', '', '', available),
			lightweightWithoutDefault: resolve('claude-opus-5.5', ' ', 'light', available),
			sonnetSession: resolve('claude-sonnet-5.5', 'mid', 'light', available),
			gptSession: resolve('gpt-5.6-sol', 'mid', 'light', available),
			noSessionModel: resolve(undefined, 'mid', 'light', available),
			dashedOpusId: resolve('claude-opus-5-5', 'mid', undefined, available).mix,
			// Naming the session's own model would change nothing but the wording.
			defaultIsSessionModel: resolve('claude-opus-5.5', 'claude-opus-5.5', 'light', available),
			lightweightIsSessionModel: resolve('claude-opus-5.5', 'mid', 'claude-opus-5.5', available),
		}, {
			nothingConfigured: { mix: undefined, notes: [] },
			emptyDefault: { mix: undefined, notes: [] },
			lightweightWithoutDefault: { mix: undefined, notes: ['lightweight model \'light\' is set without a default model'] },
			sonnetSession: { mix: undefined, notes: [] },
			gptSession: { mix: undefined, notes: [] },
			noSessionModel: { mix: undefined, notes: [] },
			dashedOpusId: { defaultModel: 'mid' },
			defaultIsSessionModel: { mix: undefined, notes: ['default model \'claude-opus-5.5\' is the session\'s own model'] },
			lightweightIsSessionModel: { mix: { defaultModel: 'mid' }, notes: ['lightweight model \'claude-opus-5.5\' is the session\'s own model'] },
		});
	});

	test('narrowSubagentHarnessDefaultsRule rewrites the one foundation bullet and nothing else', () => {
		assert.strictEqual(narrowSubagentHarnessDefaultsRule(FOUNDATION_TASK_BULLETS), [
			'* Prefer custom agents over built-ins.',
			'* For a subagent\'s `reasoning_effort` and `context_tier`, trust the harness defaults. Specify a value only when the user\'s current request or applicable persistent custom instructions (including global instructions) explicitly require that value for the subagent. Do not reuse values from earlier requests or infer unspecified values from the parent configuration.',
			'* Give a bounded objective/stop; request execution, not advice.',
		].join('\n'));
	});

	test('the edit leaves text it does not recognize alone', () => {
		const reworded = '* Prefer custom agents over built-ins.\n* Rely on harness defaults for subagents.';
		assert.strictEqual(narrowSubagentHarnessDefaultsRule(reworded), reworded);
	});
});
