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

interface IFrontMatterMeta {
	readonly content: string;
}

/**
 * Extends a `markdown-it` instance with parsing and rendering support for YAML
 * front matter at the start of a Markdown document.
 *
 * Front matter is delimited by lines containing only `---`. How (or whether) the parsed
 * front matter is rendered in the preview is controlled by the `markdown.preview.frontMatter`
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
	const meta = tokens[idx].meta as IFrontMatterMeta | undefined;
	if (!meta) {
		return '';
	}

	const currentDocument = (env as { currentDocument?: vscode.Uri } | undefined)?.currentDocument;
	const style = getFrontMatterRenderStyle(currentDocument);

	switch (style) {
		case 'codeBlock':
			return renderAsCodeBlock(meta, options);
		case 'table':
			return renderAsTable(meta);
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

function renderAsCodeBlock(meta: IFrontMatterMeta, options: MarkdownIt.Options): string {
	let highlighted: string | undefined;
	if (typeof options.highlight === 'function') {
		try {
			highlighted = options.highlight(meta.content, 'yaml', '') || undefined;
		} catch {
			highlighted = undefined;
		}
	}
	if (highlighted?.startsWith('<pre')) {
		return highlighted + '\n';
	}
	const body = highlighted ?? escapeHtml(meta.content);
	return `<pre class="frontmatter hljs"><code class="language-yaml">${body}</code></pre>\n`;
}

function renderAsTable(meta: IFrontMatterMeta): string {
	const result = parseEntries(meta);
	if (result.error !== undefined) {
		return renderError(result.error);
	}
	if (!result.entries.length) {
		return '';
	}
	const rows = result.entries.map(([key, value]) =>
		`<tr><th>${escapeHtml(key)}</th><td>${formatValueHtml(value)}</td></tr>`
	).join('');
	return `<table class="frontmatter"><tbody>${rows}</tbody></table>\n`;
}

function renderError(message: string): string {
	const label = vscode.l10n.t('Failed to parse front matter');
	return `<div class="frontmatter-error" role="alert"><strong>${escapeHtml(label)}</strong><pre>${escapeHtml(message)}</pre></div>\n`;
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
		return `<code>${escapeHtml(yaml.stringify(value).trimEnd())}</code>`;
	}
	return escapeHtml(formatScalar(value));
}

function formatScalar(value: unknown): string {
	if (value instanceof Date) {
		return value.toISOString();
	}
	return String(value);
}
