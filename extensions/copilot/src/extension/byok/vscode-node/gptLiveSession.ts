/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { l10n } from 'vscode';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';

const GPT_LIVE_SESSIONS_URL = 'https://api.openai.com/v1/live/sessions';
const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';

export const GPT_LIVE_SESSION_PROVIDER_ID = 'github.copilot.gptLive';
export const GPT_LIVE_MODEL_ID = 'gpt-live-1';

export interface GptLiveSession {
	readonly sessionId: string;
	readonly sdp: string;
}

export type GptLiveSessionResult =
	| { readonly status: 'unavailable' }
	| { readonly status: 'available' }
	| { readonly status: 'ready'; readonly session: GptLiveSession };

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

export async function isGptLiveModelAvailable(fetcherService: IFetcherService, apiKey: string): Promise<boolean> {
	const response = await fetcherService.fetch(OPENAI_MODELS_URL, {
		callSite: 'openai-gpt-live-model-availability',
		method: 'GET',
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
		expectJSON: true,
	});
	if (!response.ok) {
		return false;
	}

	const result = await response.json() as OpenAIModelsResponse;
	if (!Array.isArray(result.data)) {
		throw new Error(l10n.t('OpenAI returned an invalid model list while checking GPT-Live availability.'));
	}
	return result.data.some(model => model.id === GPT_LIVE_MODEL_ID);
}

export async function createGptLiveSession(fetcherService: IFetcherService, apiKey: string, sdp: string): Promise<GptLiveSession> {
	const offer = sdp.trim();
	if (!offer) {
		throw new Error(l10n.t('An SDP offer is required to create a GPT-Live session.'));
	}

	const response = await fetcherService.fetch(GPT_LIVE_SESSIONS_URL, {
		callSite: 'openai-gpt-live-session',
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
		json: {
			session: {
				model: GPT_LIVE_MODEL_ID,
				instructions: 'You are the voice interface for a coding agent. Be concise. Delegate coding tasks to the client and clearly communicate its progress and results.',
				delegation: {
					type: 'client',
				},
			},
			transport: {
				type: 'webrtc',
				sdp: offer,
			},
		},
		expectJSON: true,
	});

	if (!response.ok) {
		throw new Error(l10n.t('OpenAI GPT-Live session creation failed with status {0}.', response.status));
	}

	const result = await response.json() as GptLiveSessionResponse;
	const sessionId = result.session?.id;
	const answer = result.transport?.sdp;
	if (typeof sessionId !== 'string' || !sessionId || result.transport?.type !== 'webrtc' || typeof answer !== 'string' || !answer) {
		throw new Error(l10n.t('OpenAI GPT-Live returned an invalid session response.'));
	}

	return { sessionId, sdp: answer };
}
