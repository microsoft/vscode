/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pure helpers used by the Cache Explorer to compare two model-turn requests
 * (A and B) and identify where the prompt prefix diverges.
 *
 * The engine works on the {@link IChatDebugEventModelTurnContent.sections}
 * "Input Messages" section, which is a JSON-stringified array of
 *   `[{ role, name?, parts: [{ type: 'text', content, name? }, ...] }]`
 * matching the OpenTelemetry GenAI semantic convention used by
 * `chatParticipantTelemetry.ts`.
 *
 * All functions are pure — no DOM, no services — so they can be unit tested
 * in isolation.
 */

/**
 * A normalized request message used by the diff engine.
 */
export interface INormalizedMessage {
	readonly role: string;
	readonly name?: string;
	/** Concatenation of all `text` parts in the message. */
	readonly text: string;
	/** Character length of `text` as a UTF-16 code unit count (`text.length`). */
	readonly charLength: number;
}

/** Classification of a single signature token when comparing A and B. */
export const enum CacheDiffKind {
	/** Same role+name and same charLength in both A and B. */
	Identical = 'identical',
	/** Same role+name and same charLength but different content. */
	ContentDrift = 'contentDrift',
	/** Same role+name but different charLength. */
	LengthChange = 'lengthChange',
	/** Position exists only in A. */
	OnlyInA = 'onlyInA',
	/** Position exists only in B. */
	OnlyInB = 'onlyInB',
}

/**
 * A single token in the side-by-side prompt signature.
 *
 * The signature is computed by zipping A's and B's normalized messages
 * positionally and classifying each index independently. The first
 * divergence is what breaks the prompt cache, but later positions can
 * still be reported as {@link CacheDiffKind.Identical} if their content
 * happens to match \u2014 we surface per-position truth here and let the
 * UI decide how to interpret it (the cache-break marker, summary copy,
 * and "Where the cache broke" line all key off the *first* divergent
 * index, not the last).
 */
export interface ICacheSignatureToken {
	readonly index: number;
	readonly kind: CacheDiffKind;
	readonly aRole?: string;
	readonly aName?: string;
	readonly aCharLength?: number;
	readonly bRole?: string;
	readonly bName?: string;
	readonly bCharLength?: number;
}

/**
 * The first place where A and B's prompt prefix diverges. Anything after
 * this index cannot be served from the prompt cache.
 */
export interface ICacheBreak {
	readonly index: number;
	readonly kind: Exclude<CacheDiffKind, CacheDiffKind.Identical>;
}

/**
 * A single drifting component (e.g. a message at index N).
 */
export interface IComponentDrift {
	readonly name: string;
	readonly role?: string;
	readonly status: CacheDiffKind;
	readonly aSize: number;
	readonly bSize: number;
}

/**
 * Aggregate result of comparing two requests.
 */
export interface ICacheDiffResult {
	readonly signature: readonly ICacheSignatureToken[];
	readonly break: ICacheBreak | undefined;
	readonly drift: readonly IComponentDrift[];
	/**
	 * Counts of identical / drift / one-sided positions across the whole
	 * signature. Useful for the summary pills.
	 */
	readonly counts: {
		readonly identical: number;
		readonly contentDrift: number;
		readonly lengthChange: number;
		readonly onlyInA: number;
		readonly onlyInB: number;
	};
}

interface IRawPart {
	readonly type?: string;
	readonly content?: unknown;
	readonly name?: string;
	readonly id?: string;
	readonly arguments?: unknown;
	readonly response?: unknown;
	readonly tools?: unknown;
	readonly status?: string;
}

interface IRawMessage {
	readonly role?: string;
	readonly name?: string;
	readonly parts?: readonly IRawPart[];
}

/**
 * Parse a JSON-encoded `inputMessages` payload into normalized messages.
 *
 * Returns an empty array on any parse error so callers can render a clear
 * empty-state without try/catch boilerplate.
 */
