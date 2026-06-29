/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

/**
 * Serializable bridge contract between the node agent host (where the
 * {@link IByokLmProxyService} OpenAI-compatible proxy runs) and the renderer
 * (which owns the extension-provided BYOK language models via the LM API).
 *
 * These shapes are deliberately wire-friendly (plain JSON, no `VSBuffer`,
 * `URI`, or `workbench/contrib/chat` types) so they survive both the local
 * utility-process IPC channel and the remote JSON-RPC transport without a
 * translation step. The node side converts OpenAI Chat Completions wire
 * payloads to/from these; the renderer side converts these to/from the VS Code
 * LM API (`ILanguageModelsService`).
 */

/** A single tool/function call requested by the assistant. */
export interface IByokLmToolCall {
	/** Stable id correlating the call with its later `tool` result message. */
	readonly id: string;
	/** Tool/function name. */
	readonly name: string;
	/** JSON-encoded arguments object. */
	readonly argumentsJson: string;
}

/** A tool/function the model may call. */
export interface IByokLmTool {
	readonly name: string;
	readonly description?: string;
	/** JSON schema for the tool parameters. */
	readonly parametersSchema?: object;
}

/** One chat message in a BYOK request. */
export interface IByokLmChatMessage {
	readonly role: 'system' | 'user' | 'assistant' | 'tool';
	/** Flattened text content. Empty string when the message carries only tool calls/results. */
	readonly content: string;
	/** Present on `assistant` messages that requested tool calls. */
	readonly toolCalls?: IByokLmToolCall[];
	/** Present on `tool` messages: the {@link IByokLmToolCall.id} this result answers. */
	readonly toolCallId?: string;
}

/** A chat request forwarded from the proxy to the renderer LM API. */
export interface IByokLmChatRequest {
	/** Provider/vendor name (the LM API vendor that registered the model). */
	readonly vendor: string;
	/** Provider-local model id (the wire id the runtime sent on the OpenAI request). */
	readonly modelId: string;
	readonly messages: IByokLmChatMessage[];
	readonly tools?: IByokLmTool[];
	/** Opaque per-request model options forwarded to the LM provider. */
	readonly modelOptions?: Record<string, unknown>;
}

/** The (buffered) completion produced by the renderer LM API. */
export interface IByokLmChatResult {
	/** Concatenated assistant text. */
	readonly content: string;
	/** Tool calls the assistant requested, if any. */
	readonly toolCalls?: IByokLmToolCall[];
	/** Best-effort token usage, when the provider reports it. */
	readonly usage?: {
		readonly promptTokens?: number;
		readonly completionTokens?: number;
	};
	/** Set when the LM call failed; `content` is then empty. */
	readonly error?: string;
}

/**
 * Metadata for a renderer BYOK model, enumerated over the bridge so the node
 * agent host can advertise it to the SDK runtime without any host-side config.
 */
export interface IByokLmModelInfo {
	/** Provider/vendor name (the LM API vendor that registered the model). */
	readonly vendor: string;
	/** Provider-local model id. */
	readonly id: string;
	/** Display name, when the provider supplies one. */
	readonly name?: string;
	/** Maximum context window tokens (prompt + output), when known. */
	readonly maxContextWindowTokens?: number;
	/** Whether the model accepts image inputs, when known. */
	readonly supportsVision?: boolean;
}

export const IAgentHostByokLmHandler = createDecorator<IAgentHostByokLmHandler>('agentHostByokLmHandler');

/**
 * Renderer-side handler that services {@link IByokLmChatRequest}s by calling
 * the VS Code Language Model API. Implemented in the workbench (where
 * `ILanguageModelsService` lives) and reached from the node agent host over
 * the reverse bridge.
 */
export interface IAgentHostByokLmHandler {
	readonly _serviceBrand: undefined;

	/**
	 * Fires when the renderer's set of BYOK models changes, so the node agent
	 * host can re-enumerate them for the model picker. Optional: test fakes may
	 * omit it.
	 */
	readonly onDidChangeModels?: Event<void>;

	/**
	 * Run a BYOK chat completion against the extension-registered model that
	 * matches `request.vendor` + `request.modelId`. Rejects (or resolves with
	 * {@link IByokLmChatResult.error}) when no such model is available.
	 */
	chat(request: IByokLmChatRequest, token: CancellationToken): Promise<IByokLmChatResult>;

	/**
	 * Enumerate the renderer's BYOK models (vendor `isBYOK`, excluding
	 * session-scoped agent-host copies) so the node agent host can synthesize
	 * provider/model config for the SDK runtime.
	 */
	listModels(token: CancellationToken): Promise<IByokLmModelInfo[]>;
}

/**
 * Node-side connection to a single renderer's {@link IAgentHostByokLmHandler}.
 * Mirrors `IRemoteFilesystemConnection` for the reverse FS bridge.
 */
export interface IByokLmBridgeConnection {
	chat(request: IByokLmChatRequest): Promise<IByokLmChatResult>;
	listModels(): Promise<IByokLmModelInfo[]>;
	/**
	 * Fires when the renderer's set of BYOK models changes, so the agent host
	 * can re-enumerate. Optional: test fakes may omit it.
	 */
	readonly onDidChangeModels?: Event<void>;
}
