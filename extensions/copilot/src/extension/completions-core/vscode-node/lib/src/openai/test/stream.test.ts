/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CopilotAnnotation, StreamCopilotAnnotations } from '../../../../../../../platform/completions-core/common/openai/copilotAnnotations';
import { ServicesAccessor } from '../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { asyncIterableToArray } from '../../helpers/iterableHelpers';
import { TelemetryWithExp } from '../../telemetry';
import { createLibTestingContext } from '../../test/context';
import { createFakeStreamResponse } from '../../test/fetcher';
import { CopilotConfirmation, CopilotError, CopilotReference, RequestDelta } from '../fetch';
import {
	FinishedCompletion,
	SSEProcessor,
	splitChunk,
} from '../stream';

suite('splitChunk', function () {
	test('splits correctly with one newline in between', function () {
		const [lines, extra] = splitChunk('foo\nbar');
		assert.deepStrictEqual(lines, ['foo']);
		assert.strictEqual(extra, 'bar');
	});
	test('splits correctly with one newline in between and trailing', function () {
		const [lines, extra] = splitChunk('foo\nbar\n');
		assert.deepStrictEqual(lines, ['foo', 'bar']);
		assert.strictEqual(extra, '');
	});
	test('splits correctly with two newlines in between', function () {
		const [lines, extra] = splitChunk('foo\n\nbar');
		assert.deepStrictEqual(lines, ['foo']);
		assert.strictEqual(extra, 'bar');
	});
	test('splits correctly with two newlines in between and trailing', function () {
		const [lines, extra] = splitChunk('foo\n\nbar\n\n');
		assert.deepStrictEqual(lines, ['foo', 'bar']);
		assert.strictEqual(extra, '');
	});
	test('splits correctly with three newlines in between', function () {
		const [lines, extra] = splitChunk('foo\n\n\nbar');
		assert.deepStrictEqual(lines, ['foo']);
		assert.strictEqual(extra, 'bar');
	});
	test('splits correctly with three newlines in between and trailing', function () {
		const [lines, extra] = splitChunk('foo\n\n\nbar\n\n\n');
		assert.deepStrictEqual(lines, ['foo', 'bar']);
		assert.strictEqual(extra, '');
	});
});

suite('Copilot Annotations', function () {
	class TestCopilotAnnotation implements CopilotAnnotation {
		id: number;
		stop_offset: number;
		start_offset: number;
		details: { [key: string]: unknown };

		constructor(id: number, start_offset: number, stop_offset: number, cursor: number) {
			this.id = id;
			this.start_offset = start_offset;
			this.stop_offset = stop_offset;
			this.details = { cursor: cursor };
		}
	}

	test('add a new annotation', function () {
		const annotations = new StreamCopilotAnnotations();
		const annotation = new TestCopilotAnnotation(1, 0, 1, 100);
		annotations.update({ test: [annotation] });
		assert.deepStrictEqual(annotations.for('test'), [annotation]);
	});

	test('update many annotations', function () {
		const annotations = new StreamCopilotAnnotations();
		const annotation = new TestCopilotAnnotation(1, 0, 1, 100);
		const annotation2 = new TestCopilotAnnotation(2, 0, 1, 100);
		const annotation3 = new TestCopilotAnnotation(1, 0, 1, 100);
		const annotation4 = new TestCopilotAnnotation(2, 0, 1, 100);
		annotations.update({ test: [annotation, annotation4], test2: [annotation2], test3: [annotation3] });
		assert.deepStrictEqual(annotations.for('test'), [annotation, annotation4]);
		assert.deepStrictEqual(annotations.for('test2'), [annotation2]);
		assert.deepStrictEqual(annotations.for('test3'), [annotation3]);
		annotation.details['cursor'] = 102;
		annotation2.details['cursor'] = 101;
		annotation3.details['cursor'] = 103;
		const annotation5 = new TestCopilotAnnotation(5, 0, 1, 103);
		annotations.update({ test: [annotation], test2: [annotation2], test3: [annotation3, annotation5] });
		assert.deepStrictEqual(annotations.for('test'), [annotation, annotation4]);
		assert.deepStrictEqual(annotations.for('test2'), [annotation2]);
		assert.deepStrictEqual(annotations.for('test3'), [annotation3, annotation5]);
	});

	test('adds new annotation when new id started', function () {
		const annotations = new StreamCopilotAnnotations();
		const annotation = new TestCopilotAnnotation(1, 0, 1, 100);
		const annotation2 = new TestCopilotAnnotation(2, 0, 1, 100);
		annotations.update({ test: [annotation] });
		annotations.update({ test: [annotation2] });
		assert.deepStrictEqual(annotations.for('test'), [annotation, annotation2]);
		annotations.update({ test2: [annotation2] });
		assert.deepStrictEqual(annotations.for('test2'), [annotation2]);
	});
});

