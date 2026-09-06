/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IByokLmChatResult } from '../../common/agentHostByokLm.js';
import {
	bridgeResultToResponsesBody,
	bridgeResultToResponsesSseFrames,
	IResponsesRequest,
	responsesRequestToBridge,
	ResponsesTranslationError,
} from '../../node/copilot/byokResponsesTranslation.js';

suite('byokResponsesTranslation', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('maps ordered Responses input, tools, continuation, reasoning and options', () => {
		const body: IResponsesRequest = {
			model: 'gpt-5',
			instructions: 'be helpful',
			previous_response_id: 'resp_previous',
			reasoning: { effort: 'high' },
			temperature: 0.5,
			top_p: 0.9,
			max_output_tokens: 256,
			input: [
				{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello' }] },
				{ type: 'reasoning', id: 'rs_1', summary: [{ type: 'summary_text', text: 'considered it' }], encrypted_content: 'encrypted' },
				{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'checking' }] },
				{ type: 'function_call', call_id: 'call_1', name: 'getWeather', arguments: '{"city":"NYC"}' },
				{ type: 'function_call_output', call_id: 'call_1', output: 'sunny' },
				{ type: 'custom_tool_call', call_id: 'call_2', name: 'apply_patch', input: '*** Begin Patch' },
				{ type: 'custom_tool_call_output', call_id: 'call_2', output: 'Done!' },
			],
			tools: [
				{ type: 'function', name: 'getWeather', description: 'weather', parameters: { type: 'object' } },
				{ type: 'custom', name: 'apply_patch', description: 'patch files' },
			],
		};

		assert.deepStrictEqual(responsesRequestToBridge('acme', body), {
			vendor: 'acme',
			modelId: 'gpt-5',
			instructions: 'be helpful',
			input: [
				{ type: 'message', role: 'user', content: [{ type: 'text', text: 'hello' }] },
				{ type: 'reasoning', id: 'rs_1', summary: ['considered it'], encryptedContent: 'encrypted' },
				{ type: 'message', role: 'assistant', content: [{ type: 'text', text: 'checking' }] },
				{ type: 'function_call', callId: 'call_1', name: 'getWeather', argumentsJson: '{"city":"NYC"}' },
				{ type: 'function_call_output', callId: 'call_1', output: 'sunny' },
				{ type: 'custom_tool_call', callId: 'call_2', name: 'apply_patch', input: '*** Begin Patch' },
				{ type: 'custom_tool_call_output', callId: 'call_2', output: 'Done!' },
			],
			tools: [
				{ type: 'function', name: 'getWeather', description: 'weather', parametersSchema: { type: 'object' } },
				{ type: 'custom', name: 'apply_patch', description: 'patch files' },
			],
			previousResponseId: 'resp_previous',
			reasoningEffort: 'high',
			modelOptions: { temperature: 0.5, top_p: 0.9, max_tokens: 256 },
		});
	});

	test('maps string input to a user message', () => {
		assert.deepStrictEqual(responsesRequestToBridge('acme', { model: 'm', input: 'hello' }).input, [
			{ type: 'message', role: 'user', content: [{ type: 'text', text: 'hello' }] },
		]);
	});

	test('rejects missing models and unsupported input items', () => {
		assert.throws(() => responsesRequestToBridge('acme', { input: [] }), ResponsesTranslationError);
		assert.throws(() => responsesRequestToBridge('acme', {
			model: 'm',
			input: [{ type: 'computer_call' }],
		}), /Unsupported input\[0\]/);
	});

	test('emits ordered Responses SSE for reasoning, text and tool calls', () => {
		const result: IByokLmChatResult = {
			responseId: 'resp_provider',
			output: [
				{ type: 'reasoning', id: 'rs_1', summary: ['first', 'second'], encryptedContent: 'encrypted' },
				{ type: 'message', content: [{ type: 'text', text: 'hello' }] },
				{ type: 'function_call', callId: 'call_1', name: 'getWeather', argumentsJson: '{"city":"NYC"}' },
				{ type: 'custom_tool_call', callId: 'call_2', name: 'apply_patch', input: 'patch' },
			],
			usage: { inputTokens: 10, outputTokens: 5, reasoningTokens: 2 },
		};

		const events = bridgeResultToResponsesSseFrames(result, 'gpt-5').map(frame => {
			const lines = frame.trim().split('\n');
			return {
				event: lines[0].slice('event: '.length),
				data: JSON.parse(lines[1].slice('data: '.length)) as Record<string, unknown>,
			};
		});
		const completed = events.at(-1)?.data.response as { id: string; output: Array<{ type: string }>; usage: unknown };

		assert.deepStrictEqual({
			eventTypes: events.map(event => event.event),
			addedStatuses: events
				.filter(event => event.event === 'response.output_item.added')
				.map(event => (event.data.item as { status: string }).status),
			responseId: completed.id,
			outputTypes: completed.output.map(item => item.type),
			usage: completed.usage,
		}, {
			eventTypes: [
				'response.created',
				'response.in_progress',
				'response.output_item.added',
				'response.reasoning_summary_part.added',
				'response.reasoning_summary_text.delta',
				'response.reasoning_summary_text.done',
				'response.reasoning_summary_part.done',
				'response.reasoning_summary_part.added',
				'response.reasoning_summary_text.delta',
				'response.reasoning_summary_text.done',
				'response.reasoning_summary_part.done',
				'response.output_item.done',
				'response.output_item.added',
				'response.content_part.added',
				'response.output_text.delta',
				'response.output_text.done',
				'response.content_part.done',
				'response.output_item.done',
				'response.output_item.added',
				'response.function_call_arguments.delta',
				'response.function_call_arguments.done',
				'response.output_item.done',
				'response.output_item.added',
				'response.custom_tool_call_input.delta',
				'response.custom_tool_call_input.done',
				'response.output_item.done',
				'response.completed',
			],
			addedStatuses: ['in_progress', 'in_progress', 'in_progress', 'in_progress'],
			responseId: 'resp_provider',
			outputTypes: ['reasoning', 'message', 'function_call', 'custom_tool_call'],
			usage: {
				input_tokens: 10,
				input_tokens_details: { cached_tokens: 0 },
				output_tokens: 5,
				output_tokens_details: { reasoning_tokens: 2 },
				total_tokens: 15,
			},
		});
	});

	test('encodes a completed non-streaming Responses body', () => {
		const body = JSON.parse(bridgeResultToResponsesBody({
			responseId: 'resp_provider',
			output: [
				{ type: 'reasoning', id: 'thinking_1', summary: ['thought'], encryptedContent: 'vscode-reasoning-metadata:{"signature":"sig"}' },
				{ type: 'message', content: [{ type: 'text', text: 'answer' }] },
			],
			usage: { inputTokens: 3, outputTokens: 2, reasoningTokens: 1 },
		}, 'gpt-5')) as {
			id: string;
			created_at: number;
			status: string;
			output: Array<{ id: string; type: string; encrypted_content?: string | null }>;
			output_text: string;
			usage: unknown;
		};

		assert.deepStrictEqual(body, {
			id: 'resp_provider',
			object: 'response',
			created_at: body['created_at'],
			status: 'completed',
			error: null,
			incomplete_details: null,
			instructions: null,
			model: 'gpt-5',
			output: body.output,
			output_text: 'answer',
			parallel_tool_calls: true,
			temperature: 1,
			tool_choice: 'auto',
			tools: [],
			top_p: 1,
			usage: {
				input_tokens: 3,
				input_tokens_details: { cached_tokens: 0 },
				output_tokens: 2,
				output_tokens_details: { reasoning_tokens: 1 },
				total_tokens: 5,
			},
		});
		assert.deepStrictEqual(body.output.map(item => item.type), ['reasoning', 'message']);
		assert.match(body.output[0].id, /^rs_byok_/);
		assert.strictEqual(body.output[0].encrypted_content, 'vscode-reasoning-metadata:{"signature":"sig"}');
	});
});
