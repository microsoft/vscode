/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { ILogService } from '../../../../platform/log/common/logService';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { createServiceIdentifier } from '../../../../util/common/services';
import { Emitter } from '../../../../util/vs/base/common/event';
import { Disposable } from '../../../../util/vs/base/common/lifecycle';
import type { ParsedClaudeModelId } from '../common/claudeModelId';
import { tryParseClaudeModelId } from './claudeModelId';

export interface IClaudeCodeModels {
	readonly _serviceBrand: undefined;
	/**
	 * Resolves a Claude endpoint for the given requested model ID.
	 * Falls back to the fallback model ID if the requested model doesn't match,
	 * then to the newest Sonnet, newest Haiku, or any Claude endpoint.
	 * Returns `undefined` if no Claude endpoint can be found.
	 */
	resolveEndpoint(requestedModel: string | undefined, fallbackModelId: ParsedClaudeModelId | undefined): Promise<IChatEndpoint | undefined>;
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
				targetChatSessionType: 'claude-code'
			};
		});
	}

	public async resolveEndpoint(requestedModel: string | undefined, fallbackModelId: ParsedClaudeModelId | undefined): Promise<IChatEndpoint | undefined> {
		const endpoints = await this._getEndpoints();

		// 1. Exact match for the requested model
		if (requestedModel) {
			const mappedModel = tryParseClaudeModelId(requestedModel)?.toEndpointModelId() ?? requestedModel;
			const exact = endpoints.find(e => e.family === mappedModel || e.model === mappedModel);
			if (exact) {
				return exact;
			}
		}

		// 2. Exact match for the fallback model from session state
		if (fallbackModelId) {
			const fallback = endpoints.find(e => e.model === fallbackModelId.toEndpointModelId());
			if (fallback) {
				return fallback;
			}
		}

		// 3. Newest Sonnet (endpoints are sorted by name descending)
		const sonnet = endpoints.find(e => e.family?.includes('sonnet') || e.model.includes('sonnet'));
		if (sonnet) {
			return sonnet;
		}

		// 4. Newest Haiku
		const haiku = endpoints.find(e => e.family?.includes('haiku') || e.model.includes('haiku'));
		if (haiku) {
			return haiku;
		}

		// 5. Any model (these are already only Anthropic models)
		return endpoints[0];
	}

	private async _fetchAvailableEndpoints(): Promise<IChatEndpoint[]> {
		try {
			const endpoints = await this.endpointProvider.getAllChatEndpoints();

			// Filter for Anthropic models that are available in the model picker
			// and use the Messages API (required for Claude Code)
			const claudeEndpoints = endpoints.filter(e =>
				e.supportsToolCalls &&
				e.showInModelPicker &&
				e.modelProvider === 'Anthropic' &&
				e.apiType === 'messages'
			);

			if (claudeEndpoints.length === 0) {
				this.logService.trace('[ClaudeCodeModels] No Anthropic models with Messages API found');
				return [];
			}

			return claudeEndpoints.sort((a, b) => b.name.localeCompare(a.name));
		} catch (ex) {
			this.logService.error(`[ClaudeCodeModels] Failed to fetch models`, ex);
			return [];
		}
	}
}
