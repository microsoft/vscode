/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Shared syntax-highlighting helpers for the phone-layout mobile overlays
// (diff view, code-block overlay). Two-stage approach:
//
//  1. Try Monaco's `tokenizeToString` against the registered TextMate
//     grammar for the language. The agents window does not load built-in
//     language extensions yet, so `TokenizationRegistry.getOrCreate`
//     resolves to null for most languages and every token comes back as
//     `mtk1` (default foreground). We detect that with
//     `hasMultipleTokenClasses` and fall through.
//
//  2. Regex fallback that emits `<span class="mobile-diff-tok-*">` spans.
//     Per-theme colors are defined in `mobileOverlayViews.css` so token
//     colours adapt to the active theme without needing to read any
//     color map in JS.
//
// Both consumers (mobileDiffView, mobileCodeBlockOverlay) share the same
// classes so a single CSS palette covers both surfaces.

import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { tokenizeToString } from '../../../../../editor/common/languages/textToHtmlTokenizer.js';

/** Hardcoded extension→languageId fallback for common languages.
 *
 * The agents window does not load language services / built-in language
 * extensions yet, so `ILanguageService.guessLanguageIdByFilepathOrFirstLine`
 * returns `'unknown'` for everything except a small core set. Once the
 * agents window starts loading language services this map becomes a
 * pure fallback for the leftover `'unknown'` cases. The IDs match
 * VS Code's built-in extension `package.json` contributions. */
export const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
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

/** Aliases for short language hints commonly emitted by chat code fences
 *  (e.g. ```ts, ```py, ```sh). Mapped to the same canonical IDs used by
 *  `EXTENSION_LANGUAGE_MAP` so the same regex-fallback lang-family
 *  lookup applies to both surfaces. */
export const LANGUAGE_ID_ALIAS: Record<string, string> = {
	js: 'javascript',
	ts: 'typescript',
	jsx: 'javascriptreact',
	tsx: 'typescriptreact',
	py: 'python',
	rb: 'ruby',
	cs: 'csharp',
	sh: 'shellscript',
	bash: 'shellscript',
	zsh: 'shellscript',
	shell: 'shellscript',
	yml: 'yaml',
	md: 'markdown',
	'c++': 'cpp',
	rs: 'rust',
	kt: 'kotlin',
};

/**
 * Tokenize a full text and return the per-line HTML (one entry per
 * source line, in order). Uses `tokenizeToString` which awaits
 * `TokenizationRegistry.getOrCreate(languageId)` — without that, sync
 * tokenization returns null highlighting for any language whose
 * textmate grammar hasn't been activated yet (common in agents
 * workbench, where no editor has opened the file).
 *
 * Tokenization runs over the whole text so state (open string,
 * template literal, block comment) propagates correctly across lines.
 */
export async function tokenizeFileLines(languageService: ILanguageService, text: string, languageId: string): Promise<string[]> {
	if (!text) {
		return [''];
	}
	const html = await tokenizeToString(languageService, text, languageId);
	const inner = stripTokenizedWrapper(html);
	// `_tokenizeToString` separates lines with `<br/>` (no closing tag,
	// always lower-case in the upstream implementation). Splitting on
	// the literal preserves the inner `<span class="mtkN">…</span>`
	// markup that gives us the syntax-highlight colours.
	return inner.split('<br/>');
}

/**
 * `tokenizeToString` returns HTML wrapped in
 * `<div class="monaco-tokenized-source">…</div>`. We render per-line into
 * an inline `<span>`, so we strip the wrapper and keep just the inner
 * `<span class="mtkN">` token spans.
 */
function stripTokenizedWrapper(html: string): string {
	const openTag = '<div class="monaco-tokenized-source">';
	const closeTag = '</div>';
	if (html.startsWith(openTag) && html.endsWith(closeTag)) {
		return html.slice(openTag.length, html.length - closeTag.length);
	}
	return html;
}

/**
 * Returns true when the Monaco tokenizer produced real syntax tokens,
 * i.e. the HTML contains more than just `mtk1` class spans. When the
 * TextMate grammar for the language isn't loaded (common on the agents
 * workbench which doesn't load built-in language extensions), every
 * token falls back to `mtk1` (default foreground).
 */
export function hasMultipleTokenClasses(lines: readonly string[]): boolean {
	for (const line of lines) {
		if (line && /class="mtk[2-9]|class="mtk[1-9][0-9]/.test(line)) {
			return true;
		}
	}
	return false;
}

// -- Regex-based syntax highlighter ------------------------------------------
// Used when the Monaco TextMate grammar isn't available (the agents window
// doesn't load built-in language extensions yet; this fallback fires for any
// language without a registered grammar). Produces CSS-class spans rather than
// inline `style` spans so token colors adapt to the active theme without
// needing to read any color map here. The classes (`mobile-diff-tok-comment`,
// `mobile-diff-tok-string`, `mobile-diff-tok-keyword`, `mobile-diff-tok-number`)
// are styled in `media/mobileOverlayViews.css` using per-theme CSS variables
// defined against the `.vs`, `.hc-black`, and `.hc-light` body class selectors,
// keeping all theme-specific values in the stylesheet rather than in JS.
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

/** Tokenize a single line using simple regex rules. Returns HTML. */
function regexTokenizeLine(line: string, lang: LangFamily): string {
	const tokens: IRegexToken[] = [];
	let pos = 0;
	const len = line.length;

	while (pos < len) {
		let matched = false;

		// Line comments
		const commentPfx = lang === 'python' ? '#' : lang === 'shell' ? '#' : '//';
		if (line.startsWith(commentPfx, pos) || (lang === 'generic' && line.startsWith('#', pos))) {
			tokens.push({ start: pos, end: len, kind: 'comment' });
			pos = len;
			matched = true;
		}

		// Block comments /* ... */
		if (!matched && lang !== 'python' && lang !== 'shell' && line.startsWith('/*', pos)) {
			const end = line.indexOf('*/', pos + 2);
			const tokenEnd = end === -1 ? len : end + 2;
			tokens.push({ start: pos, end: tokenEnd, kind: 'comment' });
			pos = tokenEnd;
			matched = true;
		}

		// Template literals
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

		// Strings
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

		// Numbers
		if (!matched && /[0-9]/.test(line[pos])) {
			const m = line.slice(pos).match(/^0x[0-9a-fA-F]+|^[0-9]+\.?[0-9]*(?:[eE][+-]?[0-9]+)?/);
			if (m) {
				tokens.push({ start: pos, end: pos + m[0].length, kind: 'number' });
				pos += m[0].length;
				matched = true;
			}
		}

		// Keywords and identifiers
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
			// Advance one character (operator/punctuation/whitespace)
			const prevTok = tokens[tokens.length - 1];
			// Coalesce consecutive default-colored chars to avoid span bloat
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

/**
 * Tokenize all lines of `text` using the regex highlighter.
 * Returns one HTML string per source line (same shape as `tokenizeFileLines`).
 */
export function regexTokenizeLines(text: string, languageId: string): string[] {
	if (!text) {
		return [''];
	}
	const lang: LangFamily = LANG_FAMILY[languageId] ?? 'generic';
	return text.split(/\r?\n/).map(line => regexTokenizeLine(line, lang));
}
