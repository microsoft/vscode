/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { scopeBlockEdit } from './livingDocMarkdown.js';
import { ChangeKind, ILivingDoc, ILivingDocLock, IProposedChange } from './livingDocsModel.js';

// The provenance a bound figure answers on hover (plan 29, iter 3): where the value came from, where in
// that source, when it last synced, and whether the source has changed since. Built purely from the lock's
// binding entries + the document's stale-binding set, so the tooltip never fabricates a state - an entry
// the lock has never synced shows the honest "Not yet synced", and `fresh` is the real hash-compare result.
export interface IPmProvenance {
	readonly key: string;
	// The source's file name or endpoint (the part before the `#` in the lock's `source`), e.g. "metrics.csv".
	readonly source: string;
	// The cell/field within the source (the part after the `#`), e.g. "mrr"; empty when the source is atomic.
	readonly location: string;
	// A truthful relative sync label, e.g. "Synced 2 h ago" or "Not yet synced" (never a fabricated time).
	readonly synced: string;
	// True when the current source value still matches the lock's recorded hash (nothing stale for this key).
	readonly fresh: boolean;
}

// A truthful relative "last synced" label from a lock timestamp (plan 29, iter 3). Undefined/unparseable =
// referenced but never synced (the honest idle state), never a fabricated freshness. Mirrors the Knowledge
// screen's `relativeSynced` wording so the figure tooltip and the source registry read identically.
export function relativeSyncedLabel(iso: string | undefined, now: number = Date.now()): string {
	if (!iso) { return 'Not yet synced'; }
	const t = Date.parse(iso);
	if (Number.isNaN(t)) { return 'Not yet synced'; }
	const s = Math.max(0, Math.floor((now - t) / 1000));
	if (s < 60) { return 'Synced just now'; }
	const m = Math.floor(s / 60);
	if (m < 60) { return `Synced ${m} min ago`; }
	const h = Math.floor(m / 60);
	if (h < 24) { return `Synced ${h} h ago`; }
	const d = Math.floor(h / 24);
	return `Synced ${d} day${d === 1 ? '' : 's'} ago`;
}

/**
 * Project the lock's binding ledger into the per-key provenance the figure/gutter hover tooltip reads
 * (plan 29, iter 3). `staleKeys` is the document's freshness `staleBindings` set - a key in it flips
 * `fresh` to false so the tooltip's amber "source changed since" line shows. Pure so it is unit-tested
 * directly and reused by the render payload builder; `now` is injectable for deterministic time tests.
 */
export function buildFigureProvenance(lock: ILivingDocLock, staleKeys: ReadonlySet<string>, now: number = Date.now()): IPmProvenance[] {
	const out: IPmProvenance[] = [];
	for (const key of Object.keys(lock.bindings)) {
		const entry = lock.bindings[key];
		const hashIdx = entry.source.indexOf('#');
		const source = hashIdx >= 0 ? entry.source.slice(0, hashIdx) : entry.source;
		const location = hashIdx >= 0 ? entry.source.slice(hashIdx + 1) : '';
		out.push({ key, source, location, synced: relativeSyncedLabel(entry.syncedAt, now), fresh: !staleKeys.has(key) });
	}
	return out;
}

// One run of a word-level diff: equal text kept, deleted text (red), or inserted text (green).
export interface IPmDiffSegment {
	readonly t: 'eq' | 'del' | 'ins';
	readonly text: string;
}

// A pending meaning-change over an existing block, anchored by the block's current text so the bundle can
// locate the matching ProseMirror node and render the word diff + accept/reject controls over it.
export interface IPmEditDecoration {
	readonly id: string;
	readonly anchorText: string;
	readonly segments: readonly IPmDiffSegment[];
	readonly added: number;
	readonly removed: number;
	readonly source: string;
	readonly confidence: number;
	// The self-explaining framing fields (plan 31 iter 2): the change kind, the model's rationale (empty when
	// it gave none), the verbatim proposed text (for the Tweak in-place editor, iter 3), and the source
	// grounding line where a real one is known - so the inline widget renders the same kind tag / confidence
	// chip / rationale / source chip the rail and cross-doc cards do.
	readonly kind: ChangeKind;
	readonly rationale: string;
	readonly newText: string;
	readonly sourceLine?: number;
}

// A generative insertion, anchored after the heading block it follows (or `null` = end of document).
export interface IPmInsertDecoration {
	readonly id: string;
	readonly afterText: string | null;
	readonly newText: string;
	readonly blockLabel: string;
	readonly confidence: number;
	readonly kind: ChangeKind;
	readonly rationale: string;
	readonly sourceLine?: number;
}

// A provenance gutter marker painted in the 30px gutter column left of the reading column.
//   - a `dot` marks a source-bound block (colour `accent`), vertically centred on the line; it carries the
//     block's bind keys + a `recent` flash flag.
//   - a `bar` spans the rows of a multi-line edited paragraph (colour `attention`); it is anchored by the
//     block's whitespace-collapsed text so the bundle can resolve the same ProseMirror node the edit widget
//     targets. A single-line edit gets no bar (there are no rows to span).
export type IPmGutterMarker =
	| { readonly kind: 'dot'; readonly keys: readonly string[]; readonly recent: boolean }
	| { readonly kind: 'bar'; readonly anchorText: string };

// The full serializable decoration spec sent to the webview; the bundle resolves the text anchors into
// ProseMirror positions and builds the DecorationSet from it.
export interface IPmDecorationSpec {
	readonly edits: readonly IPmEditDecoration[];
	readonly inserts: readonly IPmInsertDecoration[];
	readonly gutters: readonly IPmGutterMarker[];
}

