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
	if (typeof configured === 'string' && isLoopbackWebSocketUrl(configured.trim())) {
		return configured.trim();
	}
	return productService.voiceWsUrl || '';
}

export function getTranscriptionWebSocketUrl(configurationService: IConfigurationService, productService: IProductService): string {
	const voiceUrl = getVoiceWebSocketUrl(configurationService, productService);
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
