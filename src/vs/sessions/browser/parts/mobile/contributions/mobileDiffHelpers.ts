/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { linesDiffComputers } from '../../../../../editor/common/diff/linesDiffComputers.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { tokenizeToString } from '../../../../../editor/common/languages/textToHtmlTokenizer.js';

interface IFileDiffLike {
	readonly originalURI: URI | undefined;
	readonly modifiedURI: URI | undefined;
}

/** Hardcoded extension→languageId fallback for common languages.
 *
 * The agents window does not load language services / built-in language
 * extensions yet, so `ILanguageService.guessLanguageIdByFilepathOrFirstLine`
 * returns `'unknown'` for everything except a small core set. Once the
 * agents window starts loading language services this map becomes a
 * pure fallback for the leftover `'unknown'` cases. The IDs match
 * VS Code's built-in extension `package.json` contributions. */
const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
	'.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
	'.jsx': 'javascriptreact',
	'.ts': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
	'.tsx': 'typescriptreact',
	'.py': 'python', '.pyw': 'python',
	'.java': 'java',
	'.c': 'c', '.h': 'c',
	'.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp',
	'.cs': 'csharp',
	'.go': 'go',
	'.rs': 'rust',
	'.rb': 'ruby',
	'.php': 'php',
	'.html': 'html', '.htm': 'html',
	'.css': 'css', '.scss': 'scss', '.less': 'less',
	'.json': 'json', '.jsonc': 'jsonc',
	'.md': 'markdown',
	'.sh': 'shellscript', '.bash': 'shellscript', '.zsh': 'shellscript',
	'.yaml': 'yaml', '.yml': 'yaml',
	'.xml': 'xml',
	'.sql': 'sql',
	'.swift': 'swift',
	'.kt': 'kotlin', '.kts': 'kotlin',
	'.r': 'r',
	'.lua': 'lua',
	'.dart': 'dart',
};

export function resolveMobileDiffLanguageId(languageService: ILanguageService, diff: IFileDiffLike): string {
	const uri = diff.modifiedURI ?? diff.originalURI;
	if (!uri) {
		return 'plaintext';
	}
	// `guessLanguageIdByFilepathOrFirstLine` already handles unknown
	// URI schemes (like `vscode-agent-host://`) through resource paths
	// and basenames for extension matching.
	const guessed = languageService.guessLanguageIdByFilepathOrFirstLine(uri);
	if (guessed && guessed !== 'unknown') {
		return guessed;
	}
	const name = basename(uri);
	const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
	return EXTENSION_LANGUAGE_MAP[ext] ?? 'plaintext';
}

/**
 * Tokenize a full text and return the per-line HTML (one entry per
 * source line, in order). Uses `tokenizeToString` which awaits
 * `TokenizationRegistry.getOrCreate(languageId)` — without that, sync
 * tokenization returns null highlighting for any language whose
 * textmate grammar hasn't been activated yet.
 */
export async function tokenizeFileLines(languageService: ILanguageService, text: string, languageId: string): Promise<string[]> {
	if (!text) {
		return [''];
	}
	const html = await tokenizeToString(languageService, text, languageId);
	const inner = stripTokenizedWrapper(html);
	return inner.split('<br/>');
}

function stripTokenizedWrapper(html: string): string {
	const openTag = '<div class="monaco-tokenized-source">';
	const closeTag = '</div>';
	if (html.startsWith(openTag) && html.endsWith(closeTag)) {
		return html.slice(openTag.length, html.length - closeTag.length);
	}
	return html;
}

export function hasMultipleTokenClasses(lines: readonly string[]): boolean {
	for (const line of lines) {
		if (line && /class="mtk[2-9]|class="mtk[1-9][0-9]/.test(line)) {
			return true;
		}
	}
	return false;
}

type RegexTokenKind = 'comment' | 'string' | 'keyword' | 'number' | 'default';

interface IRegexToken {
	start: number;
	end: number;
	kind: RegexTokenKind;
}

