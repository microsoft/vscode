import MarkdownIt from 'markdown-it';
import type { RenderableBlock } from '../protocol/types';

type Token = ReturnType<MarkdownIt['parse']>[number];

interface BlockDraft {
	readonly blockType: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly headingPath: readonly string[];
	readonly previewText: string;
	readonly html: string;
}

/** `html: true` keeps `<!-- -->` and inline HTML in the token stream so forge marker comments parse predictably. */
const md = new MarkdownIt('commonmark', { html: true, linkify: true, breaks: false });

export function parseMarkdownToBlocks(source: string): RenderableBlock[] {
	const tokens = md.parse(source, {});
	const headingStack: string[] = [];
	const drafts: BlockDraft[] = [];
	let i = 0;

	while (i < tokens.length) {
		const t = tokens[i];
		if (!t) {
			break;
		}

		if (t.type === 'heading_open' && t.level === 0) {
			const level = Number(t.tag.slice(1));
			const inline = tokens[i + 1];
			const close = tokens[i + 2];
			if (inline?.type === 'inline' && close?.type === 'heading_close') {
				const ancestors = headingStack.slice(0, Math.max(0, level - 1));
				const title = stripInline(inline.content);
				const end = i + 3;
				const html = md.renderer.render(tokens.slice(i, end), md.options, {});
				const map = mapFromTokens(t, close);
				if (map) {
					drafts.push({
						blockType: `heading_${level}`,
						startLine: map[0],
						endLine: map[1],
						headingPath: ancestors,
						previewText: title.slice(0, 200),
						html,
					});
				}
				headingStack.length = Math.max(0, level - 1);
				headingStack.push(title);
				i = end;
				continue;
			}
		}

		if (t.type === 'fence' && t.map) {
			const html = md.renderer.render([t], md.options, {});
			drafts.push({
				blockType: 'fence',
				startLine: t.map[0],
				endLine: t.map[1],
				headingPath: [...headingStack],
				previewText: (t.info || 'code').slice(0, 80),
				html,
			});
			i++;
			continue;
		}

		if ((t.type === 'bullet_list_open' || t.type === 'ordered_list_open') && t.level === 0) {
			const { endIdx, items } = extractListItems(tokens, i);
			for (const item of items) {
				const html = md.renderer.render(item.slice, md.options, {});
				drafts.push({
					blockType: 'list_item',
					startLine: item.map[0],
					endLine: item.map[1],
					headingPath: [...headingStack],
					previewText: previewFromSlice(source, item.map[0], item.map[1]),
					html,
				});
			}
			i = endIdx;
			continue;
		}

		if (t.type === 'blockquote_open' && t.level === 0) {
			const end = findMatchingClose(tokens, i, 'blockquote_open', 'blockquote_close');
			const html = md.renderer.render(tokens.slice(i, end), md.options, {});
			const closeTok = tokens[end - 1];
			const map = mapFromTokens(t, closeTok);
			if (map) {
				drafts.push({
					blockType: 'blockquote',
					startLine: map[0],
					endLine: map[1],
					headingPath: [...headingStack],
					previewText: previewFromSlice(source, map[0], map[1]),
					html,
				});
			}
			i = end;
			continue;
		}

		if (t.type === 'table_open' && t.level === 0) {
			const end = findMatchingClose(tokens, i, 'table_open', 'table_close');
			const html = md.renderer.render(tokens.slice(i, end), md.options, {});
			const closeTok = tokens[end - 1];
			const map = mapFromTokens(t, closeTok);
			if (map) {
				drafts.push({
					blockType: 'table',
					startLine: map[0],
					endLine: map[1],
					headingPath: [...headingStack],
					previewText: previewFromSlice(source, map[0], map[1]),
					html,
				});
			}
			i = end;
			continue;
		}

		if (t.type === 'paragraph_open' && t.level === 0) {
			const inline = tokens[i + 1];
			const close = tokens[i + 2];
			if (inline?.type === 'inline' && close?.type === 'paragraph_close' && t.map) {
				const html = md.renderer.render(tokens.slice(i, i + 3), md.options, {});
				drafts.push({
					blockType: 'paragraph',
					startLine: t.map[0],
					endLine: t.map[1],
					headingPath: [...headingStack],
					previewText: stripInline(inline.content).slice(0, 200),
					html,
				});
				i += 3;
				continue;
			}
		}

		if (t.type === 'html_block' && t.map) {
			const html = md.renderer.render([t], md.options, {});
			drafts.push({
				blockType: 'html_block',
				startLine: t.map[0],
				endLine: t.map[1],
				headingPath: [...headingStack],
				previewText: previewFromSlice(source, t.map[0], t.map[1]),
				html,
			});
			i++;
			continue;
		}

		if (t.type === 'hr' && t.map) {
			drafts.push({
				blockType: 'hr',
				startLine: t.map[0],
				endLine: t.map[1],
				headingPath: [...headingStack],
				previewText: '—',
				html: '<hr />',
			});
			i++;
			continue;
		}

		i++;
	}

	return assignBlockIndices(drafts, source);
}

