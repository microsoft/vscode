/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { CredentialBroker } from '../auth/CredentialBroker';
import type { ConfigStore, SecretStore } from '../host';

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
	openRouter: 'sota.secrets.openRouterApiKey',
	lmstudio: 'sota.secrets.lmstudioApiKey',
	deepSeek: 'sota.secrets.deepSeekApiKey',
	mistral: 'sota.secrets.mistralApiKey',
	groq: 'sota.secrets.groqApiKey',
	cerebras: 'sota.secrets.cerebrasApiKey',
	together: 'sota.secrets.togetherApiKey',
	fireworks: 'sota.secrets.fireworksApiKey',
} as const;

export interface CredentialState {
	anthropic: { hasApiKey: boolean; hasOAuth: boolean };
	openai: { hasApiKey: boolean; hasOAuth: boolean };
	foundry: { hasApiKey: boolean; hasEndpoint: boolean };
	bedrock: { hasAccessKey: boolean; hasProfile: boolean };
	google: { hasApiKey: boolean };
	openrouter: { hasApiKey: boolean };
	ollama: { hasBaseUrl: boolean };
	lmstudio: { hasBaseUrl: boolean };
	deepseek: { hasApiKey: boolean };
	mistral: { hasApiKey: boolean };
	groq: { hasApiKey: boolean };
	cerebras: { hasApiKey: boolean };
	together: { hasApiKey: boolean };
	fireworks: { hasApiKey: boolean };
	codex: { hasCli: boolean };
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
	secrets: SecretStore,
	config: ConfigStore,
	broker: CredentialBroker,
): Promise<CredentialState> {
	const env = process.env;

	const [
		anthropicSecret,
		openaiSecret,
		foundrySecret,
		bedrockAccessSecret,
		googleSecret,
		openRouterSecret,
		lmstudioSecret,
		deepSeekSecret,
		mistralSecret,
		groqSecret,
		cerebrasSecret,
		togetherSecret,
		fireworksSecret,
	] = await Promise.all([
		secrets.get(SECRET_KEYS.anthropic),
		secrets.get(SECRET_KEYS.openai),
		secrets.get(SECRET_KEYS.foundry),
		secrets.get(SECRET_KEYS.bedrockAccessKeyId),
		secrets.get(SECRET_KEYS.google),
		secrets.get(SECRET_KEYS.openRouter),
		secrets.get(SECRET_KEYS.lmstudio),
		secrets.get(SECRET_KEYS.deepSeek),
		secrets.get(SECRET_KEYS.mistral),
		secrets.get(SECRET_KEYS.groq),
		secrets.get(SECRET_KEYS.cerebras),
		secrets.get(SECRET_KEYS.together),
		secrets.get(SECRET_KEYS.fireworks),
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

	const openRouterHasKey = nonEmpty(openRouterSecret)
		|| nonEmpty(config.get<string>('openRouterApiKey'))
		|| nonEmpty(env.OPENROUTER_API_KEY);

	// Local-server providers don't carry a "key" — having the base URL set
	// (or the daemon being installed at the default port) is the proxy for
	// "configured". We cheat slightly here and report `hasBaseUrl: true`
	// when the user has explicitly stored a URL or when they've completed
	// the saver flow (which always writes the default URL into settings).
	const ollamaHasBaseUrl = nonEmpty(config.get<string>('ollamaBaseUrl'));
	const lmstudioHasBaseUrl = nonEmpty(config.get<string>('lmstudioBaseUrl'))
		|| nonEmpty(lmstudioSecret);

	const deepSeekHasKey = nonEmpty(deepSeekSecret)
		|| nonEmpty(config.get<string>('deepSeekApiKey'))
		|| nonEmpty(env.DEEPSEEK_API_KEY);
	const mistralHasKey = nonEmpty(mistralSecret)
		|| nonEmpty(config.get<string>('mistralApiKey'))
		|| nonEmpty(env.MISTRAL_API_KEY);
	const groqHasKey = nonEmpty(groqSecret)
		|| nonEmpty(config.get<string>('groqApiKey'))
		|| nonEmpty(env.GROQ_API_KEY);
	const cerebrasHasKey = nonEmpty(cerebrasSecret)
		|| nonEmpty(config.get<string>('cerebrasApiKey'))
		|| nonEmpty(env.CEREBRAS_API_KEY);
	const togetherHasKey = nonEmpty(togetherSecret)
		|| nonEmpty(config.get<string>('togetherApiKey'))
		|| nonEmpty(env.TOGETHER_API_KEY);
	const fireworksHasKey = nonEmpty(fireworksSecret)
		|| nonEmpty(config.get<string>('fireworksApiKey'))
		|| nonEmpty(env.FIREWORKS_API_KEY);

	// Codex CLI — `codex` binary on PATH is the proxy for "configured".
	let codexHasCli = false;
	try {
		const { isCodexAvailable } = await import('../llm/codexRunner.js');
		codexHasCli = isCodexAvailable();
	} catch {
		codexHasCli = false;
	}

	return {
		anthropic: { hasApiKey: anthropicHasKey, hasOAuth: oauthConnected('anthropic-oauth') },
		openai: { hasApiKey: openaiHasKey, hasOAuth: oauthConnected('chatgpt-oauth') },
		foundry: { hasApiKey: foundryHasKey, hasEndpoint: foundryHasEndpoint },
		bedrock: { hasAccessKey: bedrockHasAccessKey, hasProfile: bedrockHasProfile },
		google: { hasApiKey: googleHasKey },
		openrouter: { hasApiKey: openRouterHasKey },
		ollama: { hasBaseUrl: ollamaHasBaseUrl },
		lmstudio: { hasBaseUrl: lmstudioHasBaseUrl },
		deepseek: { hasApiKey: deepSeekHasKey },
		mistral: { hasApiKey: mistralHasKey },
		groq: { hasApiKey: groqHasKey },
		cerebras: { hasApiKey: cerebrasHasKey },
		together: { hasApiKey: togetherHasKey },
		fireworks: { hasApiKey: fireworksHasKey },
		codex: { hasCli: codexHasCli },
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
		|| state.google.hasApiKey
		|| state.openrouter.hasApiKey
		|| state.ollama.hasBaseUrl
		|| state.lmstudio.hasBaseUrl
		|| state.deepseek.hasApiKey
		|| state.mistral.hasApiKey
		|| state.groq.hasApiKey
		|| state.cerebras.hasApiKey
		|| state.together.hasApiKey
		|| state.fireworks.hasApiKey
		|| state.codex.hasCli;
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
