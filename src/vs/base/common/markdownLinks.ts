/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as marked from './marked/marked.js';

export interface IMarkdownEdit {
	readonly start: number;
	readonly end: number;
	readonly replacement: string;
}

/** Tokens whose source is consumed whole, never searched for links inside. */
function isOpaque(token: marked.Token): boolean {
	switch (token.type) {
		case 'code':
		case 'codespan':
		case 'html':
		case 'link':
		case 'image':
		case 'def':
			return true;
		default:
			return false;
	}
}

function childrenOf(token: marked.Token): readonly marked.Token[] {
	const candidate = token as {
		tokens?: marked.Token[];
		items?: marked.Token[];
		header?: { tokens?: marked.Token[] }[];
		rows?: { tokens?: marked.Token[] }[][];
	};

	if (candidate.items?.length) {
		return candidate.items;
	}
	if (candidate.header || candidate.rows) {
		const cells = [...(candidate.header ?? []), ...(candidate.rows ?? []).flat()];
		return cells.flatMap(cell => cell.tokens ?? []);
	}
	return candidate.tokens ?? [];
}

type Locator = (raw: string, from: number) => { start: number; end: number } | undefined;

/**
 * Returns a lookup for a token's `raw` source in `markdown` at or after a source offset. The lexer
 * turns `\r\n` and `\r` into `\n` before tokenizing, so the search runs over a copy normalized the
 * same way, and its offsets are mapped back to the source. Each lookup is one `indexOf`.
 */
function createLocator(markdown: string): Locator {
	if (!markdown.includes('\r')) {
		return (raw, from) => {
			const start = markdown.indexOf(raw, from);
			return start < 0 ? undefined : { start, end: start + raw.length };
		};
	}

	// `toSource[i]` is the source offset of normalized offset `i`; `toNormalized` is its inverse.
	const toSource = new Int32Array(markdown.length + 1);
	const toNormalized = new Int32Array(markdown.length + 1);
	const normalized = markdown.replace(/\r\n?/g, '\n');
	let n = 0;
	for (let i = 0; i < markdown.length; i++, n++) {
		toSource[n] = i;
		toNormalized[i] = n;
		if (markdown[i] === '\r' && markdown[i + 1] === '\n') {
			toNormalized[++i] = n;
		}
	}
	toSource[n] = markdown.length;
	toNormalized[markdown.length] = n;

	return (raw, from) => {
		const start = normalized.indexOf(raw, toNormalized[from]);
		return start < 0 ? undefined : { start: toSource[start], end: toSource[start + raw.length] };
	};
}

/** The text a reader saw, with markdown emphasis and code markers removed. */
export function markdownTokensToPlainText(tokens: readonly marked.Token[]): string {
	let text = '';
	for (const token of tokens) {
		const children = (token as { tokens?: marked.Token[] }).tokens;
		text += children?.length
			? markdownTokensToPlainText(children)
			: (token as { text?: string; raw?: string }).text ?? (token as { raw?: string }).raw ?? '';
	}
	return text;
}

export interface IMarkdownRewriteContext {
	/** Source ranges of code spans and fenced blocks, whose contents were left untouched. */
	readonly codeRanges: readonly { readonly start: number; readonly end: number }[];
	/** Source ranges holding link reference definitions. See {@link findDefinitionRanges}. */
	readonly definitionRanges: readonly { readonly start: number; readonly end: number }[];
	/** Tokens whose source could not be located, so no edit could be produced for them. */
	readonly unlocatable: readonly (marked.Tokens.Link | marked.Tokens.Image)[];
}

export interface IMarkdownRewriter {
	/** Returns replacement source for a link or image, or `undefined` to keep it verbatim. */
	rewriteLink(token: marked.Tokens.Link | marked.Tokens.Image): string | undefined;
	/** Produces additional edits once traversal has mapped the document. */
	additionalEdits?(markdown: string, context: IMarkdownRewriteContext): readonly IMarkdownEdit[];
}

/**
 * Walks the token tree in document order, tracking how much source each token consumed so an
 * edit lands on the token that produced it. Locating tokens by searching for their source text
 * instead matches the first lookalike — typically a link written inside a code span — which
 * rewrites the sample and leaves the real link in place.
 *
 * Known limitation: a link label spanning lines inside a blockquote or list has its block
 * prefixes stripped from `raw`, so the offset lookup fails and the link is left alone. Blocks
 * whose lines start with tabs cannot be located either, as the lexer expands those to spaces.
 */
