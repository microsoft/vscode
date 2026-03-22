/** Do not bridge more than this many characters between consecutive selected words. */
const MAX_INTER_TOKEN_GAP = 6000;

export function normalizeForMatch(s: string): string {
	return s
		.normalize('NFKC')
		.replace(/\u00a0/g, ' ')
		.replace(/\u00ad/g, '')
		.replace(/[\u200b\ufeff\u200c\u200d]/g, '')
		.replace(/\r\n/g, '\n')
		.replace(/\r/g, '\n');
}

function normalizeQuotes(s: string): string {
	return s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, "\"");
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Match selection where the preview used different line breaks or spacing than the source
 * (e.g. single newline vs blank line between blocks).
 */
function flexibleWhitespaceMatch(reg: string, sel: string): { start: number; end: number } | null {
	const trimmed = sel.trim();
	if (!trimmed) {
		return null;
	}
	const parts = trimmed.split(/\s+/).filter(Boolean);
	if (parts.length === 0) {
		return null;
	}
	const pattern = parts.map(escapeRegExp).join('\\s+');
	try {
		const re = new RegExp(pattern, 's');
		const m = re.exec(reg);
		if (m) {
			return { start: m.index, end: m.index + m[0].length };
		}
	} catch {
		// ignore invalid regex (e.g. extreme input)
	}
	return null;
}

/**
 * Map a preview selection string onto a substring of the Markdown `region`.
 * Handles: exact match, newline variants, and whitespace / inline-markdown gaps between words.
 */
export function findSelectionSpanInRegion(region: string, selectedText: string): { start: number; end: number } | null {
	const reg = normalizeForMatch(region);
	const sel = normalizeForMatch(selectedText).trim();
	if (sel.length === 0) {
		return null;
	}

	// 1) Exact substring
	let idx = reg.indexOf(sel);
	if (idx >= 0) {
		return { start: idx, end: idx + sel.length };
	}

	const regQ = normalizeQuotes(reg);
	const selQ = normalizeQuotes(sel);

	// 2) Exact after normalizing curly quotes (source often uses ASCII, preview may not)
	idx = regQ.indexOf(selQ);
	if (idx >= 0) {
		return { start: idx, end: idx + selQ.length };
	}

	// 3) Whitespace-flexible: preview vs source line breaks / spaces differ
	let flex = flexibleWhitespaceMatch(reg, sel);
	if (flex) {
		return flex;
	}
	flex = flexibleWhitespaceMatch(regQ, selQ);
	if (flex) {
		return flex;
	}

	// 4) Token chain: preview omits markdown syntax between words (**, links, list markers, etc.)
	const tokens = sel.split(/\s+/).filter(Boolean);
	if (tokens.length === 0) {
		return null;
	}
	let chain = findTokenChain(reg, tokens);
	if (chain) {
		return chain;
	}

	const tokensQ = selQ.split(/\s+/).filter(Boolean);
	chain = findTokenChain(regQ, tokensQ);
	if (chain) {
		return chain;
	}

	return null;
}

/**
 * If the selection appears exactly once in the document, return its span (used when the
 * block-derived region does not contain a match, e.g. stale block indices after an edit).
 */
export function findSelectionSpanInDocumentIfUnique(
	documentText: string,
	selectedText: string,
): { start: number; end: number } | null {
	const first = findSelectionSpanInRegion(documentText, selectedText);
	if (!first) {
		return null;
	}
	const afterFirst = documentText.slice(first.end);
	const second = findSelectionSpanInRegion(afterFirst, selectedText);
	if (second) {
		return null;
	}
	return first;
}

function findTokenChain(reg: string, tokens: readonly string[]): { start: number; end: number } | null {
	const first = tokens[0]!;
	let searchFrom = 0;
	while (searchFrom < reg.length) {
		const pos = reg.indexOf(first, searchFrom);
		if (pos < 0) {
			break;
		}
		const end = extendTokenChain(reg, pos, first, tokens);
		if (end !== null) {
			return { start: pos, end };
		}
		searchFrom = pos + 1;
	}
	return null;
}

function extendTokenChain(reg: string, pos: number, first: string, tokens: readonly string[]): number | null {
	if (reg.slice(pos, pos + first.length) !== first) {
		return null;
	}
	let i = pos + first.length;
	for (let t = 1; t < tokens.length; t++) {
		const tok = tokens[t]!;
		const j = reg.indexOf(tok, i);
		if (j < 0) {
			return null;
		}
		if (j - i > MAX_INTER_TOKEN_GAP) {
			return null;
		}
		i = j + tok.length;
	}
	return i;
}
