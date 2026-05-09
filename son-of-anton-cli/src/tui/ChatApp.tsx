/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Box, Text, useApp, useInput } from 'ink';
import * as React from 'react';
import { SpecialistMemory } from 'son-of-anton-core/dist/agents/SpecialistMemory';
import type { AgentHandle } from 'son-of-anton-core/dist/agents/types';
import type { CoreHost } from 'son-of-anton-core/dist/host';
import type { LlmClient, ModelId } from 'son-of-anton-core/dist/llm/LlmClient';
import { BUILTIN_TOOLS } from 'son-of-anton-core/dist/tools/registry';
import {
	listConversations,
	loadConversation,
	saveConversation,
	type CliConversation,
	type CliConversationSummary,
} from '../persistence/ConversationStore';
import { Composer } from './Composer';
import { ResumePicker } from './ResumePicker';
import { appendHistory, loadHistory } from './replHistory';
import { findCommand, type SlashCommandContext } from './slashCommands';
import { StatusBar } from './StatusBar';
import { Suggestions, extractSuggestionsFromAssistantText, stripSuggestionsSentinel } from './Suggestions';
import { Transcript } from './Transcript';
import { loadSessionInfo } from './sessionInfo';
import type { UiBlockResponse } from './uiBlocks/types';
import type { TuiMessage } from './types';
import { useAgentStream } from './useAgentStream';

export interface ChatAppProps {
	llm: LlmClient;
	host: CoreHost;
	model: ModelId;
	specialist: string;
	resumeFrom?: CliConversation;
}

/**
 * Root Ink component for `sota chat`. Composition is flat — banner, status
 * bar on top, scrolling transcript in the middle, multi-line composer at the
 * bottom. Slash commands are dispatched here so they have direct access to
 * the agent-stream helpers and the live model / specialist state.
 */