export function parseInputMessages(inputMessagesJson: string | undefined): readonly INormalizedMessage[] {
	if (!inputMessagesJson) {
		return [];
	}
	let raw: unknown;
	try {
		raw = JSON.parse(inputMessagesJson);
	} catch {
		return [];
	}
	if (!Array.isArray(raw)) {
		return [];
	}

	const out: INormalizedMessage[] = [];
	for (const m of raw as readonly IRawMessage[]) {
		if (!m || typeof m !== 'object') {
			continue;
		}
		let role = typeof m.role === 'string' ? m.role : 'unknown';
		const name = typeof m.name === 'string' ? m.name : undefined;
		let text = '';
		let hasToolResponse = false;
		let hasToolCall = false;
		let hasToolSearchOutput = false;
		let hasText = false;
		if (Array.isArray(m.parts)) {
			for (const p of m.parts) {
				if (!p || typeof p !== 'object') {
					continue;
				}
				switch (p.type) {
					case undefined:
					case 'text':
					case 'reasoning':
						if (typeof p.content === 'string') {
							text += p.content;
							hasText = true;
						}
						break;
					case 'tool_call_response':
					case 'tool_result':
						if (typeof p.response === 'string') {
							text += p.response;
						} else if (p.response !== undefined) {
							text += stableStringify(p.response);
						} else if (typeof p.content === 'string') {
							text += p.content;
						} else if (p.content !== undefined) {
							text += stableStringify(p.content);
						}
						hasToolResponse = true;
						break;
					case 'tool_call':
						// Tool calls live on assistant messages; include their
						// stringified arguments so a tool-call argument change
						// (e.g. file path) shows up as drift.
						if (p.name) { text += `call:${p.name}`; }
						if (p.arguments !== undefined) { text += stableStringify(p.arguments); }
						hasToolCall = true;
						break;
					case 'tool_search_output':
						text += stableStringify({
							id: p.id,
							status: p.status,
							tools: p.tools,
						});
						hasToolSearchOutput = true;
						break;
				}
			}
		}
		// If a message is dominated by tool I/O, label its role accordingly
		// so the visualization labels it as `tool` rather than as a `user`
		// or `assistant` message with mysterious empty content.
		if (hasToolSearchOutput && !hasText) {
			role = 'tool_search';
		} else if (hasToolResponse && !hasText) {
			role = 'tool';
		} else if (hasToolCall && !hasText && role === 'assistant') {
			role = 'assistant';
		}
		// Defensive fallback: if we recognized neither a role nor any
		// content, dump the whole raw message as text so the diff still
		// has *something* to compare. This catches provider-specific
		// shapes that the upstream normalizer hasn't been taught about
		// yet (e.g. a new `type: '...'` item type added to the OpenAI
		// Responses API). Without this fallback the message reads as
		// `unknown / 0 chars` and silently matches every other empty
		// message, hiding real drift from the user.
		if (text.length === 0 && role === 'unknown') {
			text = stableStringify(m);
		}
		out.push({ role, name, text, charLength: text.length });
	}
	return out;
}

/**
 * Render an opaque value (tool arguments, response payload) as a string in
 * a way that matches what an HTTP client would actually serialize. We do
 * not normalize key order: if a provider's serializer differs between
 * requests, that *is* a real cache break we want to surface.
 *
 * The fallback to {@link String} is reached only for values that
 * `JSON.stringify` rejects \u2014 circular references or `BigInt` payloads.
 * Both produce a stable but lossy representation (e.g. `[object Object]`)
 * which still surfaces as content drift in the diff rather than silently
 * matching, so the user notices that something unusual went through. We
 * intentionally do not log here so the diff engine stays free of service
 * dependencies; the caller is welcome to wrap with logging when needed.
 */
