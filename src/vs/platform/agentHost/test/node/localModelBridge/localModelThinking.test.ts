/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { detectChatTemplateThinking, getLocalModelThinkingLevels, toChatTemplateKwargs } from '../../../node/copilot/localModelBridge/localModelThinking.js';

/** Excerpt of the Example Flash (harmony) chat template. */
const HARMONY_TEMPLATE = [
	'{#- - "reasoning_effort": A string that describes the reasoning effort, defaults to "medium". #}',
	'{%- if reasoning_effort is not defined %}',
	'    {%- set reasoning_effort = "medium" %}',
	'{%- endif %}',
	'{{- "Reasoning: " + reasoning_effort + "\\n\\n" }}',
].join('\n');

/** Excerpt of the Qwen3.5 chat template. */
const QWEN_TEMPLATE = [
	'{%- if add_generation_prompt %}',
	'    {{- \'<|im_start|>assistant\\n\' }}',
	'    {%- if enable_thinking is defined and enable_thinking is true %}',
	'        {{- \'<think>\\n\' }}',
	'    {%- else %}',
	'        {{- \'<think>\\n\\n</think>\\n\\n\' }}',
	'    {%- endif %}',
	'{%- endif %}',
].join('\n');

suite('localModel thinking', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('detects the thinking control of a chat template without executing it', () => {
		assert.deepStrictEqual({
			harmony: detectChatTemplateThinking(HARMONY_TEMPLATE),
			harmonyDefaultHigh: detectChatTemplateThinking('{{ reasoning_effort | default("high") }}'),
			harmonyUnknownDefault: detectChatTemplateThinking('{% set reasoning_effort = "turbo" %}'),
			qwen: detectChatTemplateThinking(QWEN_TEMPLATE),
			plain: detectChatTemplateThinking('{% for m in messages %}{{ m.content }}{% endfor %}'),
			none: detectChatTemplateThinking(undefined),
		}, {
			harmony: { kind: 'effort', levels: ['low', 'medium', 'high'], defaultLevel: 'medium' },
			harmonyDefaultHigh: { kind: 'effort', levels: ['low', 'medium', 'high'], defaultLevel: 'high' },
			harmonyUnknownDefault: { kind: 'effort', levels: ['low', 'medium', 'high'], defaultLevel: 'medium' },
			qwen: { kind: 'toggle' },
			plain: undefined,
			none: undefined,
		});
	});

	test('offers the template\'s levels, or Off / On, and maps a requested effort to template kwargs', () => {
		const effort = { kind: 'effort', levels: ['low', 'medium', 'high'], defaultLevel: 'medium' } as const;
		const toggle = { kind: 'toggle' } as const;
		const map = (support: typeof effort | typeof toggle) => Object.fromEntries(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'turbo'].map(level => [level, toChatTemplateKwargs(level, support)]));
		assert.deepStrictEqual({
			effortLevels: getLocalModelThinkingLevels(effort),
			toggleLevels: getLocalModelThinkingLevels(toggle),
			effort: map(effort),
			toggle: map(toggle),
			notAString: toChatTemplateKwargs(3, toggle),
			noControl: toChatTemplateKwargs('high', undefined),
		}, {
			effortLevels: { levels: ['low', 'medium', 'high'], defaultLevel: 'medium' },
			toggleLevels: { levels: ['none', 'medium'], defaultLevel: 'medium' },
			effort: {
				none: { reasoning_effort: 'low' }, minimal: { reasoning_effort: 'low' }, low: { reasoning_effort: 'low' }, medium: { reasoning_effort: 'medium' },
				high: { reasoning_effort: 'high' }, xhigh: { reasoning_effort: 'high' }, max: { reasoning_effort: 'high' }, ultra: { reasoning_effort: 'high' }, turbo: undefined,
			},
			toggle: {
				none: { enable_thinking: false }, minimal: { enable_thinking: false }, low: { enable_thinking: true }, medium: { enable_thinking: true },
				high: { enable_thinking: true }, xhigh: { enable_thinking: true }, max: { enable_thinking: true }, ultra: { enable_thinking: true }, turbo: undefined,
			},
			notAString: undefined,
			noControl: undefined,
		});
	});
});
