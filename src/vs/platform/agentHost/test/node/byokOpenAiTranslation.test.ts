/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IByokLmChatResult } from '../../common/agentHostByokLm.js';
import {
	bridgeResultToSseFrames,
	openAiRequestToBridge,
	OpenAiTranslationError,
	type IOpenAiChatRequest,
} from '../../node/copilot/byokOpenAiTranslation.js';

suite('byokOpenAiTranslation', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('openAiRequestToBridge', () => {

		test('maps roles, text content, tools and options', () => {
			const body: IOpenAiChatRequest = {
				model: 'claude-sonnet',
				temperature: 0.5,
				max_tokens: 256,
				messages: [
					{ role: 'system', content: 'be helpful' },
					{ role: 'user', content: [{ type: 'text', text: 'hi ' }, { type: 'text', text: 'there' }] },
					{
						role: 'assistant',
						content: '',
						tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'getWeather', arguments: '{"city":"NYC"}' } }],
					},
					{ role: 'tool', tool_call_id: 'call_1', content: 'sunny' },
				],
				tools: [{ type: 'function', function: { name: 'getWeather', description: 'weather', parameters: { type: 'object' } } }],
			};

			const result = openAiRequestToBridge('acme', body);

			assert.deepStrictEqual(result, {
				vendor: 'acme',
				modelId: 'claude-sonnet',
				messages: [
					{ role: 'system', content: 'be helpful', toolCalls: undefined, toolCallId: undefined },
					{ role: 'user', content: 'hi there', toolCalls: undefined, toolCallId: undefined },
					{ role: 'assistant', content: '', toolCalls: [{ id: 'call_1', name: 'getWeather', argumentsJson: '{"city":"NYC"}' }], toolCallId: undefined },
					{ role: 'tool', content: 'sunny', toolCalls: undefined, toolCallId: 'call_1' },
				],
				tools: [{ name: 'getWeather', description: 'weather', parametersSchema: { type: 'object' } }],
				modelOptions: { temperature: 0.5, max_tokens: 256 },
			});
		});

		test('throws when model is missing', () => {
			assert.throws(() => openAiRequestToBridge('acme', { messages: [] }), OpenAiTranslationError);
		});

		test('throws when an assistant tool call is missing its function name', () => {
			assert.throws(() => openAiRequestToBridge('acme', {
				model: 'm',
				messages: [{ role: 'assistant', content: '', tool_calls: [{ id: 'call_1', type: 'function', function: { arguments: '{}' } }] }],
			}), OpenAiTranslationError);
		});

		test('omits tools and options when absent', () => {
			const result = openAiRequestToBridge('acme', { model: 'm', messages: [{ role: 'user', content: 'hello' }] });
			assert.strictEqual(result.tools, undefined);
			assert.strictEqual(result.modelOptions, undefined);
		});
	});

	suite('bridgeResultToSseFrames', () => {

		function parseFrames(frames: string[]): unknown[] {
			return frames
				.map(frame => frame.replace(/^data: /, '').trim())
				.filter(payload => payload !== '[DONE]')
				.map(payload => JSON.parse(payload));
		}

		test('emits role, content and stop frames terminated by [DONE]', () => {
			const result: IByokLmChatResult = { content: 'hello world' };
			const frames = bridgeResultToSseFrames(result, 'm');

			assert.strictEqual(frames[frames.length - 1], 'data: [DONE]\n\n');
			const parsed = parseFrames(frames) as Array<{ choices: Array<{ delta: Record<string, unknown>; finish_reason: string | null }> }>;
			assert.deepStrictEqual(parsed.map(p => p.choices[0].delta), [
				{ role: 'assistant' },
				{ content: 'hello world' },
				{},
			]);
			assert.strictEqual(parsed[parsed.length - 1].choices[0].finish_reason, 'stop');
		});

		test('encodes tool calls and a tool_calls finish reason', () => {
			const result: IByokLmChatResult = {
				content: '',
				toolCalls: [{ id: 'call_1', name: 'getWeather', argumentsJson: '{"city":"NYC"}' }],
			};
			const frames = bridgeResultToSseFrames(result, 'm');
			const parsed = parseFrames(frames) as Array<{ choices: Array<{ delta: Record<string, unknown>; finish_reason: string | null }> }>;

			const toolDelta = parsed.find(p => p.choices[0].delta.tool_calls !== undefined);
			assert.deepStrictEqual(toolDelta?.choices[0].delta.tool_calls, [
				{ index: 0, id: 'call_1', type: 'function', function: { name: 'getWeather', arguments: '{"city":"NYC"}' } },
			]);
			assert.strictEqual(parsed[parsed.length - 1].choices[0].finish_reason, 'tool_calls');
		});
	});
});
