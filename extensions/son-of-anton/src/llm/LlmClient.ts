/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import { fromIni, fromNodeProviderChain } from '@aws-sdk/credential-providers';
import type { AwsCredentialIdentity, AwsCredentialIdentityProvider } from '@smithy/types';

// Model id naming scheme:
//   - Bare names (e.g. 'opus', 'gpt-4o') are routed to their native provider
//     (Anthropic, OpenAI).
//   - The 'foundry-' prefix routes a model id to Microsoft Foundry / Azure
//     OpenAI. The suffix is purely a human-readable hint about the underlying
//     model family — actual deployment names are configured separately via
//     `sota.foundryDeployments` because Foundry decouples deployment names
//     from model identifiers.
//   - The 'bedrock-' prefix routes a model id to Amazon Bedrock. Like Foundry,
//     the suffix is a human-readable hint; the actual Bedrock invocation id
//     (e.g. `anthropic.claude-3-5-sonnet-20241022-v2:0`) is resolved at
//     request time via `sota.bedrockModelMap` with sensible defaults.
export type ModelId =
	| 'opus'
	| 'sonnet'
	| 'haiku'
	| 'gpt-4o'
	| 'gpt-4o-mini'
	| 'gpt-5-codex'
	| 'foundry-gpt-4o'
	| 'foundry-gpt-4o-mini'
	| 'foundry-claude-sonnet'
	| 'bedrock-claude-sonnet'
	| 'bedrock-claude-haiku'
	| 'gemini-1-5-pro'
	| 'gemini-1-5-flash'
	| 'gemini-2-0-flash';

/** Provider that backs a given model id. */
type Provider = 'anthropic' | 'openai' | 'foundry' | 'bedrock' | 'google';

export interface LlmMessage {
	role: 'user' | 'assistant';
	content: string;
}

/**
 * Local declaration of a tool definition consumed by Anthropic-compatible
 * providers. A parallel module under `../tools/types.ts` is being introduced
 * by another work stream; this inline copy keeps LlmClient unblocked and
 * avoids a cross-module import while the canonical location stabilises.
 */
export interface ToolDefinition {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: {
		readonly type: 'object';
		readonly properties: Record<string, unknown>;
		readonly required?: ReadonlyArray<string>;
	};
}

export interface LlmRequestOptions {
	model: ModelId;
	messages: LlmMessage[];
	maxTokens?: number;
	systemPrompt?: string;
	signal?: AbortSignal;
	/** Enable prompt caching for the system prompt. */
	enableCaching?: boolean;
	/** Agent handle for cache metrics tracking. */
	agentHandle?: string;
	/**
	 * Tool definitions to expose to the model. Currently honoured by the
	 * Anthropic-compatible providers (`streamAnthropic`, `streamBedrock`).
	 * Other providers silently ignore this field until their respective
	 * function-calling integrations land.
	 */
	tools?: ReadonlyArray<ToolDefinition>;
}

export interface LlmStreamToken {
	type: 'token';
	token: string;
}

/**
 * Tool-call event emitted when a model requests invocation of a tool. The
 * `id` matches the Anthropic `tool_use_id` and must be echoed back on the
 * subsequent tool-result message so the model can correlate replies with
 * outstanding requests.
 */
export interface LlmStreamToolCall {
	type: 'tool-call';
	id: string;
	name: string;
	input: Record<string, unknown>;
}

export interface LlmStreamComplete {
	type: 'complete';
	fullText: string;
	inputTokens: number;
	outputTokens: number;
	cachedTokens: number;
	cacheCreationTokens: number;
	cacheReadTokens: number;
	/**
	 * Reason the model stopped generating. Only populated for providers that
	 * surface it (currently Anthropic and Bedrock); undefined elsewhere.
	 */
	stopReason?: 'end_turn' | 'tool_use' | 'max_tokens' | string;
}

export interface LlmStreamError {
	type: 'error';
	error: string;
}

export type LlmStreamEvent = LlmStreamToken | LlmStreamToolCall | LlmStreamComplete | LlmStreamError;

/**
 * Minimal contract used by LlmClient to obtain an OAuth bearer token for a
 * provider. Modeled after CredentialBroker.getToken but kept narrow so tests
 * and alternative implementations can satisfy it without bringing in the full
 * broker surface.
 */
export interface ICredentialResolver {
	getToken(providerId: string): Promise<{ token: string } | undefined>;
}

/** Provider ID used for Claude OAuth credentials. */
const ANTHROPIC_OAUTH_PROVIDER_ID = 'anthropic-oauth';
/** Provider ID used for ChatGPT/OpenAI OAuth credentials. */
const OPENAI_OAUTH_PROVIDER_ID = 'chatgpt-oauth';
/**
 * Provider ID reserved for Microsoft Foundry / Azure OpenAI Entra OAuth
 * credentials. Declared here for symmetry with the other provider ids;
 * Entra OAuth wiring is intentionally deferred to a later phase, so this
 * constant is currently unused at runtime. Exported so the credential
 * broker layer can reference it once Entra integration lands without
 * touching the constant's declaration site.
 */
export const FOUNDRY_OAUTH_PROVIDER_ID = 'foundry-oauth';
/**
 * Provider ID reserved for Amazon Bedrock OAuth-style credentials (e.g.
 * IAM Identity Center / SSO bearer tokens). Declared here for symmetry with
 * the other provider ids; AWS sign-in wiring is intentionally deferred to a
 * later phase, so this constant is currently unused at runtime. Exported so
 * the credential broker layer can reference it once AWS sign-in integration
 * lands without touching the constant's declaration site.
 */
export const BEDROCK_OAUTH_PROVIDER_ID = 'bedrock-oauth';
/**
 * Provider ID reserved for Google Cloud ADC / Vertex AI OAuth credentials.
 * Declared here for symmetry with the other provider ids; full Vertex AI
 * (`aiplatform.googleapis.com`) with ADC OAuth is a deferred follow-up. The
 * current Google integration uses the consumer Gemini API endpoint
 * (`generativelanguage.googleapis.com`) with API-key auth, so this constant
 * is currently unused at runtime. Exported so the credential broker layer
 * can reference it once Vertex AI / ADC integration lands without touching
 * the constant's declaration site.
 */
export const GOOGLE_OAUTH_PROVIDER_ID = 'google-oauth';

/**
 * Classify a model id as belonging to either the Anthropic or OpenAI provider.
 * Adding a third provider in future is a matter of adding another branch here
 * plus a corresponding stream method below.
 */
function providerForModel(model: ModelId): Provider {
	switch (model) {
		case 'opus':
		case 'sonnet':
		case 'haiku':
			return 'anthropic';
		case 'gpt-4o':
		case 'gpt-4o-mini':
		case 'gpt-5-codex':
			return 'openai';
		case 'foundry-gpt-4o':
		case 'foundry-gpt-4o-mini':
		case 'foundry-claude-sonnet':
			return 'foundry';
		case 'bedrock-claude-sonnet':
		case 'bedrock-claude-haiku':
			return 'bedrock';
		case 'gemini-1-5-pro':
		case 'gemini-1-5-flash':
		case 'gemini-2-0-flash':
			return 'google';
	}
}

/**
 * Routes requests to Claude or OpenAI models based on task complexity.
 * Provider selection is driven entirely by the model id; per-provider
 * specifics (endpoint, headers, body shape, streaming protocol) are isolated
 * in `streamAnthropic` and `streamOpenAI` to keep the dispatcher narrow.
 */
export class LlmClient {
	private totalInputTokens = 0;
	private totalOutputTokens = 0;
	private totalCachedTokens = 0;
	private readonly credentialResolver?: ICredentialResolver;
	private readonly secrets: vscode.SecretStorage;

	constructor(context: vscode.ExtensionContext, credentialResolver?: ICredentialResolver) {
		this.secrets = context.secrets;
		this.credentialResolver = credentialResolver;
	}