function collectEdits(tokens: readonly marked.Token[], locate: Locator, cursor: number, rewriter: IMarkdownRewriter, edits: IMarkdownEdit[], codeRanges: { start: number; end: number }[], unlocatable: (marked.Tokens.Link | marked.Tokens.Image)[]): number {
	for (const token of tokens) {
		if (!isOpaque(token)) {
			const children = childrenOf(token);
			if (children.length) {
				cursor = collectEdits(children, locate, cursor, rewriter, edits, codeRanges, unlocatable);
				continue;
			}
		}

		const raw = (token as { raw?: string }).raw ?? '';
		if (!raw) {
			continue;
		}

		const range = locate(raw, cursor);
		if (!range) {
			if (token.type === 'link' || token.type === 'image') {
				unlocatable.push(token as marked.Tokens.Link | marked.Tokens.Image);
			}
			continue;
		}
		const { start, end } = range;
		cursor = end;

		if (token.type === 'code' || token.type === 'codespan') {
			codeRanges.push({ start, end });
		} else if (token.type === 'link' || token.type === 'image') {
			const replacement = rewriter.rewriteLink(token as marked.Tokens.Link | marked.Tokens.Image);
			if (replacement !== undefined) {
				edits.push({ start, end, replacement });
			} else {
				// The token survives as written, so anything nested inside it — an image with
				// its own target inside a link, say — still has to be visited.
				collectEdits(childrenOf(token), locate, start, rewriter, edits, codeRanges, unlocatable);
			}
		}
	}

	return cursor;
}

/**
 * Finds the source the lexer consumed without emitting any token, which is precisely where the
 * link reference definitions are: the lexer resolves them while parsing and reports them only
 * through the resolved {@link marked.TokensList.links} map, never as a token.
 *
 * Deriving the ranges from what the parser did — rather than matching definition syntax against
 * the whole document — takes each definition whole however its author wrapped the destination or
 * title across lines, and cannot mistake a lookalike written in prose or inside a code fence for
 * a definition, because the parser accounted for those.
 */
function findDefinitionRanges(tokens: readonly marked.Token[], markdown: string, locate: Locator): { start: number; end: number }[] {
	const ranges: { start: number; end: number }[] = [];
	let cursor = 0;
	for (const token of tokens) {
		const raw = (token as { raw?: string }).raw ?? '';
		const range = raw ? locate(raw, cursor) : undefined;
		if (!range) {
			// A block that cannot be placed leaves everything after it unaccounted for, which
			// would read as one enormous definition. Claim nothing rather than cut live text.
			return [];
		}
		if (range.start > cursor && markdown.substring(cursor, range.start).trim()) {
			ranges.push({ start: cursor, end: range.start });
		}
		cursor = range.end;
	}

	if (markdown.substring(cursor).trim()) {
		ranges.push({ start: cursor, end: markdown.length });
	}
	return ranges;
}

/**
 * Rewrites link and image targets in markdown, leaving the source of everything else — notably
 * code spans and fenced blocks — byte for byte intact.
 *
 * Tokens whose source cannot be located — marked strips block prefixes from a label spanning
 * lines inside a list or quote — are reported through {@link IMarkdownRewriteContext.unlocatable}
 * so callers that must not emit a target can fall back to something coarser.
 */
export function rewriteMarkdownLinks(markdown: string, rewriter: IMarkdownRewriter): string {
	let tokens: marked.TokensList;
	try {
		tokens = marked.lexer(markdown);
	} catch {
		return markdown;
	}

	const edits: IMarkdownEdit[] = [];
	const codeRanges: { start: number; end: number }[] = [];
	const unlocatable: (marked.Tokens.Link | marked.Tokens.Image)[] = [];
	const locate = createLocator(markdown);
	collectEdits(tokens, locate, 0, rewriter, edits, codeRanges, unlocatable);
	edits.push(...(rewriter.additionalEdits?.(markdown, {
		codeRanges,
		definitionRanges: findDefinitionRanges(tokens, markdown, locate),
		unlocatable,
	}) ?? []));
	if (!edits.length) {
		return markdown;
	}

	edits.sort((a, b) => a.start - b.start);

	let result = '';
	let position = 0;
	for (const edit of edits) {
		if (edit.start < position) {
			continue;
		}
		result += markdown.substring(position, edit.start) + edit.replacement;
		position = edit.end;
	}
	return result + markdown.substring(position);
}