type LangFamily = 'js' | 'python' | 'css' | 'html' | 'json' | 'shell' | 'generic';

const LANG_FAMILY: Record<string, LangFamily> = {
	javascript: 'js', javascriptreact: 'js',
	typescript: 'js', typescriptreact: 'js',
	java: 'js', csharp: 'js', go: 'js', rust: 'js',
	cpp: 'js', c: 'js', swift: 'js', kotlin: 'js', dart: 'js', php: 'js', ruby: 'js',
	python: 'python',
	css: 'css', scss: 'css', less: 'css',
	html: 'html', xml: 'html',
	json: 'json', jsonc: 'json',
	shellscript: 'shell', powershell: 'shell',
};

const JS_KEYWORDS = new Set([
	'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
	'delete', 'do', 'else', 'export', 'extends', 'false', 'finally', 'for',
	'function', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'null',
	'of', 'return', 'static', 'super', 'switch', 'this', 'throw', 'true',
	'try', 'typeof', 'undefined', 'var', 'void', 'while', 'with', 'yield',
	'async', 'await', 'from', 'as', 'interface', 'type', 'enum', 'declare',
	'abstract', 'override', 'readonly', 'namespace', 'module', 'public', 'private', 'protected',
]);

const PY_KEYWORDS = new Set([
	'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
	'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
	'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
	'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return',
	'try', 'while', 'with', 'yield',
]);

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildSpan(kind: RegexTokenKind, text: string): string {
	if (kind === 'default' || !text) {
		return escapeHtml(text);
	}
	return `<span class="mobile-diff-tok-${kind}">${escapeHtml(text)}</span>`;
}

function regexTokenizeLine(line: string, lang: LangFamily): string {
	const tokens: IRegexToken[] = [];
	let pos = 0;
	const len = line.length;

	while (pos < len) {
		let matched = false;

		const commentPfx = lang === 'python' ? '#' : lang === 'shell' ? '#' : '//';
		if (line.startsWith(commentPfx, pos) || (lang === 'generic' && line.startsWith('#', pos))) {
			tokens.push({ start: pos, end: len, kind: 'comment' });
			pos = len;
			matched = true;
		}

		if (!matched && lang !== 'python' && lang !== 'shell' && line.startsWith('/*', pos)) {
			const end = line.indexOf('*/', pos + 2);
			const tokenEnd = end === -1 ? len : end + 2;
			tokens.push({ start: pos, end: tokenEnd, kind: 'comment' });
			pos = tokenEnd;
			matched = true;
		}

		if (!matched && (lang === 'js') && line[pos] === '`') {
			let i = pos + 1;
			while (i < len) {
				if (line[i] === '\\') { i += 2; continue; }
				if (line[i] === '`') { i++; break; }
				i++;
			}
			tokens.push({ start: pos, end: i, kind: 'string' });
			pos = i;
			matched = true;
		}

		if (!matched && (line[pos] === '"' || line[pos] === '\'')) {
			const q = line[pos];
			let i = pos + 1;
			while (i < len) {
				if (line[i] === '\\') { i += 2; continue; }
				if (line[i] === q) { i++; break; }
				i++;
			}
			tokens.push({ start: pos, end: i, kind: 'string' });
			pos = i;
			matched = true;
		}

		if (!matched && /[0-9]/.test(line[pos])) {
			const m = line.slice(pos).match(/^0x[0-9a-fA-F]+|^[0-9]+\.?[0-9]*(?:[eE][+-]?[0-9]+)?/);
			if (m) {
				tokens.push({ start: pos, end: pos + m[0].length, kind: 'number' });
				pos += m[0].length;
				matched = true;
			}
		}

		if (!matched && /[a-zA-Z_$]/.test(line[pos])) {
			const m = line.slice(pos).match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
			if (m) {
				const word = m[0];
				const keywords = lang === 'python' ? PY_KEYWORDS : JS_KEYWORDS;
				const kind: RegexTokenKind = keywords.has(word) ? 'keyword' : 'default';
				tokens.push({ start: pos, end: pos + word.length, kind });
				pos += word.length;
				matched = true;
			}
		}

		if (!matched) {
			const prevTok = tokens[tokens.length - 1];
			if (prevTok && prevTok.kind === 'default') {
				prevTok.end = pos + 1;
			} else {
				tokens.push({ start: pos, end: pos + 1, kind: 'default' });
			}
			pos++;
		}
	}

	return tokens.map(t => buildSpan(t.kind, line.slice(t.start, t.end))).join('');
}

