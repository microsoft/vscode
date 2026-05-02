// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import { describe, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { collectChunks, wrapStreamingTool, type StreamingToolExtra } from '../src/streaming/streamingTool';
import type { StreamingToolHandler, ToolResultChunk } from '../src/streaming/types';

interface NotificationCall {
	method: string;
	params: {
		progressToken: string | number;
		progress: number;
		total?: number;
		message?: string;
	};
}

function makeExtra(signal?: AbortSignal): {
	extra: StreamingToolExtra;
	notifications: NotificationCall[];
} {
	const notifications: NotificationCall[] = [];
	const ctrl = new AbortController();
	const extra: StreamingToolExtra = {
		signal: signal ?? ctrl.signal,
		requestId: 'req-test-1',
		sendNotification: mock.fn(async (n: NotificationCall) => {
			notifications.push(n);
		}),
	};
	return { extra, notifications };
}

describe('wrapStreamingTool', () => {
	test('translates progress, partial, and done chunks into the expected MCP response', async () => {
		const handler: StreamingToolHandler<{ q: string }> = async function* () {
			yield { kind: 'progress', message: 'Starting' };
			yield { kind: 'partial', items: [{ id: 1 }, { id: 2 }] };
			yield { kind: 'progress', message: 'Halfway' };
			yield { kind: 'partial', items: [{ id: 3 }] };
			yield { kind: 'done', summary: { total: 3 } };
		};

		const { extra, notifications } = makeExtra();
		const wrapped = wrapStreamingTool('test_tool', handler);
		const result = await wrapped({ q: 'hi' }, extra);

		const payload = JSON.parse(result.content[0].text) as {
			items: Array<{ id: number }>;
			summary: { total: number };
		};

		assert.deepStrictEqual(
			{
				items: payload.items,
				summary: payload.summary,
				progressMessages: notifications.map(n => n.params.message),
				progressCounts: notifications.map(n => n.params.progress),
				notificationMethod: notifications[0]?.method,
			},
			{
				items: [{ id: 1 }, { id: 2 }, { id: 3 }],
				summary: { total: 3 },
				progressMessages: ['Starting', 'Halfway'],
				progressCounts: [1, 2],
				notificationMethod: 'notifications/progress',
			},
		);
	});

	test('omits summary from the response when no done chunk supplies one', async () => {
		const handler: StreamingToolHandler<undefined> = async function* () {
			yield { kind: 'partial', items: ['a', 'b'] };
			yield { kind: 'done' };
		};

		const { extra } = makeExtra();
		const result = await wrapStreamingTool('t', handler)(undefined, extra);
		const payload = JSON.parse(result.content[0].text) as Record<string, unknown>;

		assert.strictEqual('summary' in payload, false);
		assert.deepStrictEqual(payload['items'], ['a', 'b']);
	});

	test('returns an error response when the generator throws', async () => {
		const handler: StreamingToolHandler<undefined> = async function* () {
			yield { kind: 'progress', message: 'about to fail' };
			throw new Error('boom');
		};

		const { extra } = makeExtra();
		const result = await wrapStreamingTool('failing_tool', handler)(undefined, extra);

		const payload = JSON.parse(result.content[0].text) as Record<string, unknown>;
		assert.deepStrictEqual(
			{
				isError: result.isError,
				error: payload['error'],
				tool: payload['tool'],
				message: payload['message'],
				cancelled: payload['cancelled'],
			},
			{
				isError: true,
				error: true,
				tool: 'failing_tool',
				message: 'failing_tool failed: boom',
				cancelled: false,
			},
		);
	});

	test('returns a cancelled error response when the AbortSignal fires mid-stream', async () => {
		const ctrl = new AbortController();
		const handler: StreamingToolHandler<undefined> = async function* (_args, _signal) {
			yield { kind: 'partial', items: [1] };
			ctrl.abort();
			yield { kind: 'partial', items: [2] };
		};

		const { extra } = makeExtra(ctrl.signal);
		const result = await wrapStreamingTool('long_tool', handler)(undefined, extra);
		const payload = JSON.parse(result.content[0].text) as Record<string, unknown>;

		assert.deepStrictEqual(
			{ cancelled: payload['cancelled'], isError: result.isError, message: payload['message'] },
			{ cancelled: true, isError: true, message: 'long_tool cancelled' },
		);
	});

	test('progress notifications include total=100 when percent is supplied', async () => {
		const handler: StreamingToolHandler<undefined> = async function* () {
			yield { kind: 'progress', message: 'Working', percent: 50 };
			yield { kind: 'done' };
		};

		const { extra, notifications } = makeExtra();
		await wrapStreamingTool('t', handler)(undefined, extra);
		assert.strictEqual(notifications[0].params.total, 100);
	});

	test('flushes nothing when the generator yields zero chunks', async () => {
		const handler: StreamingToolHandler<undefined> = async function* () {
			// no-op
		};
		const { extra, notifications } = makeExtra();
		const result = await wrapStreamingTool('t', handler)(undefined, extra);
		const payload = JSON.parse(result.content[0].text) as Record<string, unknown>;
		assert.deepStrictEqual({ items: payload['items'], notifications: notifications.length }, { items: [], notifications: 0 });
	});
});

describe('collectChunks', () => {
	test('buffers a generator into an array of chunks for testing', async () => {
		const handler: StreamingToolHandler<undefined> = async function* () {
			yield { kind: 'progress', message: 'a' };
			yield { kind: 'partial', items: [1] };
			yield { kind: 'done', summary: { ok: true } };
		};
		const chunks: ToolResultChunk[] = await collectChunks(handler, undefined);
		assert.deepStrictEqual(
			chunks,
			[
				{ kind: 'progress', message: 'a' },
				{ kind: 'partial', items: [1] },
				{ kind: 'done', summary: { ok: true } },
			] as ToolResultChunk[],
		);
	});
});
