/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBindLink, ILivingDoc, ILivingDocBlock, LivingDocBlockType } from './livingDocsModel.js';

// The clean-file format (spec 08). A Living Document is portable Markdown:
//   - YAML-ish frontmatter holds the title/subtitle and the `sources:` / `context:` dependency lists
//   - value bindings live inline as real Markdown links with a `bind:` scheme, so the file renders
//     correctly in any viewer and the resolved value is its own visible text:
//       Revenue grew [18%](bind:metrics.mrr.delta) week-on-week to [$48.6k](bind:metrics.mrr) MRR.
//
// There are no HTML comments, no `{cell}` placeholders, and no slugged block ids on disk: the bind
// link's key is the durable anchor. The companion `<doc>.lock.json` carries the dependency graph.

// Matches one inline bind link: [visible value](bind:key). The key runs to the closing paren and
// carries no whitespace, e.g. `metrics.mrr` or `metrics.mrr.delta`.
const BIND_LINK_RE = /\[([^\]]*)\]\(bind:([^)\s]+)\)/g;

/** Every bind-link occurrence in a span of Markdown, in document order. */
export function extractBindLinks(text: string): IBindLink[] {
	const out: IBindLink[] = [];
	for (const m of text.matchAll(BIND_LINK_RE)) {
		out.push({ value: m[1], key: m[2] });
	}
	return out;
}

/**
 * Rewrite the visible link text of every bind link to the resolved value from the lock (lock wins).
 * Keys absent from `resolved` keep their current cached text. This is the rendered-cache
 * reconciliation: the `.md` is brought in line with the lock's authoritative values.
 */
export function reconcileBindLinks(text: string, resolved: ReadonlyMap<string, string>): string {
	return text.replace(BIND_LINK_RE, (whole, _value: string, key: string) => {
		const next = resolved.get(key);
		return next === undefined ? whole : `[${next}](bind:${key})`;
	});
}

function slug(s: string): string {
	return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
}

interface IFrontmatter {
	title: string;
	subtitle: string;
	sources: string[];
	context: string[];
}

