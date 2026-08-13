/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readFileSync } from 'fs';
import { join } from '../../../../base/common/path.js';

/** Resolve the same config directory as Codex without requiring its binary. */
function resolveCodexHome(userHome: string, env: NodeJS.ProcessEnv, codexHome: string | undefined): string {
	return codexHome || env.CODEX_HOME || join(userHome, '.codex');
}

function readJson(path: string): unknown {
	try {
		return JSON.parse(readFileSync(path, 'utf8'));
	} catch {
		return undefined;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

function hasChatGPTTokens(value: unknown): boolean {
	return isRecord(value) && (isNonEmptyString(value.access_token) || isNonEmptyString(value.refresh_token));
}

/**
 * Detect an existing persisted ChatGPT identity without starting or downloading
 * Codex. This mirrors Codex's `AuthDotJson::resolved_mode` classification for
 * the modes that `account/read` exposes as a ChatGPT account. API keys,
 * Bedrock, headers, and Agent Identity deliberately do not count.
 *
 * Token expiry is not checked here: managed ChatGPT auth commonly has an
 * expired access token alongside a refresh token, and app-server remains the
 * authority that refreshes and validates it before the first request.
 */
export function detectExistingCodexChatGPTSetup(userHome: string, env: NodeJS.ProcessEnv = process.env, codexHome?: string): boolean {
	const auth = readJson(join(resolveCodexHome(userHome, env, codexHome), 'auth.json'));
	if (!isRecord(auth)) {
		return false;
	}

	const authMode = auth.auth_mode;
	if (authMode === 'personalAccessToken') {
		return isNonEmptyString(auth.personal_access_token);
	}
	if (authMode === 'chatgpt' || authMode === 'chatgptAuthTokens') {
		return hasChatGPTTokens(auth.tokens);
	}
	if (authMode !== undefined) {
		return false;
	}

	// Legacy Codex auth files predate `auth_mode`: PAT wins first, then
	// `OPENAI_API_KEY`, and otherwise token material means managed ChatGPT auth.
	if (isNonEmptyString(auth.personal_access_token)) {
		return true;
	}
	if (isNonEmptyString(auth.OPENAI_API_KEY) || auth.bedrock_api_key !== undefined || auth.agent_identity !== undefined) {
		return false;
	}
	return hasChatGPTTokens(auth.tokens);
}
