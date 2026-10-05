/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isClaudeOpusModelId, narrowSubagentHarnessDefaultsRule, omitCodeChangeVerification, omitLastInstructionsVerification, subagentModelGuidanceLines } from '../../node/copilot/prompts/promptExperiments.js';

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

	const FOUNDATION_CODE_CHANGE_RULES = [
		'<rules_for_code_changes>',
		'* Make precise, complete, surgical changes that fully address the request; prefer completeness over a minimal but incomplete fix, and avoid unrelated changes.',
		'* Don\'t fix unrelated pre-existing issues, but do fix bugs caused by or tightly coupled to your changes.',
		'* Update directly related documentation.',
		'* Validate that your changes preserve existing behavior</rules_for_code_changes>',
		'<linting_building_testing>',
		'* Use existing linters, builds, and tests; add tooling only when the task requires it.',
		'</linting_building_testing>',
	].join('\n');

	const FOUNDATION_LAST_INSTRUCTIONS = [
		'Your goal is to deliver complete, working solutions. If your first approach doesn\'t fully solve the problem, iterate with alternative approaches. Don\'t settle for partial fixes. Verify your changes actually work before considering the task done.',
		'',
		'<task_completion>',
		'* A task is not complete until the expected outcome is verified and persistent',
		'* Install or restore dependencies only after changing dependency manifests or when the chosen validation command fails because packages/tools are missing.',
		'* After starting a background process, verify it is running and responsive (e.g., test with `curl`, check process status)',
		'* If an initial approach fails, try alternative tools or methods before concluding the task is impossible',
		'</task_completion>',
		'Respond concisely to the user, but be thorough in your work.',
	].join('\n');

	test('isClaudeOpusModelId matches dashed and dotted Opus ids only', () => {
		assert.deepStrictEqual(
			['claude-opus-5.5', 'claude-opus-5-5', 'claude-opus-4.8', 'claude-sonnet-5.5', 'claude-haiku-4.5', 'gpt-5.6-sol', undefined].map(isClaudeOpusModelId),
			[true, true, true, false, false, false, false]
		);
	});

	test('subagent model guidance names the lightweight and mid-sized model of each mix', () => {
		const sameProvider = subagentModelGuidanceLines('sameProvider', 'claude-opus-5.5');
		const crossProvider = subagentModelGuidanceLines('crossProvider', 'claude-opus-5.5');
		assert.deepStrictEqual({
			off: subagentModelGuidanceLines('off', 'claude-opus-5.5'),
			unset: subagentModelGuidanceLines(undefined, 'claude-opus-5.5'),
			notOpus: subagentModelGuidanceLines('sameProvider', 'claude-sonnet-5.5'),
			sameProvider,
			crossProviderModels: crossProvider?.match(/set `model` to `([^`]+)`/g),
			sameWordingAcrossMixes: crossProvider === sameProvider?.replace('claude-haiku-4.5', 'gpt-6-luna').replace('claude-sonnet-5.5', 'gpt-5.6-terra'),
		}, {
			off: undefined,
			unset: undefined,
			notOpus: undefined,
			sameProvider: [
				'When launching subagents with the task tool, leave the `reasoning_effort` and `context_tier` parameters unset.',
				'When you delegate with the task tool, choose the model the subagent runs on. For searching, for reading and summarizing, and for running commands and reporting what they print, set `model` to `claude-haiku-4.5`. For a well-defined piece of implementation with clear inputs and a clear definition of done, set `model` to `claude-sonnet-5.5`. For work that needs your own level of judgment, such as open-ended implementation, debugging and review, leave `model` unset; the subagent then runs on your model. If the user names a model for the subagent, use that one. This guidance applies even though the `model` parameter\'s own description says to leave it unset.',
			].join('\n'),
			crossProviderModels: ['set `model` to `gpt-6-luna`', 'set `model` to `gpt-5.6-terra`'],
			sameWordingAcrossMixes: true,
		});
	});

	test('narrowSubagentHarnessDefaultsRule rewrites the one foundation bullet and nothing else', () => {
		assert.strictEqual(narrowSubagentHarnessDefaultsRule(FOUNDATION_TASK_BULLETS), [
			'* Prefer custom agents over built-ins.',
			'* For a subagent\'s `reasoning_effort` and `context_tier`, trust the harness defaults. Specify a value only when the user\'s current request or applicable persistent custom instructions (including global instructions) explicitly require that value for the subagent. Do not reuse values from earlier requests or infer unspecified values from the parent configuration.',
			'* Give a bounded objective/stop; request execution, not advice.',
		].join('\n'));
	});

	test('omitCodeChangeVerification drops the bullet and keeps the closing tag', () => {
		assert.strictEqual(omitCodeChangeVerification(FOUNDATION_CODE_CHANGE_RULES), [
			'<rules_for_code_changes>',
			'* Make precise, complete, surgical changes that fully address the request; prefer completeness over a minimal but incomplete fix, and avoid unrelated changes.',
			'* Don\'t fix unrelated pre-existing issues, but do fix bugs caused by or tightly coupled to your changes.',
			'* Update directly related documentation.</rules_for_code_changes>',
			'<linting_building_testing>',
			'* Use existing linters, builds, and tests; add tooling only when the task requires it.',
			'</linting_building_testing>',
		].join('\n'));
	});

	test('omitCodeChangeVerification also handles the bullet on a line of its own', () => {
		assert.strictEqual(
			omitCodeChangeVerification('<rules_for_code_changes>\n* Validate that your changes preserve existing behavior\n* Update directly related documentation.\n</rules_for_code_changes>'),
			'<rules_for_code_changes>\n* Update directly related documentation.\n</rules_for_code_changes>'
		);
	});

	test('omitLastInstructionsVerification drops the two mandates and keeps the rest', () => {
		assert.strictEqual(omitLastInstructionsVerification(FOUNDATION_LAST_INSTRUCTIONS), [
			'Your goal is to deliver complete, working solutions. If your first approach doesn\'t fully solve the problem, iterate with alternative approaches. Don\'t settle for partial fixes.',
			'',
			'<task_completion>',
			'* Install or restore dependencies only after changing dependency manifests or when the chosen validation command fails because packages/tools are missing.',
			'* After starting a background process, verify it is running and responsive (e.g., test with `curl`, check process status)',
			'* If an initial approach fails, try alternative tools or methods before concluding the task is impossible',
			'</task_completion>',
			'Respond concisely to the user, but be thorough in your work.',
		].join('\n'));
	});

	test('each edit leaves text it does not recognize alone', () => {
		const reworded = '* Check that behavior is preserved.\n* Rely on harness defaults for subagents.\nMake sure it works before you stop.';
		assert.deepStrictEqual(
			[narrowSubagentHarnessDefaultsRule(reworded), omitCodeChangeVerification(reworded), omitLastInstructionsVerification(reworded)],
			[reworded, reworded, reworded]
		);
	});
});
