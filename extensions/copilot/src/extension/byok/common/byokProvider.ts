/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { Disposable, LanguageModelChatInformation, LanguageModelDataPart, LanguageModelTextPart, LanguageModelThinkingPart, LanguageModelToolCallPart, LanguageModelToolResultPart } from 'vscode';
import { CopilotToken } from '../../../platform/authentication/common/copilotToken';
import { EndpointEditToolName, IChatModelInformation, IChatModelRequestOptions, ModelSupportedEndpoint } from '../../../platform/endpoint/common/endpointProvider';
import { TokenizerType } from '../../../util/common/tokenizer';

export const enum BYOKAuthType {
	/**
	 * Requires a single API key for all models (e.g., OpenAI)
	 */
	GlobalApiKey,
	/**
	 * Requires both deployment URL and API key per model (e.g., Azure)
	 */
	PerModelDeployment,
	/**
	 * No authentication required (e.g., Ollama)
	 */
	None
}

interface BYOKBaseModelConfig {
	modelId: string;
	capabilities?: BYOKModelCapabilities;
}

export type LMResponsePart = LanguageModelTextPart | LanguageModelToolCallPart | LanguageModelDataPart | LanguageModelThinkingPart | LanguageModelToolResultPart;

export interface BYOKGlobalKeyModelConfig extends BYOKBaseModelConfig {
	apiKey: string;
}

export interface BYOKPerModelConfig extends BYOKBaseModelConfig {
	apiKey: string;
	deploymentUrl: string;
}

interface BYOKNoAuthModelConfig extends BYOKBaseModelConfig {
	// No additional fields required
}

export type BYOKModelConfig = BYOKGlobalKeyModelConfig | BYOKPerModelConfig | BYOKNoAuthModelConfig;

export interface BYOKModelCapabilities {
	name: string;
	url?: string;
	/**
	 * The maximum number of prompt (input) tokens. Optional when {@link contextWindow}
	 * is supplied, in which case it is derived as `contextWindow - maxOutputTokens`.
	 */
	maxInputTokens?: number;
	maxOutputTokens: number;
	/**
	 * The model's full context window (input + output) in tokens. Many providers
	 * publish this directly (e.g. "Context Length: 1M"). When set it is used as the
	 * source of truth for the context window; otherwise the window is derived as
	 * `maxInputTokens + maxOutputTokens` for backward compatibility.
	 */
	contextWindow?: number;
	toolCalling: boolean;
	vision: boolean;
	thinking?: boolean;
	adaptiveThinking?: boolean;
	streaming?: boolean;
	editTools?: EndpointEditToolName[];
	requestHeaders?: Record<string, string>;
	modelOptions?: IChatModelRequestOptions;
	supportedEndpoints?: ModelSupportedEndpoint[];
	zeroDataRetentionEnabled?: boolean;
	supportsReasoningEffort?: string[];
	/**
	 * Override the body shape used to forward the reasoning effort to the model.
	 * - `'chat-completions'`: top-level `reasoning_effort` (default for `/chat/completions`).
	 * - `'responses'`: nested `reasoning.effort` (default for `/responses`).
	 * If unset the format is inferred from whether the endpoint uses the Responses API.
	 */
	reasoningEffortFormat?: 'chat-completions' | 'responses';
}

export interface BYOKModelRegistry {
	readonly name: string;
	readonly authType: BYOKAuthType;
	updateKnownModelsList(knownModels: BYOKKnownModels | undefined): void;
	getAllModels(apiKey?: string): Promise<{ id: string; name: string }[]>;
	registerModel(config: BYOKModelConfig): Promise<Disposable>;
}

// Many model providers don't have robust model lists. This allows us to map id -> information about models, and then if we don't know the model just let the user enter a custom id
export type BYOKKnownModels = Record<string, BYOKModelCapabilities>;

// Type guards to ensure correct config type
export function isGlobalKeyConfig(config: BYOKModelConfig): config is BYOKGlobalKeyModelConfig {
	return 'apiKey' in config && !('deploymentUrl' in config);
}

export function isPerModelConfig(config: BYOKModelConfig): config is BYOKPerModelConfig {
	return 'apiKey' in config && 'deploymentUrl' in config;
}

