/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { LlmClient, ModelId } from '../llm/LlmClient';
import type { ConfigStore, SecretStore, Thenable } from '../host';
import { SECRET_KEYS } from './credentialDetection';

/**
 * Hard ceiling on validation latency. The probe is a 1-token round-trip; any
 * remote endpoint that hasn't acknowledged within this window is functionally
 * unreachable. Capping the wait keeps the chat empty-state spinner from
 * hanging indefinitely on a misconfigured endpoint and lets the UI surface a
 * "saved but unverified" state instead.
 */
const VALIDATION_TIMEOUT_MS = 15_000;

/**
 * Foundry / Azure OpenAI model ids that share a single deployment name.
 *
 * Most users provision ONE Azure OpenAI resource with ONE deployment and
 * select the underlying model via the chat picker. By seeding every Foundry
 * model id with the user-entered deployment we let the picker work
 * end-to-end without the user editing `sota.foundryDeployments` by hand.
 *
 * Listed exhaustively here (rather than derived from `ModelId`) so that the
 * authoritative provider list lives in one place at the credential layer —
 * the type alias intentionally tolerates new entries without forcing this
 * file to be touched, but every shipped Foundry model id should be present.
 */
const FOUNDRY_MODEL_IDS: ReadonlyArray<ModelId> = [
	'foundry-gpt-4',
	'foundry-gpt-4o',
	'foundry-gpt-4o-mini',
	'foundry-gpt-4-1',
	'foundry-gpt-4-1-mini',
	'foundry-gpt-4-1-nano',
	'foundry-gpt-5',
	'foundry-gpt-5-mini',
	'foundry-gpt-5-nano',
	'foundry-o1',
	'foundry-o1-mini',
	'foundry-o3',
	'foundry-o3-mini',
	'foundry-o4-mini',
	'foundry-claude-sonnet',
	'foundry-mistral-large',
	'foundry-llama-3-70b',
	'foundry-phi-4',
	'foundry-custom',
];

/**
 * Provider identifiers handled by the shared credential saver. The chat
 * empty-state surface and the standalone setup wizard both write through
 * this module so the persistence rules stay in lock-step regardless of
 * which surface initiated the save.
 */
export type ProviderId =
	| 'anthropic'
	| 'openai'
	| 'foundry'
	| 'bedrock'
	| 'google'
	| 'openrouter'
	| 'ollama'
	| 'lmstudio'
	| 'deepseek'
	| 'mistral'
	| 'groq'
	| 'cerebras'
	| 'together'
	| 'fireworks';

/**
 * Outcome of an end-to-end save+validate run. `deferred` is reserved for
 * provider modes (Bedrock with an AWS profile, Foundry without an immediate
 * probe target) where the credential resolution chain runs at request time
 * and there's nothing meaningful to ping right now.
 */
export interface ProviderSaveResult {
	readonly ok: boolean;
	readonly message: string;
	readonly deferred?: boolean;
}

/**
 * Writable config surface used by the credential saver. The extension wraps
 * `vscode.workspace.getConfiguration('sota')` plus `ConfigurationTarget.Global`;
 * the CLI implementation writes into the JSON config file directly.
 */
export type WritableConfigStore = ConfigStore & {
	update(key: string, value: unknown): Thenable<void> | Promise<void>;
};

export interface ProviderSaveDeps {
	readonly llmClient: LlmClient;
	readonly secrets: SecretStore;
	readonly config: WritableConfigStore;
}

/**
 * Persist credentials for the given provider into the canonical secret store
 * AND mirror them into the matching `sota.*` settings so `LlmClient`'s
 * existing readers see the value without per-call storage probes.
 *
 * Throws an Error with a user-readable message when required fields are
 * missing — callers should surface it inline rather than swallowing it.
 */