export function regexTokenizeLines(text: string, languageId: string): string[] {
	if (!text) {
		return [''];
	}
	const lang: LangFamily = LANG_FAMILY[languageId] ?? 'generic';
	return text.split(/\r?\n/).map(line => regexTokenizeLine(line, lang));
}

export interface IDiffLine {
	type: 'context' | 'added' | 'removed';
	lineNum?: number;
	text: string;
}

export interface IDiffHunk {
	header: string;
	lines: IDiffLine[];
}

const CONTEXT_LINES = 3;

export function computeUnifiedDiff(original: string, modified: string): IDiffHunk[] {
	const origLines = original.split(/\r?\n/);
	const modLines = modified.split(/\r?\n/);

	const result = linesDiffComputers.getDefault().computeDiff(origLines, modLines, {
		ignoreTrimWhitespace: false,
		maxComputationTimeMs: 1000,
		computeMoves: false,
	});

	if (result.changes.length === 0) {
		return [];
	}

	type Sub = { origStart: number; origEnd: number; modStart: number; modEnd: number };
	type Group = { subs: Sub[] };
	const groups: Group[] = [];
	for (const change of result.changes) {
		const sub: Sub = {
			origStart: change.original.startLineNumber,
			origEnd: change.original.endLineNumberExclusive,
			modStart: change.modified.startLineNumber,
			modEnd: change.modified.endLineNumberExclusive,
		};
		const last = groups[groups.length - 1];
		const lastSub = last?.subs[last.subs.length - 1];
		if (lastSub && sub.origStart - lastSub.origEnd <= CONTEXT_LINES * 2) {
			last!.subs.push(sub);
		} else {
			groups.push({ subs: [sub] });
		}
	}

	const hunks: IDiffHunk[] = [];
	for (const group of groups) {
		const first = group.subs[0];
		const last = group.subs[group.subs.length - 1];
		const origLeading = Math.max(1, first.origStart - CONTEXT_LINES);
		const modLeading = Math.max(1, first.modStart - CONTEXT_LINES);
		const origTrailing = Math.min(origLines.length + 1, last.origEnd + CONTEXT_LINES);
		const modTrailing = Math.min(modLines.length + 1, last.modEnd + CONTEXT_LINES);

		const lines: IDiffLine[] = [];

		for (let i = origLeading; i < first.origStart; i++) {
			lines.push({ type: 'context', lineNum: i, text: origLines[i - 1] ?? '' });
		}

		for (let s = 0; s < group.subs.length; s++) {
			const sub = group.subs[s];
			for (let i = sub.origStart; i < sub.origEnd; i++) {
				lines.push({ type: 'removed', lineNum: i, text: origLines[i - 1] ?? '' });
			}
			for (let i = sub.modStart; i < sub.modEnd; i++) {
				lines.push({ type: 'added', lineNum: i, text: modLines[i - 1] ?? '' });
			}
			const next = group.subs[s + 1];
			if (next) {
				for (let i = sub.origEnd; i < next.origStart; i++) {
					lines.push({ type: 'context', lineNum: i, text: origLines[i - 1] ?? '' });
				}
			}
		}

		for (let i = last.origEnd; i < origTrailing; i++) {
			lines.push({ type: 'context', lineNum: i, text: origLines[i - 1] ?? '' });
		}

		const origCount = origTrailing - origLeading;
		const modCount = modTrailing - modLeading;
		hunks.push({
			header: `@@ -${origLeading},${origCount} +${modLeading},${modCount} @@`,
			lines,
		});
	}

	return hunks;
}
