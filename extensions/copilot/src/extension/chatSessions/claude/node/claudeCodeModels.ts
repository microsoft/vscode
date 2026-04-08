/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { ILogService } from '../../../../platform/log/common/logService';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { createServiceIdentifier } from '../../../../util/common/services';
import { Emitter } from '../../../../util/vs/base/common/event';
import { Disposable } from '../../../../util/vs/base/common/lifecycle';

const CLAUDE_CODE_MODEL_MEMENTO_KEY = 'github.copilot.claudeCode.sessionModel';

/** Error thrown when no Claude models with Messages API are available */
export class NoClaudeModelsAvailableError extends Error {
	constructor() {
		super('Claude Code is not available. No Claude models with Messages API support were found.');
		this.name = 'NoClaudeModelsAvailableError';
	}
}

export interface ClaudeCodeModelInfo {
	id: string;
	name: string;
	multiplier?: number;
}

export interface IClaudeCodeModels {
	readonly _serviceBrand: undefined;
	/**
	 * Gets the default Claude model.
	 * @throws {NoClaudeModelsAvailableError} if no Claude models with Messages API are available
	 */
	getDefaultModel(): Promise<string>;
	setDefaultModel(modelId: string | undefined): Promise<void>;
	getModels(): Promise<ClaudeCodeModelInfo[]>;
	/**
	 * Gets the filtered list of Claude chat endpoints that support the Messages API.
	 */
	getEndpoints(): Promise<IChatEndpoint[]>;
	/**
	 * Maps an SDK model ID to the best matching endpoint model ID.
	 * SDK model IDs are raw Anthropic API model IDs (e.g., 'claude-opus-4-5-20251101').
	 * Returns undefined if no suitable match is found.
	 */
	mapSdkModelToEndpointModel(sdkModelId: string): Promise<string | undefined>;
	/**
	 * Registers a LanguageModelChatProvider so that Claude models appear in
	 * VS Code's built-in model picker for the claude-code session type.
	 */
	registerLanguageModelChatProvider(lm: typeof vscode['lm']): void;
}

export const IClaudeCodeModels = createServiceIdentifier<IClaudeCodeModels>('IClaudeCodeModels');

export class ClaudeCodeModels extends Disposable implements IClaudeCodeModels {
	declare _serviceBrand: undefined;
	private _cachedEndpoints: Promise<IChatEndpoint[]> | undefined;
	private readonly _onDidChange = this._register(new Emitter<void>());

	constructor(
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IVSCodeExtensionContext private readonly extensionContext: IVSCodeExtensionContext,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._register(this.endpointProvider.onDidModelsRefresh(() => {
			this._cachedEndpoints = undefined;
			this._onDidChange.fire();
		}));
	}

	public registerLanguageModelChatProvider(lm: typeof vscode['lm']): void {
		const provider: vscode.LanguageModelChatProvider = {
			onDidChangeLanguageModelChatInformation: this._onDidChange.event,
			provideLanguageModelChatInformation: async (_options, _token) => {
				return this._provideLanguageModelChatInfo();
			},
			provideLanguageModelChatResponse: async (_model, _messages, _options, _progress, _token) => {
				// Implemented via chat participants.
			},
			provideTokenCount: async (_model, _text, _token) => {
				// Token counting is not currently supported for the claude provider.
				return 0;
			}
		};
		this._register(lm.registerLanguageModelChatProvider('claude-code', provider));

		void this._getEndpoints().then(() => this._onDidChange.fire());
	}

	private _getEndpoints(): Promise<IChatEndpoint[]> {
		if (!this._cachedEndpoints) {
			this._cachedEndpoints = this._fetchAvailableEndpoints();
		}
		return this._cachedEndpoints;
	}

	private async _provideLanguageModelChatInfo(): Promise<vscode.LanguageModelChatInformation[]> {
		const endpoints = await this._getEndpoints();
		// const defaultModelId = await this.getDefaultModel().catch(() => undefined);
		return endpoints.map(endpoint => {
			const multiplier = endpoint.multiplier === undefined ? undefined : `${endpoint.multiplier}x`;
			return {
				id: endpoint.model,
				name: endpoint.name,
				family: endpoint.family,
				version: endpoint.version,
				maxInputTokens: endpoint.modelMaxPromptTokens,
				maxOutputTokens: endpoint.maxOutputTokens,
				multiplier,
				multiplierNumeric: endpoint.multiplier,
				isUserSelectable: true,
				capabilities: {
					imageInput: endpoint.supportsVision,
					toolCalling: endpoint.supportsToolCalls,
					editTools: endpoint.supportedEditTools ? [...endpoint.supportedEditTools] : undefined,
				},
				targetChatSessionType: 'claude-code',
				// isDefault: endpoint.model === defaultModelId,
			};
		});
	}

	public async getDefaultModel(): Promise<string> {
		const models = await this.getModels();
		if (!models.length) {
			throw new NoClaudeModelsAvailableError();
		}

		// Get preferred model from stored preference
		const preferredModelId = this.extensionContext.globalState.get<string>(CLAUDE_CODE_MODEL_MEMENTO_KEY)?.trim()?.toLowerCase();

		if (preferredModelId) {
			const matchedModel = models.find(m => m.id.toLowerCase() === preferredModelId);
			if (matchedModel) {
				return matchedModel.id;
			}
		}

		// Return the latest Sonnet as the default model, or fall back to the first available model
		const defaultModel = models.find(m => m.id.toLowerCase().includes('sonnet') || m.name.toLowerCase().includes('sonnet'));
		return defaultModel?.id ?? models[0].id;
	}

