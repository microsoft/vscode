/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, l10n } from 'vscode';
import { FetchOptions, IFetcherService, Response } from '../../../platform/networking/common/fetcherService';
import { CancellationError } from '../../../util/vs/base/common/errors';

const GPT_LIVE_SESSIONS_URL = 'https://api.openai.com/v1/live/sessions';
const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';

export const GPT_LIVE_SESSION_PROVIDER_ID = 'github.copilot.gptLive';
export const USE_BYOK_VOICE_MODEL_SETTING = 'agents.voice.useBYOKVoiceModel';

export interface GptLiveSession {
	readonly sessionId: string;
	readonly sdp: string;
}

export interface GptLiveSessionResult {
	readonly available: boolean;
	readonly session?: GptLiveSession;
}

interface GptLiveSessionResponse {
	readonly session?: {
		readonly id?: unknown;
	};
	readonly transport?: {
		readonly type?: unknown;
		readonly sdp?: unknown;
	};
}

interface OpenAIModelsResponse {
	readonly data?: readonly {
		readonly id?: unknown;
	}[];
}

interface OpenAIErrorResponse {
	readonly error?: {
		readonly message?: unknown;
	};
}

async function fetchGptLive<T>(fetcherService: IFetcherService, url: string, options: FetchOptions, token: CancellationToken, consume: (response: Response) => Promise<T>): Promise<T> {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
	const controller = fetcherService.makeAbortController();
	const listener = token.onCancellationRequested(() => controller.abort());
	try {
		const response = await fetcherService.fetch(url, { ...options, signal: controller.signal });
		return await consume(response);
	} finally {
		listener.dispose();
	}
}

export async function isGptLiveModelAvailable(fetcherService: IFetcherService, apiKey: string, modelId: string, token: CancellationToken): Promise<boolean> {
	return fetchGptLive(fetcherService, OPENAI_MODELS_URL, {
		callSite: 'openai-gpt-live-model-availability',
		method: 'GET',
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
		expectJSON: true,
	}, token, async response => {
		if (!response.ok) {
			return false;
		}

		const result = await response.json() as OpenAIModelsResponse;
		if (!Array.isArray(result?.data)) {
			throw new Error(l10n.t('OpenAI returned an invalid model list while checking GPT-Live availability.'));
		}
		return result.data.some(model => model?.id === modelId);
	});
}

export async function createGptLiveSession(fetcherService: IFetcherService, apiKey: string, modelId: string, sdp: string, token: CancellationToken): Promise<GptLiveSession> {
	if (!sdp.trim()) {
		throw new Error(l10n.t('An SDP offer is required to create a GPT-Live session.'));
	}

	return fetchGptLive(fetcherService, GPT_LIVE_SESSIONS_URL, {
		callSite: 'openai-gpt-live-session',
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
		json: {
			session: {
				model: modelId,
				instructions: 'You are the voice interface for a coding agent. Be concise. Delegate coding tasks to the client and clearly communicate its progress and results.',
				delegation: {
					type: 'client',
				},
			},
			transport: {
				type: 'webrtc',
				sdp,
			},
		},
		expectJSON: true,
	}, token, async response => {

		if (!response.ok) {
			const result = await response.json().catch(() => undefined) as OpenAIErrorResponse | undefined;
			const message = result?.error?.message;
			throw new Error(typeof message === 'string' && message
				? l10n.t('OpenAI GPT-Live session creation failed with status {0}: {1}', response.status, message)
				: l10n.t('OpenAI GPT-Live session creation failed with status {0}.', response.status));
		}

		const result = await response.json() as GptLiveSessionResponse;
		const sessionId = result?.session?.id;
		const answer = result?.transport?.sdp;
		if (typeof sessionId !== 'string' || !sessionId || result.transport?.type !== 'webrtc' || typeof answer !== 'string' || !answer) {
			throw new Error(l10n.t('OpenAI GPT-Live returned an invalid session response.'));
		}

		return { sessionId, sdp: answer };
	});
}