const BIND_LINK_RE = /\[([^\]]*)\]\(bind:([^)\s]+)\)/g;
function bindToValue(text: string): string {
	return text.replace(BIND_LINK_RE, '$1');
}

// The decoration bundle places an inline diff/insert by EXACT match of its anchor against the live
// ProseMirror node's `textContent`. Source prose is wrapped one-sentence-per-line (house style), but
// CommonMark renders those soft wraps as single spaces, so the node text is single-spaced. Collapse the
// anchor's internal whitespace to match - otherwise a wrapped paragraph never decorates and the change
// shows only in the review rail (the plan-19 baseline bug). Kept here, next to where anchors are built, so
// the host stays the single source of anchor truth (no offline PM-bundle rebuild needed).
function anchorNormalize(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

/** Word-level diff of `oldText` -> `newText` merged into eq/del/ins runs, with the run counts. */
export function wordDiffSegments(oldText: string, newText: string): { segments: IPmDiffSegment[]; added: number; removed: number } {
	const a = oldText.split(/\s+/).filter(Boolean);
	const b = newText.split(/\s+/).filter(Boolean);
	const n = a.length, m = b.length;
	// LCS table, then a backtrack into per-word eq/del/ins operations.
	const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
		}
	}
	type Op = { t: 'eq' | 'del' | 'ins'; w: string };
	const ops: Op[] = [];
	let i = 0, j = 0;
	while (i < n && j < m) {
		if (a[i] === b[j]) { ops.push({ t: 'eq', w: a[i] }); i++; j++; }
		else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: 'del', w: a[i] }); i++; }
		else { ops.push({ t: 'ins', w: b[j] }); j++; }
	}
	while (i < n) { ops.push({ t: 'del', w: a[i++] }); }
	while (j < m) { ops.push({ t: 'ins', w: b[j++] }); }

	// Merge consecutive ops of the same kind into runs; count the del/ins runs for the control row.
	const segments: IPmDiffSegment[] = [];
	let added = 0, removed = 0, k = 0;
	while (k < ops.length) {
		const t = ops[k].t;
		const words: string[] = [];
		while (k < ops.length && ops[k].t === t) { words.push(ops[k].w); k++; }
		segments.push({ t, text: words.join(' ') });
		if (t === 'del') { removed++; }
		else if (t === 'ins') { added++; }
	}
	return { segments, added, removed };
}

/** Map the pending proposals + document into a serializable ProseMirror decoration spec. */
export function buildPmDecorationSpec(doc: ILivingDoc, pending: readonly IProposedChange[], recent: ReadonlySet<string>): IPmDecorationSpec {
	const source = doc.sources.concat(doc.context).join(', ');
	const edits: IPmEditDecoration[] = [];
	const inserts: IPmInsertDecoration[] = [];
	// Anchor texts of paragraphs under a pending meaning-change that span multiple physical lines in the
	// wrapped source (house style: one sentence per line). Those get an `attention` bar in the gutter.
	const barAnchors: string[] = [];

	for (const change of pending) {
		if (change.insert) {
			// A generative insertion lands after its anchor block (a heading), or at the end when unanchored.
			const anchor = change.afterBlockId ? doc.blocks.find(b => b.id === change.afterBlockId) : undefined;
			inserts.push({
				id: change.id,
				afterText: anchor ? anchorNormalize(anchor.text) : null,
				newText: change.newText,
				blockLabel: change.blockLabel,
				confidence: change.confidence,
				kind: change.kind,
				rationale: change.rationale,
				...(typeof change.sourceLine === 'number' ? { sourceLine: change.sourceLine } : {}),
			});
			continue;
		}
		// A meaning-change: anchor on the block's current (resolved) text so the bundle can find the node.
		// When the change targets one item of a list block, scope the anchor + diff to that single `<li>` so
		// the widget places over the changed item and the word diff never shows the sibling items being
		// deleted (decision-68 fix, plan 31 iter 1). A scoped `oldText` (already one item) is returned as-is.
		const oldSource = bindToValue(change.oldText);
		const newSource = bindToValue(change.newText);
		const anchorSource = scopeBlockEdit(oldSource, newSource).oldText;
		const anchorText = anchorNormalize(anchorSource);
		const diff = wordDiffSegments(anchorSource, newSource);
		edits.push({
			id: change.id,
			anchorText,
			segments: diff.segments,
			added: diff.added,
			removed: diff.removed,
			source,
			confidence: change.confidence,
			kind: change.kind,
			rationale: change.rationale,
			newText: newSource,
			...(typeof change.sourceLine === 'number' ? { sourceLine: change.sourceLine } : {}),
		});
		// The bar spans the rows of a MULTI-line paragraph: detect multi-line off the (scoped) anchor source
		// which still carries the hard newlines of a wrapped paragraph, keyed on the same collapsed anchor.
		if (anchorSource.includes('\n')) {
			barAnchors.push(anchorText);
		}
	}

	// Provenance gutter markers: a `dot` for each source-bound block (a recently-applied block flashes),
	// plus an `attention` `bar` for each multi-line edited paragraph. Dots come first (document order).
	const gutters: IPmGutterMarker[] = [];
	for (const block of doc.blocks) {
		if (block.binds.length > 0) {
			gutters.push({ kind: 'dot', keys: block.binds.map(b => b.key), recent: recent.has(block.id) });
		}
	}
	for (const anchorText of barAnchors) {
		gutters.push({ kind: 'bar', anchorText });
	}

	return { edits, inserts, gutters };
}
