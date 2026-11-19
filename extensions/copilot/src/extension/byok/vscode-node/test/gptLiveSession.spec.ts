/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import { Event } from '../../../../util/vs/base/common/event';
import { mock } from '../../../../util/common/test/simpleMock';
import { FetchOptions, IFetcherService, Response } from '../../../../platform/networking/common/fetcherService';
import { createFakeResponse } from '../../../../platform/test/node/fetcher';
import { createGptLiveSession, GptLiveModelAvailability, isGptLiveModelAvailable } from '../gptLiveSession';
import { CancellationToken, CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';

class TestFetcherService extends mock<IFetcherService>() {
	override readonly onDidFetch = Event.None;
	override readonly onDidCompleteFetch = Event.None;
	override readonly fetch = vi.fn<(url: string, options: FetchOptions) => Promise<Response>>();
	override makeAbortController(): AbortController { return new AbortController(); }
}

describe('isGptLiveModelAvailable', () => {
	it('detects GPT-Live access without exposing the API key', async () => {
		const fetcher = new TestFetcherService();
		fetcher.fetch.mockResolvedValue(createFakeResponse(200, {
			data: [{ id: 'gpt-4.1' }, { id: 'configured-live-model' }],
		}));

		const available = await isGptLiveModelAvailable(fetcher, 'secret-key', 'configured-live-model', CancellationToken.None);

		expect({
			available,
			url: fetcher.fetch.mock.calls[0][0],
			options: fetcher.fetch.mock.calls[0][1],
		}).toMatchObject({
			available: true,
			url: 'https://api.openai.com/v1/models',
			options: {
				callSite: 'openai-gpt-live-model-availability',
				method: 'GET',
			},
		});
	});

	it('reports unavailable when the key cannot access GPT-Live', async () => {
		const fetcher = new TestFetcherService();
		fetcher.fetch.mockResolvedValue(createFakeResponse(200, {
			data: [{ id: 'gpt-4.1' }],
		}));

		await expect(isGptLiveModelAvailable(fetcher, 'secret-key', 'gpt-live-1', CancellationToken.None)).resolves.toBe(false);
	});

	it.each([401, 429, 503])('surfaces status %s without exposing credentials or response content', async status => {
		const fetcher = new TestFetcherService();
		const response = createFakeResponse(status, {
			error: { message: 'Request rejected for secret-key' },
		});
		const readBody = vi.spyOn(response, 'json');
		fetcher.fetch.mockResolvedValue(response);

		let error: Error | undefined;
		try {
			await isGptLiveModelAvailable(fetcher, 'secret-key', 'gpt-live-1', CancellationToken.None);
		} catch (caught) {
			error = caught instanceof Error ? caught : new Error(String(caught));
		}

		expect({
			message: error?.message,
			containsKey: error?.message.includes('secret-key'),
			readBody: readBody.mock.calls.length,
		}).toEqual({
			message: `OpenAI GPT-Live model availability check failed with status ${status}.`,
			containsKey: false,
			readBody: 0,
		});
	});

	it('does not issue an availability request after cancellation', async () => {
		const fetcher = new TestFetcherService();
		const source = new CancellationTokenSource();
		try {
			source.cancel();
			await expect(isGptLiveModelAvailable(fetcher, 'secret-key', 'gpt-live-1', source.token)).rejects.toThrow('Canceled');
			expect(fetcher.fetch).not.toHaveBeenCalled();
		} finally {
			source.dispose();
		}
	});
});

describe('GptLiveModelAvailability', () => {
	it('caches successful checks for one minute, scoped to the current key and model', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		try {
			const fetcher = new TestFetcherService();
			fetcher.fetch.mockImplementation(async () => createFakeResponse(200, { data: [{ id: 'live-a' }, { id: 'live-b' }] }));
			const availability = new GptLiveModelAvailability(fetcher);
			const counts: number[] = [];
			for (const [key, model] of [['first-key', 'live-a'], ['first-key', 'live-a'], ['second-key', 'live-a'], ['second-key', 'live-b']]) {
				await availability.isAvailable(key, model, CancellationToken.None);
				counts.push(fetcher.fetch.mock.calls.length);
			}
			vi.advanceTimersByTime(60_000);
			await availability.isAvailable('second-key', 'live-b', CancellationToken.None);
			counts.push(fetcher.fetch.mock.calls.length);
			expect(counts).toEqual([1, 1, 2, 3, 4]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('does not cache unavailable models or failures', async () => {
		const fetcher = new TestFetcherService();
		fetcher.fetch
			.mockResolvedValueOnce(createFakeResponse(200, { data: [] }))
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValueOnce(createFakeResponse(200, { data: [{ id: 'live' }] }));
		const availability = new GptLiveModelAvailability(fetcher);
		const unavailable = await availability.isAvailable('key', 'live', CancellationToken.None);
		await expect(availability.isAvailable('key', 'live', CancellationToken.None)).rejects.toThrow('offline');
		const available = await availability.isAvailable('key', 'live', CancellationToken.None);
		expect({ unavailable, available, requests: fetcher.fetch.mock.calls.length }).toEqual({ unavailable: false, available: true, requests: 3 });
	});

	it('honors cancellation even on a cache hit', async () => {
		const fetcher = new TestFetcherService();
		fetcher.fetch.mockResolvedValue(createFakeResponse(200, { data: [{ id: 'live' }] }));
		const availability = new GptLiveModelAvailability(fetcher);
		await availability.isAvailable('key', 'live', CancellationToken.None);
		const source = new CancellationTokenSource();
		try {
			source.cancel();
			await expect(availability.isAvailable('key', 'live', source.token)).rejects.toThrow('Canceled');
			expect(fetcher.fetch).toHaveBeenCalledTimes(1);
		} finally {
			source.dispose();
		}
	});
});

describe('createGptLiveSession', () => {
	it('creates a client-delegation GPT-Live session without returning the API key or trimming the SDP terminator', async () => {
		const fetcher = new TestFetcherService();
		fetcher.fetch.mockResolvedValue(createFakeResponse(201, {
			session: { id: 'live_123' },
			transport: { type: 'webrtc', sdp: 'answer-sdp' },
		}));

		const result = await createGptLiveSession(fetcher, 'secret-key', 'configured-live-model', 'offer-sdp\r\n', CancellationToken.None);

		expect({
			result,
			url: fetcher.fetch.mock.calls[0][0],
			options: fetcher.fetch.mock.calls[0][1],
		}).toMatchObject({
			result: {
				sessionId: 'live_123',
				sdp: 'answer-sdp',
			},
			url: 'https://api.openai.com/v1/live/sessions',
			options: {
				callSite: 'openai-gpt-live-session',
				method: 'POST',
				headers: {
					Authorization: 'Bearer secret-key',
				},
				json: {
					session: {
						model: 'configured-live-model',
						instructions: expect.stringContaining('Generate <|SpawnThinking|> before acknowledging any request that needs backend work.'),
						delegation: { type: 'client' },
					},
					transport: {
						type: 'webrtc',
						sdp: 'offer-sdp\r\n',
					},
				},
			},
		});
		for (const instruction of [
			'Backend tools: The client starts coding sessions, creates or edits files, runs commands, answers coding questions, handles session awareness and navigation, and applies replies to pending questions or approvals.',
			'new-session input when no session exists',
			'Wait for the client result before saying the request was accepted or an action succeeded.',
			'Do not generate <|SpawnThinking|> when:',
		]) {
			expect(fetcher.fetch.mock.calls[0][1].json).toMatchObject({ session: { instructions: expect.stringContaining(instruction) } });
		}
		expect(JSON.stringify(result)).not.toContain('secret-key');
	});

	it('rejects an empty SDP offer before making a request', async () => {
		const fetcher = new TestFetcherService();

		await expect(createGptLiveSession(fetcher, 'secret-key', 'gpt-live-1', '  ', CancellationToken.None)).rejects.toThrow('An SDP offer is required');
		expect(fetcher.fetch).not.toHaveBeenCalled();
	});

	it('surfaces OpenAI failures without including the API key', async () => {
		const fetcher = new TestFetcherService();
		fetcher.fetch.mockResolvedValue(createFakeResponse(401, {}));

		let error: Error | undefined;
		try {
			await createGptLiveSession(fetcher, 'secret-key', 'gpt-live-1', 'offer-sdp', CancellationToken.None);
		} catch (caught) {
			error = caught instanceof Error ? caught : new Error(String(caught));
		}

		expect({
			message: error?.message,
			containsKey: error?.message.includes('secret-key'),
		}).toEqual({
			message: 'OpenAI GPT-Live session creation failed with status 401.',
			containsKey: false,
		});
	});

	it('rejects malformed session responses', async () => {
		const fetcher = new TestFetcherService();
		fetcher.fetch.mockResolvedValue(createFakeResponse(201, {
			session: { id: 'live_123' },
			transport: { type: 'webrtc' },
		}));

		await expect(createGptLiveSession(fetcher, 'secret-key', 'gpt-live-1', 'offer-sdp', CancellationToken.None)).rejects.toThrow('invalid session response');
	});

	it('does not issue a billable session request after cancellation', async () => {
		const fetcher = new TestFetcherService();
		const source = new CancellationTokenSource();
		try {
			source.cancel();
			await expect(createGptLiveSession(fetcher, 'secret-key', 'gpt-live-1', 'offer-sdp', source.token)).rejects.toThrow('Canceled');
			expect(fetcher.fetch).not.toHaveBeenCalled();
		} finally {
			source.dispose();
		}
	});

	it('aborts an in-flight session request when cancelled', async () => {
		const fetcher = new TestFetcherService();
		const source = new CancellationTokenSource();
		fetcher.fetch.mockImplementation(async (_url, options) => {
			source.cancel();
			expect(options.signal?.aborted).toBe(true);
			throw new Error('aborted');
		});
		try {
			await expect(createGptLiveSession(fetcher, 'secret-key', 'gpt-live-1', 'offer-sdp', source.token)).rejects.toThrow('aborted');
		} finally {
			source.dispose();
		}
	});

	it('keeps cancellation wired while consuming the session response body', async () => {
		const fetcher = new TestFetcherService();
		const source = new CancellationTokenSource();
		const response = createFakeResponse(201, {});
		fetcher.fetch.mockResolvedValue(response);
		vi.spyOn(response, 'json').mockImplementation(async () => {
			source.cancel();
			expect(fetcher.fetch.mock.calls[0][1].signal?.aborted).toBe(true);
			throw new Error('body aborted');
		});
		try {
			await expect(createGptLiveSession(fetcher, 'secret-key', 'gpt-live-1', 'offer-sdp', source.token)).rejects.toThrow('body aborted');
		} finally {
			source.dispose();
		}
	});
});
