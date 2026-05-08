/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatMessage, ChatMessageContent } from './ChatPanel';
import { ConversationRecord } from './ConversationStore';
import { getPersona } from 'son-of-anton-core/chat/personas';

/**
 * Cap per-tool-result body size when rendered into the export. Long
 * grep/read output would otherwise drown the document. 4KB matches the
 * spec for Phase 64 — long enough to show a meaningful slice, short enough
 * that the overall file stays sharable.
 */
const TOOL_RESULT_CAP = 4096;

/**
 * Sentinel marker used by ChatPanel to persist tool-call cards inside the
 * assistant message body. Format: `<<<sota:tool data="<base64>">>>`.
 * The base64 payload decodes to `<header>\n<body>` where the header is
 * `name({jsonInput}) → ok|error` and the body is the tool's textual
 * result. An optional leading `__EDITED__\n` line marks a user-edited
 * result (Phase 53 inline review) and is stripped before parsing.
 */
const TOOL_SENTINEL_RE = /<<<sota:tool data="([A-Za-z0-9+/=]+)">>>/g;

/**
 * Token / cost snapshot fed in from the host's live `CostReporter`.
 *
 * The exporter is deliberately decoupled from the reporter class so the
 * snapshot can be captured at the moment of export (live numbers reflect
 * the active session) without dragging the whole reporter into every
 * test that needs to render markdown. All fields are optional so callers
 * can omit the section entirely on environments where token accounting
 * isn't wired up yet.
 */
export interface CostSnapshot {
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly cachedInputTokens: number;
	readonly totalCost: number;
}

/**
 * Tunables for {@link exportConversationAsMarkdown}. All flags default to
 * including their content; callers opt out by passing `false` explicitly.
 * Pass {@link cost} to render the live "Cost & Tokens" snapshot block;
 * omit it to skip that section entirely (useful in tests).
 */
export interface ExportOptions {
	readonly includeTimestamps?: boolean;
	readonly includeMetadata?: boolean;
	readonly cost?: CostSnapshot;
	/** Absolute path of the workspace folder the export was triggered in. */
	readonly workspaceFolder?: string;
}

/**
 * Decoded form of a `<<<sota:tool data="…">>>` sentinel. Surfaced from
 * {@link decodeToolSentinels} so the transcript renderer and the manifest
 * builder share a single parser.
 */
interface DecodedToolCall {
	readonly name: string;
	readonly inputJson: string;
	readonly status: 'ok' | 'error';
	readonly body: string;
	readonly userEdited: boolean;
}

/**
 * One row in the "Files Touched" manifest. Operations are accumulated as
 * a `Set` while the manifest is being built so duplicates collapse, then
 * flattened into a sorted array at render time.
 */
interface ManifestEntry {
	readonly path: string;
	readonly operations: Set<ManifestOperation>;
}

type ManifestOperation = 'read' | 'write' | 'edit' | 'run';

/**
 * Convert a {@link ConversationRecord} into a single Markdown document
 * suitable for archiving, sharing, or attaching to a PR. The output is
 * deterministic for a given record + options pair — no live data lookups
 * inside this function — so callers must capture token / cost totals
 * BEFORE calling and pass them in via {@link ExportOptions.cost}.
 *
 * Layout (Phase 64):
 *   - H1 title (conversation summary title)
 *   - optional metadata blockquote (createdAt / updatedAt / message count / workspace)
 *   - Cost & Tokens block (when {@link ExportOptions.cost} is provided)
 *   - Files Touched manifest (extracted from `<<<sota:tool>>>` sentinels)
 *   - Transcript: one H2/H3 section per message, with decoded tool cards
 *     inlined under the assistant turn that emitted them
 *   - Footer: "Exported from Son of Anton on <iso timestamp>"
 */
export function exportConversationAsMarkdown(
	record: ConversationRecord,
	options: ExportOptions = {},
): string {
	const sections: string[] = [];

	sections.push(renderHeader(record, options));

	if (options.cost) {
		sections.push(renderCost(record, options.cost));
	}

	sections.push(renderManifest(record));

	sections.push(renderTranscript(record, options));

	sections.push(`*Exported from Son of Anton on ${new Date().toISOString()}*`);

	return sections.join('\n\n---\n\n') + '\n';
}

