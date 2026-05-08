/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = path.join(os.homedir(), '.son-of-anton', 'data', 'conversations');
const RETENTION_DAYS = 90;
const MAX_TITLE_LENGTH = 50;

/**
 * Persisted shape for a single CLI conversation. Designed to be a strict
 * subset of the IDE's `ConversationRecord` (see
 * extensions/son-of-anton/src/chat/ConversationStore.ts) so a future bridge
 * can hydrate IDE-side from these files without a migration.
 *
 * The on-disk file is one JSON object per conversation, written atomically
 * via the temp-file + rename idiom. The directory is created with mode 0o700
 * and files with 0o600 since conversations frequently contain credentials
 * pasted in by the user.
 */
export interface CliConversation {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	model: string;
	specialist: string;
	messages: ReadonlyArray<{ role: 'user' | 'assistant' | 'system'; content: string }>;
}

export interface CliConversationSummary {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	messageCount: number;
	model: string;
	specialist: string;
}

function ensureDir(): void {
	fs.mkdirSync(ROOT, { recursive: true, mode: 0o700 });
}

function fileFor(id: string): string {
	return path.join(ROOT, `cli-${id}.json`);
}

/**
 * 128 random bits, formatted to look like a UUID v4 so logs and indexes are
 * pleasant to read. Cheap on every save; collision domain is per install so
 * the lack of strict RFC 4122 compliance doesn't matter.
 */
function generateId(): string {
	const bytes = new Uint8Array(16);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = Math.floor(Math.random() * 256);
	}
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Derive a sidebar-style title from the first user message, capped at
 * {@link MAX_TITLE_LENGTH} characters. Falls back to a placeholder when no
 * user message exists yet (e.g. immediately after `/new`).
 */
function deriveTitle(messages: CliConversation['messages']): string {
	const firstUser = messages.find((m) => m.role === 'user');
	if (!firstUser) {
		return 'New conversation';
	}
	const trimmed = firstUser.content.trim().replace(/\s+/g, ' ');
	if (!trimmed) {
		return 'New conversation';
	}
	return trimmed.length <= MAX_TITLE_LENGTH ? trimmed : `${trimmed.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`;
}

/**
 * Atomic write — render to a sibling temp file then rename. Guarantees the
 * destination is either fully-written or untouched even if the process is
 * killed mid-write.
 */
function writeAtomic(target: string, body: string): void {
	const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
	fs.writeFileSync(tmp, body, { mode: 0o600 });
	fs.renameSync(tmp, target);
}

export interface SaveArgs {
	id?: string;
	title?: string;
	model: string;
	specialist: string;
	messages: CliConversation['messages'];
}

/**
 * Persist a conversation. Generates an id on first save, preserves the id
 * on subsequent saves so callers can autosave after every turn without
 * accumulating duplicate files.
 */
export function saveConversation(args: SaveArgs): CliConversation {
	ensureDir();
	const now = Date.now();
	const existing = args.id ? loadConversation(args.id) : undefined;
	const record: CliConversation = {
		id: args.id ?? generateId(),
		title: args.title?.trim().slice(0, MAX_TITLE_LENGTH) || existing?.title || deriveTitle(args.messages),
		createdAt: existing?.createdAt ?? now,
		updatedAt: now,
		model: args.model,
		specialist: args.specialist,
		messages: args.messages,
	};
	writeAtomic(fileFor(record.id), JSON.stringify(record, null, 2));
	return record;
}

export function loadConversation(id: string): CliConversation | undefined {
	try {
		const raw = fs.readFileSync(fileFor(id), 'utf8');
		const parsed = JSON.parse(raw) as CliConversation;
		if (parsed && typeof parsed.id === 'string' && Array.isArray(parsed.messages)) {
			return parsed;
		}
		return undefined;
	} catch {
		return undefined;
	}
}

export function deleteConversation(id: string): void {
	try {
		fs.unlinkSync(fileFor(id));
	} catch {
		// File may already be gone — treat as success.
	}
}

/**
 * Enumerate stored conversations newest-first, returning summaries only so
 * listings stay fast even when individual conversations are large. Also
 * sweeps entries older than `RETENTION_DAYS` so the directory stays bounded
 * without a separate scheduled cleanup.
 */
export function listConversations(): CliConversationSummary[] {
	let entries: string[];
	try {
		ensureDir();
		entries = fs.readdirSync(ROOT);
	} catch {
		return [];
	}
	const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
	const summaries: CliConversationSummary[] = [];
	for (const entry of entries) {
		if (!entry.startsWith('cli-') || !entry.endsWith('.json')) {
			continue;
		}
		try {
			const full = path.join(ROOT, entry);
			const raw = fs.readFileSync(full, 'utf8');
			const parsed = JSON.parse(raw) as CliConversation;
			if (!parsed || typeof parsed.id !== 'string' || !Array.isArray(parsed.messages)) {
				continue;
			}
			if (parsed.updatedAt < cutoff) {
				try {
					fs.unlinkSync(full);
				} catch {
					// Ignore unlink failures during sweep.
				}
				continue;
			}
			summaries.push({
				id: parsed.id,
				title: parsed.title,
				createdAt: parsed.createdAt,
				updatedAt: parsed.updatedAt,
				messageCount: parsed.messages.length,
				model: parsed.model,
				specialist: parsed.specialist,
			});
		} catch {
			// Skip unreadable / malformed files; they may be in-flight writes.
		}
	}
	summaries.sort((a, b) => b.updatedAt - a.updatedAt);
	return summaries;
}