export async function persistProviderCredentials(
	provider: ProviderId,
	fields: Record<string, string>,
	deps: ProviderSaveDeps,
): Promise<void> {
	const { secrets, config } = deps;
	const trimmed = (key: string): string => (typeof fields[key] === 'string' ? fields[key].trim() : '');

	// Phase 3 — advanced fields the per-provider form may post alongside the
	// canonical credentials. Persisted as plain settings (not secrets) since
	// none of these are sensitive on their own. Empty strings clear the
	// override; unrecognised values are silently dropped by `LlmClient` at
	// request time.
	const optAdvanced = (key: string): string => trimmed(key);

	switch (provider) {
		case 'anthropic': {
			const key = trimmed('apiKey');
			if (!key) { throw new Error('API key is required.'); }
			await secrets.store(SECRET_KEYS.anthropic, key);
			// Mirror to settings so LlmClient's existing readers see the value
			// without needing changes — the secret store is the canonical
			// location and the setting is the read-through cache.
			await config.update('apiKey', key);
			await config.update('anthropicBaseUrl', optAdvanced('baseUrl'));
			await config.update('anthropicCustomHeaders', optAdvanced('customHeaders'));
			return;
		}
		case 'openai': {
			const key = trimmed('apiKey');
			if (!key) { throw new Error('API key is required.'); }
			await secrets.store(SECRET_KEYS.openai, key);
			await config.update('openaiApiKey', key);
			await config.update('openaiBaseUrl', optAdvanced('baseUrl'));
			await config.update('openaiOrgId', optAdvanced('orgId'));
			await config.update('openaiCustomHeaders', optAdvanced('customHeaders'));
			return;
		}
		case 'foundry': {
			const key = trimmed('apiKey');
			const endpoint = trimmed('endpoint');
			const deployment = trimmed('deployment');
			const apiVersion = trimmed('apiVersion');
			// Optional name when the user is adding a SECONDARY deployment via
			// the multi-deployment management UI. The default profile uses the
			// reserved id "default" so the picker can show
			// `Foundry · default` alongside named deployments.
			const profileName = trimmed('profileName') || 'default';
			if (!endpoint) { throw new Error('Endpoint is required.'); }
			if (!key) { throw new Error('API key is required.'); }
			if (!deployment) { throw new Error('Deployment name is required.'); }
			await secrets.store(SECRET_KEYS.foundry, key);
			await config.update('foundryApiKey', key);
			await config.update('foundryEndpoint', endpoint);
			if (apiVersion) {
				await config.update('foundryApiVersion', apiVersion);
			}
			const existing = (config.get<string>('foundryDeployments') ?? '{}').trim() || '{}';
			let parsed: Record<string, string> = {};
			try {
				const candidate = JSON.parse(existing);
				if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
					parsed = candidate as Record<string, string>;
				}
			} catch {
				parsed = {};
			}
			// Seed every Foundry model id with the user-entered deployment so
			// that picking any Foundry model in the chat composer works
			// against the same Azure resource. Existing entries (e.g. a user
			// who manually configured per-model deployments) are preserved.
			for (const modelId of FOUNDRY_MODEL_IDS) {
				if (!parsed[modelId]) {
					parsed[modelId] = deployment;
				}
			}
			await config.update('foundryDeployments', JSON.stringify(parsed));
			// Multi-deployment profile map (Phase C). Co-exists with the
			// legacy `foundryDeployments` map so existing setups keep working.
			await mergeProfileEntry(config, 'foundryProfiles', profileName, {
				endpoint,
				deployment,
				...(apiVersion ? { apiVersion } : {}),
			});
			await config.update('foundryCustomHeaders', optAdvanced('customHeaders'));
			return;
		}
		case 'bedrock': {
			const region = trimmed('region') || 'us-east-1';
			const profile = trimmed('profile');
			const accessKeyId = trimmed('accessKeyId');
			const secretAccessKey = trimmed('secretAccessKey');
			const sessionToken = trimmed('sessionToken');
			const profileName = trimmed('profileName') || 'default';
			await config.update('bedrockRegion', region);
			// Phase 3 — endpoint override applies to both profile-based and
			// static-key flows; persist before the early return below.
			await config.update('bedrockEndpointUrl', optAdvanced('endpointUrl'));
			if (profile) {
				// Profile takes precedence in LlmClient's resolution order, so
				// clear the static-credential settings to avoid ambiguity for
				// users who later inspect their settings.json.
				await config.update('bedrockProfile', profile);
				await config.update('bedrockAccessKeyId', '');
				await config.update('bedrockSecretAccessKey', '');
				await config.update('bedrockSessionToken', '');
				await mergeProfileEntry(config, 'bedrockProfiles', profileName, { region, profile });
				return;
			}
			if (!accessKeyId || !secretAccessKey) {
				throw new Error('Either an AWS profile or both Access Key ID and Secret Access Key are required.');
			}
			await secrets.store(SECRET_KEYS.bedrockAccessKeyId, accessKeyId);
			await secrets.store(SECRET_KEYS.bedrockSecretAccessKey, secretAccessKey);
			await config.update('bedrockAccessKeyId', accessKeyId);
			await config.update('bedrockSecretAccessKey', secretAccessKey);
			if (sessionToken) {
				await secrets.store(SECRET_KEYS.bedrockSessionToken, sessionToken);
				await config.update('bedrockSessionToken', sessionToken);
			}
			await config.update('bedrockProfile', '');
			// Persist the named profile entry. Static keys are stored ONLY in
			// the secret store; the profile entry just records the region so
			// the picker UI can surface it without leaking credentials.
			await mergeProfileEntry(config, 'bedrockProfiles', profileName, { region });
			return;
		}
		case 'google': {
			const key = trimmed('apiKey');
			const project = trimmed('project');
			const profileName = trimmed('profileName') || 'default';
			if (!key) { throw new Error('API key is required.'); }
			await secrets.store(SECRET_KEYS.google, key);
			await config.update('googleApiKey', key);
			await mergeProfileEntry(config, 'googleProfiles', profileName, {
				apiKey: key,
				...(project ? { project } : {}),
			});
			await config.update('geminiProjectId', optAdvanced('projectId'));
			await config.update('geminiLocation', optAdvanced('location'));
			return;
		}
		case 'openrouter': {
			const key = trimmed('apiKey');
			if (!key) { throw new Error('API key is required.'); }
			await secrets.store(SECRET_KEYS.openRouter, key);
			await config.update('openRouterApiKey', key);
			await config.update('openRouterCustomHeaders', optAdvanced('customHeaders'));
			return;
		}
		case 'ollama': {
			// Local-server provider — no secret to persist. The base URL is
			// the only "credential" and defaults to the standard local port
			// when the user leaves it blank.
			const baseUrl = trimmed('baseUrl') || 'http://localhost:11434';
			await config.update('ollamaBaseUrl', baseUrl);
			await config.update('ollamaCustomHeaders', optAdvanced('customHeaders'));
			return;
		}
		case 'lmstudio': {
			// LM Studio — optional API key for the rare shared-server
			// scenario. Most local installs leave the key blank.
			const key = trimmed('apiKey');
			const baseUrl = trimmed('baseUrl') || 'http://localhost:1234';
			if (key) {
				await secrets.store(SECRET_KEYS.lmstudio, key);
				await config.update('lmstudioApiKey', key);
			} else {
				await config.update('lmstudioApiKey', '');
			}
			await config.update('lmstudioBaseUrl', baseUrl);
			await config.update('lmstudioCustomHeaders', optAdvanced('customHeaders'));
			return;
		}
		case 'deepseek': {
			const key = trimmed('apiKey');
			if (!key) { throw new Error('API key is required.'); }
			await secrets.store(SECRET_KEYS.deepSeek, key);
			await config.update('deepSeekApiKey', key);
			await config.update('deepSeekCustomHeaders', optAdvanced('customHeaders'));
			return;
		}
		case 'mistral': {
			const key = trimmed('apiKey');
			if (!key) { throw new Error('API key is required.'); }
			await secrets.store(SECRET_KEYS.mistral, key);
			await config.update('mistralApiKey', key);
			await config.update('mistralCustomHeaders', optAdvanced('customHeaders'));
			return;
		}
		case 'groq': {
			const key = trimmed('apiKey');
			if (!key) { throw new Error('API key is required.'); }
			await secrets.store(SECRET_KEYS.groq, key);
			await config.update('groqApiKey', key);
			await config.update('groqCustomHeaders', optAdvanced('customHeaders'));
			return;
		}
		case 'cerebras': {
			const key = trimmed('apiKey');
			if (!key) { throw new Error('API key is required.'); }
			await secrets.store(SECRET_KEYS.cerebras, key);
			await config.update('cerebrasApiKey', key);
			await config.update('cerebrasCustomHeaders', optAdvanced('customHeaders'));
			return;
		}
		case 'together': {
			const key = trimmed('apiKey');
			if (!key) { throw new Error('API key is required.'); }
			await secrets.store(SECRET_KEYS.together, key);
			await config.update('togetherApiKey', key);
			const customModel = trimmed('customModel');
			if (customModel) {
				await config.update('togetherCustomModel', customModel);
			}
			await config.update('togetherCustomHeaders', optAdvanced('customHeaders'));
			return;
		}
		case 'fireworks': {
			const key = trimmed('apiKey');
			if (!key) { throw new Error('API key is required.'); }
			await secrets.store(SECRET_KEYS.fireworks, key);
			await config.update('fireworksApiKey', key);
			const customModel = trimmed('customModel');
			if (customModel) {
				await config.update('fireworksCustomModel', customModel);
			}
			await config.update('fireworksCustomHeaders', optAdvanced('customHeaders'));
			return;
		}
	}
}

