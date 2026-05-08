/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import type { LlmClient, LlmMessage, ModelId } from 'son-of-anton-core/dist/llm/LlmClient';
import type { TuiMessage } from './types';

interface UseAgentStreamArgs {
	llm: LlmClient;
	model: ModelId;
	specialist: string;
}

interface UseAgentStreamResult {
	messages: ReadonlyArray<TuiMessage>;
	busy: boolean;
	send: (text: string) => void;
	addSystemMessage: (text: string) => void;
	clearTranscript: () => void;
	resetConversation: () => void;
	replaceMessages: (next: ReadonlyArray<TuiMessage>) => void;
}

/**
 * Bridges the core streaming LLM client into React state so the transcript
 * re-renders as tokens arrive. The caller owns the conversation history (the
 * hook keeps an internal `LlmMessage[]` for the API call); each user turn
 * appends a user `TuiMessage`, then a streaming assistant `TuiMessage` that
 * mutates as tokens arrive, then closes out when the stream completes.
 */
export function useAgentStream(args: UseAgentStreamArgs): UseAgentStreamResult {
	const { llm, model, specialist } = args;
	const [messages, setMessages] = React.useState<ReadonlyArray<TuiMessage>>([]);
	const [busy, setBusy] = React.useState(false);
	const historyRef = React.useRef<LlmMessage[]>([]);
	const idCounterRef = React.useRef(0);

	const nextId = (): string => {
		idCounterRef.current += 1;
		return `m${idCounterRef.current}`;
	};

	const send = React.useCallback(
		(text: string): void => {
			if (busy) {
				return;
			}
			const userMsg: TuiMessage = { id: nextId(), role: 'user', text };
			const assistantId = nextId();
			const assistantMsg: TuiMessage = { id: assistantId, role: 'assistant', text: '', streaming: true };
			historyRef.current.push({ role: 'user', content: text });
			setMessages((prev) => [...prev, userMsg, assistantMsg]);
			setBusy(true);

			void (async () => {
				let assistantText = '';
				const toolCalls: Array<{ name: string; input?: unknown }> = [];
				let errorMessage: string | undefined;

				try {
					for await (const event of llm.streamRequest({
						model,
						messages: historyRef.current,
						systemPrompt: buildTuiSystemPrompt(specialist),
						enableCaching: true,
						agentHandle: specialist,
					})) {
						if (event.type === 'token') {
							assistantText += event.token;
							setMessages((prev) =>
								prev.map((m) => (m.id === assistantId ? { ...m, text: assistantText } : m)),
							);
						} else if (event.type === 'tool-call') {
							toolCalls.push({ name: event.name, input: event.input });
							setMessages((prev) =>
								prev.map((m) => (m.id === assistantId ? { ...m, toolCalls: [...toolCalls] } : m)),
							);
						} else if (event.type === 'error') {
							errorMessage = event.error;
						}
					}
				} catch (err) {
					errorMessage = err instanceof Error ? err.message : String(err);
				}

				if (assistantText) {
					historyRef.current.push({ role: 'assistant', content: assistantText });
				} else {
					// Drop the orphan user turn so a retry doesn't double-stack.
					historyRef.current.pop();
				}

				setMessages((prev) =>
					prev.map((m) =>
						m.id === assistantId
							? { ...m, streaming: false, error: errorMessage, text: assistantText }
							: m,
					),
				);
				setBusy(false);
			})();
		},
		[busy, llm, model, specialist],
	);

	const addSystemMessage = React.useCallback((text: string): void => {
		const id = nextId();
		setMessages((prev) => [...prev, { id, role: 'system', text }]);
	}, []);

	const clearTranscript = React.useCallback((): void => {
		setMessages([]);
	}, []);

	const resetConversation = React.useCallback((): void => {
		historyRef.current = [];
		setMessages([]);
	}, []);

	const replaceMessages = React.useCallback((next: ReadonlyArray<TuiMessage>): void => {
		setMessages(next);
		historyRef.current = next
			.filter((m) => m.role === 'user' || m.role === 'assistant')
			.map((m) => ({ role: m.role, content: m.text } as LlmMessage));
	}, []);

	return { messages, busy, send, addSystemMessage, clearTranscript, resetConversation, replaceMessages };
}

/**
 * Minimal system prompt for the TUI's raw streaming path. The full agent
 * harness system prompt (voice + role + project context + memory) goes
 * through `BaseAgent.runChatTurn`, but the TUI calls `LlmClient.streamRequest`
 * directly to keep latency low and avoid spinning up the orchestrator. This
 * prompt only carries the H4 follow-up-suggestion sentinel instruction so
 * the TUI's Tab-cyclable suggestion strip pulls real LLM-driven options
 * instead of the static fallback.
 *
 * When `sota chat` is migrated onto `BaseAgent.runChatTurn` (planned with
 * the full harness wiring), this minimal prompt drops out — the harness
 * will assemble the correct system prompt with the same flag.
 */
function buildTuiSystemPrompt(specialist: string): string {
	return [
		`You are Son of Anton's @${specialist} specialist.`,
		'Reply concisely and helpfully.',
		'',
		'## Follow-up suggestions',
		'',
		'After your main reply, append a sentinel block listing 2-4 short follow-up',
		'prompts the user might want to send next. The TUI uses this to show',
		'tab-cyclable next-step buttons. Keep each suggestion under 60 characters,',
		'phrased as something the *user* would type ("Run the tests", not "I will',
		'run the tests"). Skip the block entirely when no useful follow-ups exist.',
		'',
		'Format (verbatim — sentinels matter for parsing):',
		'',
		'```',
		'<<sota:suggestions>>',
		'["Run the tests", "Show me the diff", "Explain that further"]',
		'<<sota:end>>',
		'```',
	].join('\n');
}
