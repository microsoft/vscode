/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const SECRET_PATTERNS: readonly RegExp[] = [
	/sk-or-v1-[A-Za-z0-9]{16,}/g,       // OpenRouter
	/sk-ant-[A-Za-z0-9_-]{16,}/g,       // Anthropic
	/sk-[A-Za-z0-9_-]{20,}/g,           // OpenAI-style
	/(Bearer\s+)[A-Za-z0-9._~+/-]{16,}=*/g,
];

/** Removes known secrets and anything that looks like an API key from text bound for logs. */
export function redactSecrets(text: string, secrets: readonly string[] = []): string {
	let out = text;
	for (const secret of secrets) {
		if (secret.length >= 8) {
			out = out.split(secret).join('***');
		}
	}
	for (const pattern of SECRET_PATTERNS) {
		out = out.replace(pattern, (_match, bearer?: string) => typeof bearer === 'string' ? `${bearer}***` : '***');
	}
	return out;
}
