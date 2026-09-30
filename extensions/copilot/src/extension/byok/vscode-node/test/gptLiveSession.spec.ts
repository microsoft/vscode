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

class TestFetcherService extends mock<IFetcherService>() {
	override readonly onDidFetch = Event.None;
	override readonly onDidCompleteFetch = Event.None;
	override readonly fetch = vi.fn<(url: string, options: FetchOptions) => Promise<Response>>();
}

describe('isGptLiveModelAvailable', () => {
	it('detects GPT-Live access without exposing the API key', async () => {
		const fetcher = new TestFetcherService();
		fetcher.fetch.mockResolvedValue(createFakeResponse(200, {
			data: [{ id: 'gpt-4.1' }, { id: 'gpt-live-1' }],
		}));

		const available = await isGptLiveModelAvailable(fetcher, 'secret-key');

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

		await expect(isGptLiveModelAvailable(fetcher, 'secret-key')).resolves.toBe(false);
	});
});

describe('createGptLiveSession', () => {
	it('creates a client-delegation GPT-Live session without returning the API key', async () => {
		const fetcher = new TestFetcherService();
		fetcher.fetch.mockResolvedValue(createFakeResponse(201, {
			session: { id: 'live_123' },
			transport: { type: 'webrtc', sdp: 'answer-sdp' },
		}));

		const result = await createGptLiveSession(fetcher, 'secret-key', ' offer-sdp ');

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
						model: 'gpt-live-1',
						delegation: { type: 'client' },
					},
					transport: {
						type: 'webrtc',
						sdp: 'offer-sdp',
					},
				},
			},
		});
		expect(JSON.stringify(result)).not.toContain('secret-key');
	});

	it('rejects an empty SDP offer before making a request', async () => {
		const fetcher = new TestFetcherService();

		await expect(createGptLiveSession(fetcher, 'secret-key', '  ')).rejects.toThrow('An SDP offer is required');
		expect(fetcher.fetch).not.toHaveBeenCalled();
	});

	it('surfaces OpenAI failures without including the API key', async () => {
		const fetcher = new TestFetcherService();
		fetcher.fetch.mockResolvedValue(createFakeResponse(401, {}));

		let error: Error | undefined;
		try {
			await createGptLiveSession(fetcher, 'secret-key', 'offer-sdp');
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

		await expect(createGptLiveSession(fetcher, 'secret-key', 'offer-sdp')).rejects.toThrow('invalid session response');
	});
});