function renderHeader(record: ConversationRecord, options: ExportOptions): string {
	const lines: string[] = [`# ${record.summary.title}`, ''];

	if (options.includeMetadata !== false) {
		const created = new Date(record.summary.createdAt).toISOString();
		const updated = new Date(record.summary.updatedAt).toISOString();
		lines.push(`> **Created:** ${created}`);
		lines.push(`> **Updated:** ${updated}`);
		lines.push(`> **Messages:** ${record.summary.messageCount}`);
		if (record.summary.lastSpecialist) {
			lines.push(`> **Active specialist:** @${record.summary.lastSpecialist}`);
		}
		if (options.workspaceFolder) {
			lines.push(`> **Workspace:** ${options.workspaceFolder}`);
		}
	}

	return lines.join('\n');
}

function renderCost(record: ConversationRecord, cost: CostSnapshot): string {
	// "Turns" is the number of user-authored messages — one per round of
	// dialogue from the human's perspective. Counts user messages only so
	// system blockquotes (slash-command output, plan summaries) don't
	// inflate the figure.
	const turns = record.messages.filter(m => m.role === 'user').length;
	const lines: string[] = [
		`## Cost & Tokens`,
		``,
		`- Total prompt tokens: ${cost.inputTokens.toLocaleString()}`,
		`- Total completion tokens: ${cost.outputTokens.toLocaleString()}`,
	];
	if (cost.cachedInputTokens > 0) {
		lines.push(`- Cached input tokens: ${cost.cachedInputTokens.toLocaleString()}`);
	}
	lines.push(`- Estimated cost: $${cost.totalCost.toFixed(4)}`);
	lines.push(`- Total turns: ${turns}`);
	return lines.join('\n');
}

/**
 * Walk every assistant message, decode its tool sentinels, and accumulate
 * a (path → operations) map. Paths are looked up under the conventional
 * input keys (`path`, `file_path`, `relPath`, `command`) so the same
 * routine handles `read_file`, `write_file`, `edit_file`, and shell tools.
 * Tool calls without a recognisable path are skipped silently — the
 * manifest is best-effort, not a guarantee of completeness.
 */
function renderManifest(record: ConversationRecord): string {
	const entries = new Map<string, ManifestEntry>();

	for (const message of record.messages) {
		if (message.role !== 'assistant') {
			continue;
		}
		const text = contentToText(message.content);
		const decoded = decodeToolSentinels(text);
		for (const call of decoded) {
			const op = inferOperation(call.name);
			if (!op) {
				continue;
			}
			const path = extractPathFromInput(call.inputJson);
			if (!path) {
				continue;
			}
			let entry = entries.get(path);
			if (!entry) {
				entry = { path, operations: new Set<ManifestOperation>() };
				entries.set(path, entry);
			}
			entry.operations.add(op);
		}
	}

	const lines: string[] = [`## Files Touched`, ``];
	if (entries.size === 0) {
		lines.push(`(none)`);
		return lines.join('\n');
	}
	const sorted = [...entries.values()].sort((a, b) => a.path.localeCompare(b.path));
	for (const entry of sorted) {
		const ops = [...entry.operations].sort().join(', ');
		lines.push(`- \`${entry.path}\` — ${ops}`);
	}
	return lines.join('\n');
}

function renderTranscript(record: ConversationRecord, options: ExportOptions): string {
	const lines: string[] = [`## Transcript`, ''];

	// `lastSpecialist` is the only specialist hint persisted on the
	// record (ChatMessage carries no per-turn `specialistId`). Using it
	// as the default for every assistant message is a reasonable
	// approximation for v1 — most conversations involve a single
	// specialist, and the fallback ('anton') matches what the chat
	// surface itself shows.
	const fallbackSpecialist = record.summary.lastSpecialist ?? 'anton';

	let turnCounter = 0;
	for (const message of record.messages) {
		if (message.role === 'user') {
			turnCounter++;
			lines.push(`### Turn ${turnCounter} — User`);
			if (options.includeTimestamps) {
				lines.push('');
				lines.push(`*${formatTime(message.timestamp)}*`);
			}
			lines.push('');
			const userText = contentToText(message.content);
			lines.push(blockquote(userText));
			lines.push('');
		} else if (message.role === 'assistant') {
			const persona = getPersona(fallbackSpecialist);
			const monogram = persona?.monogram ?? '?';
			const displayName = persona ? `@${persona.id}` : `@${fallbackSpecialist}`;
			lines.push(`### Turn ${turnCounter} — ${monogram} ${displayName}`);
			if (options.includeTimestamps) {
				lines.push('');
				lines.push(`*${formatTime(message.timestamp)}*`);
			}
			lines.push('');

			// Strip tool sentinels before rendering the prose so the
			// transcript reads as the assistant's narration. The decoded
			// cards are appended below as `#### Tool: …` blocks so the
			// reader sees the tool chronology without inline base64.
			const fullText = contentToText(message.content);
			const proseOnly = stripToolSentinels(fullText).trim();
			if (proseOnly.length > 0) {
				lines.push(proseOnly);
				lines.push('');
			}

			const decoded = decodeToolSentinels(fullText);
			for (const call of decoded) {
				lines.push(...renderToolCard(call));
			}
		} else if (message.role === 'system') {
			// System messages typically carry slash-command output, plan
			// summaries, or tool-result echoes piped back into the
			// scrollback. Render them as blockquotes so they read as
			// ambient context rather than a participant turn.
			lines.push(`> **System:** ${contentToText(message.content)}`);
			lines.push('');
		}
	}

	return lines.join('\n').trimEnd();
}

