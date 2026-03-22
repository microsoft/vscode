/** Do not bridge more than this many characters between consecutive selected words. */
const MAX_INTER_TOKEN_GAP = 6000;

export function normalizeForMatch(s: string): string {
	return s
		.replace(/\u00a0/g, ' ')
		.replace(/[\u200b\ufeff]/g, '')
		.replace(/\r\n/g, '\n')
		.replace(/\r/g, '\n');
}

function normalizeQuotes(s: string): string {
	return s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, "\"");
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

	// 3) Token chain: preview omits markdown syntax between words (**, links, list markers, etc.)
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
