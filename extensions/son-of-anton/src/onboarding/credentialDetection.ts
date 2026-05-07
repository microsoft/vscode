/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import type { CredentialBroker } from '../auth/CredentialBroker';

// SecretStorage keys used by the wizard. Co-located here so the persistence
// surface (broker tokens, settings, API-key secrets) stays discoverable from
// one file. Wizard-saved API keys live in SecretStorage under these keys; the
// LlmClient still reads from `vscode.workspace.getConfiguration('sota')`,
// so saving an API key writes to BOTH locations: SecretStorage (canonical)
// and the existing setting (so LlmClient sees it without further changes).
export const SECRET_KEYS = {
	anthropic: 'sota.secrets.anthropicApiKey',
	openai: 'sota.secrets.openaiApiKey',
	foundry: 'sota.secrets.foundryApiKey',
	bedrockAccessKeyId: 'sota.secrets.bedrockAccessKeyId',
	bedrockSecretAccessKey: 'sota.secrets.bedrockSecretAccessKey',
	bedrockSessionToken: 'sota.secrets.bedrockSessionToken',
	google: 'sota.secrets.googleApiKey',
} as const;

export interface CredentialState {
	anthropic: { hasApiKey: boolean; hasOAuth: boolean };
	openai: { hasApiKey: boolean; hasOAuth: boolean };
	foundry: { hasApiKey: boolean; hasEndpoint: boolean };
	bedrock: { hasAccessKey: boolean; hasProfile: boolean };
	google: { hasApiKey: boolean };
}

/**
 * Probe every provider's known credential surface and return a snapshot of
 * what is configured. The check is intentionally permissive — we treat any
 * non-empty string in any of the recognised locations as "configured" and
 * leave actual validity to the smoke-test step in the wizard.
 *
 * Locations searched per provider:
 *   - SecretStorage (wizard-managed)
 *   - Settings (`sota.*`)
 *   - Environment variables (the same fallbacks LlmClient honours)
 *   - CredentialBroker OAuth tokens (Anthropic / OpenAI only)
 */
export async function detectCredentials(
	secrets: vscode.SecretStorage,
	config: vscode.WorkspaceConfiguration,
	broker: CredentialBroker,
): Promise<CredentialState> {
	const env = process.env;

	const [
		anthropicSecret,
		openaiSecret,
		foundrySecret,
		bedrockAccessSecret,
		googleSecret,
	] = await Promise.all([
		secrets.get(SECRET_KEYS.anthropic),
		secrets.get(SECRET_KEYS.openai),
		secrets.get(SECRET_KEYS.foundry),
		secrets.get(SECRET_KEYS.bedrockAccessKeyId),
		secrets.get(SECRET_KEYS.google),
	]);

	const oauthStatus = await safeStatus(broker);
	const oauthConnected = (id: string): boolean =>
		oauthStatus.some(p => p.id === id && p.connected);

	const anthropicHasKey = nonEmpty(anthropicSecret)
		|| nonEmpty(config.get<string>('apiKey'))
		|| nonEmpty(env.ANTHROPIC_API_KEY);

	const openaiHasKey = nonEmpty(openaiSecret)
		|| nonEmpty(config.get<string>('openaiApiKey'))
		|| nonEmpty(env.OPENAI_API_KEY);

	const foundryHasKey = nonEmpty(foundrySecret)
		|| nonEmpty(config.get<string>('foundryApiKey'))
		|| nonEmpty(env.AZURE_OPENAI_API_KEY)
		|| nonEmpty(env.FOUNDRY_API_KEY);

	const foundryHasEndpoint = nonEmpty(config.get<string>('foundryEndpoint'));

	const bedrockHasAccessKey = nonEmpty(bedrockAccessSecret)
		|| nonEmpty(config.get<string>('bedrockAccessKeyId'))
		|| nonEmpty(env.AWS_ACCESS_KEY_ID);
	const bedrockHasProfile = nonEmpty(config.get<string>('bedrockProfile'))
		|| nonEmpty(env.AWS_PROFILE);

	const googleHasKey = nonEmpty(googleSecret)
		|| nonEmpty(config.get<string>('googleApiKey'))
		|| nonEmpty(env.GOOGLE_API_KEY)
		|| nonEmpty(env.GEMINI_API_KEY);

	return {
		anthropic: { hasApiKey: anthropicHasKey, hasOAuth: oauthConnected('anthropic-oauth') },
		openai: { hasApiKey: openaiHasKey, hasOAuth: oauthConnected('chatgpt-oauth') },
		foundry: { hasApiKey: foundryHasKey, hasEndpoint: foundryHasEndpoint },
		bedrock: { hasAccessKey: bedrockHasAccessKey, hasProfile: bedrockHasProfile },
		google: { hasApiKey: googleHasKey },
	};
}

export function hasAnyProvider(state: CredentialState): boolean {
	return state.anthropic.hasApiKey
		|| state.anthropic.hasOAuth
		|| state.openai.hasApiKey
		|| state.openai.hasOAuth
		|| state.foundry.hasApiKey
		|| state.bedrock.hasAccessKey
		|| state.bedrock.hasProfile
		|| state.google.hasApiKey;
}

function nonEmpty(value: string | undefined): boolean {
	return typeof value === 'string' && value.trim().length > 0;
}

async function safeStatus(broker: CredentialBroker): Promise<ReadonlyArray<{ id: string; connected: boolean }>> {
	try {
		return await broker.status();
	} catch {
		return [];
	}
}
