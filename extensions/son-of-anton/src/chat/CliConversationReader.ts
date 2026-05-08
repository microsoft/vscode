/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ChatMessage } from './ChatPanel';
import { ConversationRecord, ConversationSummary } from './ConversationStore';

/**
 * Mirrors the maximum message count enforced by the IDE's
 * {@link ConversationStore}. Kept identical so an imported CLI conversation
 * is never larger than what the IDE store would otherwise retain.
 */
const MAX_MESSAGES_PER_CONVERSATION = 500;

/**
 * Absolute path to the directory the CLI's `ConversationStore` writes into.
 * The IDE only reads from this directory — it never writes back. Resolved
 * once at module load so callers don't repeatedly join `os.homedir()`.
 */
const CLI_CONVERSATIONS_DIR = path.join(os.homedir(), '.son-of-anton', 'data', 'conversations');

/**
 * Persisted shape for a single CLI conversation.
 *
 * MUST stay in lockstep with son-of-anton-cli/src/persistence/ConversationStore.ts.
 * The CLI is a sibling repository, not a Node dependency, so the type is
 * duplicated here rather than imported. If the CLI changes the on-disk
 * shape, update this interface in the same change.
 */
interface CliConversation {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	model: string;
	specialist: string;
	messages: ReadonlyArray<{ role: 'user' | 'assistant' | 'system'; content: string }>;
}

/**
 * Discriminator stamped on every summary surfaced through this reader so
 * the tree provider can render a small label (and dispatch the right
 * click-handler) without consulting the on-disk file again.
 */
export type ConversationSource = 'cli' | 'ide';

/**
 * Lightweight summary of a CLI-authored conversation, shaped to match the
 * IDE's {@link ConversationSummary} so the tree provider can mix the two
 * lists without bespoke field handling. The extra `source` and `specialist`
 * fields are CLI-only; consumers that don't care about them can ignore them.
 */
export interface CliConversationSummary {
	readonly id: string;
	readonly title: string;
	readonly createdAt: number;
	readonly updatedAt: number;
	readonly messageCount: number;
	readonly lastSpecialist?: string;
	readonly source: ConversationSource;
}

/**
 * A complete CLI conversation adapted to the IDE's
 * {@link ConversationRecord} shape so callers can hydrate the chat panel
 * directly. The summary's `source` field is preserved on the way through
 * for any UI that needs to distinguish CLI imports.
 */
export interface CliConversationRecord {
	readonly summary: CliConversationSummary;
	readonly messages: ChatMessage[];
}

/**
 * Cap a CLI message list at the IDE's per-conversation limit, dropping the
 * oldest entries first. Keeps the imported conversation roughly the same
 * size as a long-running native one.
 */
function trimMessages(messages: ReadonlyArray<ChatMessage>): ChatMessage[] {
	if (messages.length <= MAX_MESSAGES_PER_CONVERSATION) {
		return [...messages];
	}
	return messages.slice(messages.length - MAX_MESSAGES_PER_CONVERSATION);
}

/**
 * Adapt the CLI's plain `{ role, content }` message shape into the IDE's
 * structured {@link ChatMessage}. CLI messages are always plain text — the
 * IDE's image-attachment path is webview-only — so we copy the string into
 * the `content` field as-is and stamp `timestamp` from the conversation's
 * `updatedAt` (the CLI doesn't persist per-message timestamps).
 */
function adaptMessages(
	cli: CliConversation,
): ChatMessage[] {
	const adapted: ChatMessage[] = cli.messages.map((m) => ({
		role: m.role,
		content: m.content,
		timestamp: cli.updatedAt,
	}));
	return trimMessages(adapted);
}

/**
 * Validate a JSON-parsed payload to make sure it has the structural fields
 * we depend on. Returns the value typed as {@link CliConversation} on
 * success or `undefined` if the file was malformed or partially written.
 */
function validate(parsed: unknown): CliConversation | undefined {
	if (!parsed || typeof parsed !== 'object') {
		return undefined;
	}
	const candidate = parsed as Partial<CliConversation>;
	if (typeof candidate.id !== 'string' || !candidate.id) {
		return undefined;
	}
	if (typeof candidate.title !== 'string') {
		return undefined;
	}
	if (typeof candidate.createdAt !== 'number' || typeof candidate.updatedAt !== 'number') {
		return undefined;
	}
	if (!Array.isArray(candidate.messages)) {
		return undefined;
	}
	return candidate as CliConversation;
}

/**
 * Walk `~/.son-of-anton/data/conversations/` and return CLI conversation
 * summaries newest-first. Silently returns `[]` when the directory does
 * not exist (e.g. the user has never run the CLI) — never throws.
 */
export async function listCliConversations(): Promise<CliConversationSummary[]> {
	let entries: string[];
	try {
		entries = await fs.readdir(CLI_CONVERSATIONS_DIR);
	} catch {
		return [];
	}
	const summaries: CliConversationSummary[] = [];
	for (const entry of entries) {
		if (!entry.startsWith('cli-') || !entry.endsWith('.json')) {
			continue;
		}
		const full = path.join(CLI_CONVERSATIONS_DIR, entry);
		let raw: string;
		try {
			raw = await fs.readFile(full, 'utf8');
		} catch {
			continue;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			// Skip in-flight writes / corrupted files — the CLI uses
			// atomic temp+rename, but a tmp file may briefly land here.
			continue;
		}
		const cli = validate(parsed);
		if (!cli) {
			continue;
		}
		summaries.push({
			id: cli.id,
			title: cli.title || 'Untitled',
			createdAt: cli.createdAt,
			updatedAt: cli.updatedAt,
			messageCount: cli.messages.length,
			lastSpecialist: cli.specialist || undefined,
			source: 'cli',
		});
	}
	summaries.sort((a, b) => b.updatedAt - a.updatedAt);
	return summaries;
}

/**
 * Load a single CLI conversation by id and return it adapted to the IDE's
 * record shape. Returns `undefined` if the file is missing, unreadable, or
 * structurally invalid — never throws.
 */
export async function loadCliConversation(id: string): Promise<CliConversationRecord | undefined> {
	const full = path.join(CLI_CONVERSATIONS_DIR, `cli-${id}.json`);
	let raw: string;
	try {
		raw = await fs.readFile(full, 'utf8');
	} catch {
		return undefined;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return undefined;
	}
	const cli = validate(parsed);
	if (!cli) {
		return undefined;
	}
	const messages = adaptMessages(cli);
	const summary: CliConversationSummary = {
		id: cli.id,
		title: cli.title || 'Untitled',
		createdAt: cli.createdAt,
		updatedAt: cli.updatedAt,
		messageCount: messages.length,
		lastSpecialist: cli.specialist || undefined,
		source: 'cli',
	};
	return { summary, messages };
}

/**
 * Absolute filesystem path to the CLI conversation directory. Exposed so
 * the tree provider can install a {@link vscode.FileSystemWatcher} that
 * triggers a refresh whenever the CLI writes a new conversation.
 */
export function getCliConversationsDir(): vscode.Uri {
	return vscode.Uri.file(CLI_CONVERSATIONS_DIR);
}

/**
 * Type guard that lets the tree provider widen the IDE summary type with
 * the CLI source discriminator. The IDE's
 * {@link ConversationSummary} is unaware of the `source` field; this helper
 * stamps it on for the unified display path.
 */
export function asIdeSummary(summary: ConversationSummary): ConversationSummary & { readonly source: ConversationSource } {
	return { ...summary, source: 'ide' };
}

/**
 * Re-export of the IDE's record shape so the tree provider has a single
 * import surface for both source types.
 */
export type { ConversationRecord };
