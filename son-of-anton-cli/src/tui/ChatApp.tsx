/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Box, Text, useApp, useInput } from 'ink';
import * as React from 'react';
import type { LlmClient, ModelId } from 'son-of-anton-core/dist/llm/LlmClient';
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
import { Transcript } from './Transcript';
import { loadSessionInfo } from './sessionInfo';
import type { TuiMessage } from './types';
import { useAgentStream } from './useAgentStream';

export interface ChatAppProps {
	llm: LlmClient;
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
	const { llm, resumeFrom } = props;
	const { exit } = useApp();
	const [model, setModel] = React.useState<ModelId>((resumeFrom?.model as ModelId) ?? props.model);
	const [specialist, setSpecialist] = React.useState<string>(resumeFrom?.specialist ?? props.specialist);
	const [planMode, setPlanMode] = React.useState(false);
	const session = React.useMemo(() => loadSessionInfo(specialist, model), [specialist, model]);

	const stream = useAgentStream({ llm, model, specialist });
	const { messages, busy, send, addSystemMessage, clearTranscript, resetConversation, replaceMessages } = stream;

	const [history, setHistory] = React.useState<ReadonlyArray<string>>(() => loadHistory());
	const conversationIdRef = React.useRef<string | undefined>(resumeFrom?.id);
	const [resumePickerOpen, setResumePickerOpen] = React.useState(false);

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
			listTools: async () => [],
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
			getConfigValue: () => undefined,
			setConfigValue: () => {
				addSystemMessage('Config writes from the REPL arrive in CLI4.');
			},
			requestExit: () => {
				exit();
			},
		}),
		[addSystemMessage, clearTranscript, resetConversation, exit, messages, model, specialist],
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
			<StatusBar session={session} busy={busy} />
			{resumePickerOpen ? (
				<ResumePicker conversations={listConversations()} onSelect={handleResumeSelect} onCancel={() => setResumePickerOpen(false)} />
			) : (
				<>
					<Transcript messages={messages} />
					<Composer disabled={busy} history={history} onSubmit={handleSubmit} />
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

export default ChatApp;
