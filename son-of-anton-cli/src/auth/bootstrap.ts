/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SECRET_KEYS } from 'son-of-anton-core/dist/credentials/credentialDetection';
import type { CoreHost } from 'son-of-anton-core/dist/host';

/**
 * Mapping of supported environment variables to the secret-store keys the
 * core LlmClient reads. Multiple env vars may target the same secret key
 * (Foundry honours both AZURE_OPENAI_API_KEY and FOUNDRY_API_KEY; Google
 * honours both GOOGLE_API_KEY and GEMINI_API_KEY).
 */
const ENV_TO_SECRET: ReadonlyArray<{ env: string; key: string }> = [
	{ env: 'ANTHROPIC_API_KEY', key: SECRET_KEYS.anthropic },
	{ env: 'OPENAI_API_KEY', key: SECRET_KEYS.openai },
	{ env: 'AZURE_OPENAI_API_KEY', key: SECRET_KEYS.foundry },
	{ env: 'FOUNDRY_API_KEY', key: SECRET_KEYS.foundry },
	{ env: 'AWS_ACCESS_KEY_ID', key: SECRET_KEYS.bedrockAccessKeyId },
	{ env: 'AWS_SECRET_ACCESS_KEY', key: SECRET_KEYS.bedrockSecretAccessKey },
	{ env: 'AWS_SESSION_TOKEN', key: SECRET_KEYS.bedrockSessionToken },
	{ env: 'GOOGLE_API_KEY', key: SECRET_KEYS.google },
	{ env: 'GEMINI_API_KEY', key: SECRET_KEYS.google },
];

/**
 * Friendly error message used when no provider credential is available. The
 * caller prints it to stderr and exits non-zero so wrapper scripts can
 * detect a misconfigured environment.
 */
const NO_PROVIDER_MESSAGE =
	'no API key configured. Set ANTHROPIC_API_KEY (or OPENAI_API_KEY, FOUNDRY_API_KEY, '
	+ 'AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY, GOOGLE_API_KEY) and re-run.';

/**
 * Mirror supported environment variables into the file-backed SecretStore so
 * the rest of the core stack picks them up via its standard secret-resolution
 * pathway. Returns `{ ok: false, message }` when no provider credential is
 * present, which the caller surfaces as a friendly CLI error.
 *
 * Env-var-only by design: full `detectCredentials` requires a `CredentialBroker`
 * (OAuth status), which is intentionally out of scope for the CLI v1.
 */
export async function bootstrapCredentials(host: CoreHost): Promise<{ ok: boolean; message?: string }> {
	let mirrored = 0;
	for (const { env, key } of ENV_TO_SECRET) {
		const value = process.env[env];
		if (value && value.trim()) {
			await host.secrets.store(key, value.trim());
			mirrored++;
		}
	}
	if (mirrored === 0) {
		return { ok: false, message: NO_PROVIDER_MESSAGE };
	}
	return { ok: true };
}
