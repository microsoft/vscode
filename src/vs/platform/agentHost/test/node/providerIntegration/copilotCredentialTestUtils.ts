/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const credentialEnvironmentSentinels = {
	GH_TOKEN: 'FAKE_SENTINEL_GH_TOKEN',
	GITHUB_TOKEN: 'FAKE_SENTINEL_GITHUB_TOKEN',
	COPILOT_GITHUB_TOKEN: 'FAKE_SENTINEL_COPILOT_GITHUB_TOKEN',
	COPILOT_SDK_AUTH_TOKEN: 'FAKE_SENTINEL_COPILOT_SDK_AUTH_TOKEN',
	OPENAI_API_KEY: 'FAKE_SENTINEL_OPENAI_API_KEY',
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
	for (const [key, fake] of Object.entries(credentialEnvironmentSentinels)) {
		if (token === fake) {
			return `ENV_${key}`;
		}
	}
	return 'UNEXPECTED';
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
