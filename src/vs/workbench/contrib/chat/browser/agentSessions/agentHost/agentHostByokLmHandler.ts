/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import {
	IAgentHostByokLmHandler,
	IByokLmChatMessage,
	IByokLmChatRequest,
	IByokLmChatResult,
	IByokLmModelInfo,
	IByokLmThinkingPart,
	IByokLmToolCall,
} from '../../../../../../platform/agentHost/common/agentHostByokLm.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import {
	ChatMessageRole,
	IChatMessage,
	IChatMessagePart,
	IChatMessageThinkingPart,
	IChatResponseThinkingPart,
	ILanguageModelChatRequestOptions,
	ILanguageModelsService,
} from '../../../common/languageModels.js';

/**
 * Renderer-side {@link IAgentHostByokLmHandler}. Services BYOK chat requests
 * forwarded by the node agent host's OpenAI proxy by calling the VS Code LM
 * API for the matching extension-registered model.
 *
 * The bridge DTOs are plain/serializable; this class is the single place that
 * translates them to and from the `workbench/contrib/chat` LM types.
 */
export class AgentHostByokLmHandler extends Disposable implements IAgentHostByokLmHandler {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeModels = this._register(new Emitter<void>());
	/** Fires when the renderer's BYOK models change, so the node agent host re-enumerates. */
	readonly onDidChangeModels = this._onDidChangeModels.event;

	constructor(
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		// Re-emit (debounced) whenever the renderer's language models change, so the
		// agent host can refresh its BYOK model list — extension-provided BYOK models
		// often register shortly after the bridge connects.
		this._register(Event.debounce(this._languageModelsService.onDidChangeLanguageModels, () => undefined, 500)(() => {
			this._onDidChangeModels.fire();
		}));
	}

	async chat(request: IByokLmChatRequest, token: CancellationToken): Promise<IByokLmChatResult> {
		const modelIdentifier = this._resolveModelIdentifier(request.vendor, request.modelId);
		if (!modelIdentifier) {
			return { content: '', error: `No BYOK model found for ${request.vendor}/${request.modelId}` };
		}

		const messages = request.messages.map(message => this._toChatMessage(message));
		const tools = request.tools?.length
			? request.tools.map(tool => ({
				name: tool.name,
				description: tool.description ?? '',
				inputSchema: tool.parametersSchema,
			}))
			: undefined;
		const options: ILanguageModelChatRequestOptions = {
			modelOptions: request.modelOptions,
			...(tools ? { tools } : {}),
		};

		try {
			const response = await this._languageModelsService.sendChatRequest(modelIdentifier, undefined, messages, options, token);

			let content = '';
			const toolCalls: IByokLmToolCall[] = [];
			// Buffer `thinking` parts onto the tool call they precede for replay;
			// thinking that precedes no tool call is dropped.
			let pendingThinking: IByokLmThinkingPart[] = [];
			const streaming = (async () => {
				for await (const part of response.stream) {
					const parts = Array.isArray(part) ? part : [part];
					for (const p of parts) {
						if (p.type === 'text') {
							content += p.value;
						} else if (p.type === 'thinking') {
							this._appendThinking(pendingThinking, this._toThinkingPart(p));
						} else if (p.type === 'tool_use') {
							toolCalls.push({
								id: p.toolCallId,
								name: p.name,
								argumentsJson: JSON.stringify(p.parameters ?? {}),
								...(pendingThinking.length ? { continuationParts: pendingThinking } : {}),
							});
							pendingThinking = [];
						}
					}
				}
			})();

			await Promise.all([response.result, streaming]);
			return { content, toolCalls: toolCalls.length ? toolCalls : undefined };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this._logService.warn(`[AgentHostByokLmHandler] chat request failed for ${request.vendor}/${request.modelId}: ${message}`);
			return { content: '', error: message };
		}
	}

	async listModels(_token: CancellationToken): Promise<IByokLmModelInfo[]> {
		const models: IByokLmModelInfo[] = [];
		for (const identifier of this._languageModelsService.getLanguageModelIds()) {
			const metadata = this._languageModelsService.lookupLanguageModel(identifier);
			// Only genuine renderer BYOK models — exclude agent-host copies, which
			// carry a `targetChatSessionType` and would otherwise re-enter the bridge.
			if (metadata?.isBYOK && !metadata.targetChatSessionType) {
				models.push({
					vendor: metadata.vendor,
					id: metadata.id,
					name: metadata.name,
					modelIdentifier: identifier,
					maxContextWindowTokens: metadata.maxInputTokens + metadata.maxOutputTokens,
					supportsVision: !!metadata.capabilities?.vision,
				});
			}
		}
		return models;
	}

