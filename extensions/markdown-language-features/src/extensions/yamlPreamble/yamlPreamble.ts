/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import * as vscode from 'vscode';
import * as yaml from 'yaml';
import { escapeHtml } from '../../util/dom';

export type FrontMatterRenderStyle = 'hide' | 'codeBlock' | 'table';

const FRONT_MATTER_TOKEN = 'front_matter';
const MARKER = '---';
const FRONT_MATTER_CONTEXT = JSON.stringify({ webviewSection: 'frontMatter' });

interface IFrontMatterMeta {
	readonly content: string;
}

/**
 * Extends a `markdown-it` instance with parsing and rendering support for YAML
 * frontmatter at the start of a Markdown document.
 *
 * Frontmatter is delimited by lines containing only `---`. How (or whether) the parsed
 * frontmatter is rendered in the preview is controlled by the `markdown.preview.frontMatter`
 * setting.
 */
export function extendMarkdownIt(md: MarkdownIt): MarkdownIt {
	md.block.ruler.before('fence', FRONT_MATTER_TOKEN, frontMatterRule, {
		alt: ['paragraph', 'reference', 'blockquote', 'list']
	});

	md.renderer.rules[FRONT_MATTER_TOKEN] = renderFrontMatter;

	return md;
}

const frontMatterRule = (state: MarkdownIt.StateBlock, startLine: number, endLine: number, silent: boolean): boolean => {
	if (startLine !== 0 || state.tShift[startLine] !== 0) {
		return false;
	}

	const firstLineStart = state.bMarks[startLine];
	const firstLineEnd = state.eMarks[startLine];
	const firstLine = state.src.slice(firstLineStart, firstLineEnd).replace(/\s+$/, '');

	if (firstLine !== MARKER) {
		return false;
	}

	let nextLine = startLine + 1;
	let foundEnd = false;
	for (; nextLine < endLine; nextLine++) {
		if (state.tShift[nextLine] !== 0) {
			continue;
		}
		const lineStart = state.bMarks[nextLine];
		const lineEnd = state.eMarks[nextLine];
		const line = state.src.slice(lineStart, lineEnd).replace(/\s+$/, '');
		if (line === MARKER) {
			foundEnd = true;
			break;
		}
	}

	if (!foundEnd) {
		return false;
	}

	if (silent) {
		return true;
	}

	const contentStart = state.bMarks[startLine + 1];
	const contentEnd = state.bMarks[nextLine];
	const rawContent = state.src.slice(contentStart, contentEnd).replace(/\n$/, '');

	const token = state.push(FRONT_MATTER_TOKEN, '', 0);
	token.block = true;
	token.hidden = false;
	token.markup = MARKER;
	token.map = [startLine, nextLine + 1];
	const meta: IFrontMatterMeta = { content: rawContent };
	token.meta = meta;

	state.line = nextLine + 1;
	return true;
};

function renderFrontMatter(tokens: Token[], idx: number, options: MarkdownIt.Options, env: unknown): string {
	const token = tokens[idx];
	const meta = token.meta as IFrontMatterMeta | undefined;
	if (!meta) {
		return '';
	}

	const currentDocument = (env as { currentDocument?: vscode.Uri } | undefined)?.currentDocument;
	const style = getFrontMatterRenderStyle(currentDocument);

	switch (style) {
		case 'codeBlock':
			return renderAsCodeBlock(token, meta, options);
		case 'table':
			return renderAsTable(token, meta);
		case 'hide':
		default:
			return '';
	}
}

function getFrontMatterRenderStyle(resource: vscode.Uri | undefined): FrontMatterRenderStyle {
	const config = vscode.workspace.getConfiguration('markdown', resource ?? null);
	const value = config.get<string>('preview.frontMatter', 'table');
	switch (value) {
		case 'codeBlock':
		case 'table':
		case 'hide':
			return value;
		default:
			return 'table';
	}
}