// Parse the YAML-ish frontmatter: `title`/`subtitle` scalars and `sources:` / `context:` block
// lists (`- item` lines). Returns the frontmatter values and the body that follows.
function parseFrontmatter(text: string): { fm: IFrontmatter; body: string } {
	const fm: IFrontmatter = { title: '', subtitle: '', sources: [], context: [] };
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
	if (!match) {
		return { fm, body: text };
	}
	const lines = match[1].split(/\r?\n/);
	let listInto: string[] | undefined;
	for (const line of lines) {
		const item = /^\s+-\s+(.*)$/.exec(line);
		if (item && listInto) {
			const value = item[1].trim().replace(/^["']|["']$/g, '');
			if (value) { listInto.push(value); }
			continue;
		}
		const i = line.indexOf(':');
		if (i < 0) { continue; }
		const key = line.slice(0, i).trim();
		const value = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
		listInto = undefined;
		if (key === 'title') { fm.title = value; }
		else if (key === 'subtitle') { fm.subtitle = value; }
		else if (key === 'sources') { listInto = fm.sources; if (value) { fm.sources.push(value); } }
		else if (key === 'context') { listInto = fm.context; if (value) { fm.context.push(value); } }
	}
	return { fm, body: text.slice(match[0].length) };
}

function classify(chunk: string): LivingDocBlockType {
	const lines = chunk.split(/\r?\n/).filter(l => l.trim().length > 0);
	if (lines.length === 1 && /^#{1,6}\s+/.test(lines[0])) { return 'heading'; }
	if (lines.length > 0 && lines.every(l => l.trim().startsWith('|'))) { return 'table'; }
	return 'paragraph';
}

function blockFor(chunk: string, index: number): ILivingDocBlock {
	const type = classify(chunk);
	const binds = extractBindLinks(chunk);
	if (type === 'heading') {
		const m = /^(#{1,6})\s+(.*)$/.exec(chunk.trim())!;
		const headingText = m[2].trim();
		return { id: 'h-' + slug(headingText), type, text: headingText, level: m[1].length, binds };
	}
	return { id: 'b-' + index, type, text: chunk, binds };
}

export function parseLivingDoc(text: string): ILivingDoc {
	const { fm, body } = parseFrontmatter(text);
	const cleanBody = body.replace(/^\r?\n+/, '').replace(/\s+$/, '') + '\n';

	const blocks: ILivingDocBlock[] = [];
	let index = 0;
	for (const chunk of cleanBody.split(/\r?\n[ \t]*\r?\n/)) {
		if (chunk.trim().length === 0) { continue; }
		blocks.push(blockFor(chunk.replace(/\s+$/, ''), index++));
	}

	const hasBinds = blocks.some(b => b.binds.length > 0);
	const isLiving = fm.sources.length > 0 || fm.context.length > 0 || hasBinds;

	let title = fm.title;
	if (!title) {
		const h1 = blocks.find(b => b.type === 'heading' && b.level === 1);
		title = h1 ? h1.text : 'Untitled';
	}

	return {
		title,
		frontmatterTitle: fm.title,
		subtitle: fm.subtitle,
		sources: fm.sources,
		context: fm.context,
		blocks,
		isLiving,
		body: cleanBody,
	};
}

// Render one block back to its Markdown source. Headings re-emit their `#` prefix from the level;
// everything else round-trips its raw text verbatim.
function serializeBlock(block: ILivingDocBlock): string {
	if (block.type === 'heading') {
		return `${'#'.repeat(block.level ?? 2)} ${block.text}`;
	}
	return block.text;
}

// Add or remove a single `value` in a frontmatter block list (`sources:` or `context:`), returning the new
// raw text with the body left verbatim. Creates a frontmatter block if the doc has none; drops the key when
// its last item is removed. Idempotent (adding an existing / removing an absent value is a no-op).
export function withFrontmatterList(text: string, key: 'sources' | 'context', value: string, add: boolean): string {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
	if (!match) {
		// A plain doc gains its first entry: prepend a minimal frontmatter block (no-op on remove).
		return add ? `---\n${key}:\n  - ${value}\n---\n\n${text}` : text;
	}

	// Walk the frontmatter lines, lifting out the existing `<key>:` block (key + its `- ` items) and
	// keeping everything else (title/subtitle, the other list) in place.
	const kept: string[] = [];
	const existing: string[] = [];
	let keyAt = -1;
	let inList = false;
	for (const line of match[1].split(/\r?\n/)) {
		const item = /^\s+-\s+(.*)$/.exec(line);
		if (inList && item) {
			existing.push(item[1].trim().replace(/^["']|["']$/g, ''));
			continue;
		}
		inList = false;
		const colon = line.indexOf(':');
		const lineKey = colon >= 0 ? line.slice(0, colon).trim() : '';
		if (lineKey === key) {
			inList = true;
			keyAt = kept.length;
			const inline = line.slice(colon + 1).trim().replace(/^["']|["']$/g, '');
			if (inline) { existing.push(inline); }
			continue;
		}
		kept.push(line);
	}

	const changed = add ? !existing.includes(value) : existing.includes(value);
	if (!changed) { return text; }

	const next = add ? [...existing, value] : existing.filter(v => v !== value);
	const block = next.length ? [`${key}:`, ...next.map(v => `  - ${v}`)] : [];
	// Re-insert where the key was; a new `sources:` goes before `context:`, a new `context:` at the end.
	let insertAt = keyAt;
	if (insertAt < 0) {
		const ctxIdx = key === 'sources' ? kept.findIndex(l => l.trim().startsWith('context:')) : -1;
		insertAt = ctxIdx >= 0 ? ctxIdx : kept.length;
	}
	const fmLines = [...kept.slice(0, insertAt), ...block, ...kept.slice(insertAt)];
	return `---\n${fmLines.join('\n')}\n---\n${text.slice(match[0].length)}`;
}

// Convenience wrapper for the document's value sources (`sources:` frontmatter list).
export function withFrontmatterSource(text: string, source: string, add: boolean): string {
	return withFrontmatterList(text, 'sources', source, add);
}

// Replace a document's body while keeping its frontmatter block verbatim. Used when a living document is
// edited in ProseMirror (which only round-trips the body): the editor serializes the body back to
// Markdown, and this re-attaches the original `---` frontmatter so `sources:`/`context:` are never lost.
// A doc with no frontmatter returns the new body unchanged. The new body is normalized to end in a single
// trailing newline.
export function withReplacedBody(text: string, newBody: string): string {
	const body = newBody.replace(/\s+$/, '') + '\n';
	const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text);
	if (!match) {
		return body;
	}
	return text.slice(0, match[0].length).replace(/\r?\n*$/, '\n') + '\n' + body;
}

export function serializeLivingDoc(doc: ILivingDoc): string {
	const body = doc.blocks.map(serializeBlock).join('\n\n');

	// Only emit the frontmatter the file actually authored. The `title:` line comes from
	// `frontmatterTitle` (the authored value), NEVER the derived `doc.title` (H1/'Untitled' fallback) -- so
	// a plain Markdown doc round-trips byte-clean and an accepted chat edit never injects a `title:` block
	// into a file the user wrote as plain Markdown (plan 16 iter 4, decision 57).
	const fmTitle = doc.frontmatterTitle ?? '';
	const fmLines: string[] = [];
	if (fmTitle) { fmLines.push(`title: ${fmTitle}`); }
	if (doc.subtitle) { fmLines.push(`subtitle: ${doc.subtitle}`); }
	if (doc.sources.length) {
		fmLines.push('sources:');
		for (const s of doc.sources) { fmLines.push(`  - ${s}`); }
	}
	if (doc.context.length) {
		fmLines.push('context:');
		for (const c of doc.context) { fmLines.push(`  - ${c}`); }
	}

	// No authored frontmatter -> the document is plain Markdown; emit the body alone (no `---` block).
	if (fmLines.length === 0) {
		return `${body}\n`;
	}
	return `---\n${fmLines.join('\n')}\n---\n\n${body}\n`;
}

// The chat model is asked for "ONLY a JSON object" of {reply, edits, inserts}, but a real model
// intermittently wraps it in prose, truncates it, or answers in plain text. The old call-site did a bare
// `JSON.parse(raw.slice(indexOf('{'), lastIndexOf('}')+1))`, which THREW on any of those and surfaced as a
// flat "the agent model errored". This pure parser is tolerant (plan 16 iter 5, decision 58): it extracts
// the JSON object when present, and otherwise degrades to treating the whole reply as a plain chat answer
// (no proposals) -- never a crash. Unit-tested independently of the model.
export interface IParsedChatResponse {
	readonly reply: string;
	readonly edits: { heading?: string; oldText?: string; newText?: string; rationale?: string }[];
	readonly inserts: { afterHeading?: string; newText?: string; rationale?: string }[];
}

// Extract the first complete JSON object from a string, ignoring prose or stray characters before and
// after it AND dropping stray closing tokens the model appends inside it. A real model (gpt-4o-mini,
// observed live) intermittently wraps the object in prose, appends a stray trailing `}` or a stray `]` on
// an array (`{..."inserts":[]]}`), or truncates mid-stream; the old `indexOf('{')..lastIndexOf('}')` slice
// broke on any of those and leaked the raw JSON into the chat. This rebuilds the object from the first `{`,
// tracking brace AND bracket depth (plus string state + escapes), emitting characters but DROPPING any
// closer that would go below zero - so a doubled `}}` / `]]` the model tacked on is discarded rather than
// breaking the parse. Returns the reconstructed object string, or undefined when no object ever closes
// (a truncated stream) so callers degrade to a plain answer. Pure + unit-tested.
function extractBalancedJsonObject(raw: string): string | undefined {
	const start = raw.indexOf('{');
	if (start < 0) { return undefined; }
	let braceDepth = 0, bracketDepth = 0, inString = false, escaped = false;
	let out = '';
	for (let i = start; i < raw.length; i++) {
		const ch = raw[i];
		if (inString) {
			out += ch;
			if (escaped) { escaped = false; }
			else if (ch === '\\') { escaped = true; }
			else if (ch === '"') { inString = false; }
			continue;
		}
		if (ch === '"') { inString = true; out += ch; continue; }
		if (ch === '{') { braceDepth++; out += ch; continue; }
		if (ch === '[') { bracketDepth++; out += ch; continue; }
		if (ch === ']') {
			if (bracketDepth === 0) { continue; } // stray array close -> drop
			bracketDepth--; out += ch; continue;
		}
		if (ch === '}') {
			if (braceDepth === 0) { continue; } // stray object close -> drop
			braceDepth--; out += ch;
			if (braceDepth === 0 && bracketDepth === 0) { return out; } // object complete
			continue;
		}
		out += ch;
	}
	return undefined; // never balanced (truncated) -> plain answer
}

export function parseChatResponse(raw: string): IParsedChatResponse {
	const plain: IParsedChatResponse = { reply: raw.trim(), edits: [], inserts: [] };
	const objStr = extractBalancedJsonObject(raw);
	if (!objStr) {
		return plain; // no balanced JSON object -> a plain-text answer
	}
	try {
		const json = JSON.parse(objStr) as {
			reply?: unknown;
			edits?: unknown;
			inserts?: unknown;
		};
		return {
			// A parsed object with no `reply` leaves reply empty -- the queued proposal cards carry the meaning.
			reply: typeof json.reply === 'string' ? json.reply.trim() : '',
			edits: Array.isArray(json.edits) ? json.edits : [],
			inserts: Array.isArray(json.inserts) ? json.inserts : [],
		};
	} catch {
		return plain; // malformed / truncated JSON -> degrade to a plain answer, never throw
	}
}

// The multi-document chat contract (plan 18, decision 62): one model call over the whole working set
// returns a reply plus a per-document map of edits/inserts, each entry keyed by the document it targets.
// Tolerant in the same way as parseChatResponse: a non-JSON / truncated reply degrades to a plain answer
// with no per-doc proposals (never throws). The `doc` key is matched to a working-set document by title
// at the call site.
// Each proposed edit/insert may carry a SOURCE GROUNDING (plan 23.4, decision #77): a short verbatim
// `sourceQuote` from the attached source (the transcript) plus, where the model can determine it, a
// `sourceLine` number. Both are OPTIONAL and only appear on the parsed object when the model supplied
// them (a non-numeric `sourceLine` is dropped, the quote kept) - the parser NEVER fabricates a line.
export interface IParsedChatEdit {
	readonly heading?: string;
	readonly oldText?: string;
	readonly newText?: string;
	readonly rationale?: string;
	readonly sourceQuote?: string;
	readonly sourceLine?: number;
}

export interface IParsedChatInsert {
	readonly afterHeading?: string;
	readonly newText?: string;
	readonly rationale?: string;
	readonly sourceQuote?: string;
	readonly sourceLine?: number;
}

export interface IParsedDocEdits {
	readonly doc: string;
	readonly edits: IParsedChatEdit[];
	readonly inserts: IParsedChatInsert[];
}

export interface IParsedMultiChatResponse {
	readonly reply: string;
	readonly docs: IParsedDocEdits[];
}

// Copy through only the string fields the model actually supplied, and attach the optional source
// grounding when present. Building the object key-by-key (rather than spreading undefineds) keeps the
// parsed shape minimal so tolerant callers and deepStrictEqual tests see no fabricated `undefined` keys.
function readSourceGrounding(raw: { sourceQuote?: unknown; sourceLine?: unknown }, into: { sourceQuote?: string; sourceLine?: number }): void {
	if (typeof raw.sourceQuote === 'string' && raw.sourceQuote.trim()) { into.sourceQuote = raw.sourceQuote; }
	if (typeof raw.sourceLine === 'number' && Number.isFinite(raw.sourceLine)) { into.sourceLine = raw.sourceLine; }
}

function normaliseEdit(raw: { heading?: unknown; oldText?: unknown; newText?: unknown; rationale?: unknown; sourceQuote?: unknown; sourceLine?: unknown }): IParsedChatEdit {
	const edit: { heading?: string; oldText?: string; newText?: string; rationale?: string; sourceQuote?: string; sourceLine?: number } = {};
	if (typeof raw.heading === 'string') { edit.heading = raw.heading; }
	if (typeof raw.oldText === 'string') { edit.oldText = raw.oldText; }
	if (typeof raw.newText === 'string') { edit.newText = raw.newText; }
	if (typeof raw.rationale === 'string') { edit.rationale = raw.rationale; }
	readSourceGrounding(raw, edit);
	return edit;
}

function normaliseInsert(raw: { afterHeading?: unknown; newText?: unknown; rationale?: unknown; sourceQuote?: unknown; sourceLine?: unknown }): IParsedChatInsert {
	const insert: { afterHeading?: string; newText?: string; rationale?: string; sourceQuote?: string; sourceLine?: number } = {};
	if (typeof raw.afterHeading === 'string') { insert.afterHeading = raw.afterHeading; }
	if (typeof raw.newText === 'string') { insert.newText = raw.newText; }
	if (typeof raw.rationale === 'string') { insert.rationale = raw.rationale; }
	readSourceGrounding(raw, insert);
	return insert;
}

// Look up the 1-based line number of a source quote in the real source text (plan 23.4). Used to fill
// a decision's `sourceLine` truthfully when the model gave a quote but no number: we search the actual
// attached source for the quote and return the line it starts on. Matching is whitespace- and
// case-insensitive, and tolerant of the source wrapping a sentence across lines (the quote's leading
// run is matched against a small sliding window of joined lines). Returns undefined when the quote is
// not found - the caller then shows the quote with NO line chip. NEVER guesses a line.
export function findQuoteLine(sourceText: string, quote: string): number | undefined {
	const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
	const needle = norm(quote);
	if (!needle) { return undefined; }
	const lines = sourceText.split(/\r?\n/);
	// The source may show its own line numbers as a leading token (e.g. "2  Decision: ..."); strip a
	// leading integer so the match is on the prose, and remember the printed number is not what we return
	// (we return the true file line so it always matches the reader's cross-check against the raw file).
	const clean = lines.map(l => norm(l.replace(/^\s*\d+\s+/, '')));
	// First try a whole-line containment; then try joining each line with the next so a wrapped decision
	// ("...REQUIRED for all administrative access,\n including cloud consoles...") still resolves to its
	// first line. The needle only needs its leading portion to match for a wrapped sentence.
	for (let i = 0; i < clean.length; i++) {
		if (!clean[i]) { continue; }
		// Whole-line containment either way, but only treat the line as a match when the model's quote
		// extends slightly past it (needle.includes(line)) if the line is nearly as long as the needle -
		// otherwise a short source line ("MFA required.") would false-match a longer, unrelated quote and
		// assign a wrong-but-real line, which would break the provenance the decisions column promises.
		if (clean[i].includes(needle)) { return i + 1; }
		if (needle.includes(clean[i]) && clean[i].length >= needle.length * 0.8) { return i + 1; }
	}
	for (let i = 0; i < clean.length - 1; i++) {
		const joined = `${clean[i]} ${clean[i + 1]}`.trim();
		if (joined && joined.includes(needle)) { return i + 1; }
	}
	return undefined;
}

export function parseMultiChatResponse(raw: string): IParsedMultiChatResponse {
	const plain: IParsedMultiChatResponse = { reply: raw.trim(), docs: [] };
	const objStr = extractBalancedJsonObject(raw);
	if (!objStr) {
		return plain;
	}
	try {
		const json = JSON.parse(objStr) as { reply?: unknown; docs?: unknown };
		const docs: IParsedDocEdits[] = Array.isArray(json.docs)
			? json.docs
				.filter((d): d is { doc?: unknown; edits?: unknown; inserts?: unknown } => !!d && typeof d === 'object')
				.map(d => ({
					doc: typeof d.doc === 'string' ? d.doc : '',
					edits: Array.isArray(d.edits) ? d.edits.map(normaliseEdit) : [],
					inserts: Array.isArray(d.inserts) ? d.inserts.map(normaliseInsert) : [],
				}))
			: [];
		return { reply: typeof json.reply === 'string' ? json.reply.trim() : '', docs };
	} catch {
		return plain;
	}
}
