/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OpenAiCompatibleClient, OpenAiCompatibleOptions } from './openAiCompatibleClient';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export interface OpenRouterOptions extends Omit<OpenAiCompatibleOptions, 'baseUrl' | 'extraHeaders'> {
	/** Shown on openrouter.ai rankings/analytics (`X-Title`). */
	readonly appName?: string;
	/** Identifies the app (`HTTP-Referer`). */
	readonly appUrl?: string;
}

export function createOpenRouterClient(options: OpenRouterOptions): OpenAiCompatibleClient {
	const { appName, appUrl, ...rest } = options;
	return new OpenAiCompatibleClient({
		...rest,
		baseUrl: OPENROUTER_BASE_URL,
		extraHeaders: {
			...appName ? { 'X-Title': appName } : {},
			...appUrl ? { 'HTTP-Referer': appUrl } : {},
		},
	});
}

/**
 * Reads `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` from an environment map (the host passes the real environment).
 * Returns undefined when either is missing — the model is configuration, never a code default.
 */
export function openRouterOptionsFromEnv(env: Readonly<Record<string, string | undefined>>): { apiKey: string; model: string } | undefined {
	const apiKey = env.OPENROUTER_API_KEY?.trim();
	const model = env.OPENROUTER_MODEL?.trim();
	return apiKey && model ? { apiKey, model } : undefined;
}
