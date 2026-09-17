/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { AgentsVoiceSettingId } from '../../../agentsVoice/common/agentsVoice.js';

const VOICE_PATH = '/realtime/voice';
const TRANSCRIPTION_PATH = '/realtime/transcription';
const GPT_LIVE_VOICE_WS_URL = 'wss://gpt-live-caas.mai.microsoft.com/voice-code/api/v1/realtime/voice';

function isGptLiveEnabled(configurationService: IConfigurationService | undefined): boolean {
	return configurationService?.getValue<boolean>(AgentsVoiceSettingId.GptLiveEnabled) === true;
}

function getGptLiveApiKey(configurationService: IConfigurationService | undefined): string | undefined {
	if (!configurationService) {
		return undefined;
	}
	const configured = configurationService.getValue<string>(AgentsVoiceSettingId.GptLiveApiKey);
	const key = typeof configured === 'string' ? configured.trim() : '';
	return key || undefined;
}

function getHostedVoiceWebSocketUrl(configurationService: IConfigurationService, productService: IProductService): string {
	if (isGptLiveEnabled(configurationService)) {
		const configured = configurationService.getValue<string>(AgentsVoiceSettingId.GptLiveBackendUrl);
		const configuredUrl = typeof configured === 'string' ? configured.trim() : '';
		return configuredUrl || GPT_LIVE_VOICE_WS_URL;
	}
	return productService.voiceWsUrl || '';
}

export function getVoiceWebSocketUrl(configurationService: IConfigurationService, productService: IProductService): string {
	const configured = configurationService.getValue<string>('agents.voice.backendUrl');
	const configuredUrl = typeof configured === 'string' ? configured.trim() : '';
	return configuredUrl || getHostedVoiceWebSocketUrl(configurationService, productService);
}

export function getTranscriptionWebSocketUrl(configurationService: IConfigurationService, productService: IProductService): string {
	const configured = configurationService.getValue<string>('agents.voice.backendUrl');
	const configuredUrl = typeof configured === 'string' ? configured.trim() : '';
	const voiceUrl = configuredUrl && isLoopbackWebSocketUrl(configuredUrl)
		? configuredUrl
		: getHostedVoiceWebSocketUrl(configurationService, productService);
	if (!voiceUrl) {
		return '';
	}

	try {
		const url = new URL(voiceUrl);
		const path = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
		if (!path.endsWith(VOICE_PATH)) {
			return '';
		}
		url.pathname = `${path.slice(0, -VOICE_PATH.length)}${TRANSCRIPTION_PATH}`;
		return url.toString();
	} catch {
		return '';
	}
}

export function addWebSocketAuthToken(url: string, token: string): string {
	const authenticatedUrl = new URL(url);
	authenticatedUrl.searchParams.set('token', token);
	return authenticatedUrl.toString();
}

export function getVoiceBackendAuthToken(configurationService: IConfigurationService | undefined, fallbackToken: string | undefined, endpointUrl?: string): string | undefined {
	if (!isGptLiveEnabled(configurationService) || !shouldUseGptLiveCredential(configurationService, endpointUrl)) {
		return fallbackToken;
	}
	return getGptLiveApiKey(configurationService);
}

function shouldUseGptLiveCredential(configurationService: IConfigurationService, endpointUrl: string | undefined): boolean {
	if (!endpointUrl) {
		return false;
	}
	const configuredVoiceOverride = configurationService.getValue<string>('agents.voice.backendUrl');
	const configuredVoiceOverrideUrl = typeof configuredVoiceOverride === 'string' ? configuredVoiceOverride.trim() : '';
	return configuredVoiceOverrideUrl.length === 0;
}

function isLoopbackWebSocketUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return (url.protocol === 'ws:' || url.protocol === 'wss:') && isLoopbackHost(url.hostname);
	} catch {
		return false;
	}
}

function isLoopbackHost(hostname: string): boolean {
	return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}
