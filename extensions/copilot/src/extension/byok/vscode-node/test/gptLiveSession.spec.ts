/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import { Event } from '../../../../util/vs/base/common/event';
import { mock } from '../../../../util/common/test/simpleMock';
import { FetchOptions, IFetcherService, Response } from '../../../../platform/networking/common/fetcherService';
import { createFakeResponse } from '../../../../platform/test/node/fetcher';
import { createGptLiveSession, isGptLiveModelAvailable } from '../gptLiveSession';
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
						delegation: { type: 'client' },
					},
					transport: {
						type: 'webrtc',
						sdp: 'offer-sdp\r\n',
					},
				},
			},
		});
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