	/**
	 * Resolve a credential by checking SecretStorage first, then a settings
	 * fallback (for users with keys still in settings.json), then environment
	 * variables. SecretStorage is the canonical store written by the setup
	 * wizard; the settings tier exists purely for backwards compatibility with
	 * pre-wizard installs.
	 */
	private async resolveCredential(secretKey: string, settingKey: string, envKeys: ReadonlyArray<string>): Promise<string | undefined> {
		const secretValue = await this.secrets.get(secretKey);
		if (secretValue && secretValue.trim()) {
			return secretValue.trim();
		}
		const config = vscode.workspace.getConfiguration('sota');
		const settingValue = config.get<string>(settingKey);
		if (settingValue && settingValue.trim()) {
			return settingValue.trim();
		}
		for (const envKey of envKeys) {
			const envValue = process.env[envKey];
			if (envValue && envValue.trim()) {
				return envValue.trim();
			}
		}
		return undefined;
	}

	/**
	 * Get the Anthropic API key from SecretStorage, configuration, or environment.
	 */
	private async getAnthropicApiKey(): Promise<string | undefined> {
		return this.resolveCredential('sota.secrets.anthropicApiKey', 'apiKey', ['ANTHROPIC_API_KEY']);
	}

	/**
	 * Get the OpenAI API key from SecretStorage, configuration, or environment.
	 */
	private async getOpenAIApiKey(): Promise<string | undefined> {
		return this.resolveCredential('sota.secrets.openaiApiKey', 'openaiApiKey', ['OPENAI_API_KEY']);
	}

	/**
	 * Get the Microsoft Foundry / Azure OpenAI API key from SecretStorage,
	 * configuration, or environment. Falls back to AZURE_OPENAI_API_KEY (the
	 * Azure-canonical env var) and then FOUNDRY_API_KEY for users who prefer
	 * the Foundry branding.
	 */
	private async getFoundryApiKey(): Promise<string | undefined> {
		return this.resolveCredential('sota.secrets.foundryApiKey', 'foundryApiKey', ['AZURE_OPENAI_API_KEY', 'FOUNDRY_API_KEY']);
	}