function stableStringify(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

/**
 * Returns true iff the two messages have the same role, name, and content.
 *
 * The `charLength` check is redundant with `text` equality but acts as a
 * cheap fast-fail: comparing two large message bodies that already differ
 * in length is wasted work.
 */
function messagesEqual(a: INormalizedMessage, b: INormalizedMessage): boolean {
	return a.role === b.role && a.name === b.name && a.charLength === b.charLength && a.text === b.text;
}

/**
 * Compute the per-position diff between two normalized message arrays.
 *
 * The algorithm is intentionally simple (positional zip) rather than a full
 * Myers diff: prompt caches are prefix-based, so the moment two messages at
 * the same index diverge in role, length, or content the cache breaks.
 * Reporting that first divergence is far more useful than computing a
 * minimum edit script.
 */
export function diffPromptSignature(a: readonly INormalizedMessage[], b: readonly INormalizedMessage[]): ICacheDiffResult {
	const signature: ICacheSignatureToken[] = [];
	const drift: IComponentDrift[] = [];
	const counts = { identical: 0, contentDrift: 0, lengthChange: 0, onlyInA: 0, onlyInB: 0 };
	let breakResult: ICacheBreak | undefined;
	let broken = false;

	const max = Math.max(a.length, b.length);
	for (let i = 0; i < max; i++) {
		const ai = a[i];
		const bi = b[i];

		if (ai && !bi) {
			counts.onlyInA++;
			signature.push({ index: i, kind: CacheDiffKind.OnlyInA, aRole: ai.role, aName: ai.name, aCharLength: ai.charLength });
			drift.push({ name: `messages[${i}]`, role: ai.role, status: CacheDiffKind.OnlyInA, aSize: ai.charLength, bSize: 0 });
			if (!broken) {
				broken = true;
				breakResult = { index: i, kind: CacheDiffKind.OnlyInA };
			}
			continue;
		}
		if (bi && !ai) {
			counts.onlyInB++;
			signature.push({ index: i, kind: CacheDiffKind.OnlyInB, bRole: bi.role, bName: bi.name, bCharLength: bi.charLength });
			drift.push({ name: `messages[${i}]`, role: bi.role, status: CacheDiffKind.OnlyInB, aSize: 0, bSize: bi.charLength });
			if (!broken) {
				broken = true;
				breakResult = { index: i, kind: CacheDiffKind.OnlyInB };
			}
			continue;
		}
		// Both present
		if (!ai || !bi) {
			continue; // unreachable, but appeases strict null checks
		}
		if (messagesEqual(ai, bi)) {
			counts.identical++;
			signature.push({
				index: i, kind: CacheDiffKind.Identical,
				aRole: ai.role, aName: ai.name, aCharLength: ai.charLength,
				bRole: bi.role, bName: bi.name, bCharLength: bi.charLength,
			});
			continue;
		}
		// Diverged
		const kind = ai.charLength === bi.charLength ? CacheDiffKind.ContentDrift : CacheDiffKind.LengthChange;
		if (kind === CacheDiffKind.ContentDrift) {
			counts.contentDrift++;
		} else {
			counts.lengthChange++;
		}
		signature.push({
			index: i, kind,
			aRole: ai.role, aName: ai.name, aCharLength: ai.charLength,
			bRole: bi.role, bName: bi.name, bCharLength: bi.charLength,
		});
		drift.push({ name: `messages[${i}]`, role: ai.role, status: kind, aSize: ai.charLength, bSize: bi.charLength });
		if (!broken) {
			broken = true;
			breakResult = { index: i, kind };
		}
	}

	return { signature, break: breakResult, drift, counts };
}

/**
 * Names of the synthetic "prefix" components that live alongside the message
 * array in a request: the system instructions and the tool catalog. These
 * are part of the cache key but not in `inputMessages`, so we surface them
 * as named drift entries via {@link appendSystemDrift} / {@link appendToolsDrift}.
 *
 * Order matters: the helpers below preserve this order so the rendered
 * Components accordion always reads `[system, tools, ...messages]`,
 * regardless of which helper was called first or whether other entries
 * were inserted in between.
 */
const PREFIX_COMPONENT_ORDER: readonly string[] = ['system', 'tools'];

/**
 * Insert a single prefix-component drift entry into a drift list while
 * preserving the canonical order defined by {@link PREFIX_COMPONENT_ORDER}.
 *
 * Splits the input into "known-prefix entries" (those with a name in
 * {@link PREFIX_COMPONENT_ORDER}) and "everything else", merges in the new
 * entry, sorts the prefix bucket by its declared order, and concatenates.
 * This means callers can append in any order and still get the same shape.
 */
function insertPrefixComponent(drift: readonly IComponentDrift[], entry: IComponentDrift): IComponentDrift[] {
	const prefixEntries: IComponentDrift[] = [];
	const rest: IComponentDrift[] = [];
	for (const d of drift) {
		if (PREFIX_COMPONENT_ORDER.includes(d.name)) {
			// Defensive dedupe: if a caller already inserted an entry for the
			// same prefix component (e.g. a refactor accidentally double-calls
			// `appendToolsDrift`), keep only the latest one to avoid silently
			// rendering two `tools` rows in the Components accordion.
			if (d.name !== entry.name) {
				prefixEntries.push(d);
			}
		} else {
			rest.push(d);
		}
	}
	prefixEntries.push(entry);
	prefixEntries.sort((a, b) => PREFIX_COMPONENT_ORDER.indexOf(a.name) - PREFIX_COMPONENT_ORDER.indexOf(b.name));
	return [...prefixEntries, ...rest];
}

/**
 * Classify a string-pair drift. Returns `undefined` when both sides match
 * (caller should skip emitting an entry).
 */
function classifyStringDrift(a: string | undefined, b: string | undefined): CacheDiffKind | undefined {
	if (a === b) {
		return undefined;
	}
	if (!a) {
		return CacheDiffKind.OnlyInB;
	}
	if (!b) {
		return CacheDiffKind.OnlyInA;
	}
	return a.length === b.length ? CacheDiffKind.ContentDrift : CacheDiffKind.LengthChange;
}

/**
 * Add a "system" drift entry to the report when the system instructions
 * differ between the two requests. Inserted at the canonical
 * {@link PREFIX_COMPONENT_ORDER} position regardless of what's already in
 * the drift list.
 */
export function appendSystemDrift(
	drift: IComponentDrift[],
	aSystem: string | undefined,
	bSystem: string | undefined,
): IComponentDrift[] {
	const status = classifyStringDrift(aSystem, bSystem);
	if (status === undefined) {
		return drift;
	}
	return insertPrefixComponent(drift, { name: 'system', status, aSize: aSystem?.length ?? 0, bSize: bSystem?.length ?? 0 });
}

/**
 * Add a "tools" drift entry to the report when the tool definitions catalog
 * differs between the two requests. The catalog is part of the cache key on
 * every model provider, so a change here \u2014 even a pure reorder \u2014 can break
 * the prompt cache. We intentionally do not normalize (sort, hash, parse)
 * the JSON: providers vary in how they hash the catalog, so the safest
 * stance is to surface any byte-level change and let the user judge.
 *
 * Inserted at the canonical {@link PREFIX_COMPONENT_ORDER} position so the
 * order is always `[system, tools, ...messages]` regardless of call order
 * relative to {@link appendSystemDrift}.
 */
export function appendToolsDrift(
	drift: IComponentDrift[],
	aTools: string | undefined,
	bTools: string | undefined,
): IComponentDrift[] {
	const status = classifyStringDrift(aTools, bTools);
	if (status === undefined) {
		return drift;
	}
	return insertPrefixComponent(drift, { name: 'tools', status, aSize: aTools?.length ?? 0, bSize: bTools?.length ?? 0 });
}

/**
 * Format a normalized message into a single-line `role[-name]:bytes` token,
 * matching the convention used by the existing `promptTypes` telemetry.
 */
export function formatSignatureToken(token: ICacheSignatureToken): string {
	const role = token.bRole ?? token.aRole ?? 'unknown';
	const name = token.bName ?? token.aName;
	const a = token.aCharLength;
	const b = token.bCharLength;
	const sizeText = a !== undefined && b !== undefined && a !== b
		? `${a}\u2192${b}`
		: a !== undefined && b === undefined
			? `${a}\u21920`
			: a === undefined && b !== undefined
				? `0\u2192${b}`
				: `${b ?? a ?? 0}`;
	return name ? `${role}-${name}:${sizeText}` : `${role}:${sizeText}`;
}