export function ChatApp(props: ChatAppProps): JSX.Element {
	const { llm, host, resumeFrom } = props;
	const { exit } = useApp();
	const [model, setModel] = React.useState<ModelId>((resumeFrom?.model as ModelId) ?? props.model);
	const [specialist, setSpecialist] = React.useState<string>(resumeFrom?.specialist ?? props.specialist);
	const [planMode, setPlanMode] = React.useState(false);
	const session = React.useMemo(() => loadSessionInfo(specialist, model), [specialist, model]);
	// One SpecialistMemory per session, backed by the host's globalState.
	// Shares the same store the IDE uses, so memories written here surface
	// in the IDE's specialist roster panel.
	const specialistMemory = React.useMemo(() => new SpecialistMemory(host.globalState), [host.globalState]);
	React.useEffect(() => () => specialistMemory.dispose(), [specialistMemory]);

	const stream = useAgentStream({ llm, model, specialist });
	const { messages, busy, send, addSystemMessage, clearTranscript, resetConversation, replaceMessages, usage } = stream;
	// H11 — cumulative session cost. The model can change mid-session via
	// /model, but tokens billed under the previous model still cost what
	// they cost — we re-price each turn at the model active when the turn
	// happened. Today the price snapshot uses the *current* model for
	// simplicity; an exact per-turn ledger lands when the metrics tracker
	// surface gets a richer hook.
	const sessionCost = React.useMemo(() => estimateCost(model, usage), [model, usage]);
	const totalTokens = usage.input + usage.output;

	const [history, setHistory] = React.useState<ReadonlyArray<string>>(() => loadHistory());
	const conversationIdRef = React.useRef<string | undefined>(resumeFrom?.id);
	const [resumePickerOpen, setResumePickerOpen] = React.useState(false);
	const [uiBlockState, setUiBlockState] = React.useState<Map<string, { settled: boolean; value?: UiBlockResponse }>>(() => new Map());
	const [suggestionHighlight, setSuggestionHighlight] = React.useState(0);

	// Strip the sentinel block from the rendered transcript so users don't
	// see the raw protocol while keeping the data available for `Suggestions`.
	// Only mutates assistant messages; user/system rows pass through.
	const renderedMessages = React.useMemo<ReadonlyArray<TuiMessage>>(
		() =>
			messages.map((m) =>
				m.role === 'assistant'
					? { ...m, text: stripSuggestionsSentinel(m.text) }
					: m,
			),
		[messages],
	);

	const lastAssistantText = React.useMemo(() => {
		for (let i = messages.length - 1; i >= 0; i--) {
			const msg = messages[i];
			if (msg.role === 'assistant' && !msg.streaming && msg.text) {
				return msg.text;
			}
		}
		return '';
	}, [messages]);

	const suggestions = React.useMemo(() => {
		if (!lastAssistantText) {
			return [] as ReadonlyArray<string>;
		}
		return extractSuggestionsFromAssistantText(lastAssistantText);
	}, [lastAssistantText]);

	React.useEffect(() => {
		// Reset the highlight every time the suggestion set changes so a new
		// turn always starts from the first follow-up.
		setSuggestionHighlight(0);
	}, [suggestions.join('\n')]);

	// Hydrate the transcript from the resume payload exactly once on mount.
	const hasHydratedRef = React.useRef(false);
	React.useEffect(() => {
		if (hasHydratedRef.current || !resumeFrom) {
			return;
		}
		hasHydratedRef.current = true;
		const hydrated: TuiMessage[] = resumeFrom.messages.map((m, i) => ({
			id: `r${i}`,
			role: m.role,
			text: m.content,
		}));
		replaceMessages(hydrated);
	}, [resumeFrom, replaceMessages]);

	// Auto-save on every transition out of `busy` once at least one user
	// message exists, so each turn snapshots durably without explicit /save.
	const lastBusyRef = React.useRef<boolean>(busy);
	React.useEffect(() => {
		if (lastBusyRef.current && !busy) {
			const userTurns = messages.filter((m) => m.role === 'user');
			if (userTurns.length > 0) {
				const record = saveConversation({
					id: conversationIdRef.current,
					model,
					specialist,
					messages: messages.map((m) => ({ role: m.role, content: m.text })),
				});
				conversationIdRef.current = record.id;
			}
		}
		lastBusyRef.current = busy;
	}, [busy, messages, model, specialist]);

	const ctx: SlashCommandContext = React.useMemo(
		() => ({
			addSystemMessage,
			clearTranscript,
			startNewConversation: () => {
				conversationIdRef.current = undefined;
				resetConversation();
			},
			setModel: (next) => {
				setModel(next as ModelId);
			},
			setSpecialist: (next) => {
				setSpecialist(next);
			},
			togglePlanMode: () => {
				setPlanMode((prev) => {
					const next = !prev;
					addSystemMessage(`Plan mode ${next ? 'on' : 'off'}.`);
					return next;
				});
			},
			listTools: async () => {
				const builtins = BUILTIN_TOOLS.map((t) => ({
					name: t.definition.name,
					description: t.definition.description,
					category: t.definition.category,
				}));
				const mcpServers = (host.config.get<unknown>('sota.mcp.servers') ?? []) as ReadonlyArray<{ name?: string }>;
				const mcpEntries = mcpServers
					.filter((s): s is { name: string } => typeof s.name === 'string')
					.map((s) => ({
						name: `${s.name}/*`,
						description: 'MCP server (run /mcp doctor to list its tools)',
						category: 'mcp',
					}));
				return [...builtins, ...mcpEntries];
			},
			saveSnapshot: async (name) => {
				if (messages.length === 0) {
					return { ok: false, error: 'Nothing to save yet.' };
				}
				const record = saveConversation({
					id: conversationIdRef.current,
					title: name,
					model,
					specialist,
					messages: messages.map((m) => ({ role: m.role, content: m.text })),
				});
				conversationIdRef.current = record.id;
				return { ok: true, id: record.id };
			},
			resumeSnapshot: async () => {
				const list = listConversations();
				if (list.length === 0) {
					return { ok: false, error: 'No saved conversations found.' };
				}
				setResumePickerOpen(true);
				return { ok: true, messages: [] };
			},
			getConfigValue: (key: string) => host.config.get<unknown>(key),
			setConfigValue: async (key: string, value: unknown) => {
				if (!host.config.update) {
					addSystemMessage('This host\'s config store is read-only.');
					return;
				}
				await host.config.update(key, value);
			},
			listMemory: (handle: string) => {
				const entries = specialistMemory.list(handle as AgentHandle);
				return entries.map((e) => ({ key: e.key, value: e.value, updatedAt: e.updatedAt }));
			},
			writeMemory: (handle: string, key: string, value: string) => {
				specialistMemory.set(handle as AgentHandle, key, value);
			},
			clearMemory: (handle: string) => {
				specialistMemory.clear(handle as AgentHandle);
			},
			getActiveSpecialist: () => specialist,
			requestExit: () => {
				exit();
			},
		}),
		[addSystemMessage, clearTranscript, resetConversation, exit, host, messages, model, specialist, specialistMemory],
	);

	const handleSubmit = React.useCallback(
		(value: string): void => {
			if (value.startsWith('/')) {
				const parsed = parseSlashLocal(value);
				if (!parsed) {
					return;
				}
				addSystemMessage(value);
				const cmd = findCommand(parsed.name);
				if (cmd === 'ambiguous') {
					addSystemMessage(`Ambiguous command "${parsed.name}". Type /help for the list.`);
					return;
				}
				if (!cmd) {
					addSystemMessage(`Unknown command "${parsed.name}". Type /help for the list.`);
					return;
				}
				void cmd.run(parsed.args, ctx);
				return;
			}
			appendHistory(value);
			setHistory((prev) => [...prev.filter((h) => h !== value), value].slice(-100));
			send(value);
		},
		[addSystemMessage, ctx, send],
	);

	useInput((input, key) => {
		if ((key.ctrl && (input === 'c' || input === 'd')) || key.escape) {
			if (resumePickerOpen) {
				setResumePickerOpen(false);
				return;
			}
			if (!busy) {
				exit();
			}
		}
	});

	const handleResumeSelect = (summary: CliConversationSummary): void => {
		const record = loadConversation(summary.id);
		if (!record) {
			addSystemMessage(`Couldn't load ${summary.id}.`);
			setResumePickerOpen(false);
			return;
		}
		conversationIdRef.current = record.id;
		setModel(record.model as ModelId);
		setSpecialist(record.specialist);
		const hydrated: TuiMessage[] = record.messages.map((m, i) => ({
			id: `r${i}`,
			role: m.role,
			text: m.content,
		}));
		replaceMessages(hydrated);
		addSystemMessage(`Restored ${record.title} (${record.messages.length} message(s)).`);
		setResumePickerOpen(false);
	};

	return (
		<Box flexDirection="column">
			<Box paddingX={1} marginBottom={1}>
				<Text color="magenta" bold>
					Son of Anton
				</Text>
				<Text color="gray">
					{' — chat away. /help for commands · Ctrl+C to exit'}
					{planMode ? ' · plan mode on' : ''}
				</Text>
			</Box>
			<StatusBar session={session} busy={busy} cost={sessionCost} totalTokens={totalTokens} />
			{resumePickerOpen ? (
				<ResumePicker conversations={listConversations()} onSelect={handleResumeSelect} onCancel={() => setResumePickerOpen(false)} />
			) : (
				<>
					<Transcript
						messages={renderedMessages}
						uiBlockState={uiBlockState}
						onUiBlockResponse={(blockId, response) => {
							setUiBlockState((prev) => {
								const next = new Map(prev);
								next.set(blockId, { settled: true, value: response });
								return next;
							});
							const summary = response.kind === 'confirm'
								? JSON.stringify({ confirmed: response.value })
								: JSON.stringify(response.values);
							handleSubmit(`UI block response (${blockId}): ${summary}`);
						}}
					/>
					{!busy ? (
						<Suggestions suggestions={suggestions} highlight={suggestionHighlight} />
					) : null}
					<Composer
						disabled={busy}
						history={history}
						suggestions={busy ? [] : suggestions}
						suggestionHighlight={suggestionHighlight}
						onCycleSuggestion={() => {
							if (suggestions.length > 0) {
								setSuggestionHighlight((h) => (h + 1) % suggestions.length);
							}
						}}
						onSubmit={handleSubmit}
					/>
				</>
			)}
		</Box>
	);
}

