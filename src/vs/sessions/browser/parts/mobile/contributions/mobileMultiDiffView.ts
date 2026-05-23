/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/mobileOverlayViews.css';
import './media/mobileMultiDiffView.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Gesture, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ITextFileService } from '../../../../../workbench/services/textfile/common/textfiles.js';
import { basename, dirname } from '../../../../../base/common/resources.js';
import { linesDiffComputers } from '../../../../../editor/common/diff/linesDiffComputers.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { tokenizeToString } from '../../../../../editor/common/languages/textToHtmlTokenizer.js';
import { TokenizationRegistry } from '../../../../../editor/common/languages.js';
import { generateTokensCSSForColorMap } from '../../../../../editor/common/languages/supports/tokenization.js';
import { IFileDiffViewData } from './mobileDiffView.js';

const $ = DOM.$;

/** Hardcoded extension→languageId fallback (same as mobileDiffView.ts). */
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

/**
 * Data passed to {@link MobileMultiDiffView}.
 */
export interface IMobileMultiDiffViewData {
	readonly diffs: readonly IFileDiffViewData[];
	/** Index of the file to scroll to initially. */
	readonly initialIndex?: number;
}

/**
 * Full-screen overlay for viewing **multiple** file diffs produced by a
 * coding agent session on phone viewports.
 *
 * All files are rendered in a single scrollable container with sticky
 * per-file headers. This allows the user to scroll through all changes
 * continuously, with the current file header always visible.
 */
export class MobileMultiDiffView extends Disposable {

	private readonly _onDidDispose = this._register(new Emitter<void>());
	readonly onDidDispose: Event<void> = this._onDidDispose.event;

	private readonly viewStore = this._register(new DisposableStore());

	private disposed = false;
	private renderGeneration = 0;

	private scrollWrapper!: HTMLElement;
	private readonly fileElements: HTMLElement[] = [];
	private readonly fileContentElements: HTMLElement[] = [];

	constructor(
		workbenchContainer: HTMLElement,
		private readonly data: IMobileMultiDiffViewData,
		private readonly textFileService: ITextFileService,
		private readonly fileService: IFileService,
		private readonly languageService: ILanguageService,
	) {
		super();
		this.render(workbenchContainer);
		this.loadAllFiles();
	}