function renderAsCodeBlock(token: Token, meta: IFrontMatterMeta, options: MarkdownIt.Options): string {
	let highlighted: string | undefined;
	if (typeof options.highlight === 'function') {
		try {
			highlighted = options.highlight(meta.content, 'yaml', '') || undefined;
		} catch {
			highlighted = undefined;
		}
	}
	const attrs = frontMatterAttributes(token, 'frontmatter hljs');
	if (highlighted?.startsWith('<pre')) {
		return restoreDiffMarkers(highlighted.replace(/^<pre\b[^>]*>/, `<pre ${attrs}>`)) + '\n';
	}
	const body = restoreDiffMarkers(highlighted ?? escapeHtml(meta.content));
	return `<pre ${attrs}><code class="language-yaml">${body}</code></pre>\n`;
}

function renderAsTable(token: Token, meta: IFrontMatterMeta): string {
	const result = parseEntries(meta);
	if (result.error !== undefined) {
		return renderError(token, result.error);
	}
	if (!result.entries.length) {
		return '';
	}
	const rows = result.entries.map(([key, value]) =>
		`<tr><th>${escapeHtml(key)}</th><td>${formatValueHtml(value)}</td></tr>`
	).join('');
	return `<table ${frontMatterAttributes(token, 'frontmatter')}><tbody>${rows}</tbody></table>\n`;
}

function renderError(token: Token, message: string): string {
	const label = vscode.l10n.t('Failed to parse frontmatter');
	return `<div ${frontMatterAttributes(token, 'frontmatter-error')} role="alert"><strong>${escapeHtml(label)}</strong><pre>${escapeHtml(message)}</pre></div>\n`;
}

function frontMatterAttributes(token: Token, extraClasses: string): string {
	const label = escapeHtml(vscode.l10n.t('Frontmatter'));
	const classes = [extraClasses];
	const otherAttrs: string[] = [];

	if (token.attrs) {
		for (const [attrName, attrValue] of token.attrs) {
			if (attrName === 'class') {
				classes.push(attrValue);
			} else {
				otherAttrs.push(`${attrName}="${escapeHtml(attrValue)}"`);
			}
		}
	}

	const classAttr = `class="${escapeHtml(classes.filter(Boolean).join(' '))}"`;
	const baseAttrs = `title="${label}" data-vscode-context='${escapeHtml(FRONT_MATTER_CONTEXT)}'`;
	const extraAttrs = otherAttrs.length ? ' ' + otherAttrs.join(' ') : '';
	return `${classAttr} ${baseAttrs}${extraAttrs}`;
}

interface IParseResult {
	readonly entries: readonly [string, unknown][];
	readonly error?: string;
}

function parseEntries(meta: IFrontMatterMeta): IParseResult {
	try {
		const parsed = yaml.parse(meta.content);
		if (parsed === null || parsed === undefined) {
			return { entries: [] };
		}
		if (typeof parsed !== 'object' || Array.isArray(parsed)) {
			return { entries: [['', parsed]] };
		}
		return { entries: Object.entries(parsed as Record<string, unknown>) };
	} catch (e) {
		return { entries: [], error: e instanceof Error ? e.message : String(e) };
	}
}

function formatValueHtml(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}
	if (Array.isArray(value)) {
		if (!value.length) {
			return '';
		}
		return `<ul>${value.map(v => `<li>${formatValueHtml(v)}</li>`).join('')}</ul>`;
	}
	if (typeof value === 'object') {
		return `<code>${restoreDiffMarkers(escapeHtml(yaml.stringify(value).trimEnd()))}</code>`;
	}
	return restoreDiffMarkers(escapeHtml(formatScalar(value)));
}

function restoreDiffMarkers(html: string): string {
	return html.replace(/&lt;span data-diff-(start|end)=&quot;(\d+)&quot;&gt;&lt;\/span&gt;/g, '<span data-diff-$1="$2"></span>');
}

function formatScalar(value: unknown): string {
	if (value instanceof Date) {
		return value.toISOString();
	}
	return String(value);
}