suite('SSEProcessor', function () {
	let accessor: ServicesAccessor;

	setup(function () {
		accessor = createLibTestingContext().createTestingAccessor();
	});

	interface SimpleResult {
		finishReason: string | null;
		chunks: string[];
	}

	function assertSimplifiedResultsEqual(
		actual: FinishedCompletion[],
		splifiedExpected: Record<number, SimpleResult>
	) {
		const simplifiedActual = Object.fromEntries(
			actual.map(c => [
				c.index,
				{
					finishReason: c.reason,
					chunks: c.solution.text,
				},
			])
		);
		assert.deepStrictEqual(simplifiedActual, splifiedExpected);
	}

	test('empty response yields no results', async function () {
		const processor = await SSEProcessor.create(
			accessor,
			1,
			createFakeStreamResponse(''),
			TelemetryWithExp.createEmptyConfigForTesting()
		);
		const results = await asyncIterableToArray(processor.processSSE());
		assertSimplifiedResultsEqual(results, {});
	});

	test('done response yields no results', async function () {
		const processor = await SSEProcessor.create(
			accessor,
			1,
			createFakeStreamResponse('data: [DONE]\n'),
			TelemetryWithExp.createEmptyConfigForTesting()
		);
		const results = await asyncIterableToArray(processor.processSSE());
		assertSimplifiedResultsEqual(results, {});
	});

	test('broken JSON response is skipped', async function () {
		const processor = await SSEProcessor.create(
			accessor,
			1,
			createFakeStreamResponse('data: {\n'),
			TelemetryWithExp.createEmptyConfigForTesting()
		);
		const results = await asyncIterableToArray(processor.processSSE());
		assertSimplifiedResultsEqual(results, {});
	});

	test('empty JSON response is skipped', async function () {
		const processor = await SSEProcessor.create(
			accessor,
			1,
			createFakeStreamResponse('data: {}\n'),
			TelemetryWithExp.createEmptyConfigForTesting()
		);
		const results = await asyncIterableToArray(processor.processSSE());
		assertSimplifiedResultsEqual(results, {});
	});

	test('1 text token response yields 1 result', async function () {
		const response = `data: {"choices":[{"text":"foo","index":0,"finish_reason":"stop"}]}
data: [DONE]
`;
		const processor = await SSEProcessor.create(
			accessor,
			1,
			createFakeStreamResponse(response),
			TelemetryWithExp.createEmptyConfigForTesting()
		);
		const results = await asyncIterableToArray(processor.processSSE());
		assertSimplifiedResultsEqual(results, {
			0: {
				finishReason: 'stop',
				chunks: ['foo'],
			},
		});
	});

	test('does not fail with null choices', async function () {
		const response = `data: {"choices":null}
data: [DONE]
`;
		const processor = await SSEProcessor.create(
			accessor,
			1,
			createFakeStreamResponse(response),
			TelemetryWithExp.createEmptyConfigForTesting()
		);
		const results = await asyncIterableToArray(processor.processSSE());
		assertSimplifiedResultsEqual(results, {});
	});

	test('1 delta token response yields 1 result', async function () {
		const response = `data: {"choices":[{"delta":{"content":"foo"},"index":0,"finish_reason":"stop"}]}
data: [DONE]
`;
		const processor = await SSEProcessor.create(
			accessor,
			1,
			createFakeStreamResponse(response),
			TelemetryWithExp.createEmptyConfigForTesting()
		);
		const results = await asyncIterableToArray(processor.processSSE());
		assertSimplifiedResultsEqual(results, {
			0: {
				finishReason: 'stop',
				chunks: ['foo'],
			},
		});
	});

	test('response with text and without finish_reason yields "DONE" result', async function () {
		// This is not an expected case, since the OpenAI API should always
		// include a finish_reason, but we handle it anyway.
		const response = `data: {"choices":[{"text":"foo","index":0,"finish_reason":null}]}
data: [DONE]
`;
		const processor = await SSEProcessor.create(
			accessor,
			1,
			createFakeStreamResponse(response),
			TelemetryWithExp.createEmptyConfigForTesting()
		);
		const results = await asyncIterableToArray(processor.processSSE());
		assertSimplifiedResultsEqual(results, {
			0: {
				finishReason: 'DONE',
				chunks: ['foo'],
			},
		});
	});

	test('response with delta and without finish_reason yields "DONE" result', async function () {
		// This is not an expected case, since the OpenAI API should always
		// include a finish_reason, but we handle it anyway.
		const response = `data: {"choices":[{"delta":{"content":"foo"},"index":0,"finish_reason":null}]}
data: [DONE]
`;
		const processor = await SSEProcessor.create(
			accessor,
			1,
			createFakeStreamResponse(response),
			TelemetryWithExp.createEmptyConfigForTesting()
		);
		const results = await asyncIterableToArray(processor.processSSE());
		assertSimplifiedResultsEqual(results, {
			0: {
				finishReason: 'DONE',
				chunks: ['foo'],
			},
		});
	});

	test('response with text and without finish_reason or "[DONE]" yields "Iteration Done" result', async function () {
		// This is not an expected case, since the OpenAI API should always
		// include a finish_reason, but we handle it anyway.
		const response = `data: {"choices":[{"text":"foo","index":0,"finish_reason":null}]}
`;
		const processor = await SSEProcessor.create(
			accessor,
			1,
			createFakeStreamResponse(response),
			TelemetryWithExp.createEmptyConfigForTesting()
		);
		const results = await asyncIterableToArray(processor.processSSE());
		assertSimplifiedResultsEqual(results, {
			0: {
				finishReason: 'Iteration Done',
				chunks: ['foo'],
			},
		});
	});

	test('response with delta and without finish_reason or "[DONE]" yields "Iteration Done" result', async function () {
		// This is not an expected case, since the OpenAI API should always
		// include a finish_reason, but we handle it anyway.
		const response = `data: {"choices":[{"delta":{"content":"foo"},"index":0,"finish_reason":null}]}
`;
		const processor = await SSEProcessor.create(
			accessor,
			1,
			createFakeStreamResponse(response),
			TelemetryWithExp.createEmptyConfigForTesting()
		);
		const results = await asyncIterableToArray(processor.processSSE());
		assertSimplifiedResultsEqual(results, {
			0: {
				finishReason: 'Iteration Done',
				chunks: ['foo'],
			},
		});
	});

	test('2 token text response with 1 index yields 1 result', async function () {
		const response = `data: {"choices":[{"text":"foo","index":0,"finish_reason":null}]}
data: {"choices":[{"text":"bar","index":0,"finish_reason":"stop"}]}
data: [DONE]
`;
		const processor = await SSEProcessor.create(
			accessor,
			1,
			createFakeStreamResponse(response),
			TelemetryWithExp.createEmptyConfigForTesting()
		);
		const results = await asyncIterableToArray(processor.processSSE());
		assertSimplifiedResultsEqual(results, {
			0: {
				finishReason: 'stop',
				chunks: ['foo', 'bar'],
			},
		});
	});

	test('2 token delta response with 1 index yields 1 result', async function () {
		const response = `data: {"choices":[{"delta":{"content":"foo"},"index":0,"finish_reason":null}]}
data: {"choices":[{"delta":{"content":"bar"},"index":0,"finish_reason":"stop"}]}
data: [DONE]
`;
		const processor = await SSEProcessor.create(
			accessor,
			1,
			createFakeStreamResponse(response),
			TelemetryWithExp.createEmptyConfigForTesting()
		);
		const results = await asyncIterableToArray(processor.processSSE());
		assertSimplifiedResultsEqual(results, {
			0: {
				finishReason: 'stop',
				chunks: ['foo', 'bar'],
			},
		});
	});

	test('text choice with logprobs are preserved', async function () {
		const response = `data: {"choices":[{"text":"foo","index":0,"finish_reason":null,"logprobs":{"token_logprobs":[-1.0]}}]}
data: {"choices":[{"text":"bar","index":0,"finish_reason":"stop","logprobs":{"token_logprobs":[-2.0]}}]}
data: [DONE]
`;
		const processor = await SSEProcessor.create(
			accessor,
			1,
			createFakeStreamResponse(response),
			TelemetryWithExp.createEmptyConfigForTesting()
		);
		const results = await asyncIterableToArray(processor.processSSE());
		assert.deepStrictEqual(results[0].solution.logprobs, [[-1], [-2]]);
	});

	test('delta choice with logprobs are preserved', async function () {
		const response = `data: {"choices":[{"delta":{"content":"foo"},"index":0,"finish_reason":null,"logprobs":{"token_logprobs":[-1.0]}}]}
data: {"choices":[{"delta":{"content":"bar"},"index":0,"finish_reason":"stop","logprobs":{"token_logprobs":[-2.0]}}]}
data: [DONE]
`;
		const processor = await SSEProcessor.create(
			accessor,
			1,
			createFakeStreamResponse(response),
			TelemetryWithExp.createEmptyConfigForTesting()
		);
		const results = await asyncIterableToArray(processor.processSSE());
		assert.deepStrictEqual(results[0].solution.logprobs, [[-1], [-2]]);
	});

	test('text choice with annotations are preserved', async function () {
		const response = `data: {"choices":[{"text":"foo","index":0,"finish_reason":null,"copilot_annotations": {"code_references": [{"match_id": 2, "cursor": "123,", "start_offset": 120, "stop_offset": 130}] } }]}
data: {"choices":[{"text":"bar","index":0,"finish_reason":"stop","logprobs":{"token_logprobs":[-2.0]}}]}
data: [DONE]
`;
		const processor = await SSEProcessor.create(
			accessor,
			1,
			createFakeStreamResponse(response),
			TelemetryWithExp.createEmptyConfigForTesting()
		);
		const match = { match_id: 2, cursor: '123,', start_offset: 120, stop_offset: 130 };
		const results = await asyncIterableToArray(processor.processSSE());
		assert.deepStrictEqual(results[0].solution.copilot_annotations.for('code_references')[0], match);
	});

	test('delta choice with annotations are preserved', async function () {
		const response = `data: {"choices":[{"delta":{"content":"foo"},"index":0,"finish_reason":null, "annotations": {"code_references": [{"match_id": 2, "cursor": "123,", "start_offset": 120, "stop_offset": 130}] } }]}
data: {"choices":[{"delta":{"content":"bar"},"index":0,"finish_reason":"stop", "copilot_annotations": {"code_references": [{"match_id": 2, "cursor": "123,", "start_offset": 120, "stop_offset": 130}] } }]}
data: [DONE]
`;
		const processor = await SSEProcessor.create(
			accessor,
			1,
			createFakeStreamResponse(response),
			TelemetryWithExp.createEmptyConfigForTesting()
		);
		const results = await asyncIterableToArray(processor.processSSE());
		const match = { match_id: 2, cursor: '123,', start_offset: 120, stop_offset: 130 };
		assert.deepStrictEqual(results[0].solution.copilot_annotations.for('code_references')[0], match);
	});

	test('text choice with annotations are updated', async function () {
		const response = `data: {"choices":[{"text":"foo","index":0,"finish_reason":null,"copilot_annotations": {"code_references": [{"match_id": 2, "cursor": "123,", "start_offset": 120, "stop_offset": 130}] } }]}
data: {"choices":[{"text":"bar","index":0,"copilot_annotations": {"code_references": [{"match_id": 2, "cursor": "123,456", "start_offset": 120, "stop_offset": 140}] },"finish_reason":"stop","logprobs":{"token_logprobs":[-2.0]}}]}
data: [DONE]
`;
		const processor = await SSEProcessor.create(
			accessor,
			1,
			createFakeStreamResponse(response),
			TelemetryWithExp.createEmptyConfigForTesting()
		);
		const match = { match_id: 2, cursor: '123,456', start_offset: 120, stop_offset: 140 };
		const results = await asyncIterableToArray(processor.processSSE());
		assert.deepStrictEqual(results[0].solution.copilot_annotations.for('code_references')[0], match);
	});

	test('delta choice with annotations are updated', async function () {
		const response = `data: {"choices":[{"delta":{"content":"foo", "copilot_annotations": {"code_references": [{"match_id": 2, "cursor": "123,", "start_offset": 120, "stop_offset": 130}] } },"index":0,"finish_reason":null }]}
data: {"choices":[{"delta":{"content":"bar", "copilot_annotations": {"code_references": [{"match_id": 2, "cursor": "123", "start_offset": 120, "stop_offset": 130}] } },"index":0,"finish_reason":"stop" }]}
data: [DONE]
`;
		const processor = await SSEProcessor.create(
			accessor,
			1,
			createFakeStreamResponse(response),
			TelemetryWithExp.createEmptyConfigForTesting()
		);
		const match = { match_id: 2, cursor: '123', start_offset: 120, stop_offset: 130 };
		const results = await asyncIterableToArray(processor.processSSE());
		assert.deepStrictEqual(results[0].solution.copilot_annotations.for('code_references')[0], match);
	});

	test('2 text token response with 2 indexes yields 2 results', async function () {
		const response = `data: {"choices":[{"text":"foo","index":0,"finish_reason":"stop"}]}
data: {"choices":[{"text":"bar","index":1,"finish_reason":"stop"}]}
data: [DONE]
`;
		const processor = await SSEProcessor.create(
			accessor,
			2,
			createFakeStreamResponse(response),
			TelemetryWithExp.createEmptyConfigForTesting()
		);
		const results = await asyncIterableToArray(processor.processSSE());
		assertSimplifiedResultsEqual(results, {
			0: {
				finishReason: 'stop',
				chunks: ['foo'],
			},
			1: {
				finishReason: 'stop',
				chunks: ['bar'],
			},
		});
	});

	test('2 delta token response with 2 indexes yields 2 results', async function () {
		const response = `data: {"choices":[{"delta":{"content":"foo"},"index":0,"finish_reason":"stop"}]}
data: {"choices":[{"delta":{"content":"bar"},"index":1,"finish_reason":"stop"}]}
data: [DONE]
`;
		const processor = await SSEProcessor.create(
			accessor,
			2,
			createFakeStreamResponse(response),
			TelemetryWithExp.createEmptyConfigForTesting()
		);
		const results = await asyncIterableToArray(processor.processSSE());
		assertSimplifiedResultsEqual(results, {
			0: {
				finishReason: 'stop',
				chunks: ['foo'],
			},
			1: {
				finishReason: 'stop',
				chunks: ['bar'],
			},
		});
	});

	test('text completions that finish with "content_filter" are fully skipped when drop completion reasons are specified', async function () {
		const response = `data: {"choices":[{"text":"foo","index":0,"finish_reason":null}]}
data: {"choices":[{"text":"bar","index":0,"finish_reason":"content_filter"}]}
data: [DONE]
`;
		const processor = await SSEProcessor.create(
			accessor,
			1,
			createFakeStreamResponse(response),
			TelemetryWithExp.createEmptyConfigForTesting(),
			['content_filter']
		);
		const results = await asyncIterableToArray(processor.processSSE());
		assertSimplifiedResultsEqual(results, {});
	});

	test('delta completions that finish with "content_filter" are fully skipped when drop completion reasons are specified', async function () {
		const response = `data: {"choices":[{"delta":{"content":"foo"},"index":0,"finish_reason":null}]}
data: {"choices":[{"delta":{"content":"bar"},"index":0,"finish_reason":"content_filter"}]}
data: [DONE]
`;
		const processor = await SSEProcessor.create(
			accessor,
			1,
			createFakeStreamResponse(response),
			TelemetryWithExp.createEmptyConfigForTesting(),
			['content_filter']
		);
		const results = await asyncIterableToArray(processor.processSSE());
		assertSimplifiedResultsEqual(results, {});
	});

	test('text completions that finish with "content_filter" are returned, when drop completion reasons are empty', async function () {
		const response = `data: {"choices":[{"text":"foo","index":0,"finish_reason":null}]}
data: {"choices":[{"text":"bar","index":0,"finish_reason":"content_filter"}]}
data: [DONE]
`;
		const processor = await SSEProcessor.create(
			accessor,
			1,
			createFakeStreamResponse(response),
			TelemetryWithExp.createEmptyConfigForTesting(),
			[]
		);
		const results = await asyncIterableToArray(processor.processSSE());
		assertSimplifiedResultsEqual(results, {
			0: {
				finishReason: 'content_filter',
				chunks: ['foo', 'bar'],
			},
		});
	});

	test('delta completions that finish with "content_filter" are returned, when drop completion reasons are empty', async function () {
		const response = `data: {"choices":[{"delta":{"content":"foo"},"index":0,"finish_reason":null}]}
data: {"choices":[{"delta":{"content":"bar"},"index":0,"finish_reason":"content_filter"}]}
data: [DONE]
`;
		const processor = await SSEProcessor.create(
			accessor,
			1,
			createFakeStreamResponse(response),
			TelemetryWithExp.createEmptyConfigForTesting(),
			[]
		);
		const results = await asyncIterableToArray(processor.processSSE());
		assertSimplifiedResultsEqual(results, {
			0: {
				finishReason: 'content_filter',
				chunks: ['foo', 'bar'],
			},
		});
	});

	test('annotations are passed to finishedCb', async function () {
		const references: CopilotAnnotation[] = [];
		const response = `data: {"choices":[{"delta":{"content":"foo", "copilot_annotations": {"code_references": [{"match_id": 2, "cursor": "123,", "start_offset": 120, "stop_offset": 130}] } },"index":0,"finish_reason":null }]}
data: {"choices":[{"delta":{"content":"bar", "copilot_annotations": {"code_references": [{"match_id": 2, "cursor": "123", "start_offset": 120, "stop_offset": 130}] } },"index":0,"finish_reason":"stop" }]}
data: [DONE]
`;
		const processor = await SSEProcessor.create(
			accessor,
			1,
			createFakeStreamResponse(response),
			TelemetryWithExp.createEmptyConfigForTesting()
		);

		await asyncIterableToArray(
			processor.processSSE((text: string, delta: RequestDelta) => {
				delta.annotations?.for('code_references').forEach(ref => references.push(ref));
				return 0;
			})
		);

		const match = { match_id: 2, cursor: '123', start_offset: 120, stop_offset: 130 };
		assert.deepStrictEqual(references[0], match);
	});

	test('copilot_errors are passed to finishedCb', async function () {
		const errors: CopilotError[] = [];
		const response = `data: {"choices":[{"delta":{"content":"foo", "copilot_annotations": {"code_references": [{"match_id": 2, "cursor": "123,", "start_offset": 120, "stop_offset": 130}] } },"index":0,"finish_reason":null }]}
data: {"choices":[{"delta":{"content":"bar", "copilot_annotations": {"code_references": [{"match_id": 2, "cursor": "123", "start_offset": 120, "stop_offset": 130}] } },"index":0,"finish_reason":"stop" }]}
data: {"copilot_errors": [{ "type": "reference", "code": "unknown", "message": "Unknown branch", "identifier": "id1" }, { "type": "reference", "code": "invalid", "message": "Invalid SHA", "identifier": "id2" }]}
data: [DONE]
`;

		const processor = await SSEProcessor.create(
			accessor,
			1,
			createFakeStreamResponse(response),
			TelemetryWithExp.createEmptyConfigForTesting()
		);

		await asyncIterableToArray(
			processor.processSSE((text: string, delta: RequestDelta) => {
				delta.copilotErrors?.forEach(err => errors.push(err));
				return 0;
			})
		);

		assert.deepStrictEqual(errors.length, 2);
		assert.deepStrictEqual(errors[0], {
			type: 'reference',
			code: 'unknown',
			message: 'Unknown branch',
			identifier: 'id1',
		});
		assert.deepStrictEqual(errors[1], {
			type: 'reference',
			code: 'invalid',
			message: 'Invalid SHA',
			identifier: 'id2',
		});
	});

	test('copilot_confirmations are passed to finishedCb', async function () {
		const confirmations: CopilotConfirmation[] = [];
		const response = `data: {"choices":[{"delta":{"content":"foo", "copilot_annotations": {"code_references": [{"match_id": 2, "cursor": "123,", "start_offset": 120, "stop_offset": 130}] } },"index":0,"finish_reason":null }]}
data: {"choices":[{"delta":{"content":"bar", "copilot_annotations": {"code_references": [{"match_id": 2, "cursor": "123", "start_offset": 120, "stop_offset": 130}] } },"index":0,"finish_reason":"stop" }]}
data: {"choices":null,"copilot_confirmation":{"type":"action","title":"Are you sure you want to proceed?","message":"This action is irreversible.","confirmation":{"id":"123"}},"id":null}
data: [DONE]
`;

		const processor = await SSEProcessor.create(
			accessor,
			1,
			createFakeStreamResponse(response),
			TelemetryWithExp.createEmptyConfigForTesting()
		);

		await asyncIterableToArray(
			processor.processSSE((text: string, delta: RequestDelta) => {
				if (delta.copilotConfirmation) {
					confirmations.push(delta.copilotConfirmation);
				}
				return 0;
			})
		);

		assert.deepStrictEqual(confirmations.length, 1);
		assert.deepStrictEqual(confirmations[0], {
			type: 'action',
			title: 'Are you sure you want to proceed?',
			message: 'This action is irreversible.',
			confirmation: { id: '123' },
		});
	});

	test('n=1 text completion is truncated with finishedCb', async function () {
		const response = `data: {"choices":[{"text":"foo\\n","index":0,"finish_reason":null}]}
data: {"choices":[{"text":"bar","index":0,"finish_reason":"stop"}]}
data: [DONE]
	`;
		const processor = await SSEProcessor.create(
			accessor,
			1,
			createFakeStreamResponse(response),
			TelemetryWithExp.createEmptyConfigForTesting()
		);
		const results = await asyncIterableToArray(processor.processSSE(() => 0));
		assertSimplifiedResultsEqual(results, {
			0: {
				finishReason: null,
				chunks: ['foo\n'],
			},
		});
	});

	test('n=1 delta completion is truncated with finishedCb', async function () {
		const response = `data: {"choices":[{"delta":{"content":"foo\\n"},"index":0,"finish_reason":null}]}
data: {"choices":[{"delta":{"content":"bar"},"index":0,"finish_reason":"stop"}]}
data: [DONE]
	`;
		const processor = await SSEProcessor.create(
			accessor,
			1,
			createFakeStreamResponse(response),
			TelemetryWithExp.createEmptyConfigForTesting()
		);
		const results = await asyncIterableToArray(processor.processSSE(() => 0));
		assertSimplifiedResultsEqual(results, {
			0: {
				finishReason: null,
				chunks: ['foo\n'],
			},
		});
	});

	test('n=2 text completion is truncated with finishedCb', async function () {
		const response = `data: {"choices":[{"text":"foo\\n","index":0,"finish_reason":null}]}
data: {"choices":[{"text":"baz\\n","index":1,"finish_reason":null}]}
data: {"choices":[{"text":"bar","index":0,"finish_reason":"stop"}]}
data: {"choices":[{"text":"quux","index":1,"finish_reason":"stop"}]}
data: [DONE]
	`;
		const processor = await SSEProcessor.create(
			accessor,
			2,
			createFakeStreamResponse(response),
			TelemetryWithExp.createEmptyConfigForTesting()
		);
		const results = await asyncIterableToArray(processor.processSSE(() => 0));
		assertSimplifiedResultsEqual(results, {
			0: {
				finishReason: null,
				chunks: ['foo\n'],
			},
			1: {
				finishReason: null,
				chunks: ['baz\n'],
			},
		});
	});

	test('n=2 delta completion is truncated with finishedCb', async function () {
		const response = `data: {"choices":[{"delta":{"content":"foo\\n"},"index":0,"finish_reason":null}]}
data: {"choices":[{"delta":{"content":"baz\\n"},"index":1,"finish_reason":null}]}
data: {"choices":[{"delta":{"content":"bar"},"index":0,"finish_reason":"stop"}]}
data: {"choices":[{"delta":{"content":"quux"},"index":1,"finish_reason":"stop"}]}
data: [DONE]
	`;
		const processor = await SSEProcessor.create(
			accessor,
			2,
			createFakeStreamResponse(response),
			TelemetryWithExp.createEmptyConfigForTesting()
		);
		const results = await asyncIterableToArray(processor.processSSE(() => 0));
		assertSimplifiedResultsEqual(results, {
			0: {
				finishReason: null,
				chunks: ['foo\n'],
			},
			1: {
				finishReason: null,
				chunks: ['baz\n'],
			},
		});
	});

	test('copilot references', async function () {
		const references: CopilotReference[] = [];
		const response = `data: {"choices":[{"delta":{"content":"[{\\"type\\":\\"github.web-search\\",\\"data\\":{\\"query\\":\\"most recent version of React\\",\\"results\\":[{\\"title\\":\\"React v18.0 Ã¢Â€Â“ React\\",\\"excerpt\\":\\"React v18.0. March 29, 2022 by The React Team. React 18 is now available on npm! In our last post, we shared step-by-step instructions for upgrading your app to React 18. In this post, weÃ¢Â€Â™ll give an overview of whatÃ¢Â€Â™s new in React 18, and what it means for the future. Our latest major version includes out-of-the-box improvements like ...\\",\\"url\\":\\"https://react.dev/blog/2022/03/29/react-v18\\"},{\\"title\\":\\"React Versions Ã¢Â€Â“ React\\",\\"excerpt\\":\\"React Versions. The React docs at react.dev provide documentation for the latest version of React. We aim to keep the docs updated within major versions, and do not publish versions for each minor or patch version. When a new major is released, we archive the docs for the previous version as x.react.dev. See our versioning policy for more info.\\",\\"url\\":\\"https://react.dev/versions\\"},{\\"title\\":\\"React 19 RC Ã¢Â€Â“ React\\",\\"excerpt\\":\\"April 25, 2024 by The React Team. React 19 RC is now available on npm! In our React 19 RC Upgrade Guide, we shared step-by-step instructions for upgrading your app to React 19. In this post, weÃ¢Â€Â™ll give an overview of the new features in React 19, and how you can adopt them. WhatÃ¢Â€Â™s new in React 19. Improvements in React 19.\\",\\"url\\":\\"https://react.dev/blog/2024/04/25/react-19\\"},{\\"title\\":\\"React 18: A Comprehensive Guide to the Latest Features and ... - Medium\\",\\"excerpt\\":\\"Lets explore the most recent version of React, diving into key features, improvements, and best practices to leverage in your projects. Hey fellow developer! Welcome to this comprehensive guide onÃ¢Â€Â¦\\",\\"url\\":\\"https://medium.com/@vyakymenko/react-18-a-comprehensive-guide-to-the-latest-features-and-improvements-82825f209ae7\\"},{\\"title\\":\\"React\\",\\"excerpt\\":\\"React is designed to let you seamlessly combine components written by independent people, teams, and organizations. ... Latest React News. React Conf 2024 Recap. May 22, 2024. React 19 RC. April 25, 2024. React 19 RC Upgrade Guide. April 25, 2024. React Labs: February 2024. February 15, 2024.\\",\\"url\\":\\"https://19.react.dev/\\"}],\\"type\\":\\"web-search\\"},\\"id\\":\\"web-search: most recent version of React\\",\\"metadata\\":{\\"display_name\\":\\"web-search: most recent version of React\\",\\"display_icon\\":\\"\\"}}]","name":"bing-search","role":"function"},"index":0}],"copilot_references":[{"type":"github.web-search","data":{"query":"most recent version of React","results":[{"title":"React v18.0 Ã¢Â€Â“ React","excerpt":"React v18.0. March 29, 2022 by The React Team. React 18 is now available on npm! In our last post, we shared step-by-step instructions for upgrading your app to React 18. In this post, weÃ¢Â€Â™ll give an overview of whatÃ¢Â€Â™s new in React 18, and what it means for the future. Our latest major version includes out-of-the-box improvements like ...","url":"https://react.dev/blog/2022/03/29/react-v18"},{"title":"React Versions Ã¢Â€Â“ React","excerpt":"React Versions. The React docs at react.dev provide documentation for the latest version of React. We aim to keep the docs updated within major versions, and do not publish versions for each minor or patch version. When a new major is released, we archive the docs for the previous version as x.react.dev. See our versioning policy for more info.","url":"https://react.dev/versions"},{"title":"React 19 RC Ã¢Â€Â“ React","excerpt":"April 25, 2024 by The React Team. React 19 RC is now available on npm! In our React 19 RC Upgrade Guide, we shared step-by-step instructions for upgrading your app to React 19. In this post, weÃ¢Â€Â™ll give an overview of the new features in React 19, and how you can adopt them. WhatÃ¢Â€Â™s new in React 19. Improvements in React 19.","url":"https://react.dev/blog/2024/04/25/react-19"},{"title":"React 18: A Comprehensive Guide to the Latest Features and ... - Medium","excerpt":"Lets explore the most recent version of React, diving into key features, improvements, and best practices to leverage in your projects. Hey fellow developer! Welcome to this comprehensive guide onÃ¢Â€Â¦","url":"https://medium.com/@vyakymenko/react-18-a-comprehensive-guide-to-the-latest-features-and-improvements-82825f209ae7"},{"title":"React","excerpt":"React is designed to let you seamlessly combine components written by independent people, teams, and organizations. ... Latest React News. React Conf 2024 Recap. May 22, 2024. React 19 RC. April 25, 2024. React 19 RC Upgrade Guide. April 25, 2024. React Labs: February 2024. February 15, 2024.","url":"https://19.react.dev/"}],"type":"web-search"},"id":"web-search: most recent version of React","metadata":{"display_name":"web-search: most recent version of React","display_icon":""}}],"id":null}
data: [DONE]
`;

		const processor = await SSEProcessor.create(
			accessor,
			1,
			createFakeStreamResponse(response),
			TelemetryWithExp.createEmptyConfigForTesting()
		);

		await asyncIterableToArray(
			processor.processSSE((text: string, delta: RequestDelta) => {
				delta.copilotReferences?.forEach(ref => references.push(ref));
				return 0;
			})
		);

		assert.deepStrictEqual(references.length, 1);
		assert.deepStrictEqual(references[0], {
			type: 'github.web-search',
			data: {
				query: 'most recent version of React',
				results: [
					{
						title: 'React v18.0 Ã¢Â€Â“ React',
						excerpt:
							'React v18.0. March 29, 2022 by The React Team. React 18 is now available on npm! In our last post, we shared step-by-step instructions for upgrading your app to React 18. In this post, weÃ¢Â€Â™ll give an overview of whatÃ¢Â€Â™s new in React 18, and what it means for the future. Our latest major version includes out-of-the-box improvements like ...',
						url: 'https://react.dev/blog/2022/03/29/react-v18',
					},
					{
						title: 'React Versions Ã¢Â€Â“ React',
						excerpt:
							'React Versions. The React docs at react.dev provide documentation for the latest version of React. We aim to keep the docs updated within major versions, and do not publish versions for each minor or patch version. When a new major is released, we archive the docs for the previous version as x.react.dev. See our versioning policy for more info.',
						url: 'https://react.dev/versions',
					},
					{
						title: 'React 19 RC Ã¢Â€Â“ React',
						excerpt:
							'April 25, 2024 by The React Team. React 19 RC is now available on npm! In our React 19 RC Upgrade Guide, we shared step-by-step instructions for upgrading your app to React 19. In this post, weÃ¢Â€Â™ll give an overview of the new features in React 19, and how you can adopt them. WhatÃ¢Â€Â™s new in React 19. Improvements in React 19.',
						url: 'https://react.dev/blog/2024/04/25/react-19',
					},
					{
						title: 'React 18: A Comprehensive Guide to the Latest Features and ... - Medium',
						excerpt:
							'Lets explore the most recent version of React, diving into key features, improvements, and best practices to leverage in your projects. Hey fellow developer! Welcome to this comprehensive guide onÃ¢Â€Â¦',
						url: 'https://medium.com/@vyakymenko/react-18-a-comprehensive-guide-to-the-latest-features-and-improvements-82825f209ae7',
					},
					{
						title: 'React',
						excerpt:
							'React is designed to let you seamlessly combine components written by independent people, teams, and organizations. ... Latest React News. React Conf 2024 Recap. May 22, 2024. React 19 RC. April 25, 2024. React 19 RC Upgrade Guide. April 25, 2024. React Labs: February 2024. February 15, 2024.',
						url: 'https://19.react.dev/',
					},
				],
				type: 'web-search',
			},
			id: 'web-search: most recent version of React',
			metadata: {
				display_name: 'web-search: most recent version of React',
				display_icon: '',
			},
		});
	});
});
