/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CHAT_MODEL_FEEDBACK_SURVEY_CONFIG_VERSION, IChatModelFeedbackSurveyMatchContext, matchesChatModelFeedbackSurvey, parseChatModelFeedbackSurveyConfig } from '../../../common/feedbackSurvey/chatModelFeedbackSurveyConfig.js';

suite('ChatModelFeedbackSurveyConfig', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const validPayload = {
		version: CHAT_MODEL_FEEDBACK_SURVEY_CONFIG_VERSION,
		id: 'auto-routing-2026-08',
		match: { selectedModels: ['auto'], harnesses: ['copilotcli', 'none'] },
		prompt: { cooldownDays: 7, maxPerSession: 1, chance: { initial: 0.1, increment: 0.05, max: 0.5 } },
		steps: [
			{
				kind: 'choice', id: 'routing', title: 'Did Auto choose the right model for the job?',
				options: [
					{ id: 'yes', label: 'Yes' },
					{ id: 'too-heavy', label: 'No - too heavy' },
					{ id: 'too-light', label: 'No - too light' },
				],
			},
			{ kind: 'text', id: 'comments', title: 'Anything else?', placeholder: 'Optional feedback', maxLength: 500 },
		],
	};

	function parse(payload: unknown): ReturnType<typeof parseChatModelFeedbackSurveyConfig> {
		return parseChatModelFeedbackSurveyConfig(JSON.stringify(payload));
	}

	test('accepts a well formed payload and normalizes selectors', () => {
		const result = parse({ ...validPayload, match: { selectedModels: ['  AUTO  '], modes: ['Agent'] } });

		assert.deepStrictEqual(result.config, {
			version: 1,
			id: 'auto-routing-2026-08',
			match: { selectedModels: ['auto'], resolvedModels: [], modes: ['agent'], harnesses: [], sessionTypes: [] },
			prompt: {
				cooldownDays: 7,
				maxPerSession: 1,
				chance: { initial: 0.1, increment: 0.05, max: 0.5 },
				triggers: { modelSwitchedAway: { enabled: false, bypassCooldown: false } },
			},
			steps: [
				{
					kind: 'choice', id: 'routing', title: 'Did Auto choose the right model for the job?',
					options: [
						{ id: 'yes', label: 'Yes' },
						{ id: 'too-heavy', label: 'No - too heavy' },
						{ id: 'too-light', label: 'No - too light' },
					],
				},
				{ kind: 'text', id: 'comments', title: 'Anything else?', placeholder: 'Optional feedback', maxLength: 500 },
			],
		});
	});

	test('rejects malformed payloads whole rather than partially', () => {
		const errors = {
			empty: parseChatModelFeedbackSurveyConfig('').error,
			notJson: parseChatModelFeedbackSurveyConfig('{nope').error?.startsWith('payload is not valid JSON'),
			wrongVersion: parse({ ...validPayload, version: 99 }).error,
			badId: parse({ ...validPayload, id: 'Has Spaces' }).error,
			unnarrowedMatch: parse({ ...validPayload, match: {} }).error,
			noSteps: parse({ ...validPayload, steps: [] }).error,
			duplicateStepId: parse({ ...validPayload, steps: [validPayload.steps[0], validPayload.steps[0]] }).error,
			unknownKind: parse({ ...validPayload, steps: [{ kind: 'slider', id: 'a', title: 'T' }] }).error,
			tooFewOptions: parse({ ...validPayload, steps: [{ kind: 'choice', id: 'a', title: 'T', options: [{ id: 'x', label: 'X' }] }] }).error,
			badPromptLimit: parse({ ...validPayload, prompt: { maxPerSession: 0 } }).error,
			badProbability: parse({ ...validPayload, prompt: { chance: { initial: 2 } } }).error,
			invertedChance: parse({ ...validPayload, prompt: { chance: { initial: 0.5, max: 0.1 } } }).error,
			badCooldown: parse({ ...validPayload, prompt: { cooldownDays: -1 } }).error,
			badTrigger: parse({ ...validPayload, prompt: { triggers: { modelSwitchedAway: 'yes' } } }).error,
		};

		assert.deepStrictEqual(errors, {
			empty: 'empty payload',
			notJson: true,
			wrongVersion: 'unsupported version 99, expected 1',
			badId: 'missing or malformed survey id',
			unnarrowedMatch: 'match must narrow at least one dimension',
			noSteps: 'steps must be a non-empty array',
			duplicateStepId: 'steps[1].id "routing" is duplicated',
			unknownKind: 'steps[0].kind must be "choice" or "text"',
			tooFewOptions: 'steps[0].options must have between 2 and 8 entries',
			badPromptLimit: 'prompt.maxPerSession must be a positive integer',
			badProbability: 'prompt.chance.initial must be a probability between 0 and 1',
			invertedChance: 'prompt.chance.max must be greater than or equal to prompt.chance.initial',
			badCooldown: 'prompt.cooldownDays must be a non-negative number',
			badTrigger: 'prompt.triggers.modelSwitchedAway must be a boolean or an object',
		});
	});

	test('clamps a text step maxLength to the transport budget', () => {
		const result = parse({ ...validPayload, steps: [{ kind: 'text', id: 'c', title: 'T', maxLength: 99999 }] });

		assert.deepStrictEqual(result.config?.steps, [{ kind: 'text', id: 'c', title: 'T', placeholder: undefined, maxLength: 1000 }]);
	});

	test('rejects text step arrangements that would strand later steps', () => {
		const choice = validPayload.steps[0];
		const text = validPayload.steps[1];
		const secondText = { kind: 'text', id: 'more', title: 'More?', maxLength: 100 };

		assert.deepStrictEqual({
			twoTextSteps: parse({ ...validPayload, steps: [text, secondText] }).error,
			textNotLast: parse({ ...validPayload, steps: [text, choice] }).error,
			choiceOnly: parse({ ...validPayload, steps: [choice] }).error,
		}, {
			twoTextSteps: 'steps may contain at most one text step',
			textNotLast: 'a text step must be the last step',
			choiceOnly: undefined,
		});
	});

	test('defaults an omitted prompt block to manual-only surfacing', () => {
		const result = parse({ ...validPayload, prompt: undefined });

		assert.deepStrictEqual(result.config?.prompt, {
			cooldownDays: 7,
			maxPerSession: 1,
			// Zero probability means the survey never opens unasked, but the control still shows.
			chance: { initial: 0, increment: 0, max: 1 },
			triggers: { modelSwitchedAway: { enabled: false, bypassCooldown: false } },
		});
	});

	suite('matching', () => {

		function match(context: IChatModelFeedbackSurveyMatchContext, payload: unknown = validPayload): boolean {
			const config = parse(payload).config;
			assert.ok(config, 'expected a valid config');
			return matchesChatModelFeedbackSurvey(config, context);
		}

		test('matches a short selector against identifiers from every harness', () => {
			// Local model ids are `<vendor>/<id>` and agent host ids are `<sessionType>:<id>`.
			assert.deepStrictEqual({
				bare: match({ selectedModelId: 'auto', harness: undefined }),
				vendorQualified: match({ selectedModelId: 'copilot/auto', harness: undefined }),
				agentHostQualified: match({ selectedModelId: 'agent-host-copilotcli:auto', harness: 'copilotcli' }),
				byAlias: match({ selectedModelId: 'copilot/gpt-5.2', selectedModelAliases: ['auto'], harness: undefined }),
				unrelatedModel: match({ selectedModelId: 'copilot/gpt-5.2', harness: undefined }),
			}, {
				bare: true,
				vendorQualified: true,
				agentHostQualified: true,
				byAlias: true,
				unrelatedModel: false,
			});
		});

		test('keeps selected and resolved models as independent dimensions', () => {
			const payload = { ...validPayload, match: { selectedModels: ['auto'], resolvedModels: ['gpt-5.2'] } };

			assert.deepStrictEqual({
				both: match({ selectedModelId: 'copilot/auto', resolvedModelId: 'gpt-5.2' }, payload),
				selectedOnly: match({ selectedModelId: 'copilot/auto', resolvedModelId: 'claude-sonnet-4.5' }, payload),
				resolvedOnly: match({ selectedModelId: 'copilot/gpt-5.2', resolvedModelId: 'gpt-5.2' }, payload),
			}, {
				both: true,
				selectedOnly: false,
				resolvedOnly: false,
			});
		});

		test('treats a session with no agent host as the "none" harness', () => {
			assert.deepStrictEqual({
				noHarnessAllowed: match({ selectedModelId: 'auto', harness: undefined }),
				harnessAllowed: match({ selectedModelId: 'auto', harness: 'copilotcli' }),
				harnessExcluded: match({ selectedModelId: 'auto', harness: 'claude' }),
			}, {
				noHarnessAllowed: true,
				harnessAllowed: true,
				harnessExcluded: false,
			});
		});
	});
});