function mapFromTokens(open: Token, close: Token | undefined): [number, number] | undefined {
	if (!open.map) {
		return undefined;
	}
	if (close?.map) {
		return [open.map[0], close.map[1]];
	}
	return [open.map[0], open.map[1]];
}

function findMatchingClose(tokens: Token[], start: number, openType: string, closeType: string): number {
	let depth = 0;
	for (let i = start; i < tokens.length; i++) {
		const tok = tokens[i]!;
		if (tok.type === openType) {
			depth++;
		}
		if (tok.type === closeType) {
			depth--;
			if (depth === 0) {
				return i + 1;
			}
		}
	}
	return tokens.length;
}

function extractListItems(
	tokens: Token[],
	listOpenIdx: number,
): { endIdx: number; items: { map: [number, number]; slice: Token[] }[] } {
	const listOpen = tokens[listOpenIdx];
	if (!listOpen || (listOpen.type !== 'bullet_list_open' && listOpen.type !== 'ordered_list_open')) {
		return { endIdx: listOpenIdx + 1, items: [] };
	}
	const listCloseType = listOpen.type.replace('_open', '_close');
	let i = listOpenIdx + 1;
	const items: { map: [number, number]; slice: Token[] }[] = [];
	while (i < tokens.length) {
		const t = tokens[i]!;
		if (t.type === listCloseType && t.level === listOpen.level) {
			return { endIdx: i + 1, items };
		}
		if (t.type === 'list_item_open') {
			const start = i;
			let depth = 0;
			let j = i;
			for (; j < tokens.length; j++) {
				const x = tokens[j]!;
				if (x.type === 'list_item_open') {
					depth++;
				}
				if (x.type === 'list_item_close') {
					depth--;
					if (depth === 0) {
						j++;
						break;
					}
				}
			}
			const slice = tokens.slice(start, j);
			const maps = slice.map(x => x.map).filter((m): m is [number, number] => !!m);
			if (maps.length > 0) {
				const startLine = Math.min(...maps.map(m => m[0]));
				const endLine = Math.max(...maps.map(m => m[1]));
				items.push({ map: [startLine, endLine], slice });
			}
			i = j;
			continue;
		}
		i++;
	}
	return { endIdx: tokens.length, items };
}

function previewFromSlice(source: string, startLine: number, endLine: number): string {
	return normalizeFingerprint(sliceSourceLines(source, startLine, endLine)).slice(0, 200);
}

function sliceSourceLines(source: string, startLine: number, endLine: number): string {
	const lines = source.split(/\r?\n/);
	return lines.slice(startLine, endLine).join('\n');
}

function normalizeFingerprint(text: string): string {
	return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function stripInline(text: string): string {
	return text.replace(/`+/g, '').replace(/\s+/g, ' ').trim();
}

function assignBlockIndices(drafts: BlockDraft[], source: string): RenderableBlock[] {
	const ordinalByPath = new Map<string, number>();
	const out: RenderableBlock[] = [];
	for (let idx = 0; idx < drafts.length; idx++) {
		const d = drafts[idx]!;
		const pathKey = d.headingPath.join('\u0001');
		const ordinal = ordinalByPath.get(pathKey) ?? 0;
		ordinalByPath.set(pathKey, ordinal + 1);
		const fpSource = sliceSourceLines(source, d.startLine, d.endLine);
		const textFingerprint = normalizeFingerprint(fpSource);
		out.push({
			blockIndex: idx,
			blockType: d.blockType,
			startLine: d.startLine,
			endLine: d.endLine,
			headingPath: d.headingPath,
			ordinal,
			textFingerprint,
			previewText: d.previewText,
			html: d.html,
		});
	}
	return out;
}
