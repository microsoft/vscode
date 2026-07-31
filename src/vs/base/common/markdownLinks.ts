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
	/** Reference definitions the lexer resolved, keyed by normalized label. */
	readonly definitions: marked.TokensList['links'];
	/** Tokens whose source could not be located, so no edit could be produced for them. */
	readonly unlocatable: readonly (marked.Tokens.Link | marked.Tokens.Image)[];
}

export interface IMarkdownRewriter {
	/** Returns replacement source for a link or image, or `undefined` to keep it verbatim. */
	rewriteLink(token: marked.Tokens.Link | marked.Tokens.Image): string | undefined;
	/** Returns replacement source for raw HTML, or `undefined` to keep it verbatim. */
	rewriteHtml?(raw: string): string | undefined;
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
 * prefixes stripped from `raw`, so the offset lookup fails and the link is left alone.
 */
function collectEdits(tokens: readonly marked.Token[], markdown: string, cursor: number, rewriter: IMarkdownRewriter, edits: IMarkdownEdit[], codeRanges: { start: number; end: number }[], unlocatable: (marked.Tokens.Link | marked.Tokens.Image)[]): number {
	for (const token of tokens) {
		if (!isOpaque(token)) {
			const children = childrenOf(token);
			if (children.length) {
				cursor = collectEdits(children, markdown, cursor, rewriter, edits, codeRanges, unlocatable);
				continue;
			}
		}

		const raw = (token as { raw?: string }).raw ?? '';
		if (!raw) {
			continue;
		}

		const start = markdown.indexOf(raw, cursor);
		if (start < 0) {
			if (token.type === 'link' || token.type === 'image') {
				unlocatable.push(token as marked.Tokens.Link | marked.Tokens.Image);
			}
			continue;
		}
		const end = start + raw.length;
		cursor = end;

		if (token.type === 'code' || token.type === 'codespan') {
			codeRanges.push({ start, end });
		} else if (token.type === 'html') {
			const replacement = rewriter.rewriteHtml?.(raw);
			if (replacement !== undefined && replacement !== raw) {
				edits.push({ start, end, replacement });
			}
		} else if (token.type === 'link' || token.type === 'image') {
			const replacement = rewriter.rewriteLink(token as marked.Tokens.Link | marked.Tokens.Image);
			if (replacement !== undefined) {
				edits.push({ start, end, replacement });
			}
		}
	}

	return cursor;
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
	collectEdits(tokens, markdown, 0, rewriter, edits, codeRanges, unlocatable);
	edits.push(...(rewriter.additionalEdits?.(markdown, { codeRanges, definitions: tokens.links, unlocatable }) ?? []));
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