function renderToolCard(call: DecodedToolCall): string[] {
	const lines: string[] = [];
	const editedSuffix = call.userEdited ? ' (edited)' : '';
	const statusGlyph = call.status === 'ok' ? '✓' : '✗';
	lines.push(`#### Tool: ${call.name} ${statusGlyph}${editedSuffix}`);
	lines.push('');
	const prettyInput = prettifyJson(call.inputJson);
	lines.push('Args:');
	lines.push('```json');
	lines.push(prettyInput);
	lines.push('```');
	lines.push('');
	const truncated = truncate(call.body, TOOL_RESULT_CAP);
	lines.push('Result:');
	lines.push('```');
	lines.push(truncated);
	lines.push('```');
	lines.push('');
	return lines;
}

/**
 * Decode every tool sentinel in `text` into a structured call. Malformed
 * payloads (bad base64, missing header line) are skipped silently —
 * partial truncation on disk shouldn't break the export.
 */
function decodeToolSentinels(text: string): DecodedToolCall[] {
	const calls: DecodedToolCall[] = [];
	// `String.matchAll` requires a global regex; we re-create the source
	// here rather than reuse the module-level constant to avoid
	// `lastIndex` sharing across invocations.
	const re = new RegExp(TOOL_SENTINEL_RE.source, 'g');
	for (const match of text.matchAll(re)) {
		const b64 = match[1];
		let decoded: string;
		try {
			decoded = Buffer.from(b64, 'base64').toString('utf-8');
		} catch {
			continue;
		}
		let userEdited = false;
		if (decoded.startsWith('__EDITED__\n')) {
			userEdited = true;
			decoded = decoded.slice('__EDITED__\n'.length);
		}
		const newlineIdx = decoded.indexOf('\n');
		if (newlineIdx === -1) {
			continue;
		}
		const headerLine = decoded.slice(0, newlineIdx);
		const body = decoded.slice(newlineIdx + 1);
		// Header shape: `name({inputJson}) → ok` or `name({inputJson}) → error`.
		// Split on the arrow first; the JSON input may contain its own
		// parens so we can't rely on the closing paren as a delimiter.
		const arrowIdx = headerLine.lastIndexOf('→');
		if (arrowIdx === -1) {
			continue;
		}
		const before = headerLine.slice(0, arrowIdx).trimEnd();
		const after = headerLine.slice(arrowIdx + 1).trim();
		const status: 'ok' | 'error' = after === 'ok' ? 'ok' : 'error';
		const openParen = before.indexOf('(');
		if (openParen === -1) {
			continue;
		}
		const name = before.slice(0, openParen).trim();
		// Strip the enclosing parens, leaving just the JSON payload.
		const inputJson = before.slice(openParen + 1, before.length - 1);
		calls.push({ name, inputJson, status, body, userEdited });
	}
	return calls;
}

/**
 * Remove every tool sentinel from `text` so the assistant's prose
 * renders cleanly. Trailing/leading blank lines that the sentinels
 * leave behind are collapsed to a single newline so the prose doesn't
 * carry a sea of empty lines after stripping.
 */
function stripToolSentinels(text: string): string {
	return text
		.replace(new RegExp(TOOL_SENTINEL_RE.source, 'g'), '')
		.replace(/<<<sota:terminal data="[A-Za-z0-9+/=]+">>>/g, '')
		.replace(/<<<sota:approval data="[A-Za-z0-9+/=]+">>>/g, '')
		.replace(/\n{3,}/g, '\n\n');
}

