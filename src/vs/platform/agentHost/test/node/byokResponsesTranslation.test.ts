/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IByokLmChatRequest, IByokLmChatResult, IByokLmInputItem, IByokLmOutputItem, IByokLmStreamDeltaBody, IByokLmTool } from '../../common/agentHostByokLm.js';
import {
	BYOK_MAX_TOOLS,
	bridgeResultToResponsesBody,
	bridgeResultToResponsesSseFrames,
	capBridgeTools,
	createResponsesSseEmitter,
	endsWithUserMessage,
	hasVisibleBridgeOutput,
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

	test('replaces input_file parts with a newline-delimited omission note', () => {
		const body: IResponsesRequest = {
			model: 'm',
			input: [{
				type: 'message', role: 'user', content: [
					{ type: 'input_text', text: 'summarize this' },
					{ type: 'input_text', text: 'Document file "spec.pdf" at path "/work/spec.pdf"' },
					{ type: 'input_file', filename: 'spec.pdf', file_data: 'data:application/pdf;base64,JVBERi0xLjQ=' },
					{ type: 'input_file', file_id: 'file_123' },
				]
			}],
		};

		assert.deepStrictEqual(responsesRequestToBridge('acme', body).input, [
			{
				type: 'message', role: 'user', content: [
					{ type: 'text', text: 'summarize this' },
					{ type: 'text', text: 'Document file "spec.pdf" at path "/work/spec.pdf"' },
					{ type: 'text', text: '\n[spec.pdf (application/pdf) omitted: this model does not accept file inputs]\n' },
					{ type: 'text', text: '\n[file_123 omitted: this model does not accept file inputs]\n' },
				]
			},
		]);
	});

	test('keeps array tool outputs with images as ordered content parts', () => {
		// Shape the Copilot runtime sends when a tool result carries images for a vision-capable model.
		const body: IResponsesRequest = {
			model: 'm',
			input: [
				{
					type: 'function_call_output', call_id: 'call_1', output: [
						{ type: 'input_text', text: 'caption A' },
						{ type: 'input_image', detail: 'auto', image_url: 'data:image/png;base64,aW1hZ2VB' },
						{ type: 'input_text', text: 'caption B' },
						{ type: 'input_image', detail: 'auto', image_url: 'data:image/jpeg;base64,aW1hZ2VC' },
					]
				},
				{ type: 'custom_tool_call_output', call_id: 'call_2', output: [{ type: 'input_text', text: 'a' }, { type: 'input_text', text: 'b' }] },
			],
		};

		assert.deepStrictEqual(responsesRequestToBridge('acme', body).input, [
			{
				type: 'function_call_output', callId: 'call_1', output: 'caption Acaption B', content: [
					{ type: 'text', text: 'caption A' },
					{ type: 'image', mimeType: 'image/png', data: 'aW1hZ2VB' },
					{ type: 'text', text: 'caption B' },
					{ type: 'image', mimeType: 'image/jpeg', data: 'aW1hZ2VC' },
				]
			},
			{ type: 'custom_tool_call_output', callId: 'call_2', output: 'ab' },
		]);
	});

	suite('capBridgeTools', () => {
		const toolNames = (request: IByokLmChatRequest) => request.tools?.map(tool => tool.name);
		const requestWithTools = (count: number, input: IByokLmChatRequest['input'] = []): IByokLmChatRequest => ({
			vendor: 'acme',
			modelId: 'm',
			input,
			tools: Array.from({ length: count }, (_, i): IByokLmTool => ({ type: 'function', name: `tool_${i}` })),
		});

		test('leaves requests within the limit untouched', () => {
			const request = requestWithTools(3);
			assert.deepStrictEqual(capBridgeTools(request, 3), { request, droppedToolNames: [] });
		});

		test('keeps the leading tools in order and reports the dropped tail', () => {
			const capped = capBridgeTools(requestWithTools(5), 3);
			assert.deepStrictEqual({ kept: toolNames(capped.request), dropped: capped.droppedToolNames }, {
				kept: ['tool_0', 'tool_1', 'tool_2'],
				dropped: ['tool_3', 'tool_4'],
			});
		});

		test('caps at the default limit', () => {
			const capped = capBridgeTools(requestWithTools(200));
			assert.deepStrictEqual({ kept: capped.request.tools?.length, dropped: capped.droppedToolNames.length }, { kept: BYOK_MAX_TOOLS, dropped: 200 - BYOK_MAX_TOOLS });
		});

		test('keeps tools the conversation already called, in their original order', () => {
			const capped = capBridgeTools(requestWithTools(6, [
				{ type: 'function_call', callId: 'c1', name: 'tool_5', argumentsJson: '{}' },
				{ type: 'custom_tool_call', callId: 'c2', name: 'tool_3', input: '' },
			]), 3);
			assert.deepStrictEqual({ kept: toolNames(capped.request), dropped: capped.droppedToolNames }, {
				kept: ['tool_0', 'tool_3', 'tool_5'],
				dropped: ['tool_1', 'tool_2', 'tool_4'],
			});
		});

	});

	test('detects input that ends with a user message', () => {
		const user: IByokLmInputItem = { type: 'message', role: 'user', content: [{ type: 'text', text: 'hi' }] };
		const developer: IByokLmInputItem = { type: 'message', role: 'developer', content: [{ type: 'text', text: 'reminder' }] };
		const assistant: IByokLmInputItem = { type: 'message', role: 'assistant', content: [{ type: 'text', text: 'hello' }] };
		const call: IByokLmInputItem = { type: 'function_call', callId: 'c1', name: 'tool', argumentsJson: '{}' };
		const callOutput: IByokLmInputItem = { type: 'function_call_output', callId: 'c1', output: 'ok' };
		assert.deepStrictEqual({
			empty: endsWithUserMessage([]),
			firstTurn: endsWithUserMessage([user]),
			userThenDeveloper: endsWithUserMessage([user, developer]),
			developerOnly: endsWithUserMessage([developer]),
			laterTurn: endsWithUserMessage([user, call, callOutput, assistant, user]),
			replacementTurnAfterRetainedToolResult: endsWithUserMessage([user, call, callOutput, user]),
			afterToolResult: endsWithUserMessage([user, call, callOutput]),
			afterAssistant: endsWithUserMessage([user, assistant]),
		}, {
			empty: false,
			firstTurn: true,
			userThenDeveloper: true,
			developerOnly: false,
			laterTurn: true,
			replacementTurnAfterRetainedToolResult: true,
			afterToolResult: false,
			afterAssistant: false,
		});
	});

	test('detects output the runtime counts as a visible response', () => {
		const text = (value: string): IByokLmOutputItem => ({ type: 'message', content: [{ type: 'text', text: value }] });
		const reasoning = (summary: string[]): IByokLmOutputItem => ({ type: 'reasoning', id: 'rs_1', summary, encryptedContent: 'opaque' });
		assert.deepStrictEqual({
			none: hasVisibleBridgeOutput([]),
			emptyText: hasVisibleBridgeOutput([text('')]),
			whitespaceText: hasVisibleBridgeOutput([text('\n\n')]),
			encryptedReasoningOnly: hasVisibleBridgeOutput([reasoning([]), reasoning([''])]),
			whitespaceReasoning: hasVisibleBridgeOutput([reasoning([' ', '\n'])]),
			text: hasVisibleBridgeOutput([text('hi')]),
			reasoningSummary: hasVisibleBridgeOutput([reasoning(['thinking'])]),
			functionCall: hasVisibleBridgeOutput([{ type: 'function_call', callId: 'c1', name: 'tool', argumentsJson: '{}' }]),
			customToolCall: hasVisibleBridgeOutput([{ type: 'custom_tool_call', callId: 'c1', name: 'tool', input: '' }]),
		}, {
			none: false,
			emptyText: false,
			whitespaceText: false,
			encryptedReasoningOnly: false,
			whitespaceReasoning: false,
			text: true,
			reasoningSummary: true,
			functionCall: true,
			customToolCall: true,
		});
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

	/** SSE frames as `{ event, data }` pairs. */
	function parseFrames(frames: readonly string[]): { event: string; data: Record<string, unknown> }[] {
		return frames.map(frame => {
			const lines = frame.trim().split('\n');
			return {
				event: lines[0].slice('event: '.length),
				data: JSON.parse(lines[1].slice('data: '.length)) as Record<string, unknown>,
			};
		});
	}

	/**
	 * Frames with the fields that legitimately differ between two serializations
	 * of the same result removed: minted ids, and sequence numbers, which shift
	 * when output arrives in finer deltas. Id consistency *within* one
	 * serialization is asserted separately.
	 */
	function stableFrames(events: readonly { event: string; data: Record<string, unknown> }[]): { event: string; data: unknown }[] {
		const strip = (value: unknown): unknown => {
			if (Array.isArray(value)) {
				return value.map(strip);
			}
			if (value && typeof value === 'object') {
				const result: Record<string, unknown> = {};
				for (const [key, nested] of Object.entries(value)) {
					if (key !== 'id' && key !== 'item_id' && key !== 'sequence_number') {
						result[key] = strip(nested);
					}
				}
				return result;
			}
			return value;
		};
		return events.map(event => ({ event: event.event, data: strip(event.data) }));
	}

	/** The items the incremental serializer advertised, keyed by output index. */
	function itemIdsByIndex(events: readonly { event: string; data: Record<string, unknown> }[]): Record<string, string | undefined>[] {
		const byIndex: Record<string, string | undefined>[] = [];
		for (const event of events) {
			if (event.event === 'response.output_item.added' || event.event === 'response.output_item.done') {
				const index = String(event.data.output_index);
				const id = (event.data.item as { id?: string }).id;
				if (event.event === 'response.output_item.added') {
					byIndex[Number(index)] = { added: id };
				} else {
					byIndex[Number(index)] = { ...byIndex[Number(index)], done: id };
				}
			}
		}
		return byIndex;
	}

	test('streams deltas into the frame sequence and output the buffered serializer produces', () => {
		const result: IByokLmChatResult = {
			responseId: 'resp_provider',
			output: [
				{ type: 'reasoning', id: 'rs_1', summary: ['first second', 'next part'], encryptedContent: 'encrypted' },
				{ type: 'message', content: [{ type: 'text', text: 'hello' }] },
				{ type: 'function_call', callId: 'call_1', name: 'getWeather', argumentsJson: '{"city":"NYC"}' },
			],
			usage: { inputTokens: 10, outputTokens: 5, reasoningTokens: 2 },
		};
		// Exactly the deltas the renderer handler emits for this result.
		const deltas: IByokLmStreamDeltaBody[] = [
			{ kind: 'reasoning', id: 'rs_1', delta: 'first', newSummaryPart: true, encryptedContent: 'encrypted' },
			{ kind: 'reasoning', id: 'rs_1', delta: ' second', newSummaryPart: false },
			{ kind: 'reasoning', id: 'rs_1', delta: 'next part', newSummaryPart: true },
			{ kind: 'text', delta: 'hel' },
			{ kind: 'text', delta: 'lo' },
			{ kind: 'toolCall', callId: 'call_1', name: 'getWeather', isCustom: false, value: '{"city":"NYC"}' },
		];

		const emitter = createResponsesSseEmitter('gpt-5', 'resp_provider');
		const streamed = parseFrames([
			...emitter.begin(),
			...deltas.flatMap(delta => emitter.push({ requestId: 'req', ...delta })),
			...emitter.complete(result),
		]);
		const buffered = parseFrames(bridgeResultToResponsesSseFrames(result, 'gpt-5'));
		const deltasRemoved = (events: typeof streamed) => events.filter(event => !event.event.endsWith('.delta'));

		// The same settled frames in the same order; only how the text is split into
		// deltas differs, and those deltas sum to the buffered text (`output_text.done`
		// and `reasoning_summary_text.done` are compared below).
		assert.deepStrictEqual(deltasRemoved(streamed).map(event => event.event), deltasRemoved(buffered).map(event => event.event));
		assert.deepStrictEqual(streamed.map(event => event.data.sequence_number), streamed.map((_, index) => index));
		// Every settled frame, and the completed output, agree with the buffered
		// serializer apart from the fields that cannot match across serializations.
		assert.deepStrictEqual(stableFrames(deltasRemoved(streamed)), stableFrames(deltasRemoved(buffered)));

		// `response.created` and `response.completed` advertise the same id, and each
		// item keeps the id it was added under through to the completed output.
		assert.strictEqual((streamed[0].data.response as { id: string }).id, (streamed.at(-1)?.data.response as { id: string }).id);
		const itemIds = itemIdsByIndex(streamed);
		assert.deepStrictEqual(itemIds.filter(pair => pair.added !== pair.done), [], 'expected each item to keep the id it was added under');
		assert.deepStrictEqual((streamed.at(-1)?.data.response as { output: { id: string }[] }).output.map(item => item.id), itemIds.map(pair => pair.added));
	});

	test('emits the first text frames without waiting for the response to complete', () => {
		const emitter = createResponsesSseEmitter('gpt-5');
		const first = parseFrames([...emitter.begin(), ...emitter.push({ requestId: 'req', kind: 'text', delta: 'hi' })]);

		assert.deepStrictEqual(first.map(event => event.event), [
			'response.created',
			'response.in_progress',
			'response.output_item.added',
			'response.content_part.added',
			'response.output_text.delta',
		]);
		assert.deepStrictEqual(first.at(-1)?.data.delta, 'hi');
	});

	test('replays output the bridge never streamed', () => {
		const result: IByokLmChatResult = { responseId: 'resp_provider', output: [{ type: 'message', content: [{ type: 'text', text: 'buffered' }] }] };
		const emitter = createResponsesSseEmitter('gpt-5', 'resp_provider');
		const buffered = parseFrames(bridgeResultToResponsesSseFrames(result, 'gpt-5'));
		const replay = parseFrames([...emitter.begin(), ...emitter.complete(result)]);

		assert.deepStrictEqual(replay.map(event => event.event), buffered.map(event => event.event));
		assert.deepStrictEqual(replay.map(event => event.data.sequence_number), replay.map((_, index) => index));
		assert.deepStrictEqual(stableFrames(replay), stableFrames(buffered));
	});

	test('fails in-stream instead of completing after output was written', () => {
		const emitter = createResponsesSseEmitter('gpt-5');
		const frames = parseFrames([...emitter.begin(), ...emitter.push({ requestId: 'req', kind: 'text', delta: 'partial' }), ...emitter.fail('model exploded')]);

		assert.deepStrictEqual({
			eventTypes: frames.map(frame => frame.event),
			last: frames.at(-1)?.event,
			status: (frames.at(-1)?.data.response as { status: string }).status,
			error: (frames.at(-1)?.data.response as { error: { message: string } }).error,
		}, {
			eventTypes: ['response.created', 'response.in_progress', 'response.output_item.added', 'response.content_part.added', 'response.output_text.delta', 'response.failed'],
			last: 'response.failed',
			status: 'failed',
			error: { code: 'server_error', message: 'model exploded' },
		});
	});

	test('updates reasoning encrypted state on each delta before closing the item', () => {
		const emitter = createResponsesSseEmitter('gpt-5');
		const frames = parseFrames([
			...emitter.begin(),
			...emitter.push({ requestId: 'req', kind: 'reasoning', id: 'rs_1', delta: 'first', newSummaryPart: true, encryptedContent: 'state-1' }),
			...emitter.push({ requestId: 'req', kind: 'reasoning', id: 'rs_1', delta: ' second', newSummaryPart: false, encryptedContent: 'state-2' }),
			...emitter.push({ requestId: 'req', kind: 'text', delta: 'hello' }),
		]);
		const reasoningDone = frames.find(f => f.event === 'response.output_item.done' && (f.data.item as { type?: string }).type === 'reasoning');
		assert.ok(reasoningDone, 'expected reasoning item to be closed');
		assert.strictEqual((reasoningDone.data.item as { encrypted_content?: string }).encrypted_content, 'state-2');
	});

	test('produces strictly increasing sequence numbers even when push is evaluated before begin', () => {
		const emitter = createResponsesSseEmitter('gpt-5');
		const pushed = emitter.push({ requestId: 'req', kind: 'text', delta: 'hi' });
		const begun = emitter.begin();
		const frames = parseFrames([...begun, ...pushed]);
		const seqs = frames.map(f => f.data.sequence_number);
		assert.deepStrictEqual(seqs, [0, 1, 2, 3, 4]);
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