export function isNoAuthConfig(config: BYOKModelConfig): config is BYOKNoAuthModelConfig {
	return !('apiKey' in config) && !('deploymentUrl' in config);
}

/**
 * Resolves a model's token limits from its BYOK capabilities, honoring an explicit
 * {@link BYOKModelCapabilities.contextWindow} when provided.
 *
 * - When `contextWindow` is set it is the source of truth for the full window and, if
 *   `maxInputTokens` is omitted, the prompt budget is derived as
 *   `contextWindow - maxOutputTokens`.
 * - Otherwise the window falls back to `maxInputTokens + maxOutputTokens` for backward
 *   compatibility.
 *
 * The returned limits are always internally consistent: `maxOutputTokens` is clamped so
 * it never exceeds the context window, and `maxInputTokens` is clamped to the remaining
 * budget (`contextWindow - maxOutputTokens`). This prevents invalid combinations such as
 * `maxOutputTokens > contextWindow`, or a `maxInputTokens` supplied alongside a smaller
 * `contextWindow` overflowing the window.
 */
export function resolveModelTokenLimits(capabilities: Pick<BYOKModelCapabilities, 'maxInputTokens' | 'maxOutputTokens' | 'contextWindow'>): { contextWindow: number; maxInputTokens: number; maxOutputTokens: number } {
	const contextWindow = capabilities.contextWindow ?? ((capabilities.maxInputTokens ?? 0) + capabilities.maxOutputTokens);
	// The output budget can never exceed the full window.
	const maxOutputTokens = Math.min(capabilities.maxOutputTokens, contextWindow);
	// The prompt budget is whatever remains after the output reservation; an explicitly
	// provided maxInputTokens is clamped to that remaining budget.
	const remainingInputBudget = Math.max(0, contextWindow - maxOutputTokens);
	const maxInputTokens = Math.min(capabilities.maxInputTokens ?? remainingInputBudget, remainingInputBudget);
	return { contextWindow, maxInputTokens, maxOutputTokens };
}

export function resolveModelInfo(modelId: string, providerName: string, knownModels: BYOKKnownModels | undefined, modelCapabilities?: BYOKModelCapabilities): IChatModelInformation {
	// Model Capabilities are something the user has decided on so those take precedence, then we rely on known model info, then defaults.
	let knownModelInfo = modelCapabilities;
	if (knownModels && !knownModelInfo) {
		knownModelInfo = knownModels[modelId];
	}
	const modelName = knownModelInfo?.name || modelId;
	const limits = knownModelInfo
		? resolveModelTokenLimits(knownModelInfo)
		: { contextWindow: 128000, maxInputTokens: 100000, maxOutputTokens: 8192 };
	const modelInfo: IChatModelInformation = {
		id: modelId,
		name: modelName,
		vendor: providerName,
		version: '1.0.0',
		capabilities: {
			type: 'chat',
			family: modelId,
			supports: {
				streaming: knownModelInfo?.streaming ?? true,
				tool_calls: !!knownModelInfo?.toolCalling,
				vision: !!knownModelInfo?.vision,
				thinking: !!knownModelInfo?.thinking,
				adaptive_thinking: !!knownModelInfo?.adaptiveThinking,
				reasoning_effort: knownModelInfo?.supportsReasoningEffort
			},
			tokenizer: TokenizerType.O200K,
			limits: {
				max_context_window_tokens: limits.contextWindow,
				max_prompt_tokens: limits.maxInputTokens,
				max_output_tokens: limits.maxOutputTokens
			}
		},
		is_chat_default: false,
		is_chat_fallback: false,
		model_picker_enabled: true,
		supported_endpoints: knownModelInfo?.supportedEndpoints,
		zeroDataRetentionEnabled: knownModelInfo?.zeroDataRetentionEnabled,
		modelOptions: knownModelInfo?.modelOptions,
		reasoningEffortFormat: knownModelInfo?.reasoningEffortFormat
	};
	if (knownModelInfo?.requestHeaders && Object.keys(knownModelInfo.requestHeaders).length > 0) {
		modelInfo.requestHeaders = { ...knownModelInfo.requestHeaders };
	}
	return modelInfo;
}

export function byokKnownModelsToAPIInfo(providerName: string, knownModels: BYOKKnownModels | undefined): LanguageModelChatInformation[] {
	if (!knownModels) {
		return [];
	}
	return Object.entries(knownModels).map(([id, capabilities]) => byokKnownModelToAPIInfo(providerName, id, capabilities));
}