	/**
	 * Resolve the Microsoft Foundry / Azure OpenAI endpoint configuration.
	 * Returns undefined when the endpoint is not configured — callers should
	 * treat that as "Foundry is not set up" and surface an actionable error.
	 *
	 * The deployments map is stored as a JSON string (rather than a typed
	 * object) so it can live in `sota.foundryDeployments` without inventing a
	 * separate settings shape per model id.
	 */
	private getFoundryConfig(): { endpoint: string; apiVersion: string; deploymentForModel: (model: ModelId) => string | undefined } | undefined {
		const config = vscode.workspace.getConfiguration('sota');
		const rawEndpoint = (config.get<string>('foundryEndpoint') ?? '').trim();
		if (!rawEndpoint) {
			return undefined;
		}
		const endpoint = rawEndpoint.replace(/\/+$/, '');

		const apiVersion = (config.get<string>('foundryApiVersion') ?? '').trim() || '2024-10-01-preview';

		const rawDeployments = (config.get<string>('foundryDeployments') ?? '').trim();
		let deploymentMap: Record<string, string> = {};
		if (rawDeployments.length > 0) {
			try {
				const parsed = JSON.parse(rawDeployments);
				if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
					for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
						if (typeof value === 'string' && value.length > 0) {
							deploymentMap[key] = value;
						}
					}
				}
			} catch (err) {
				console.warn('LlmClient: Failed to parse sota.foundryDeployments as JSON; treating as empty.', err);
				deploymentMap = {};
			}
		}

		return {
			endpoint,
			apiVersion,
			deploymentForModel: (model: ModelId): string | undefined => {
				const value = deploymentMap[model];
				return value && value.length > 0 ? value : undefined;
			},
		};
	}

	/**
	 * Resolve Amazon Bedrock configuration: target region, credential provider,
	 * and a function that resolves a Son of Anton model id to the Bedrock
	 * invocation id sent on the wire (e.g. `anthropic.claude-3-5-sonnet-20241022-v2:0`).
	 *
	 * Credential resolution order — first non-empty wins:
	 *   1. `sota.bedrockProfile` (named profile in `~/.aws/credentials`).
	 *   2. `sota.bedrockAccessKeyId` / `sota.bedrockSecretAccessKey` (and
	 *      optional `sota.bedrockSessionToken` for STS temporary credentials).
	 *   3. The standard AWS Node provider chain (env vars, shared credentials,
	 *      IMDS, ECS task role, IAM role, etc.) via `fromNodeProviderChain()`.
	 *
	 * The model map merges built-in defaults (Claude 3.5 Sonnet/Haiku) with the
	 * user's `sota.bedrockModelMap` JSON. User-supplied entries override
	 * defaults so the user can pin region-specific or cross-region inference
	 * profile ARNs without losing the fallback for the unmapped model.
	 */
	private async getBedrockConfig(): Promise<{ region: string; modelInvocationId: (model: ModelId) => string | undefined; credentialProvider: AwsCredentialIdentityProvider }> {
		const config = vscode.workspace.getConfiguration('sota');
		const rawRegion = (config.get<string>('bedrockRegion') ?? '').trim();
		const region = rawRegion.length > 0 ? rawRegion : 'us-east-1';

		const profile = (config.get<string>('bedrockProfile') ?? '').trim();
		// SecretStorage takes priority over settings for the three credential
		// fields; bedrockProfile remains a settings-only knob since profile names
		// are not secret.
		const accessKeyId = (await this.resolveCredential('sota.secrets.bedrockAccessKeyId', 'bedrockAccessKeyId', [])) ?? '';
		const secretAccessKey = (await this.resolveCredential('sota.secrets.bedrockSecretAccessKey', 'bedrockSecretAccessKey', [])) ?? '';
		const sessionToken = (await this.resolveCredential('sota.secrets.bedrockSessionToken', 'bedrockSessionToken', [])) ?? '';

		let credentialProvider: AwsCredentialIdentityProvider;
		if (profile.length > 0) {
			credentialProvider = fromIni({ profile });
		} else if (accessKeyId.length > 0 || secretAccessKey.length > 0) {
			// Static credentials from settings. The SDK accepts a function that
			// returns AwsCredentialIdentity; we wrap so a missing pair surfaces
			// at request time as a credential error rather than at config read.
			const staticCreds: AwsCredentialIdentity = {
				accessKeyId,
				secretAccessKey,
				...(sessionToken.length > 0 ? { sessionToken } : {}),
			};
			credentialProvider = async () => staticCreds;
		} else {
			credentialProvider = fromNodeProviderChain();
		}

		const defaultMap: Partial<Record<ModelId, string>> = {
			'bedrock-claude-sonnet': 'anthropic.claude-3-5-sonnet-20241022-v2:0',
			'bedrock-claude-haiku': 'anthropic.claude-3-5-haiku-20241022-v1:0',
		};

		const rawMap = (config.get<string>('bedrockModelMap') ?? '').trim();
		const userMap: Record<string, string> = {};
		if (rawMap.length > 0) {
			try {
				const parsed = JSON.parse(rawMap);
				if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
					for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
						if (typeof value === 'string' && value.length > 0) {
							userMap[key] = value;
						}
					}
				}
			} catch (err) {
				console.warn('LlmClient: Failed to parse sota.bedrockModelMap as JSON; treating as empty.', err);
			}
		}

		return {
			region,
			credentialProvider,
			modelInvocationId: (model: ModelId): string | undefined => {
				const userValue = userMap[model];
				if (userValue && userValue.length > 0) {
					return userValue;
				}
				return defaultMap[model];
			},
		};
	}

	/**
	 * Get the Google Gemini API key from SecretStorage, configuration, or
	 * environment. Falls back to GOOGLE_API_KEY (Google's canonical env var)
	 * and then GEMINI_API_KEY for users who follow the Gemini-branded
	 * convention.
	 */
	private async getGoogleApiKey(): Promise<string | undefined> {
		return this.resolveCredential('sota.secrets.googleApiKey', 'googleApiKey', ['GOOGLE_API_KEY', 'GEMINI_API_KEY']);
	}

	/**
	 * Resolve the Google Gemini API model name for a given Son of Anton model
	 * id. User-supplied entries in `sota.googleModelMap` override the built-in
	 * defaults so the user can pin specific versions or experimental endpoints
	 * without losing the fallback for unmapped models.
	 */
	private getGoogleModelInvocationId(model: ModelId): string | undefined {
		const defaults: Partial<Record<ModelId, string>> = {
			'gemini-1-5-pro': 'gemini-1.5-pro',
			'gemini-1-5-flash': 'gemini-1.5-flash',
			'gemini-2-0-flash': 'gemini-2.0-flash-exp',
		};
		const raw = vscode.workspace.getConfiguration('sota').get<string>('googleModelMap', '{}');
		let userMap: Record<string, string> = {};
		try {
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
					if (typeof value === 'string' && value.length > 0) {
						userMap[key] = value;
					}
				}
			}
		} catch (err) {
			console.warn('LlmClient: Failed to parse sota.googleModelMap as JSON; treating as empty.', err);
			userMap = {};
		}
		return userMap[model] ?? defaults[model];
	}

	/**
	 * Extract a human-readable error message from a parsed provider response
	 * body. Both Anthropic and OpenAI nest their message at `body.error.message`,
	 * but we accept a top-level `message` and bare strings to stay defensive
	 * against future shape drift or HTML/text error pages.
	 */
	private extractBodyMessage(body: unknown): string | undefined {
		if (!body) {
			return undefined;
		}
		if (typeof body === 'string') {
			const trimmed = body.trim();
			return trimmed.length > 0 ? trimmed : undefined;
		}
		if (typeof body === 'object') {
			const obj = body as Record<string, unknown>;
			const err = obj['error'];
			if (err && typeof err === 'object') {
				const errObj = err as Record<string, unknown>;
				const msg = errObj['message'];
				if (typeof msg === 'string' && msg.length > 0) {
					return msg;
				}
			}
			const topMsg = obj['message'];
			if (typeof topMsg === 'string' && topMsg.length > 0) {
				return topMsg;
			}
		}
		return undefined;
	}

	/**
	 * Extract a provider-specific error type/code (e.g. 'authentication_error',
	 * 'rate_limit_error', 'model_not_found'). Returns undefined if unavailable.
	 */
	private extractBodyErrorType(body: unknown): string | undefined {
		if (!body || typeof body !== 'object') {
			return undefined;
		}
		const err = (body as Record<string, unknown>)['error'];
		if (!err || typeof err !== 'object') {
			return undefined;
		}
		const errObj = err as Record<string, unknown>;
		const type = errObj['type'];
		if (typeof type === 'string' && type.length > 0) {
			return type;
		}
		const code = errObj['code'];
		if (typeof code === 'string' && code.length > 0) {
			return code;
		}
		return undefined;
	}

	/**
	 * Translate an HTTP-level provider error into an actionable, single-paragraph
	 * message. The text is what the chat UI will surface, so it must guide the
	 * user toward a concrete fix rather than echoing raw provider output.
	 */
	private mapProviderError(provider: Provider, status: number, body: unknown): string {
		const providerLabel = provider === 'anthropic'
			? 'Anthropic'
			: provider === 'openai'
				? 'OpenAI'
				: provider === 'foundry'
					? 'Microsoft Foundry'
					: provider === 'bedrock'
						? 'Amazon Bedrock'
						: 'Google Gemini';
		const bodyMessage = this.extractBodyMessage(body);
		const errorType = this.extractBodyErrorType(body);
		const lowerMessage = (bodyMessage ?? '').toLowerCase();
		const lowerType = (errorType ?? '').toLowerCase();

		// Auth: 401/403, or any status accompanied by an authentication_error type.
		if (status === 401 || status === 403 || lowerType === 'authentication_error' || lowerType === 'permission_error') {
			if (provider === 'bedrock') {
				return `Authentication failed for ${providerLabel}. Check your AWS credentials (settings -> sota.bedrockAccessKeyId / sota.bedrockProfile, or the standard AWS credential chain), and confirm your IAM principal has the bedrock:InvokeModelWithResponseStream permission.`;
			}
			const settingKey = provider === 'anthropic'
				? 'sota.apiKey'
				: provider === 'openai'
					? 'sota.openaiApiKey'
					: provider === 'foundry'
						? 'sota.foundryApiKey'
						: 'sota.googleApiKey';
			return `Authentication failed for ${providerLabel}. Check that your API key is correct (settings -> ${settingKey}), or re-sign in via 'Anton: Sign In to Claude' / 'Anton: Sign In to ChatGPT / Codex'.`;
		}

		// Rate limit: 429, or any rate_limit_error / overloaded_error type.
		if (status === 429 || lowerType === 'rate_limit_error' || lowerType === 'overloaded_error') {
			return `${providerLabel} rate limit hit. Wait a moment and retry, or check your plan limits.`;
		}

		// Model not found: 404, OpenAI 'model_not_found' code, or Anthropic
		// invalid_request_error mentioning the model in its message.
		const isAnthropicModelMissing = provider === 'anthropic'
			&& lowerType === 'invalid_request_error'
			&& lowerMessage.includes('model')
			&& (lowerMessage.includes('not found') || lowerMessage.includes('does not exist'));
		const isOpenAIModelMissing = provider === 'openai' && lowerType === 'model_not_found';
		if (status === 404 || isAnthropicModelMissing || isOpenAIModelMissing) {
			return 'Model is not available on your account. Pick a different model from the chat picker.';
		}

		// Server-side errors: keep this branch broad so transient blips read as retryable.
		if (status >= 500 && status < 600) {
			return `${providerLabel} returned an internal error (HTTP ${status}). Try again shortly.`;
		}

		return `${providerLabel} request failed (HTTP ${status}): ${bodyMessage ?? 'no detail'}`;
	}

	/**
	 * Translate a thrown fetch/network error into an actionable message. The
	 * cancel branch deliberately omits the provider label since the user
	 * triggered the cancellation themselves.
	 */
	private mapNetworkError(provider: Provider, err: unknown): string {
		const providerLabel = provider === 'anthropic'
			? 'Anthropic'
			: provider === 'openai'
				? 'OpenAI'
				: provider === 'foundry'
					? 'Microsoft Foundry'
					: provider === 'bedrock'
						? 'Amazon Bedrock'
						: 'Google Gemini';
		const errorObj = (err && typeof err === 'object') ? err as { name?: unknown; message?: unknown; $metadata?: unknown } : undefined;
		const name = typeof errorObj?.name === 'string' ? errorObj.name : '';
		const message = typeof errorObj?.message === 'string' ? errorObj.message : '';

		if (name === 'AbortError') {
			return 'Request cancelled.';
		}

		// AWS SDK errors carry $metadata.httpStatusCode for HTTP-level failures.
		// Reuse mapProviderError so 401/403/429/404/5xx map to the same actionable
		// strings as native fetch-based providers.
		if (provider === 'bedrock' && errorObj?.$metadata && typeof errorObj.$metadata === 'object') {
			const metaObj = errorObj.$metadata as { httpStatusCode?: unknown };
			const httpStatus = typeof metaObj.httpStatusCode === 'number' ? metaObj.httpStatusCode : undefined;
			if (typeof httpStatus === 'number' && httpStatus > 0) {
				return this.mapProviderError('bedrock', httpStatus, { error: { message, type: name } });
			}
		}

		if (message.includes('fetch failed')
			|| message.includes('ENOTFOUND')
			|| message.includes('ECONNREFUSED')
			|| message.includes('getaddrinfo')) {
			return `Cannot reach ${providerLabel}'s API. Check your internet connection or proxy settings.`;
		}

		// AWS SDK surfaces credential-resolution failures with these names rather
		// than HTTP status codes. Translate to an actionable auth error so the
		// user knows to update sota.bedrockAccessKeyId / sota.bedrockProfile.
		if (provider === 'bedrock' && (
			name === 'CredentialsProviderError'
			|| name === 'CredentialsError'
			|| message.includes('Could not load credentials')
			|| message.includes('credentials were unavailable')
		)) {
			return `No AWS credentials available for ${providerLabel}. Set sota.bedrockAccessKeyId / sota.bedrockSecretAccessKey, sota.bedrockProfile, or configure the standard AWS credential chain (env vars, ~/.aws/credentials, IAM role).`;
		}

		const detail = message.length > 0 ? message : String(err);
		return `Network error while calling ${providerLabel}: ${detail}`;
	}

	/**
	 * Best-effort body parse: read the body as text, then attempt JSON parse.
	 * Falls back to the raw text, finally undefined. Never throws — error
	 * mapping must succeed even if the provider returns malformed bytes.
	 */
	private async readErrorBody(response: Response): Promise<unknown> {
		let raw: string | undefined;
		try {
			raw = await response.text();
		} catch {
			return undefined;
		}
		if (raw === undefined || raw.length === 0) {
			return undefined;
		}
		try {
			return JSON.parse(raw);
		} catch {
			return raw;
		}
	}

	/**
	 * Map our model shorthand to the full Anthropic model ID.
	 */
	getModelId(model: ModelId): string {
		switch (model) {
			case 'opus': return 'claude-3-opus-20240229';
			case 'sonnet': return 'claude-3-sonnet-20240229';
			case 'haiku': return 'claude-3-haiku-20240307';
			// OpenAI ids are direct OpenAI model identifiers; surface them as-is
			// so callers that want a wire-level id (e.g. logs) get a useful value.
			case 'gpt-4o': return 'gpt-4o';
			case 'gpt-4o-mini': return 'gpt-4o-mini';
			case 'gpt-5-codex': return 'gpt-5-codex';
			// Foundry ids: report the underlying model family. The actual
			// deployment name lives in `sota.foundryDeployments` and is
			// resolved at request time inside streamFoundry.
			case 'foundry-gpt-4o': return 'gpt-4o';
			case 'foundry-gpt-4o-mini': return 'gpt-4o-mini';
			case 'foundry-claude-sonnet': return 'claude-sonnet-4-5';
			// Bedrock ids: report the human-readable id unchanged. The actual
			// invocation id (e.g. anthropic.claude-3-5-sonnet-20241022-v2:0)
			// is resolved at request time via getBedrockConfig().modelInvocationId.
			case 'bedrock-claude-sonnet': return 'bedrock-claude-sonnet';
			case 'bedrock-claude-haiku': return 'bedrock-claude-haiku';
			// Google Gemini ids: report the human-readable id unchanged. The
			// actual API model name (e.g. gemini-1.5-pro) is resolved at request
			// time via getGoogleModelInvocationId() with sensible defaults.
			case 'gemini-1-5-pro': return 'gemini-1-5-pro';
			case 'gemini-1-5-flash': return 'gemini-1-5-flash';
			case 'gemini-2-0-flash': return 'gemini-2-0-flash';
		}
	}

	/**
	 * Stream a request to the appropriate provider based on the model id.
	 * Returns an async iterable of normalized stream events.
	 */
	async *streamRequest(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		const provider = providerForModel(options.model);
		switch (provider) {
			case 'anthropic':
				yield* this.streamAnthropic(options);
				return;
			case 'openai':
				yield* this.streamOpenAI(options);
				return;
			case 'foundry':
				yield* this.streamFoundry(options);
				return;
			case 'bedrock':
				yield* this.streamBedrock(options);
				return;
			case 'google':
				yield* this.streamGoogle(options);
				return;
		}
	}

	/**
	 * Anthropic-specific streaming implementation. Behavior is intentionally
	 * unchanged from the pre-OpenAI version of this client.
	 */
	private async *streamAnthropic(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		// Prefer OAuth bearer token from the credential broker when available.
		// Any failure is treated as "no token" so the API key path remains usable.
		let oauthToken: string | undefined;
		try {
			const record = await this.credentialResolver?.getToken(ANTHROPIC_OAUTH_PROVIDER_ID);
			if (record && typeof record.token === 'string' && record.token) {
				oauthToken = record.token;
			}
		} catch (err) {
			console.warn('LlmClient: OAuth token lookup failed, falling back to API key.', err);
		}

		const apiKey = oauthToken ? undefined : await this.getAnthropicApiKey();

		if (!oauthToken && !apiKey) {
			yield {
				type: 'error',
				error: 'No Claude credentials configured. Sign in to Claude from the welcome screen, or set sota.apiKey in settings or ANTHROPIC_API_KEY environment variable.'
			};
			return;
		}

		const modelId = this.getModelId(options.model);

		// Build system prompt with cache control for prompt caching
		const systemContent = options.enableCaching
			? [{ type: 'text', text: options.systemPrompt ?? 'You are a helpful coding assistant.', cache_control: { type: 'ephemeral' } }]
			: options.systemPrompt ?? 'You are a helpful coding assistant.';

		const body: Record<string, unknown> = {
			model: modelId,
			max_tokens: options.maxTokens ?? 4096,
			system: systemContent,
			messages: options.messages.map(m => ({
				role: m.role,
				content: m.content,
			})),
			stream: true,
		};

		if (options.tools && options.tools.length > 0) {
			body['tools'] = options.tools.map(t => ({
				name: t.name,
				description: t.description,
				input_schema: t.inputSchema,
			}));
		}

		const headers: Record<string, string> = oauthToken
			? {
				'content-type': 'application/json',
				'Authorization': `Bearer ${oauthToken}`,
				'anthropic-version': '2023-06-01',
				'anthropic-beta': 'oauth-2025-04-20',
			}
			: {
				'Content-Type': 'application/json',
				'x-api-key': apiKey!,
				'anthropic-version': '2023-06-01',
			};

		// Enable prompt caching beta header (API-key path only; OAuth path
		// already sets anthropic-beta to oauth-2025-04-20).
		if (options.enableCaching && !oauthToken) {
			headers['anthropic-beta'] = 'prompt-caching-2024-07-31';
		}

		try {
			const response = await fetch('https://api.anthropic.com/v1/messages', {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				signal: options.signal,
			});

			if (!response.ok) {
				const body = await this.readErrorBody(response);
				yield { type: 'error', error: this.mapProviderError('anthropic', response.status, body) };
				return;
			}

			const reader = response.body?.getReader();
			if (!reader) {
				yield { type: 'error', error: 'Anthropic returned an empty response body. Try again shortly.' };
				return;
			}

			const decoder = new TextDecoder();
			let fullText = '';
			let inputTokens = 0;
			let outputTokens = 0;
			let cacheCreationTokens = 0;
			let cacheReadTokens = 0;
			let stopReason: string | undefined;
			let buffer = '';

			// Tool-use accumulator keyed by content block index. Tool input JSON
			// streams as `input_json_delta` chunks that must be concatenated and
			// parsed once the block closes.
			const toolUseByIndex = new Map<number, { id: string; name: string; jsonChunks: string[] }>();

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					if (!line.startsWith('data: ')) {
						continue;
					}
					const data = line.slice(6).trim();
					if (data === '[DONE]') {
						continue;
					}

					try {
						const event = JSON.parse(data);

						if (event.type === 'content_block_start'
							&& event.content_block?.type === 'tool_use'
							&& typeof event.index === 'number'
							&& typeof event.content_block.id === 'string'
							&& typeof event.content_block.name === 'string'
						) {
							toolUseByIndex.set(event.index, {
								id: event.content_block.id,
								name: event.content_block.name,
								jsonChunks: [],
							});
						} else if (event.type === 'content_block_delta'
							&& event.delta?.type === 'input_json_delta'
							&& typeof event.index === 'number'
							&& typeof event.delta.partial_json === 'string'
						) {
							const entry = toolUseByIndex.get(event.index);
							if (entry) {
								entry.jsonChunks.push(event.delta.partial_json);
							}
						} else if (event.type === 'content_block_stop' && typeof event.index === 'number') {
							const entry = toolUseByIndex.get(event.index);
							if (entry) {
								toolUseByIndex.delete(event.index);
								const joined = entry.jsonChunks.join('');
								let parsedInput: Record<string, unknown> = {};
								if (joined.length > 0) {
									try {
										const parsed = JSON.parse(joined);
										if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
											parsedInput = parsed as Record<string, unknown>;
										} else {
											console.warn(`LlmClient: tool_use input JSON for tool '${entry.name}' did not parse to an object; defaulting to {}.`);
										}
									} catch (parseErr) {
										console.warn(`LlmClient: failed to parse tool_use input JSON for tool '${entry.name}'; defaulting to {}.`, parseErr);
									}
								}
								yield { type: 'tool-call', id: entry.id, name: entry.name, input: parsedInput };
							}
						} else if (event.type === 'content_block_delta' && event.delta?.text) {
							const token = event.delta.text;
							fullText += token;
							yield { type: 'token', token };
						} else if (event.type === 'message_start' && event.message?.usage) {
							inputTokens = event.message.usage.input_tokens ?? 0;
							cacheCreationTokens = event.message.usage.cache_creation_input_tokens ?? 0;
							cacheReadTokens = event.message.usage.cache_read_input_tokens ?? 0;
						} else if (event.type === 'message_delta') {
							if (event.usage) {
								outputTokens = event.usage.output_tokens ?? 0;
							}
							if (event.delta && typeof event.delta.stop_reason === 'string') {
								stopReason = event.delta.stop_reason;
							}
						}
					} catch {
						// Skip malformed JSON lines in the stream
					}
				}
			}

			this.totalInputTokens += inputTokens;
			this.totalOutputTokens += outputTokens;
			this.totalCachedTokens += cacheReadTokens;

			yield {
				type: 'complete',
				fullText,
				inputTokens,
				outputTokens,
				cachedTokens: cacheReadTokens,
				cacheCreationTokens,
				cacheReadTokens,
				stopReason,
			};
		} catch (err) {
			if (options.signal?.aborted) {
				yield { type: 'error', error: 'Request cancelled.' };
			} else {
				yield { type: 'error', error: this.mapNetworkError('anthropic', err) };
			}
		}
	}

	/**
	 * OpenAI-specific streaming implementation. Targets the chat completions
	 * endpoint; SSE chunks have a different shape from Anthropic's, so token
	 * extraction and usage accounting are handled inline here.
	 */
	private async *streamOpenAI(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		// Prefer OAuth bearer token from the credential broker when available.
		// Mirror the silent-fallback semantics of the Anthropic path.
		let oauthToken: string | undefined;
		try {
			const record = await this.credentialResolver?.getToken(OPENAI_OAUTH_PROVIDER_ID);
			if (record && typeof record.token === 'string' && record.token) {
				oauthToken = record.token;
			}
		} catch (err) {
			console.warn('LlmClient: OpenAI OAuth token lookup failed, falling back to API key.', err);
		}

		const apiKey = oauthToken ? undefined : await this.getOpenAIApiKey();

		if (!oauthToken && !apiKey) {
			yield {
				type: 'error',
				error: 'No OpenAI credentials configured. Sign in to ChatGPT from the welcome screen, or set the OPENAI_API_KEY environment variable.'
			};
			return;
		}

		const modelId = this.getModelId(options.model);

		// OpenAI takes the system prompt as a leading system message rather
		// than a top-level field. Build it once so we can prepend cleanly.
		const systemMessage = {
			role: 'system' as const,
			content: options.systemPrompt ?? 'You are a helpful coding assistant.',
		};

		const body: Record<string, unknown> = {
			model: modelId,
			max_tokens: options.maxTokens ?? 4096,
			messages: [
				systemMessage,
				...options.messages.map(m => ({ role: m.role, content: m.content })),
			],
			stream: true,
			// Request a final usage chunk so we can populate token counts.
			stream_options: { include_usage: true },
		};

		if (options.tools && options.tools.length > 0) {
			body.tools = options.tools.map(t => ({
				type: 'function',
				function: { name: t.name, description: t.description, parameters: t.inputSchema },
			}));
		}

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${oauthToken ?? apiKey!}`,
		};

		try {
			const response = await fetch('https://api.openai.com/v1/chat/completions', {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				signal: options.signal,
			});

			if (!response.ok) {
				const body = await this.readErrorBody(response);
				yield { type: 'error', error: this.mapProviderError('openai', response.status, body) };
				return;
			}

			const reader = response.body?.getReader();
			if (!reader) {
				yield { type: 'error', error: 'OpenAI returned an empty response body. Try again shortly.' };
				return;
			}

			const decoder = new TextDecoder();
			let fullText = '';
			let inputTokens = 0;
			let outputTokens = 0;
			let buffer = '';
			// Tool-call accumulator keyed by `tool_calls[i].index`. OpenAI streams
			// id/name/arguments piecewise across multiple deltas, so we buffer
			// fragments and assemble them once the stream finishes.
			const toolCallsByIndex = new Map<number, { id?: string; name?: string; argsBuffer: string }>();
			let stopReason: string | undefined;

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					if (!line.startsWith('data: ')) {
						continue;
					}
					const data = line.slice(6).trim();
					if (data === '[DONE]') {
						continue;
					}

					try {
						const event = JSON.parse(data);

						// Token deltas live on choices[0].delta.content. The
						// final usage-only chunk has an empty choices array.
						const choice = event.choices?.[0];
						const delta = choice?.delta;
						if (delta && typeof delta.content === 'string' && delta.content.length > 0) {
							const token = delta.content;
							fullText += token;
							yield { type: 'token', token };
						}

						if (delta && Array.isArray(delta.tool_calls)) {
							for (const tc of delta.tool_calls) {
								if (typeof tc?.index !== 'number') {
									continue;
								}
								let entry = toolCallsByIndex.get(tc.index);
								if (!entry) {
									entry = { id: undefined, name: undefined, argsBuffer: '' };
									toolCallsByIndex.set(tc.index, entry);
								}
								if (typeof tc.id === 'string' && tc.id.length > 0) {
									entry.id = tc.id;
								}
								if (typeof tc.function?.name === 'string' && tc.function.name.length > 0) {
									entry.name = tc.function.name;
								}
								if (typeof tc.function?.arguments === 'string') {
									entry.argsBuffer += tc.function.arguments;
								}
							}
						}

						if (typeof choice?.finish_reason === 'string' && choice.finish_reason === 'tool_calls') {
							stopReason = 'tool_use';
						}

						if (event.usage) {
							inputTokens = event.usage.prompt_tokens ?? 0;
							outputTokens = event.usage.completion_tokens ?? 0;
						}
					} catch {
						// Skip malformed JSON lines in the stream
					}
				}
			}

			// Emit accumulated tool calls in stable index order.
			const orderedIndexes = Array.from(toolCallsByIndex.keys()).sort((a, b) => a - b);
			for (let i = 0; i < orderedIndexes.length; i++) {
				const idx = orderedIndexes[i];
				const entry = toolCallsByIndex.get(idx)!;
				let parsedInput: Record<string, unknown> = {};
				if (entry.argsBuffer.length > 0) {
					try {
						const parsed = JSON.parse(entry.argsBuffer);
						if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
							parsedInput = parsed as Record<string, unknown>;
						} else {
							console.warn(`LlmClient: OpenAI tool_call arguments for '${entry.name}' did not parse to an object; defaulting to {}.`);
						}
					} catch (parseErr) {
						console.warn(`LlmClient: failed to parse OpenAI tool_call arguments for '${entry.name}'; defaulting to {}.`, parseErr);
					}
				}
				yield {
					type: 'tool-call',
					id: entry.id ?? `openai_call_${i}`,
					name: entry.name ?? '',
					input: parsedInput,
				};
			}

			// OpenAI has no cached-token concept exposed here; leave at 0.
			this.totalInputTokens += inputTokens;
			this.totalOutputTokens += outputTokens;

			yield {
				type: 'complete',
				fullText,
				inputTokens,
				outputTokens,
				cachedTokens: 0,
				cacheCreationTokens: 0,
				cacheReadTokens: 0,
				stopReason,
			};
		} catch (err) {
			if (options.signal?.aborted) {
				yield { type: 'error', error: 'Request cancelled.' };
			} else {
				yield { type: 'error', error: this.mapNetworkError('openai', err) };
			}
		}
	}

	/**
	 * Microsoft Foundry / Azure OpenAI streaming implementation. The wire
	 * protocol is OpenAI's chat completions API verbatim — same request body,
	 * same SSE chunk shape — but with two endpoint-shape changes:
	 *   - URL embeds the deployment name: `/openai/deployments/{deployment}/chat/completions?api-version={version}`
	 *   - Auth header is `api-key` rather than `Authorization: Bearer …`.
	 *
	 * Token parsing intentionally mirrors `streamOpenAI` line-for-line so the
	 * two paths drift together if the upstream chunk shape changes. Entra
	 * OAuth is deferred; this path is API-key only.
	 */
	private async *streamFoundry(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		const apiKey = await this.getFoundryApiKey();
		if (!apiKey) {
			yield {
				type: 'error',
				error: 'Microsoft Foundry credentials not configured. Set sota.foundryApiKey in settings, or AZURE_OPENAI_API_KEY / FOUNDRY_API_KEY env var.'
			};
			return;
		}

		const config = this.getFoundryConfig();
		if (!config) {
			yield {
				type: 'error',
				error: 'Microsoft Foundry endpoint not configured. Set sota.foundryEndpoint to your resource URL (e.g. https://my-resource.openai.azure.com).'
			};
			return;
		}

		const deployment = config.deploymentForModel(options.model);
		if (!deployment) {
			yield {
				type: 'error',
				error: `Microsoft Foundry deployment not configured for model '${options.model}'. Add an entry to sota.foundryDeployments mapping '${options.model}' to a deployment name in your Foundry resource.`
			};
			return;
		}

		const modelId = this.getModelId(options.model);

		// Foundry takes the system prompt as a leading system message, mirroring
		// the OpenAI body shape. The 'model' field is ignored by Azure (the
		// deployment URL determines the model) but is sent for consistency.
		const systemMessage = {
			role: 'system' as const,
			content: options.systemPrompt ?? 'You are a helpful coding assistant.',
		};

		const body: Record<string, unknown> = {
			model: modelId,
			max_tokens: options.maxTokens ?? 4096,
			messages: [
				systemMessage,
				...options.messages.map(m => ({ role: m.role, content: m.content })),
			],
			stream: true,
			stream_options: { include_usage: true },
		};

		if (options.tools && options.tools.length > 0) {
			body.tools = options.tools.map(t => ({
				type: 'function',
				function: { name: t.name, description: t.description, parameters: t.inputSchema },
			}));
		}

		const url = `${config.endpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(config.apiVersion)}`;

		const headers: Record<string, string> = {
			'content-type': 'application/json',
			'api-key': apiKey,
		};

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				signal: options.signal,
			});

			if (!response.ok) {
				const body = await this.readErrorBody(response);
				yield { type: 'error', error: this.mapProviderError('foundry', response.status, body) };
				return;
			}

			const reader = response.body?.getReader();
			if (!reader) {
				yield { type: 'error', error: 'Microsoft Foundry returned an empty response body. Try again shortly.' };
				return;
			}

			const decoder = new TextDecoder();
			let fullText = '';
			let inputTokens = 0;
			let outputTokens = 0;
			let buffer = '';
			// Tool-call accumulator keyed by `tool_calls[i].index`. Mirrors the
			// streamOpenAI implementation since Foundry surfaces identical chunk
			// shapes for chat-completions deployments.
			const toolCallsByIndex = new Map<number, { id?: string; name?: string; argsBuffer: string }>();
			let stopReason: string | undefined;

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					if (!line.startsWith('data: ')) {
						continue;
					}
					const data = line.slice(6).trim();
					if (data === '[DONE]') {
						continue;
					}

					try {
						const event = JSON.parse(data);

						// Token deltas live on choices[0].delta.content. The
						// final usage-only chunk has an empty choices array.
						const choice = event.choices?.[0];
						const delta = choice?.delta;
						if (delta && typeof delta.content === 'string' && delta.content.length > 0) {
							const token = delta.content;
							fullText += token;
							yield { type: 'token', token };
						}

						if (delta && Array.isArray(delta.tool_calls)) {
							for (const tc of delta.tool_calls) {
								if (typeof tc?.index !== 'number') {
									continue;
								}
								let entry = toolCallsByIndex.get(tc.index);
								if (!entry) {
									entry = { id: undefined, name: undefined, argsBuffer: '' };
									toolCallsByIndex.set(tc.index, entry);
								}
								if (typeof tc.id === 'string' && tc.id.length > 0) {
									entry.id = tc.id;
								}
								if (typeof tc.function?.name === 'string' && tc.function.name.length > 0) {
									entry.name = tc.function.name;
								}
								if (typeof tc.function?.arguments === 'string') {
									entry.argsBuffer += tc.function.arguments;
								}
							}
						}

						if (typeof choice?.finish_reason === 'string' && choice.finish_reason === 'tool_calls') {
							stopReason = 'tool_use';
						}

						if (event.usage) {
							inputTokens = event.usage.prompt_tokens ?? 0;
							outputTokens = event.usage.completion_tokens ?? 0;
						}
					} catch {
						// Skip malformed JSON lines in the stream
					}
				}
			}

			// Emit accumulated tool calls in stable index order.
			const orderedIndexes = Array.from(toolCallsByIndex.keys()).sort((a, b) => a - b);
			for (let i = 0; i < orderedIndexes.length; i++) {
				const idx = orderedIndexes[i];
				const entry = toolCallsByIndex.get(idx)!;
				let parsedInput: Record<string, unknown> = {};
				if (entry.argsBuffer.length > 0) {
					try {
						const parsed = JSON.parse(entry.argsBuffer);
						if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
							parsedInput = parsed as Record<string, unknown>;
						} else {
							console.warn(`LlmClient: Foundry tool_call arguments for '${entry.name}' did not parse to an object; defaulting to {}.`);
						}
					} catch (parseErr) {
						console.warn(`LlmClient: failed to parse Foundry tool_call arguments for '${entry.name}'; defaulting to {}.`, parseErr);
					}
				}
				yield {
					type: 'tool-call',
					id: entry.id ?? `foundry_call_${i}`,
					name: entry.name ?? '',
					input: parsedInput,
				};
			}

			// Foundry surfaces no cached-token signal in the standard chat
			// completions stream; leave at 0 to match the OpenAI path.
			this.totalInputTokens += inputTokens;
			this.totalOutputTokens += outputTokens;

			yield {
				type: 'complete',
				fullText,
				inputTokens,
				outputTokens,
				cachedTokens: 0,
				cacheCreationTokens: 0,
				cacheReadTokens: 0,
				stopReason,
			};
		} catch (err) {
			if (options.signal?.aborted) {
				yield { type: 'error', error: 'Request cancelled.' };
			} else {
				yield { type: 'error', error: this.mapNetworkError('foundry', err) };
			}
		}
	}

	/**
	 * Amazon Bedrock streaming implementation, restricted to Anthropic Claude
	 * foundation models. Bedrock requires AWS SigV4 request signing and frames
	 * its streaming response in the proprietary AWS event-stream binary format
	 * — both notoriously easy to get wrong by hand — so we delegate to the
	 * official `@aws-sdk/client-bedrock-runtime` package which handles signing,
	 * frame parsing, retries, and credential resolution.
	 *
	 * The Bedrock body shape for Anthropic models is the Anthropic Messages API
	 * with one tweak: `anthropic_version` replaces the SaaS API's `model` field
	 * (the model is selected via the URL path's `modelId`). Streaming chunks
	 * arrive with the SAME event shape as the Anthropic SaaS streaming API
	 * (`message_start` / `content_block_delta` / `message_delta`), so the token
	 * extraction and usage accounting mirror `streamAnthropic` line-for-line.
	 */
	private async *streamBedrock(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		const config = await this.getBedrockConfig();
		const modelId = config.modelInvocationId(options.model);
		if (!modelId) {
			yield {
				type: 'error',
				error: `Amazon Bedrock model id not configured for "${options.model}". Update sota.bedrockModelMap to map this id to a Bedrock invocation id (e.g. \`anthropic.claude-3-5-sonnet-20241022-v2:0\`).`
			};
			return;
		}

		const body: Record<string, unknown> = {
			anthropic_version: 'bedrock-2023-05-31',
			max_tokens: options.maxTokens ?? 4096,
			system: options.systemPrompt ?? 'You are a helpful coding assistant.',
			messages: options.messages.map(m => ({ role: m.role, content: m.content })),
		};

		if (options.tools && options.tools.length > 0) {
			body['tools'] = options.tools.map(t => ({
				name: t.name,
				description: t.description,
				input_schema: t.inputSchema,
			}));
		}

		// Construct the SDK client. The SDK does not throw synchronously for
		// missing credentials at construction time — credential resolution is
		// deferred to first request — so this should only fail for malformed
		// region strings or other config-parse errors. Wrap defensively anyway.
		let client: BedrockRuntimeClient;
		try {
			client = new BedrockRuntimeClient({
				region: config.region,
				credentials: config.credentialProvider,
			});
		} catch (err) {
			yield { type: 'error', error: this.mapNetworkError('bedrock', err) };
			return;
		}

		try {
			const command = new InvokeModelWithResponseStreamCommand({
				modelId,
				contentType: 'application/json',
				accept: 'application/json',
				body: new TextEncoder().encode(JSON.stringify(body)),
			});
			const response = await client.send(command, { abortSignal: options.signal });

			if (!response.body) {
				yield { type: 'error', error: 'Amazon Bedrock returned an empty response body. Try again shortly.' };
				return;
			}

			let fullText = '';
			let inputTokens = 0;
			let outputTokens = 0;
			let stopReason: string | undefined;

			// Tool-use accumulator keyed by content block index. Mirrors the
			// streamAnthropic implementation since Bedrock surfaces identical
			// event shapes for Anthropic-family models.
			const toolUseByIndex = new Map<number, { id: string; name: string; jsonChunks: string[] }>();

			for await (const item of response.body) {
				if (options.signal?.aborted) {
					yield { type: 'error', error: 'Request cancelled.' };
					return;
				}

				// Bedrock's ResponseStream union surfaces stream-level errors as
				// distinct keys on the item. Translate to a single error event so
				// callers see the same shape as a transport-level failure.
				if (item.modelStreamErrorException) {
					yield { type: 'error', error: `Amazon Bedrock stream error: ${item.modelStreamErrorException.message ?? 'unknown'}` };
					return;
				}
				if (item.internalServerException) {
					yield { type: 'error', error: `Amazon Bedrock internal server error: ${item.internalServerException.message ?? 'unknown'}. Try again shortly.` };
					return;
				}
				if (item.modelTimeoutException) {
					yield { type: 'error', error: `Amazon Bedrock model timeout: ${item.modelTimeoutException.message ?? 'unknown'}.` };
					return;
				}
				if (item.throttlingException) {
					yield { type: 'error', error: `Amazon Bedrock rate limit hit. Wait a moment and retry, or check your account quotas.` };
					return;
				}
				if (item.validationException) {
					yield { type: 'error', error: `Amazon Bedrock request validation failed: ${item.validationException.message ?? 'unknown'}.` };
					return;
				}
				if (item.serviceUnavailableException) {
					yield { type: 'error', error: `Amazon Bedrock returned an internal error. Try again shortly.` };
					return;
				}

				const bytes = item.chunk?.bytes;
				if (!bytes) {
					continue;
				}
				let event: {
					type?: unknown;
					index?: unknown;
					content_block?: { type?: unknown; id?: unknown; name?: unknown };
					delta?: { type?: unknown; text?: unknown; partial_json?: unknown; stop_reason?: unknown };
					message?: { usage?: { input_tokens?: unknown } };
					usage?: { output_tokens?: unknown };
				};
				try {
					event = JSON.parse(new TextDecoder().decode(bytes));
				} catch {
					// Skip malformed JSON frames in the stream.
					continue;
				}

				if (event.type === 'content_block_start'
					&& event.content_block
					&& event.content_block.type === 'tool_use'
					&& typeof event.index === 'number'
					&& typeof event.content_block.id === 'string'
					&& typeof event.content_block.name === 'string'
				) {
					toolUseByIndex.set(event.index, {
						id: event.content_block.id,
						name: event.content_block.name,
						jsonChunks: [],
					});
				} else if (event.type === 'content_block_delta'
					&& event.delta
					&& event.delta.type === 'input_json_delta'
					&& typeof event.index === 'number'
					&& typeof event.delta.partial_json === 'string'
				) {
					const entry = toolUseByIndex.get(event.index);
					if (entry) {
						entry.jsonChunks.push(event.delta.partial_json);
					}
				} else if (event.type === 'content_block_stop' && typeof event.index === 'number') {
					const entry = toolUseByIndex.get(event.index);
					if (entry) {
						toolUseByIndex.delete(event.index);
						const joined = entry.jsonChunks.join('');
						let parsedInput: Record<string, unknown> = {};
						if (joined.length > 0) {
							try {
								const parsed = JSON.parse(joined);
								if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
									parsedInput = parsed as Record<string, unknown>;
								} else {
									console.warn(`LlmClient: tool_use input JSON for tool '${entry.name}' did not parse to an object; defaulting to {}.`);
								}
							} catch (parseErr) {
								console.warn(`LlmClient: failed to parse tool_use input JSON for tool '${entry.name}'; defaulting to {}.`, parseErr);
							}
						}
						yield { type: 'tool-call', id: entry.id, name: entry.name, input: parsedInput };
					}
				} else if (event.type === 'content_block_delta' && event.delta && typeof event.delta.text === 'string' && event.delta.text.length > 0) {
					const token = event.delta.text;
					fullText += token;
					yield { type: 'token', token };
				} else if (event.type === 'message_start' && event.message?.usage && typeof event.message.usage.input_tokens === 'number') {
					inputTokens = event.message.usage.input_tokens;
				} else if (event.type === 'message_delta') {
					if (event.usage && typeof event.usage.output_tokens === 'number') {
						outputTokens = event.usage.output_tokens;
					}
					if (event.delta && typeof event.delta.stop_reason === 'string') {
						stopReason = event.delta.stop_reason;
					}
				}
			}

			// Bedrock's streaming response surfaces no cached-token signal as of
			// late-2024 — leave at 0 to match the OpenAI / Foundry paths.
			this.totalInputTokens += inputTokens;
			this.totalOutputTokens += outputTokens;

			yield {
				type: 'complete',
				fullText,
				inputTokens,
				outputTokens,
				cachedTokens: 0,
				cacheCreationTokens: 0,
				cacheReadTokens: 0,
				stopReason,
			};
		} catch (err) {
			if (options.signal?.aborted) {
				yield { type: 'error', error: 'Request cancelled.' };
			} else {
				yield { type: 'error', error: this.mapNetworkError('bedrock', err) };
			}
		}
	}

	/**
	 * Google Gemini streaming implementation, targeting the consumer Gemini
	 * API endpoint (`generativelanguage.googleapis.com`) with API-key auth.
	 * Full Vertex AI (`aiplatform.googleapis.com` with ADC OAuth) is a
	 * deferred follow-up and is intentionally not handled here.
	 *
	 * Wire shape highlights:
	 *   - URL: `/v1beta/models/{modelId}:streamGenerateContent?alt=sse`
	 *   - Auth: `x-goog-api-key` header (avoids leaking the key in URL logs).
	 *   - Body: `contents` (with `role: 'user' | 'model'`), `systemInstruction`
	 *     as a top-level field (NOT inside `contents`), and `generationConfig`.
	 *   - Streaming: SSE chunks; each `data:` payload is a JSON object with
	 *     `candidates[0].content.parts[0].text` for token deltas, and a final
	 *     chunk carries `usageMetadata` for token accounting.
	 *   - Safety blocks surface as `finishReason: 'SAFETY'` and are mapped to
	 *     a user-facing error.
	 */
	private async *streamGoogle(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		const apiKey = await this.getGoogleApiKey();
		if (!apiKey) {
			yield {
				type: 'error',
				error: 'Google Gemini credentials not configured. Set sota.googleApiKey in settings, or GOOGLE_API_KEY / GEMINI_API_KEY env var.'
			};
			return;
		}

		const modelId = this.getGoogleModelInvocationId(options.model);
		if (!modelId) {
			yield {
				type: 'error',
				error: `Google Gemini model id not configured for '${options.model}'. Update sota.googleModelMap.`
			};
			return;
		}

		// Map our 'assistant' role to Gemini's 'model' role; everything else
		// stays 'user'. System prompt lives in a separate top-level field.
		const contents = options.messages.map(m => ({
			role: m.role === 'assistant' ? 'model' : 'user',
			parts: [{ text: m.content }],
		}));
		const body: Record<string, unknown> = {
			contents,
			systemInstruction: options.systemPrompt
				? { parts: [{ text: options.systemPrompt }] }
				: undefined,
			generationConfig: {
				maxOutputTokens: options.maxTokens ?? 4096,
			},
		};

		if (options.tools && options.tools.length > 0) {
			body.tools = [{
				functionDeclarations: options.tools.map(t => ({
					name: t.name,
					description: t.description,
					parameters: t.inputSchema,
				})),
			}];
		}

		const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:streamGenerateContent?alt=sse`;

		const headers: Record<string, string> = {
			'content-type': 'application/json',
			'x-goog-api-key': apiKey,
		};

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				signal: options.signal,
			});

			if (!response.ok) {
				const errBody = await this.readErrorBody(response);
				yield { type: 'error', error: this.mapProviderError('google', response.status, errBody) };
				return;
			}

			const reader = response.body?.getReader();
			if (!reader) {
				yield { type: 'error', error: 'Google Gemini returned an empty response body. Try again shortly.' };
				return;
			}

			const decoder = new TextDecoder();
			let fullText = '';
			let inputTokens = 0;
			let outputTokens = 0;
			// SSE events are separated by a blank line (\n\n). We accumulate raw
			// bytes into a buffer and slice off complete events as boundaries
			// appear; partial events stay in the buffer for the next read.
			let buffer = '';
			let toolCallIndex = 0;
			let sawFunctionCall = false;

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });

				let boundary = buffer.indexOf('\n\n');
				while (boundary !== -1) {
					const rawEvent = buffer.slice(0, boundary);
					buffer = buffer.slice(boundary + 2);
					boundary = buffer.indexOf('\n\n');

					// An SSE event may have multiple lines; we only care about
					// the `data:` line(s). Concatenate any data lines per event.
					let dataPayload = '';
					for (const line of rawEvent.split('\n')) {
						if (line.startsWith('data:')) {
							dataPayload += line.slice(5).trimStart();
						}
					}
					if (!dataPayload) {
						continue;
					}
					if (dataPayload === '[DONE]') {
						continue;
					}

					try {
						const event = JSON.parse(dataPayload);
						const candidate = event.candidates?.[0];
						const parts = candidate?.content?.parts;
						if (Array.isArray(parts)) {
							for (const part of parts) {
								if (part && typeof part.text === 'string' && part.text.length > 0) {
									const token = part.text;
									fullText += token;
									yield { type: 'token', token };
								}
								if (part && part.functionCall && typeof part.functionCall.name === 'string') {
									sawFunctionCall = true;
									const args = part.functionCall.args;
									const input: Record<string, unknown> = (args && typeof args === 'object' && !Array.isArray(args))
										? args as Record<string, unknown>
										: {};
									yield {
										type: 'tool-call',
										id: `gemini_call_${toolCallIndex++}`,
										name: part.functionCall.name,
										input,
									};
								}
							}
						}

						if (candidate?.finishReason === 'SAFETY') {
							yield { type: 'error', error: 'Google Gemini blocked the response for safety reasons.' };
							return;
						}

						if (event.usageMetadata) {
							const meta = event.usageMetadata;
							if (typeof meta.promptTokenCount === 'number') {
								inputTokens = meta.promptTokenCount;
							}
							if (typeof meta.candidatesTokenCount === 'number') {
								outputTokens = meta.candidatesTokenCount;
							}
						}
					} catch {
						// Skip malformed JSON payloads in the stream.
					}
				}
			}

			// Gemini exposes no cached-token signal on the consumer endpoint —
			// leave at 0 to match the OpenAI / Foundry / Bedrock paths.
			this.totalInputTokens += inputTokens;
			this.totalOutputTokens += outputTokens;

			yield {
				type: 'complete',
				fullText,
				inputTokens,
				outputTokens,
				cachedTokens: 0,
				cacheCreationTokens: 0,
				cacheReadTokens: 0,
				stopReason: sawFunctionCall ? 'tool_use' : undefined,
			};
		} catch (err) {
			if (options.signal?.aborted) {
				yield { type: 'error', error: 'Request cancelled.' };
			} else {
				yield { type: 'error', error: this.mapNetworkError('google', err) };
			}
		}
	}

	/**
	 * Non-streaming request. Collects all tokens and returns the full response.
	 */
	async request(options: LlmRequestOptions): Promise<string> {
		let result = '';
		for await (const event of this.streamRequest(options)) {
			if (event.type === 'token') {
				result += event.token;
			} else if (event.type === 'error') {
				throw new Error(event.error);
			}
		}
		return result;
	}

	getTokenUsage(): { input: number; output: number; cached: number } {
		return {
			input: this.totalInputTokens,
			output: this.totalOutputTokens,
			cached: this.totalCachedTokens,
		};
	}

	/**
	 * Estimate cost based on token usage. Pricing is per-model since each
	 * model has its own rates (and providers price differently). When usage
	 * is mixed across models, this is necessarily approximate — callers that
	 * need precise per-call cost should derive it at request time from the
	 * stream-complete event.
	 *
	 * Rates (USD per 1M tokens):
	 *   Anthropic (blended):    input $3.00, output $15.00
	 *   gpt-4o:                 input $2.50, output $10.00
	 *   gpt-4o-mini:            input $0.15, output $0.60
	 *   gpt-5-codex:            placeholder, uses gpt-4o rates
	 *   foundry-gpt-4o:         mirrors gpt-4o (best-effort; Foundry pricing varies by region and commitment tier)
	 *   foundry-gpt-4o-mini:    mirrors gpt-4o-mini (best-effort)
	 *   foundry-claude-sonnet:  mirrors Anthropic Sonnet (~$3 / $15 per Mtok, best-effort)
	 *   bedrock-claude-sonnet:  Anthropic public Bedrock pricing — input $3.00, output $15.00 per Mtok
	 *   bedrock-claude-haiku:   Anthropic public Bedrock pricing — input $0.80, output $4.00 per Mtok
	 *   gemini-1-5-pro:         input $1.25, output $5.00 per Mtok (lower-context tier; >128K context tier is $2.50 / $10.00 but is not auto-detected here)
	 *   gemini-1-5-flash:       input $0.075, output $0.30 per Mtok (lower-context tier; >128K context tier is $0.15 / $0.60 but is not auto-detected here)
	 *   gemini-2-0-flash:       input $0.10, output $0.40 per Mtok
	 */
	estimateCost(model?: ModelId): number {
		// Default to Anthropic blended rates if no model is supplied so existing
		// callers see no behavioural change.
		let inputCostPer1M = 3.0;
		let outputCostPer1M = 15.0;

		if (model) {
			switch (model) {
				case 'gpt-4o':
				case 'gpt-5-codex':
				case 'foundry-gpt-4o':
					inputCostPer1M = 2.5;
					outputCostPer1M = 10.0;
					break;
				case 'gpt-4o-mini':
				case 'foundry-gpt-4o-mini':
					inputCostPer1M = 0.15;
					outputCostPer1M = 0.60;
					break;
				case 'bedrock-claude-haiku':
					inputCostPer1M = 0.80;
					outputCostPer1M = 4.00;
					break;
				case 'gemini-1-5-pro':
					inputCostPer1M = 1.25;
					outputCostPer1M = 5.00;
					break;
				case 'gemini-1-5-flash':
					inputCostPer1M = 0.075;
					outputCostPer1M = 0.30;
					break;
				case 'gemini-2-0-flash':
					inputCostPer1M = 0.10;
					outputCostPer1M = 0.40;
					break;
				case 'opus':
				case 'sonnet':
				case 'haiku':
				case 'foundry-claude-sonnet':
				case 'bedrock-claude-sonnet':
				default:
					// Keep Anthropic blended defaults (Sonnet rates).
					break;
			}
		}

		return (this.totalInputTokens / 1_000_000) * inputCostPer1M +
			(this.totalOutputTokens / 1_000_000) * outputCostPer1M;
	}
}