function parseSlashLocal(input: string): { name: string; args: ReadonlyArray<string> } | null {
	const tokens = input.trim().split(/\s+/);
	if (tokens.length === 0) {
		return null;
	}
	const [name, ...args] = tokens;
	return { name, args };
}

/**
 * H11 — rough cost estimate for the live status-bar meter. Prices reflect
 * Anthropic's published list rates as of Jan 2026; OpenAI / Foundry /
 * Bedrock / Gemini fall through to the most-similar Anthropic model for
 * a "good enough" running total. The display intentionally skips a
 * decimal-cent precision when usage is below $0.01 (formats as "<$0.01")
 * so users see *something* tick up on the first turn instead of a
 * stubborn $0.00.
 */
function estimateCost(model: ModelId, usage: { input: number; output: number; cached: number }): number {
	const rates = MODEL_RATES[model] ?? SONNET_RATE;
	const nonCachedInput = Math.max(0, usage.input - usage.cached);
	return (
		(nonCachedInput / 1_000_000) * rates.input
		+ (usage.cached / 1_000_000) * rates.cachedInput
		+ (usage.output / 1_000_000) * rates.output
	);
}

const SONNET_RATE = { input: 3.0, output: 15.0, cachedInput: 0.3 };
const OPUS_RATE = { input: 15.0, output: 75.0, cachedInput: 1.5 };
const HAIKU_RATE = { input: 1.0, output: 5.0, cachedInput: 0.1 };

const MODEL_RATES: Partial<Record<ModelId, { input: number; output: number; cachedInput: number }>> = {
	opus: OPUS_RATE,
	sonnet: SONNET_RATE,
	haiku: HAIKU_RATE,
	'claude-opus-4-7': OPUS_RATE,
	'claude-sonnet-4-7': SONNET_RATE,
	'claude-haiku-4-7': HAIKU_RATE,
	'claude-opus-4-6': OPUS_RATE,
	'claude-sonnet-4-6': SONNET_RATE,
	'claude-haiku-4-6': HAIKU_RATE,
};

export default ChatApp;
