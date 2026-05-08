/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Disposable } from './host';
import type { ModelId } from './llm/LlmClient';

/**
 * Minimal structural type for a streaming chat response surface. Both
 * `vscode.ChatResponseStream` (in the extension) and a plain CLI sink
 * conform to this — agents only ever call `.markdown()` and the optional
 * `.progress()`.
 */
export interface ChatStreamLike {
	markdown(value: string): void;
	progress?(message: string): void;
}

/**
 * Minimal structural type for an incoming chat request. Compatible with
 * `vscode.ChatRequest` (which has many additional properties); core code
 * reads `prompt`, `command`, and the optional `modelOverride`.
 *
 * `modelOverride` is the per-turn model the chat composer's picker selected.
 * When undefined, agents fall back to their `defaultModel` from
 * `AgentStackFactory.ts` (preserving the historical Anthropic-by-default
 * behaviour). When defined, the orchestrator routes its own LLM calls through
 * the chosen model so the picker actually controls which provider responds.
 *
 * The field is deliberately NOT named `model` because `vscode.ChatRequest`
 * already exposes a `model: LanguageModelChat` property — naming the override
 * `model` would force a structural collision at the chat-participant
 * boundary. `modelOverride` lives on the structural shim only.
 */
export interface ChatRequestLike {
	readonly prompt: string;
	readonly command?: string;
	readonly modelOverride?: ModelId;
	/**
	 * Per-turn dynamic context (active editor, selection, open editors, git
	 * status, etc.) collected by the host. When present, agents inject it as a
	 * "Workspace Context" section in their system prompt rather than treating
	 * it as part of the user's typed message.
	 */
	readonly workspaceContextSnapshot?: string;
	/**
	 * When true, the agent's system prompt asks the model to emit a
	 * structured `<<sota:suggestions>>[...]<<sota:end>>` block at the end
	 * of its reply listing 2-4 follow-up prompts the user can pick. The
	 * CLI TUI already parses + strips this sentinel; surfaces that don't
	 * (the IDE chat panel today) leave the flag false so users never see
	 * the raw protocol block.
	 */
	readonly emitFollowupSuggestions?: boolean;
}

/**
 * Bag of contextual data passed alongside a chat request. Compatible with
 * `vscode.ChatContext` (currently unused inside core agents — accepted as a
 * pass-through for extension call sites).
 */
export interface ChatContextLike {
	readonly history?: ReadonlyArray<unknown>;
}

/**
 * Minimal structural type matching `vscode.CancellationToken`. The extension
 * passes a real token; the CLI / unit tests can construct one from an
 * `AbortSignal`.
 */
export interface CancellationLike {
	readonly isCancellationRequested: boolean;
	onCancellationRequested(listener: () => unknown): Disposable;
}