	private render(workbenchContainer: HTMLElement): void {
		// -- Root overlay
		const overlay = DOM.append(workbenchContainer, $('div.mobile-overlay-view.mobile-multi-diff-view'));
		this.viewStore.add(DOM.addDisposableListener(overlay, DOM.EventType.CONTEXT_MENU, e => e.preventDefault()));
		this.viewStore.add(toDisposable(() => overlay.remove()));

		// -- Top bar (fixed)
		const topBar = DOM.append(overlay, $('div.mobile-multi-diff-topbar'));

		const backBtn = DOM.append(topBar, $('button.mobile-overlay-back-btn', { type: 'button' })) as HTMLButtonElement;
		backBtn.setAttribute('aria-label', localize('multiDiffView.back', "Back"));
		DOM.append(backBtn, $('span')).classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronLeft));
		this.viewStore.add(Gesture.addTarget(backBtn));
		this.viewStore.add(DOM.addDisposableListener(backBtn, DOM.EventType.CLICK, () => this.dispose()));
		this.viewStore.add(DOM.addDisposableListener(backBtn, TouchEventType.Tap, () => this.dispose()));

		const fileCount = DOM.append(topBar, $('span.mobile-multi-diff-file-count'));
		fileCount.textContent = localize(
			'multiDiffView.fileCount',
			"{0} {1}",
			this.data.diffs.length,
			this.data.diffs.length === 1 ? localize('multiDiffView.file', "file") : localize('multiDiffView.files', "files"),
		);

		// -- Scroll body
		const body = DOM.append(overlay, $('div.mobile-overlay-body'));
		this.scrollWrapper = DOM.append(body, $('div.mobile-overlay-scroll'));

		// Render file sections
		for (let i = 0; i < this.data.diffs.length; i++) {
			const diff = this.data.diffs[i];
			const fileSection = this.renderFileSection(diff);
			this.fileElements.push(fileSection);
			this.scrollWrapper.appendChild(fileSection);
		}

		// Scroll to initial file if specified
		if (this.data.initialIndex !== undefined && this.data.initialIndex > 0) {
			DOM.getWindow(this.scrollWrapper).requestAnimationFrame(() => {
				const target = this.fileElements[this.data.initialIndex!];
				if (target) {
					target.scrollIntoView({ block: 'start' });
				}
			});
		}
	}

	private formatDirSegment(uri: URI): string {
		// Take the last 2 directory segments of the parent path to provide
		// context without overwhelming the header on narrow phone widths.
		const parent = dirname(uri);
		const parentPath = parent.path.replace(/^\/+/, '');
		if (!parentPath || parentPath === '.') {
			return '';
		}
		const segments = parentPath.split('/').filter(s => s.length > 0);
		if (segments.length === 0) {
			return '';
		}
		const tail = segments.slice(-2).join('/');
		const prefix = segments.length > 2 ? '…/' : '';
		return `${prefix}${tail}/`;
	}

	private renderFileSection(diff: IFileDiffViewData): HTMLElement {
		const section = $('div.mobile-multi-diff-file-section');

		const header = DOM.append(section, $('div.mobile-multi-diff-file-header'));

		const fileNameUri = diff.modifiedURI ?? diff.originalURI;
		const fileName = fileNameUri ? basename(fileNameUri) : '';
		const dirPath = fileNameUri ? this.formatDirSegment(fileNameUri) : '';

		// Chevron acts as the fold toggle.
		const chevronEl = DOM.append(header, $('span.mobile-multi-diff-file-chevron', {
			role: 'button',
			tabindex: '0',
			'aria-expanded': 'true',
		}));
		chevronEl.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronDown));
		chevronEl.setAttribute('aria-label', localize('multiDiffView.toggleFile', "Toggle {0}", fileName || 'file'));

		const nameEl = DOM.append(header, $('span.mobile-multi-diff-file-name'));
		if (dirPath) {
			DOM.append(nameEl, $('span.mobile-multi-diff-file-dir')).textContent = dirPath;
		}
		DOM.append(nameEl, $('span.mobile-multi-diff-file-base')).textContent = fileName;

		const statsEl = DOM.append(header, $('span.mobile-multi-diff-file-stats'));
		if (!diff.identical) {
			if (diff.added) {
				DOM.append(statsEl, $('span.mobile-multi-diff-stat-added')).textContent = `+${diff.added}`;
			}
			if (diff.removed) {
				DOM.append(statsEl, $('span.mobile-multi-diff-stat-removed')).textContent = `-${diff.removed}`;
			}
		}

		// Content area (will be populated async)
		const content = DOM.append(section, $('div.mobile-multi-diff-file-content'));
		this.fileContentElements.push(content);

		// Loading placeholder
		const loadingEl = DOM.append(content, $('div.mobile-diff-empty-state'));
		loadingEl.textContent = localize('multiDiffView.loading', "Loading…");

		const toggle = (e: UIEvent) => {
			e.stopPropagation();
			const collapsed = section.classList.toggle('collapsed');
			chevronEl.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
			chevronEl.classList.remove(...ThemeIcon.asClassNameArray(collapsed ? Codicon.chevronDown : Codicon.chevronRight));
			chevronEl.classList.add(...ThemeIcon.asClassNameArray(collapsed ? Codicon.chevronRight : Codicon.chevronDown));
		};
		this.viewStore.add(Gesture.addTarget(chevronEl));
		this.viewStore.add(DOM.addDisposableListener(chevronEl, DOM.EventType.CLICK, toggle));
		this.viewStore.add(DOM.addDisposableListener(chevronEl, TouchEventType.Tap, e => { e.preventDefault(); toggle(e); }));
		this.viewStore.add(DOM.addDisposableListener(chevronEl, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				toggle(e);
			}
		}));

		return section;
	}

	private loadAllFiles(): void {
		this.renderGeneration++;
		const generation = this.renderGeneration;

		for (let i = 0; i < this.data.diffs.length; i++) {
			const diff = this.data.diffs[i];
			const content = this.fileContentElements[i];
			if (content) {
				void this.loadFileContent(content, diff, generation);
			}
		}
	}

	private async loadFileContent(container: HTMLElement, diff: IFileDiffViewData, generation: number): Promise<void> {
		if (diff.identical) {
			DOM.clearNode(container);
			const empty = DOM.append(container, $('div.mobile-diff-empty-state'));
			empty.textContent = localize('multiDiffView.noChanges', "No changes in this file.");
			return;
		}

		const languageId = this.resolveLanguageId(diff);

		const [originalText, modifiedText] = await Promise.all([
			this.readTextContent(diff.originalURI),
			this.readTextContent(diff.modifiedURI),
		]);

		if (this.disposed || generation !== this.renderGeneration) {
			return;
		}

		const hunks = computeUnifiedDiff(originalText, modifiedText);
		if (hunks.length === 0) {
			DOM.clearNode(container);
			const empty = DOM.append(container, $('div.mobile-diff-empty-state'));
			empty.textContent = localize('multiDiffView.noChanges', "No changes in this file.");
			return;
		}

		const [origLineHtml, modLineHtml] = await Promise.all([
			tokenizeFileLines(this.languageService, originalText, languageId),
			tokenizeFileLines(this.languageService, modifiedText, languageId),
		]);

		const hasRealTokens = hasMultipleTokenClasses(origLineHtml) || hasMultipleTokenClasses(modLineHtml);
		const origLines = hasRealTokens ? origLineHtml : regexTokenizeLines(originalText, languageId);
		const modLines = hasRealTokens ? modLineHtml : regexTokenizeLines(modifiedText, languageId);

		if (this.disposed || generation !== this.renderGeneration) {
			return;
		}

		DOM.clearNode(container);

		// Inner wrapper: stretches to widest line so all line backgrounds fill equally
		const inner = DOM.append(container, $('div.mobile-multi-diff-file-content-inner'));

		const colorMap = TokenizationRegistry.getColorMap();
		if (colorMap && hasRealTokens) {
			const styleEl = document.createElement('style');
			styleEl.textContent = generateTokensCSSForColorMap(colorMap);
			inner.appendChild(styleEl);
		}

		this.renderHunks(inner, hunks, origLines, modLines);
	}

	private async readTextContent(resource: URI | undefined): Promise<string> {
		if (!resource) {
			return '';
		}

		try {
			const model = await this.textFileService.read(resource, { acceptTextOnly: true });
			return model.value;
		} catch {
			try {
				const file = await this.fileService.readFile(resource);
				return file.value.toString();
			} catch {
				return '';
			}
		}
	}

	private resolveLanguageId(diff: IFileDiffViewData): string {
		const uri = diff.modifiedURI ?? diff.originalURI;
		if (!uri) {
			return 'plaintext';
		}
		const guessed = this.languageService.guessLanguageIdByFilepathOrFirstLine(uri);
		if (guessed && guessed !== 'unknown') {
			return guessed;
		}
		const name = basename(uri);
		const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
		return EXTENSION_LANGUAGE_MAP[ext] ?? 'plaintext';
	}

	private renderHunks(
		container: HTMLElement,
		hunks: IDiffHunk[],
		origLineHtml: readonly string[],
		modLineHtml: readonly string[],
	): void {
		for (const hunk of hunks) {
			const headerEl = DOM.append(container, $('div.mobile-diff-hunk-header'));
			headerEl.textContent = hunk.header;

			for (const line of hunk.lines) {
				const row = DOM.append(container, $('div.mobile-diff-line'));
				row.classList.add(line.type);

				const numEl = DOM.append(row, $('span.mobile-diff-line-num'));
				numEl.textContent = line.lineNum !== undefined ? String(line.lineNum) : '';

				const gutter = DOM.append(row, $('span.mobile-diff-gutter'));
				gutter.textContent = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';

				const content = DOM.append(row, $('span.mobile-diff-content'));
				if (line.lineNum !== undefined) {
					const source = line.type === 'added' ? modLineHtml : origLineHtml;
					const html = source[line.lineNum - 1];
					if (html !== undefined) {
						content.innerHTML = html;
					} else if (line.text) {
						content.textContent = line.text;
					}
				} else if (line.text) {
					content.textContent = line.text;
				}
			}
		}
	}

	override dispose(): void {
		this.disposed = true;
		this._onDidDispose.fire();
		this.viewStore.dispose();
		super.dispose();
	}
}

// -- Tokenization helpers (same as mobileDiffView.ts) -------------------------

async function tokenizeFileLines(languageService: ILanguageService, text: string, languageId: string): Promise<string[]> {
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

function hasMultipleTokenClasses(lines: readonly string[]): boolean {
	for (const line of lines) {
		if (line && /class="mtk[2-9]|class="mtk[1-9][0-9]/.test(line)) {
			return true;
		}
	}
	return false;
}

// -- Regex tokenizer (same as mobileDiffView.ts) ------------------------------

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

function regexTokenizeLines(text: string, languageId: string): string[] {
	if (!text) {
		return [''];
	}
	const lang: LangFamily = LANG_FAMILY[languageId] ?? 'generic';
	return text.split(/\r?\n/).map(line => regexTokenizeLine(line, lang));
}

// -- Unified diff computation (same as mobileDiffView.ts) ---------------------

interface IDiffLine {
	type: 'context' | 'added' | 'removed';
	lineNum?: number;
	text: string;
}

interface IDiffHunk {
	header: string;
	lines: IDiffLine[];
}

const CONTEXT_LINES = 3;

function computeUnifiedDiff(original: string, modified: string): IDiffHunk[] {
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