export function byokKnownModelToAPIInfo(providerName: string, id: string, capabilities: BYOKModelCapabilities): LanguageModelChatInformation {
	const limits = resolveModelTokenLimits(capabilities);
	return {
		id,
		name: capabilities.name,
		version: '1.0.0',
		maxOutputTokens: limits.maxOutputTokens,
		maxInputTokens: limits.maxInputTokens,
		// `detail` is intentionally omitted: when this model is resolved
		// via a configured provider group, `LanguageModelsService` will
		// fall back to the group name so multiple instances of the same
		// vendor (e.g. multiple Ollama servers) are distinguishable in
		// the model picker.
		family: id,
		tooltip: `${capabilities.name} is contributed via the ${providerName} provider.`,
		multiplierNumeric: undefined,
		isUserSelectable: true,
		capabilities: {
			toolCalling: capabilities.toolCalling,
			imageInput: capabilities.vision,
			editTools: capabilities.editTools,
		},
	};
}

/**
 * Signed-out users are allowed; signed-in users without a Copilot token (e.g. enterprise-managed errors) are denied to avoid bypassing policy.
 */
export function isClientBYOKAllowed(hasGitHubSession: boolean, copilotToken: Omit<CopilotToken, 'token'> | undefined): boolean {
	if (!hasGitHubSession) {
		return true;
	}
	if (!copilotToken) {
		return false;
	}
	return copilotToken.isInternal || copilotToken.isIndividual || copilotToken.isClientBYOKEnabled();
}

/**
 * Result of handling an API key update operation.
 */
export interface HandleAPIKeyUpdateResult {
	/**
	 * The new API key value, or undefined if the key was deleted or operation was cancelled.
	 */
	apiKey: string | undefined;
	/**
	 * Whether the API key was deleted (user entered empty string during reconfigure).
	 */
	deleted: boolean;
	/**
	 * Whether the operation was cancelled (user dismissed the input).
	 */
	cancelled: boolean;
}

/**
 * Storage service interface for BYOK API key operations.
 * This is a minimal interface to avoid importing the full IBYOKStorageService in common code.
 */
export interface IBYOKStorageServiceLike {
	getAPIKey(providerName: string, modelId?: string): Promise<string | undefined>;
	storeAPIKey(providerName: string, apiKey: string, authType: BYOKAuthType, modelId?: string): Promise<void>;
	deleteAPIKey(providerName: string, authType: BYOKAuthType, modelId?: string): Promise<void>;
}

/**
 * Handles API key update flow for BYOK providers using a consistent pattern.
 * This utility handles all three cases from promptForAPIKey:
 * - undefined: user cancelled/dismissed the input
 * - empty string: user wants to delete the saved key (only when reconfiguring)
 * - non-empty string: user provided a new API key
 *
 * @param providerName - Name of the provider (e.g., 'Anthropic', 'Gemini')
 * @param storageService - Storage service for API key operations
 * @param promptForAPIKeyFn - Function to prompt user for API key
 * @returns Result containing the new API key (if any) and status flags
 */
export async function handleAPIKeyUpdate(
	providerName: string,
	storageService: IBYOKStorageServiceLike,
	promptForAPIKeyFn: (providerName: string, reconfigure: boolean) => Promise<string | undefined>
): Promise<HandleAPIKeyUpdateResult> {
	const existingKey = await storageService.getAPIKey(providerName);
	const isReconfiguring = existingKey !== undefined;

	const newAPIKey = await promptForAPIKeyFn(providerName, isReconfiguring);

	if (newAPIKey === undefined) {
		// User cancelled/dismissed the input
		return { apiKey: undefined, deleted: false, cancelled: true };
	} else if (newAPIKey === '') {
		// User wants to delete the key (only valid when reconfiguring)
		await storageService.deleteAPIKey(providerName, BYOKAuthType.GlobalApiKey);
		return { apiKey: undefined, deleted: true, cancelled: false };
	} else {
		// User provided a new API key
		await storageService.storeAPIKey(providerName, newAPIKey, BYOKAuthType.GlobalApiKey);
		return { apiKey: newAPIKey, deleted: false, cancelled: false };
	}
}