/**
 * Run a 1-token smoke request through the LlmClient using the cheapest
 * model in the provider's roster. A successful token / completion event
 * proves both the credentials and the endpoint, so we can safely tell the
 * user "Connected" without any further probing.
 */
export async function validateProviderCredentials(
	provider: ProviderId,
	fields: Record<string, string>,
	deps: ProviderSaveDeps,
): Promise<ProviderSaveResult> {
	// Bedrock with a profile resolves credentials at request time via the AWS
	// SDK chain. Probing it here would either hit the configured profile (and
	// charge the user a token) or fail with a confusing error if the profile
	// is mid-rotation. Prefer to defer.
	if (provider === 'bedrock' && (fields['profile'] ?? '').trim().length > 0) {
		return { ok: true, message: 'Saved. AWS profile credentials will be validated on the first request.', deferred: true };
	}

	// Local-server providers — Ollama and LM Studio expose endpoint-listing
	// routes (`/api/tags` and `/v1/models` respectively) that are far cheaper
	// to probe than a chat completion. They return 200 + a JSON list when
	// the server is up, regardless of whether any model is currently loaded.
	if (provider === 'ollama') {
		const baseUrl = (fields['baseUrl'] ?? '').trim().replace(/\/+$/, '') || 'http://localhost:11434';
		return probeLocalServer(`${baseUrl}/api/tags`, 'Ollama', 'ollama serve');
	}
	if (provider === 'lmstudio') {
		const baseUrl = (fields['baseUrl'] ?? '').trim().replace(/\/+$/, '') || 'http://localhost:1234';
		const apiKey = (fields['apiKey'] ?? '').trim();
		return probeLocalServer(`${baseUrl}/v1/models`, 'LM Studio', 'the LM Studio app\'s "Local Server" tab', apiKey);
	}

	const model = modelForProvider(provider);
	// AbortController lets us tear down the in-flight stream when the timeout
	// fires; without it the underlying fetch would keep running until the
	// network gave up, leaking a request and (more importantly) a token spend.
	const controller = new AbortController();
	const probe = (async (): Promise<ProviderSaveResult> => {
		try {
			const stream = deps.llmClient.streamRequest({
				model,
				messages: [{ role: 'user', content: 'Reply with: ok' }],
				maxTokens: 5,
				systemPrompt: 'You are a connectivity probe. Reply with the single word ok.',
				signal: controller.signal,
			});
			for await (const event of stream) {
				if (event.type === 'token') {
					return { ok: true, message: 'Credentials verified.' };
				}
				if (event.type === 'complete') {
					// Some providers emit a single completion event without an
					// intermediate token (e.g. when output is empty). A successful
					// completion still proves the credentials and endpoint work.
					return { ok: true, message: 'Credentials verified.' };
				}
				if (event.type === 'error') {
					return { ok: false, message: event.error };
				}
			}
			return { ok: false, message: 'Validation request returned no events.' };
		} catch (err) {
			const detail = err instanceof Error ? err.message : String(err);
			return { ok: false, message: detail };
		}
	})();

	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<ProviderSaveResult>(resolve => {
		timer = setTimeout(() => {
			controller.abort();
			resolve({
				ok: true,
				deferred: true,
				message: `Validation timed out after ${Math.round(VALIDATION_TIMEOUT_MS / 1000)}s. Credentials saved; you can retry validation later.`,
			});
		}, VALIDATION_TIMEOUT_MS);
	});

	try {
		return await Promise.race([probe, timeout]);
	} finally {
		if (timer) {
			clearTimeout(timer);
		}
	}
}

