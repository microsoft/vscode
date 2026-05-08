/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * @fileoverview Runtime adapter for the Task Board chat panel.
 *
 * CopilotKit's `<CopilotKit>` provider expects a `runtimeUrl` pointing at a
 * hosted runtime that handles the LLM calls. We don't have a server — the
 * board lives entirely in a VS Code webview. Two choices:
 *
 *   1. Use the official runtime (heavy: requires a server-side proxy).
 *   2. Use only the action / readable hooks for agent metadata, drive chat
 *      ourselves via a postMessage round-trip with `LlmClient` in the host.
 *
 * We took (2). The provider mounts with a no-op `runtimeUrl` so the
 * action/readable context is available for `useCopilotAction` /
 * `useCopilotReadable` to register against. The chat UI in `BoardChat.tsx`
 * uses our own minimal `requestStream` helper which sends a
 * `chat-runtime` message to the host, then awaits a stream of
 * `chat-runtime-chunk` replies — INCLUDING `tool-call` events that the
 * webview routes back through CopilotKit's registered handlers.
 *
 * Tier 2.5 wires the loop end-to-end: the webview now ships a `tools`
 * array on the request, the host passes it into `LlmClient.streamRequest`,
 * and any `tool-call` event the model emits comes back through the same
 * channel and is dispatched against the action registry.
 */

import { CopilotKit } from '@copilotkit/react-core';
import type { ReactNode } from 'react';
import type { ChatToolDefinition } from './protocol';

interface BoardRuntimeProps {
	readonly children: ReactNode;
}

/**
 * The dummy runtime URL is never fetched — `BoardChat.tsx` intercepts all
 * LLM traffic and routes it through postMessage to the host. CopilotKit
 * only checks that *some* runtime config is present so its action /
 * readable hooks have a context.
 */
const NOOP_RUNTIME_URL = 'vscode-webview://noop';

export function BoardRuntime({ children }: BoardRuntimeProps): JSX.Element {
	return (
		<CopilotKit
			runtimeUrl={NOOP_RUNTIME_URL}
			showDevConsole={false}
		>
			{children}
		</CopilotKit>
	);
}

/**
 * Tool-call event surfaced to the chat UI when the model invokes one of
 * the registered actions. `id` correlates the call with any future
 * follow-up (deferred); today the handler runs synchronously and the
 * model's next assistant turn is fully detached.
 */
export interface ChatToolCall {
	readonly id: string;
	readonly name: string;
	readonly input: Record<string, unknown>;
}

/**
 * Stream a chat completion through the host's `LlmClient`.
 *
 * The webview posts a `chat-runtime` message tagged with a UUID; the host
 * resolves it by streaming `chat-runtime-chunk` events back, which we
 * fan out to the supplied callbacks.
 */
export function requestStream(
	model: string,
	messages: ReadonlyArray<{ role: 'system' | 'user' | 'assistant'; content: string }>,
	callbacks: {
		onToken: (token: string) => void;
		onComplete: (fullText: string) => void;
		onError: (error: string) => void;
		onToolCall?: (call: ChatToolCall) => void;
	},
	tools?: ReadonlyArray<ChatToolDefinition>,
): { cancel: () => void } {
	const requestId = makeRequestId();
	const handler = (ev: MessageEvent): void => {
		const data = ev.data as {
			type?: string;
			requestId?: string;
			event?: {
				type: string;
				token?: string;
				fullText?: string;
				error?: string;
				id?: string;
				name?: string;
				input?: Record<string, unknown>;
			};
		} | undefined;
		if (!data || data.type !== 'chat-runtime-chunk' || data.requestId !== requestId) {
			return;
		}
		const event = data.event;
		if (!event) {
			return;
		}
		if (event.type === 'token' && typeof event.token === 'string') {
			callbacks.onToken(event.token);
		} else if (event.type === 'tool-call' && typeof event.name === 'string' && typeof event.id === 'string') {
			callbacks.onToolCall?.({
				id: event.id,
				name: event.name,
				input: event.input && typeof event.input === 'object' ? event.input : {},
			});
		} else if (event.type === 'complete') {
			callbacks.onComplete(event.fullText ?? '');
			window.removeEventListener('message', handler);
		} else if (event.type === 'error') {
			callbacks.onError(event.error ?? 'Unknown error');
			window.removeEventListener('message', handler);
		}
	};
	window.addEventListener('message', handler);

	// Lazy-import vscode wrapper to keep this module independent of postToHost
	// for testability (the wrapper would log warnings outside of a webview).
	import('./vscode').then(mod => {
		mod.postToHost({ type: 'chat-runtime', requestId, model, messages, tools });
	});

	return {
		cancel: (): void => {
			window.removeEventListener('message', handler);
		},
	};
}

function makeRequestId(): string {
	// Webview's `crypto.randomUUID` is available in all modern Electron versions.
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return 'r-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
}