/**
 * Look at a tool name and decide which manifest bucket it belongs in.
 * Substring match keeps us tolerant of plugin-supplied tools that wrap
 * the canonical name (e.g. `mcp__fs__read_file` → 'read'). Returns
 * `undefined` for tools that don't touch files at all (search,
 * formatting, list_directory) so the manifest stays focused.
 */
function inferOperation(toolName: string): ManifestOperation | undefined {
	const n = toolName.toLowerCase();
	if (n.includes('write') || n.includes('create_file')) {
		return 'write';
	}
	if (n.includes('edit') || n.includes('apply_patch') || n.includes('replace')) {
		return 'edit';
	}
	if (n.includes('read')) {
		return 'read';
	}
	if (n.includes('run') || n.includes('exec') || n.includes('shell') || n.includes('command') || n.includes('terminal')) {
		return 'run';
	}
	return undefined;
}

/**
 * Pull a path/command out of the JSON-encoded tool input. Tries the
 * conventional keys in priority order; falls back to `command` last so
 * shell tools land in the manifest under the literal command string.
 */
function extractPathFromInput(inputJson: string): string | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(inputJson);
	} catch {
		return undefined;
	}
	if (!parsed || typeof parsed !== 'object') {
		return undefined;
	}
	const obj = parsed as Record<string, unknown>;
	const candidates = ['path', 'file_path', 'filePath', 'file', 'relPath', 'target', 'command'];
	for (const key of candidates) {
		const value = obj[key];
		if (typeof value === 'string' && value.trim().length > 0) {
			return value.trim();
		}
	}
	return undefined;
}

/**
 * Best-effort JSON pretty-print. Falls back to the raw string when the
 * input isn't valid JSON (e.g. truncated payload from disk).
 */
function prettifyJson(raw: string): string {
	try {
		return JSON.stringify(JSON.parse(raw), null, 2);
	} catch {
		return raw;
	}
}

function truncate(text: string, cap: number): string {
	if (text.length <= cap) {
		return text;
	}
	return text.slice(0, cap) + `\n\n[truncated — full result was ${text.length} chars]`;
}

/**
 * Flatten a {@link ChatMessageContent} into a single string. Image
 * parts are surfaced as a `[image: <name>]` placeholder rather than the
 * raw base64 — full image bytes would balloon the export far beyond
 * what most git hosts and email clients accept.
 */
function contentToText(content: ChatMessageContent): string {
	if (typeof content === 'string') {
		return content;
	}
	if (Array.isArray(content)) {
		return content
			.map(part => {
				if (part.type === 'text') {
					return part.text;
				}
				if (part.type === 'image') {
					return `[image attachment${part.name ? `: ${part.name}` : ''}]`;
				}
				return '';
			})
			.filter(s => s.length > 0)
			.join('\n');
	}
	return '';
}

/**
 * Wrap each line of `text` in a markdown blockquote. Empty lines stay
 * `>` so the visual block doesn't fragment when GitHub renders it.
 */
function blockquote(text: string): string {
	return text
		.split('\n')
		.map(line => (line.length > 0 ? `> ${line}` : `>`))
		.join('\n');
}

function formatTime(timestamp?: number): string {
	if (!timestamp) {
		return '';
	}
	return new Date(timestamp).toISOString();
}

/**
 * Generate a filename-safe slug from a conversation title. Strips
 * non-alphanumerics, collapses runs of dashes, and caps at 50 chars so the
 * resulting filename stays readable on every filesystem we care about.
 * Falls back to `'conversation'` when the title contains no usable
 * characters (e.g. all whitespace or punctuation).
 */
export function slugifyTitle(title: string): string {
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.substring(0, 50);
	return slug.length > 0 ? slug : 'conversation';
}

/**
 * Build the canonical export filename for a conversation. The shape is
 * `son-of-anton-conversation-<yyyy-mm-ddThh-mm-ss>.md`; the date defaults
 * to "now" but is injectable for deterministic tests.
 */
export function exportFilename(record: ConversationRecord, date: Date = new Date()): string {
	const slug = slugifyTitle(record.summary.title);
	// Replace colons + dots so the filename is portable on Windows.
	const stamp = date.toISOString().replace(/[:.]/g, '-');
	return `son-of-anton-conversation-${slug}-${stamp}.md`;
}

// Suppress unused-import warning for `ChatMessage` — re-exporting keeps the
// type addressable in case downstream callers want to extend the exporter
// without a separate import.
export type { ChatMessage };