	/**
	 * Find the LM API identifier for a BYOK model addressed by its vendor and
	 * provider-local id (the `provider/id` selection id the picker surfaced).
	 */
	private _resolveModelIdentifier(vendor: string, modelId: string): string | undefined {
		for (const identifier of this._languageModelsService.getLanguageModelIds()) {
			const metadata = this._languageModelsService.lookupLanguageModel(identifier);
			if (metadata?.isBYOK && metadata.vendor === vendor && metadata.id === modelId) {
				return identifier;
			}
		}
		return undefined;
	}

	private _toChatMessage(message: IByokLmChatMessage): IChatMessage {
		// A tool-result message carries its payload solely in the `tool_result`
		// part — the renderer/extension turns that into a wire `role: 'tool'`
		// message on its own. Emit it and return early so the shared text branch
		// below doesn't also inject a duplicate `role: 'user'` copy of the output.
		// Tool messages that lack a `toolCallId` fall through to the plain text branch.
		if (message.role === 'tool' && message.toolCallId) {
			return {
				role: ChatMessageRole.User,
				content: [{ type: 'tool_result', toolCallId: message.toolCallId, value: [{ type: 'text', value: message.content }] }],
			};
		}

		const content: IChatMessagePart[] = [];

		if (message.role === 'assistant' && message.toolCalls?.length) {
			// Anthropic-style providers require thinking to lead the turn: emit
			// all continuation thinking first, then text, then the tool calls.
			for (const call of message.toolCalls) {
				for (const part of call.continuationParts ?? []) {
					content.push(this._toThinkingMessagePart(part));
				}
			}
			if (message.content) {
				content.push({ type: 'text', value: message.content });
			}
			for (const call of message.toolCalls) {
				content.push({
					type: 'tool_use',
					name: call.name,
					toolCallId: call.id,
					parameters: this._safeParseJson(call.argumentsJson),
				});
			}
		} else if (message.content) {
			content.push({ type: 'text', value: message.content });
		}

		return { role: this._toChatRole(message.role), content };
	}

	/** Convert an LM API `thinking` response part to the serializable bridge shape. */
	private _toThinkingPart(part: IChatResponseThinkingPart): IByokLmThinkingPart {
		return {
			type: 'thinking',
			value: part.value,
			...(part.id !== undefined ? { id: part.id } : {}),
			...(part.metadata !== undefined ? { metadata: part.metadata } : {}),
		};
	}

	/** Coalesce consecutive non-empty deltas of one reasoning block; keep empty (metadata-only) parts verbatim. */
	private _appendThinking(pending: IByokLmThinkingPart[], part: IByokLmThinkingPart): void {
		const last = pending.at(-1);
		if (last && !this._isEmptyThinking(last) && !this._isEmptyThinking(part) && this._sameThinkingBlock(last, part)) {
			pending[pending.length - 1] = this._coalesceThinking(last, part);
		} else {
			pending.push(part);
		}
	}

	/** Two deltas belong to the same block unless they carry distinct defined ids. */
	private _sameThinkingBlock(a: IByokLmThinkingPart, b: IByokLmThinkingPart): boolean {
		return a.id === undefined || b.id === undefined || a.id === b.id;
	}

	private _isEmptyThinking(part: IByokLmThinkingPart): boolean {
		return (Array.isArray(part.value) ? part.value.join('') : part.value).length === 0;
	}

	/** Merge two thinking deltas: concatenate values, merge metadata last-writer-wins. */
	private _coalesceThinking(a: IByokLmThinkingPart, b: IByokLmThinkingPart): IByokLmThinkingPart {
		const value = typeof a.value === 'string' && typeof b.value === 'string'
			? a.value + b.value
			: [...(Array.isArray(a.value) ? a.value : [a.value]), ...(Array.isArray(b.value) ? b.value : [b.value])];
		const id = a.id ?? b.id;
		const metadata = a.metadata !== undefined || b.metadata !== undefined ? { ...a.metadata, ...b.metadata } : undefined;
		return {
			type: 'thinking',
			value,
			...(id !== undefined ? { id } : {}),
			...(metadata !== undefined ? { metadata } : {}),
		};
	}

	/** Rebuild an LM API `thinking` message part from the serializable bridge shape. */
	private _toThinkingMessagePart(part: IByokLmThinkingPart): IChatMessageThinkingPart {
		const thinking: IChatMessageThinkingPart = { type: 'thinking', value: part.value };
		if (part.id !== undefined) {
			thinking.id = part.id;
		}
		if (part.metadata !== undefined) {
			thinking.metadata = part.metadata;
		}
		return thinking;
	}

	private _toChatRole(role: IByokLmChatMessage['role']): ChatMessageRole {
		switch (role) {
			case 'system': return ChatMessageRole.System;
			case 'assistant': return ChatMessageRole.Assistant;
			case 'user':
			case 'tool':
			default: return ChatMessageRole.User;
		}
	}

	private _safeParseJson(json: string): unknown {
		try {
			return JSON.parse(json);
		} catch {
			return {};
		}
	}
}
