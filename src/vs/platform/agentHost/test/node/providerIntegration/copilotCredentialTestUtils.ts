/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWindows } from '../../../../../base/common/platform.js';

export const credentialEnvironmentSentinels = {
	GH_TOKEN: 'FAKE_SENTINEL_GH_TOKEN',
	GITHUB_TOKEN: 'FAKE_SENTINEL_GITHUB_TOKEN',
	COPILOT_GITHUB_TOKEN: 'FAKE_SENTINEL_COPILOT_GITHUB_TOKEN',
	COPILOT_SDK_AUTH_TOKEN: 'FAKE_SENTINEL_COPILOT_SDK_AUTH_TOKEN',
	OPENAI_API_KEY: 'FAKE_SENTINEL_OPENAI_API_KEY',
} as const;

/** A credential-shaped variable that test extensions request; the runtime withholds it from extensions until the user consents. */
export const extensionEnvironmentSentinels = {
	BLACKBIRD_AUTH_METIS_API_KEY: 'FAKE_SENTINEL_BLACKBIRD_AUTH_METIS_API_KEY',
} as const;

const fakeCredentials = { A: 'scope-a', B: 'scope-b', L: 'legacy-l', AR: 'scope-a-rotated', STUB_CAPI: 'replay-copilot-token' };
const fakeCapiCredentials = { A: 'FAKE_CAPI_A', B: 'FAKE_CAPI_B', L: 'FAKE_CAPI_L', AR: 'FAKE_CAPI_AR' };

/** Unknown values never enter assertion data, logs, or synthetic token responses. */
export function labelTestCredential(value: string | undefined): string {
	if (!value) {
		return 'NONE';
	}
	const token = value.replace(/^(?:Bearer|token) /i, '');
	for (const [label, fake] of Object.entries(fakeCredentials)) {
		if (token === fake) {
			return label;
		}
	}
	for (const [label, fake] of Object.entries(fakeCapiCredentials)) {
		if (token === fake) {
			return `CAPI_${label}`;
		}
	}
	for (const [key, fake] of [...Object.entries(credentialEnvironmentSentinels), ...Object.entries(extensionEnvironmentSentinels)]) {
		if (token === fake) {
			return `ENV_${key}`;
		}
	}
	return 'UNEXPECTED';
}

/**
 * Removes every credential, proxy, and provider variable from this process's environment and sets `sentinels` in their place,
 * so provider processes the product starts cannot inherit the developer's credentials. Returns a function that restores them.
 */
export function replaceCredentialEnvironment(sentinels: Readonly<Record<string, string>>): () => void {
	const originalEnvironment = new Map(Object.entries(process.env).filter(([key]) =>
		/(?:AUTH|TOKEN|_KEY|SECRET|PASSWORD)|^(?:GIT_CONFIG_|COPILOT_|GITHUB_|GH_|ANTHROPIC_|OPENAI_|AZURE_OPENAI_|AWS_|AZURE_|VSCODE_AGENT_HOST_CAPI_)|^(?:HTTPS?_PROXY|ALL_PROXY|NO_PROXY)$/i.test(key)));
	for (const key of new Set([...originalEnvironment.keys(), ...Object.keys(sentinels)])) {
		const hasOriginal = isWindows
			? [...originalEnvironment.keys()].some(original => original.toUpperCase() === key.toUpperCase())
			: originalEnvironment.has(key);
		if (!hasOriginal) {
			originalEnvironment.set(key, undefined);
		}
		delete process.env[key];
	}
	Object.assign(process.env, sentinels);
	return () => {
		for (const key of Object.keys(sentinels)) {
			delete process.env[key];
		}
		for (const [key, value] of originalEnvironment) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	};
}

export function fakeCapiCredentialForLabel(label: string): string | undefined {
	return Object.entries(fakeCapiCredentials).find(([known]) => known === label)?.[1];
}

export function isCredentialEnvironmentKey(key: string): boolean {
	return /(?:AUTH|TOKEN|_KEY|SECRET|PASSWORD)/i.test(key);
}

export function normalizeTestSystemPrompt(prompt: string, workspace: string, home: string): string {
	for (const [path, replacement] of [[workspace, '<workspace>'], [home, '<home>']]) {
		for (const variant of [path, path.replace(/^[A-Z]:/, drive => drive.toLowerCase())]) {
			prompt = prompt
				.replaceAll(JSON.stringify(variant).slice(1, -1), replacement)
				.replaceAll(variant, replacement)
				.replaceAll(variant.replaceAll('\\', '/'), replacement);
		}
	}
	return prompt
		.replace(/\r\n/g, '\n')
		.replace(/[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}/gi, '<id>')
		.replace(/\n{2,}/g, '\n').trim();
}
