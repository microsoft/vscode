/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

interface LMStudioModelsResponse {
	data?: Array<{ id?: string }>;
	models?: Array<{ id?: string }>;
}

interface LMStudioChatCompletionRequest {
	model: string;
	messages: Array<{
		role: 'system' | 'user' | 'assistant' | 'tool';
		content: string;
	}>;
	temperature?: number;
	max_tokens?: number;
	stream?: boolean;
}

interface LMStudioChatCompletionResponse {
	choices?: Array<{
		message?: {
			content?: string;
		};
	}>;
}

export class LMStudioLMProvider implements vscode.LanguageModelChatProvider, vscode.Disposable {
	private readonly _onDidChangeLanguageModelChatInformation = new vscode.EventEmitter<void>();
	private readonly _disposables: vscode.Disposable[] = [];
	private _cachedModels: vscode.LanguageModelChatInformation[] = [];
	private _modelsFetchedAt = 0;
	private readonly _cacheDuration = 5 * 60 * 1000;

	readonly onDidChangeLanguageModelChatInformation = this._onDidChangeLanguageModelChatInformation.event;

	constructor() {
		this._disposables.push(vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('lmstudioByok.endpoint') || event.affectsConfiguration('chat.byok.lmstudioEndpoint')) {
				this._cachedModels = [];
				this._modelsFetchedAt = 0;
				this._onDidChangeLanguageModelChatInformation.fire();
			}
		}));
	}

	async provideLanguageModelChatInformation(
		_options: vscode.PrepareLanguageModelChatModelOptions,
		token: vscode.CancellationToken
	): Promise<vscode.LanguageModelChatInformation[]> {
		const now = Date.now();
		if (this._cachedModels.length > 0 && now - this._modelsFetchedAt < this._cacheDuration) {
			return this._cachedModels;
		}

		const endpoint = this.getEndpoint();
		const controller = new AbortController();
		const cancellation = token.onCancellationRequested(() => controller.abort());

		try {
			const response = await fetch(`${endpoint}/models`, {
				method: 'GET',
				headers: { 'Content-Type': 'application/json' },
				signal: controller.signal
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			const data = await response.json() as LMStudioModelsResponse;
			const models = data.data ?? data.models ?? [];

			this._cachedModels = models
				.filter((model): model is { id: string } => typeof model.id === 'string' && model.id.length > 0)
				.map(model => ({
					id: model.id,
					name: model.id,
					family: 'lmstudio',
					version: '1.0.0',
					maxInputTokens: 32768,
					maxOutputTokens: 4096,
					capabilities: {
						toolCalling: false
					},
					detail: endpoint,
					tooltip: `LM Studio model ${model.id}`
				}));

			this._modelsFetchedAt = now;
			return this._cachedModels;
		} catch (error) {
			if (token.isCancellationRequested) {
				return [];
			}
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Failed to fetch models from LM Studio at ${endpoint}: ${message}`);
		} finally {
			cancellation.dispose();
		}
	}

	async provideLanguageModelChatResponse(
		model: vscode.LanguageModelChatInformation,
		messages: readonly vscode.LanguageModelChatRequestMessage[],
		_options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken
	): Promise<void> {
		const endpoint = this.getEndpoint();
		const controller = new AbortController();
		const cancellation = token.onCancellationRequested(() => controller.abort());

		try {
			const response = await fetch(`${endpoint}/chat/completions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: model.id,
					messages: messages.map(message => this.toOpenAIMessage(message)),
					stream: false
				} satisfies LMStudioChatCompletionRequest),
				signal: controller.signal
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`HTTP ${response.status}: ${errorText}`);
			}

			const data = await response.json() as LMStudioChatCompletionResponse;
			const content = data.choices?.[0]?.message?.content;
			if (!content) {
				throw new Error('LM Studio returned no response content');
			}

			for (const chunk of this.chunkText(content)) {
				if (token.isCancellationRequested) {
					return;
				}
				progress.report(new vscode.LanguageModelTextPart(chunk));
			}
		} catch (error) {
			if (token.isCancellationRequested) {
				return;
			}
			if (error instanceof DOMException && error.name === 'AbortError') {
				return;
			}
			throw error;
		} finally {
			cancellation.dispose();
		}
	}

	async provideTokenCount(
		_model: vscode.LanguageModelChatInformation,
		text: string | vscode.LanguageModelChatRequestMessage,
		_token: vscode.CancellationToken
	): Promise<number> {
		const value = typeof text === 'string' ? text : this.flattenMessageContent(text.content);
		return Math.max(1, Math.ceil(value.length / 4));
	}

	dispose(): void {
		for (const disposable of this._disposables) {
			disposable.dispose();
		}
		this._onDidChangeLanguageModelChatInformation.dispose();
	}

	private getEndpoint(): string {
		const configuration = vscode.workspace.getConfiguration();
		const endpoint = configuration.get<string>('lmstudioByok.endpoint')
			?? configuration.get<string>('chat.byok.lmstudioEndpoint')
			?? 'http://localhost:1234/v1';
		return this.normalizeEndpoint(endpoint);
	}

	private normalizeEndpoint(endpoint: string): string {
		let normalized = endpoint.trim();
		if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
			normalized = `http://${normalized}`;
		}
		if (normalized.endsWith('/')) {
			normalized = normalized.slice(0, -1);
		}
		return normalized;
	}

	private toOpenAIMessage(
		message: vscode.LanguageModelChatRequestMessage
	): { role: 'system' | 'user' | 'assistant' | 'tool'; content: string } {
		let role: 'system' | 'user' | 'assistant' | 'tool';
		switch (message.role) {
			case vscode.LanguageModelChatMessageRole.System:
				role = 'system';
				break;
			case vscode.LanguageModelChatMessageRole.User:
				role = 'user';
				break;
			case vscode.LanguageModelChatMessageRole.Assistant:
				role = 'assistant';
				break;
			default:
				throw new Error(`Unsupported chat message role: ${message.role}`);
		}

		return {
			role,
			content: this.flattenMessageContent(message.content)
		};
	}

	private flattenMessageContent(parts: readonly (vscode.LanguageModelInputPart | unknown)[]): string {
		return parts
			.map(part => part instanceof vscode.LanguageModelTextPart ? part.value : '')
			.join('');
	}

	private chunkText(text: string): string[] {
		const chunks: string[] = [];
		const chunkSize = 256;
		for (let index = 0; index < text.length; index += chunkSize) {
			chunks.push(text.slice(index, index + chunkSize));
		}
		return chunks;
	}
}