/**
 * One-shot helper that persists then validates. Used by the chat empty-state
 * and the setup wizard so the order of operations (write THEN probe) stays
 * consistent — the probe relies on `LlmClient` reading the settings we just
 * wrote, so flipping the order would always fail-open the validation.
 */
export async function saveProviderCredentials(
	provider: ProviderId,
	fields: Record<string, string>,
	deps: ProviderSaveDeps,
): Promise<ProviderSaveResult> {
	try {
		await persistProviderCredentials(provider, fields, deps);
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		return { ok: false, message: detail };
	}
	try {
		return await validateProviderCredentials(provider, fields, deps);
	} catch (err) {
		// validateProviderCredentials owns its own try/catch internally, but a
		// belt-and-braces guard here ensures the spinner UI always receives a
		// terminal result even if a future refactor accidentally bubbles an
		// exception out of the probe path.
		const detail = err instanceof Error ? err.message : String(err);
		return {
			ok: true,
			deferred: true,
			message: `Saved. Validation failed unexpectedly (${detail}); will validate on first request.`,
		};
	}
}

/**
 * Merge a named profile entry into a JSON-encoded `<settingKey>` map. Used by
 * Phase C's multi-deployment management UI for Foundry, Bedrock, and Google,
 * which all maintain their own per-name profile dictionaries alongside the
 * legacy single-credential settings. Survives the existing-but-corrupt JSON
 * case by quietly resetting to an empty object — the user can always re-add
 * the profile via the UI rather than fight with malformed JSON.
 */