	public async setDefaultModel(modelId: string | undefined): Promise<void> {
		await this.extensionContext.globalState.update(CLAUDE_CODE_MODEL_MEMENTO_KEY, modelId);
	}

	public async getModels(): Promise<ClaudeCodeModelInfo[]> {
		const endpoints = await this._getEndpoints();
		return endpoints.map(e => ({ id: e.model, name: e.name, multiplier: e.multiplier }));
	}

	public async getEndpoints(): Promise<IChatEndpoint[]> {
		return this._getEndpoints();
	}

	private async _fetchAvailableEndpoints(): Promise<IChatEndpoint[]> {
		try {
			const endpoints = await this.endpointProvider.getAllChatEndpoints();

			// Filter for Claude/Anthropic models that are available in the model picker
			// and use the Messages API (required for Claude Code)
			const claudeEndpoints = endpoints.filter(e =>
				e.supportsToolCalls &&
				e.showInModelPicker &&
				(e.family?.toLowerCase().includes('claude') || e.model?.toLowerCase().includes('claude')) &&
				e.apiType === 'messages'
			);

			if (claudeEndpoints.length === 0) {
				this.logService.trace('[ClaudeCodeModels] No Claude models with Messages API found');
				return [];
			}

			return claudeEndpoints.sort((a, b) => b.name.localeCompare(a.name));
		} catch (ex) {
			this.logService.error(`[ClaudeCodeModels] Failed to fetch models`, ex);
			return [];
		}
	}

	public async mapSdkModelToEndpointModel(sdkModelId: string): Promise<string | undefined> {
		const models = await this.getModels();

		// Try exact match first
		const exactMatch = models.find(m => m.id === sdkModelId);
		if (exactMatch) {
			return exactMatch.id;
		}

		// Try case-insensitive match
		const sdkModelLower = sdkModelId.toLowerCase();
		const caseInsensitiveMatch = models.find(m => m.id.toLowerCase() === sdkModelLower);
		if (caseInsensitiveMatch) {
			return caseInsensitiveMatch.id;
		}

		// Normalize SDK model ID to extract family and version
		const normalized = this._normalizeSdkModelId(sdkModelId);
		if (!normalized) {
			return undefined;
		}

		// Find models with the same family
		const familyMatches = models.filter(m => {
			const modelNormalized = this._normalizeSdkModelId(m.id);
			return modelNormalized?.family === normalized.family;
		});

		if (familyMatches.length === 0) {
			return undefined;
		}

		// Among family matches, prefer exact version match
		const versionMatch = familyMatches.find(m => {
			const modelNormalized = this._normalizeSdkModelId(m.id);
			return modelNormalized?.version === normalized.version;
		});

		if (versionMatch) {
			return versionMatch.id;
		}

		// Fall back to the first (latest) model in the family
		return familyMatches[0].id;
	}

	/**
	 * Normalizes an SDK model ID to extract the model family and version.
	 * Examples:
	 * - "claude-opus-4-5-20251101" -> { family: "opus", version: "4.5" }
	 * - "claude-3-5-sonnet-20241022" -> { family: "sonnet", version: "3.5" }
	 * - "claude-sonnet-4-20250514" -> { family: "sonnet", version: "4" }
	 * - "claude-haiku-3-5-20250514" -> { family: "haiku", version: "3.5" }
	 * - "claude-haiku-4.5" -> { family: "haiku", version: "4.5" }
	 */
	private _normalizeSdkModelId(sdkModelId: string): { family: string; version: string } | undefined {
		const lower = sdkModelId.toLowerCase();

		// Strip date suffix (8 digits at the end)
		const withoutDate = lower.replace(/-\d{8}$/, '');

		// Pattern 1: claude-{family}-{major}-{minor} (e.g., claude-opus-4-5, claude-haiku-3-5)
		const pattern1 = withoutDate.match(/^claude-(\w+)-(\d+)-(\d+)$/);
		if (pattern1) {
			return { family: pattern1[1], version: `${pattern1[2]}.${pattern1[3]}` };
		}

		// Pattern 2: claude-{major}-{minor}-{family} (e.g., claude-3-5-sonnet)
		const pattern2 = withoutDate.match(/^claude-(\d+)-(\d+)-(\w+)$/);
		if (pattern2) {
			return { family: pattern2[3], version: `${pattern2[1]}.${pattern2[2]}` };
		}

		// Pattern 3: claude-{family}-{major}.{minor} (e.g., claude-haiku-4.5)
		const pattern3 = withoutDate.match(/^claude-(\w+)-(\d+)\.(\d+)$/);
		if (pattern3) {
			return { family: pattern3[1], version: `${pattern3[2]}.${pattern3[3]}` };
		}

		// Pattern 4: claude-{family}-{major} (e.g., claude-sonnet-4)
		const pattern4 = withoutDate.match(/^claude-(\w+)-(\d+)$/);
		if (pattern4) {
			return { family: pattern4[1], version: pattern4[2] };
		}

		// Pattern 5: claude-{major}-{family} (e.g., claude-3-opus)
		const pattern5 = withoutDate.match(/^claude-(\d+)-(\w+)$/);
		if (pattern5) {
			return { family: pattern5[2], version: pattern5[1] };
		}

		return undefined;
	}
}
