/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';

const VOICE_PATH = '/realtime/voice';
const TRANSCRIPTION_PATH = '/realtime/transcription';

export function getVoiceWebSocketUrl(configurationService: IConfigurationService, productService: IProductService): string {
	const configured = configurationService.getValue<string>('agents.voice.backendUrl');
	const url = typeof configured === 'string' ? configured.trim() : '';
	return url || productService.voiceWsUrl || '';
}

export function getTranscriptionWebSocketUrl(configurationService: IConfigurationService, productService: IProductService): string {
	const configured = configurationService.getValue<string>('agents.voice.backendUrl')?.trim();
	const voiceUrl = configured && isLoopbackWebSocketUrl(configured) ? configured : productService.voiceWsUrl;
	if (!voiceUrl) {
		return '';
	}

	try {
		const url = new URL(voiceUrl);
		if (url.protocol !== 'wss:' && !isLoopbackUrl(url)) {
			return '';
		}
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

function isLoopbackWebSocketUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return (url.protocol === 'ws:' || url.protocol === 'wss:') && isLoopbackUrl(url);
	} catch {
		return false;
	}
}

function isLoopbackUrl(url: URL): boolean {
	return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
}

export function addWebSocketAuthToken(url: string, token: string): string {
	const authenticatedUrl = new URL(url);
	authenticatedUrl.searchParams.set('token', token);
	return authenticatedUrl.toString();
}