async function mergeProfileEntry(
	config: WritableConfigStore,
	settingKey: 'foundryProfiles' | 'bedrockProfiles' | 'googleProfiles',
	profileName: string,
	entry: Record<string, string>,
): Promise<void> {
	const existing = (config.get<string>(settingKey) ?? '{}').trim() || '{}';
	let parsed: Record<string, Record<string, string>> = {};
	try {
		const candidate = JSON.parse(existing);
		if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
			parsed = candidate as Record<string, Record<string, string>>;
		}
	} catch {
		parsed = {};
	}
	parsed[profileName] = entry;
	await config.update(settingKey, JSON.stringify(parsed));
}

/**
 * Delete a named profile entry from a JSON-encoded `<settingKey>` map. Used by
 * the multi-deployment management UI's Delete affordance. Silent no-op when
 * the entry is missing or the JSON is corrupt.
 */
export async function deleteProfileEntry(
	config: WritableConfigStore,
	settingKey: 'foundryProfiles' | 'bedrockProfiles' | 'googleProfiles',
	profileName: string,
): Promise<void> {
	const existing = (config.get<string>(settingKey) ?? '{}').trim() || '{}';
	let parsed: Record<string, Record<string, string>> = {};
	try {
		const candidate = JSON.parse(existing);
		if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
			parsed = candidate as Record<string, Record<string, string>>;
		}
	} catch {
		return;
	}
	if (!(profileName in parsed)) {
		return;
	}
	delete parsed[profileName];
	await config.update(settingKey, JSON.stringify(parsed));
}

function modelForProvider(provider: ProviderId): ModelId {
	switch (provider) {
		case 'anthropic': return 'haiku';
		case 'openai': return 'gpt-4o-mini';
		case 'foundry': return 'foundry-gpt-4o-mini';
		case 'bedrock': return 'bedrock-claude-haiku';
		case 'google': return 'gemini-1-5-flash';
		case 'openrouter': return 'openrouter-claude-sonnet-4-7';
		case 'ollama': return 'ollama-llama-3-1';
		case 'lmstudio': return 'lmstudio-loaded';
		case 'deepseek': return 'deepseek-v3';
		case 'mistral': return 'mistral-small';
		case 'groq': return 'groq-llama-3-1-8b';
		case 'cerebras': return 'cerebras-llama-3-1-8b';
		case 'together': return 'together-qwen-2-5-coder';
		case 'fireworks': return 'fireworks-qwen-2-5-coder';
	}
}

/**
 * Probe a local-server provider's listing endpoint. Returns ok when the
 * server responds 200; surfaces an actionable hint when the server is
 * unreachable so the user knows to start the daemon.
 */
async function probeLocalServer(
	url: string,
	label: string,
	startHint: string,
	apiKey?: string,
): Promise<ProviderSaveResult> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);
	try {
		const headers: Record<string, string> = { Accept: 'application/json' };
		if (apiKey) {
			headers['Authorization'] = `Bearer ${apiKey}`;
		}
		const response = await fetch(url, { method: 'GET', headers, signal: controller.signal });
		if (response.ok) {
			return { ok: true, message: `${label} server reachable.` };
		}
		if (response.status === 401 || response.status === 403) {
			return { ok: false, message: `${label} rejected the request (HTTP ${response.status}). Check the API key.` };
		}
		return { ok: false, message: `${label} returned HTTP ${response.status}.` };
	} catch (err) {
		if (controller.signal.aborted) {
			return { ok: true, deferred: true, message: `Validation timed out after ${Math.round(VALIDATION_TIMEOUT_MS / 1000)}s. Saved; will validate on first request.` };
		}
		const detail = err instanceof Error ? err.message : String(err);
		const lower = detail.toLowerCase();
		if (lower.includes('econnrefused') || lower.includes('fetch failed') || lower.includes('enotfound')) {
			return { ok: false, message: `Cannot reach ${label} at ${url}. Is the server running? Start it via ${startHint}.` };
		}
		return { ok: false, message: `${label} probe failed: ${detail}` };
	} finally {
		clearTimeout(timer);
	}
}
