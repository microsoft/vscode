/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/mobileOverlayViews.css';
import './mobileDiffColors.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Gesture, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ITextFileService } from '../../../../../workbench/services/textfile/common/textfiles.js';
import { URI } from '../../../../../base/common/uri.js';
import { basename } from '../../../../../base/common/resources.js';
import { linesDiffComputers } from '../../../../../editor/common/diff/linesDiffComputers.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { tokenizeToString } from '../../../../../editor/common/languages/textToHtmlTokenizer.js';
import { TokenizationRegistry } from '../../../../../editor/common/languages.js';
import { generateTokensCSSForColorMap } from '../../../../../editor/common/languages/supports/tokenization.js';

const $ = DOM.$;

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

/**
 * Command ID for opening the {@link MobileDiffView}.
 *
 * Accepts {@link IMobileDiffViewData} as the single argument. Phone-only.
 *
 * For backwards compatibility the command also accepts a bare
 * {@link IFileDiffViewData} (without siblings) — in that case the view
 * is rendered without prev/next navigation.
 */
export const MOBILE_OPEN_DIFF_VIEW_COMMAND_ID = 'sessions.mobile.openDiffView';

/**
 * Minimal subset of diff entry fields consumed by the mobile diff view.
 * Defined locally to avoid importing from vs/workbench/contrib in vs/sessions/browser.
 */
export interface IFileDiffViewData {
	/**
	 * URI of the file before the change. `undefined` when the file is
	 * newly added by the agent and there is no prior content; the diff
	 * is rendered against an empty original (all lines as additions).
	 */
	readonly originalURI: URI | undefined;
	/**
	 * URI of the file after the change. `undefined` when the file was
	 * deleted by the agent — the diff is rendered as all-removed lines
	 * read from {@link originalURI}.
	 */
	readonly modifiedURI: URI | undefined;
	readonly identical: boolean;
	readonly added: number;
	readonly removed: number;
}

/**
 * Data passed to {@link MobileDiffView} when opening a diff view.
 *
 * When {@link siblings} is provided and contains more than one entry,
 * the header renders prev/next chevrons that navigate within the list.
 */
export interface IMobileDiffViewData {
	readonly diff: IFileDiffViewData;
	readonly siblings?: readonly IFileDiffViewData[];
	readonly index?: number;
}

/**
 * Full-screen overlay for viewing file changes produced by a coding agent
 * session on phone viewports.
 *
 * Renders a unified diff with coloured +/- gutters, line numbers, and
 * Monaco-quality syntax highlighting. Text is read from the file service
 * via the modified/original URIs stored in {@link IFileDiffViewData}.
 * This keeps the view lightweight — it avoids embedding a full Monaco
 * diff editor while still giving users a readable, theme-aware view.
 *
 * Follows the account-sheet overlay pattern: appends to the workbench
 * container, disposes on back-button tap.
 */
export class MobileDiffView extends Disposable {

	private readonly _onDidDispose = this._register(new Emitter<void>());
	/**
	 * Fires when this view has been disposed (either externally or
	 * because the user tapped Back). Used by the mobile overlay
	 * contribution to clear its `MutableDisposable<MobileDiffView>` slot.
	 */
	readonly onDidDispose: Event<void> = this._onDidDispose.event;

	private readonly viewStore = this._register(new DisposableStore());

	private disposed = false;
	/** Bumped on every body render so late-arriving `textFileService.read`
	 *  promises know to drop their results when the user navigated away. */
	private renderGeneration = 0;

	private readonly siblings: readonly IFileDiffViewData[];
	private currentIndex: number;

	private titleEl!: HTMLElement;
	private subtitleEl!: HTMLElement;
	private positionEl!: HTMLElement;
	private prevBtn!: HTMLButtonElement;
	private nextBtn!: HTMLButtonElement;
	private contentArea!: HTMLElement;
	private scrollWrapper!: HTMLElement;

	constructor(
		workbenchContainer: HTMLElement,
		data: IMobileDiffViewData,
		private readonly textFileService: ITextFileService,
		private readonly languageService: ILanguageService,
	) {
		super();

		// Normalise siblings into a non-empty array so all subsequent code
		// can index it directly. If the caller didn't pass siblings we
		// treat the single diff as its own one-element list.
		this.siblings = data.siblings && data.siblings.length > 0 ? data.siblings : [data.diff];
		const startIndex = data.index ?? this.siblings.indexOf(data.diff);
		this.currentIndex = startIndex >= 0 ? startIndex : 0;

		this.render(workbenchContainer);
		this.renderBodyForCurrent();
	}

	private render(workbenchContainer: HTMLElement): void {
		// -- Root overlay -----------------------------------------
		const overlay = DOM.append(workbenchContainer, $('div.mobile-overlay-view'));
		this.viewStore.add(DOM.addDisposableListener(overlay, DOM.EventType.CONTEXT_MENU, e => e.preventDefault()));
		this.viewStore.add(toDisposable(() => overlay.remove()));

		// -- Header -----------------------------------------------
		const header = DOM.append(overlay, $('div.mobile-overlay-header'));

		const backBtn = DOM.append(header, $('button.mobile-overlay-back-btn', { type: 'button' })) as HTMLButtonElement;
		backBtn.setAttribute('aria-label', localize('diffView.back', "Back"));
		DOM.append(backBtn, $('span')).classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronLeft));
		DOM.append(backBtn, $('span.back-btn-label')).textContent = localize('diffView.backLabel', "Back");
		this.viewStore.add(Gesture.addTarget(backBtn));
		this.viewStore.add(DOM.addDisposableListener(backBtn, DOM.EventType.CLICK, () => this.dispose()));
		this.viewStore.add(DOM.addDisposableListener(backBtn, TouchEventType.Tap, () => this.dispose()));

		const info = DOM.append(header, $('div.mobile-overlay-header-info'));
		this.titleEl = DOM.append(info, $('div.mobile-overlay-header-title'));
		this.subtitleEl = DOM.append(info, $('div.mobile-overlay-header-subtitle'));

		// Prev/Next nav appears on the right side when we have siblings.
		// We always create the elements (so layout space is reserved) but
		// keep them hidden when there is only a single file.
		const nav = DOM.append(header, $('div.mobile-diff-nav'));
		this.prevBtn = DOM.append(nav, $('button.mobile-diff-nav-btn.prev', { type: 'button' })) as HTMLButtonElement;
		this.prevBtn.setAttribute('aria-label', localize('diffView.prevFile', "Previous file"));
		DOM.append(this.prevBtn, $('span')).classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronUp));
		this.positionEl = DOM.append(nav, $('span.mobile-diff-nav-position'));
		this.nextBtn = DOM.append(nav, $('button.mobile-diff-nav-btn.next', { type: 'button' })) as HTMLButtonElement;
		this.nextBtn.setAttribute('aria-label', localize('diffView.nextFile', "Next file"));
		DOM.append(this.nextBtn, $('span')).classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronDown));

		this.viewStore.add(Gesture.addTarget(this.prevBtn));
		this.viewStore.add(Gesture.addTarget(this.nextBtn));
		const onPrev = () => this.navigate(-1);
		const onNext = () => this.navigate(+1);
		this.viewStore.add(DOM.addDisposableListener(this.prevBtn, DOM.EventType.CLICK, onPrev));
		this.viewStore.add(DOM.addDisposableListener(this.prevBtn, TouchEventType.Tap, onPrev));
		this.viewStore.add(DOM.addDisposableListener(this.nextBtn, DOM.EventType.CLICK, onNext));
		this.viewStore.add(DOM.addDisposableListener(this.nextBtn, TouchEventType.Tap, onNext));

		nav.style.display = this.siblings.length > 1 ? '' : 'none';

		// -- Body -------------------------------------------------
		const body = DOM.append(overlay, $('div.mobile-overlay-body'));
		this.scrollWrapper = DOM.append(body, $('div.mobile-overlay-scroll'));
		this.contentArea = DOM.append(this.scrollWrapper, $('div.mobile-diff-output'));

		// Horizontal swipe between sibling files. We mount on the scroll
		// wrapper so vertical scrolling continues to work normally; the
		// gesture only activates when horizontal motion clearly dominates.
		this.viewStore.add(this.attachSwipeNavigation(this.scrollWrapper));
	}

	private attachSwipeNavigation(target: HTMLElement): { dispose(): void } {
		const store = new DisposableStore();
		if (this.siblings.length <= 1) {
			return store;
		}

		let startX = 0;
		let startY = 0;
		let startTime = 0;
		let tracking = false;

		const onPointerDown = (e: PointerEvent) => {
			if (e.pointerType !== 'touch') {
				return;
			}
			tracking = true;
			startX = e.clientX;
			startY = e.clientY;
			startTime = Date.now();
		};
		const onPointerUp = (e: PointerEvent) => {
			if (!tracking) {
				return;
			}
			tracking = false;
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;
			const dt = Date.now() - startTime;
			const absDx = Math.abs(dx);
			const absDy = Math.abs(dy);

			// Require a horizontal-dominant swipe of at least 30% of the
			// viewport width or 0.5 px/ms velocity. Vertical swipes are
			// passed through untouched (they're scrolling).
			const viewportWidth = target.clientWidth;
			const minDistance = viewportWidth * 0.3;
			const velocity = absDx / Math.max(dt, 1);
			if (absDx <= absDy * 1.5) {
				return;
			}
			if (absDx < minDistance && velocity < 0.5) {
				return;
			}

			// Swipe left → next file, swipe right → previous file.
			this.navigate(dx < 0 ? +1 : -1);
		};

		store.add(DOM.addDisposableListener(target, 'pointerdown', onPointerDown));
		store.add(DOM.addDisposableListener(target, 'pointerup', onPointerUp));
		store.add(DOM.addDisposableListener(target, 'pointercancel', () => { tracking = false; }));
		return store;
	}

	private navigate(delta: number): void {
		const next = this.currentIndex + delta;
		if (next < 0 || next >= this.siblings.length) {
			return;
		}
		this.currentIndex = next;
		this.renderBodyForCurrent();
	}

	private renderBodyForCurrent(): void {
		// Bump the render generation so any inflight `textFileService.read`
		// from the previous file knows to drop its results before writing
		// into the now-stale container.
		this.renderGeneration++;

		const diff = this.siblings[this.currentIndex];
		const fileNameUri = diff.modifiedURI ?? diff.originalURI;
		const fileName = fileNameUri ? basename(fileNameUri) : '';

		// Header content
		this.titleEl.textContent = fileName;
		// Render +N / -N as styled spans so they pick up the same accent
		// colours as the changes-list (`mobile-changes-row-added` /
		// `mobile-changes-row-removed`). The previous flat textContent
		// rendered everything as foreground colour.
		DOM.clearNode(this.subtitleEl);
		if (!diff.identical) {
			if (diff.added) {
				DOM.append(this.subtitleEl, $('span.mobile-changes-row-added')).textContent = `+${diff.added}`;
			}
			if (diff.added && diff.removed) {
				DOM.append(this.subtitleEl, document.createTextNode(' '));
			}
			if (diff.removed) {
				DOM.append(this.subtitleEl, $('span.mobile-changes-row-removed')).textContent = `-${diff.removed}`;
			}
		}

		if (this.siblings.length > 1) {
			this.positionEl.textContent = localize(
				'diffView.position',
				"{0} / {1}",
				this.currentIndex + 1,
				this.siblings.length,
			);
			this.prevBtn.disabled = this.currentIndex === 0;
			this.nextBtn.disabled = this.currentIndex === this.siblings.length - 1;
			this.prevBtn.setAttribute('aria-disabled', String(this.prevBtn.disabled));
			this.nextBtn.setAttribute('aria-disabled', String(this.nextBtn.disabled));
		}

		// Reset scroll position so the user starts at the top of each file.
		this.scrollWrapper.scrollTop = 0;
		this.scrollWrapper.scrollLeft = 0;

		DOM.clearNode(this.contentArea);
		this.loadDiffContent(this.contentArea, diff);
	}

	private loadDiffContent(container: HTMLElement, diff: IFileDiffViewData): void {
		if (diff.identical) {
			const empty = DOM.append(container, $('div.mobile-diff-empty-state'));
			empty.textContent = localize('diffView.noChanges', "No changes in this file.");
			return;
		}

		const loadingEl = DOM.append(container, $('div.mobile-diff-empty-state'));
		loadingEl.textContent = localize('diffView.loading', "Loading…");

		const generation = this.renderGeneration;
		const languageId = this.resolveLanguageId(diff);

		void this.loadAndRender(container, diff, languageId, generation);
	}

	private async loadAndRender(
		container: HTMLElement,
		diff: IFileDiffViewData,
		languageId: string,
		generation: number,
	): Promise<void> {
		const [originalText, modifiedText] = await Promise.all([
			diff.originalURI
				? this.textFileService.read(diff.originalURI, { acceptTextOnly: true }).then(m => m.value).catch(() => '')
				: Promise.resolve(''),
			diff.modifiedURI
				? this.textFileService.read(diff.modifiedURI, { acceptTextOnly: true }).then(m => m.value).catch(() => '')
				: Promise.resolve(''),
		]);

		if (this.disposed || generation !== this.renderGeneration) {
			return;
		}

		const hunks = computeUnifiedDiff(originalText, modifiedText);
		if (hunks.length === 0) {
			DOM.clearNode(container);
			const empty = DOM.append(container, $('div.mobile-diff-empty-state'));
			empty.textContent = localize('diffView.noChanges', "No changes in this file.");
			return;
		}

		// Attempt Monaco tokenization. The sessions workbench does not load
		// built-in language extensions (JS, TS, Python, etc.), so
		// `TokenizationRegistry.getOrCreate` resolves to null for those languages
		// and falls back to `nullTokenizeEncoded` — every token gets class `mtk1`
		// (plain foreground). Detect that case and fall back to a lightweight
		// regex tokenizer that covers the most common syntax patterns.
		const [origLineHtml, modLineHtml] = await Promise.all([
			tokenizeFileLines(this.languageService, originalText, languageId),
			tokenizeFileLines(this.languageService, modifiedText, languageId),
		]);

		// Real tokenization produces multiple distinct mtk* classes; if ALL
		// non-empty lines contain only `mtk1`, the grammar did not fire.
		const hasRealTokens = hasMultipleTokenClasses(origLineHtml) || hasMultipleTokenClasses(modLineHtml);
		const origLines = hasRealTokens ? origLineHtml : regexTokenizeLines(originalText, languageId);
		const modLines = hasRealTokens ? modLineHtml : regexTokenizeLines(modifiedText, languageId);

		if (this.disposed || generation !== this.renderGeneration) {
			return;
		}

		DOM.clearNode(container);

		// Inject a <style> block with the Monaco token colour-map so that
		// `mtk*` classes produced by `tokenizeToString` resolve to colours.
		// Not needed for the regex fallback which uses inline styles, but
		// kept so both paths share the same container node.
		const colorMap = TokenizationRegistry.getColorMap();
		if (colorMap && hasRealTokens) {
			const styleEl = document.createElement('style');
			styleEl.textContent = generateTokensCSSForColorMap(colorMap);
			container.appendChild(styleEl);
		}

		this.renderHunks(container, hunks, origLines, modLines);
	}

	private resolveLanguageId(diff: IFileDiffViewData): string {
		// Prefer the modified URI for language guessing — that's the file
		// the user is reading. Falls back to the original (deletion case).
		const uri = diff.modifiedURI ?? diff.originalURI;
		if (!uri) {
			return 'plaintext';
		}
		// `guessLanguageIdByFilepathOrFirstLine` already handles unknown
		// URI schemes (like `vscode-agent-host://`) — its association
		// resolver falls through to `resource.path` and basenames that
		// for extension matching. We don't need to massage the URI.
		const guessed = this.languageService.guessLanguageIdByFilepathOrFirstLine(uri);
		if (guessed && guessed !== 'unknown') {
			return guessed;
		}
		// Most language extensions (javascript, typescript, python, etc.)
		// are not loaded in the agents window yet, so the guesser returns
		// `'unknown'` for them. Map known extensions to language IDs that
		// `tokenizeToString` will pick up if/when their TextMate grammars
		// load on demand.
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
			// Hunk header — sticky inside the scroll container so the
			// `@@ -..,.. +..,.. @@` indicator stays anchored as the user
			// scrolls through the hunk's lines.
			const headerEl = DOM.append(container, $('div.mobile-diff-hunk-header'));
			headerEl.textContent = hunk.header;

			// Lines
			for (const line of hunk.lines) {
				const row = DOM.append(container, $('div.mobile-diff-line'));
				row.classList.add(line.type);

				const numEl = DOM.append(row, $('span.mobile-diff-line-num'));
				numEl.textContent = line.lineNum !== undefined ? String(line.lineNum) : '';

				const gutter = DOM.append(row, $('span.mobile-diff-gutter'));
				gutter.textContent = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';

				const content = DOM.append(row, $('span.mobile-diff-content'));
				// `lineNum` is 1-based and indexes into the source the
				// line was taken from: original for context/removed,
				// modified for added (see `computeUnifiedDiff`). The
				// tokenization pass returns one HTML span block per
				// line in the same order, so a direct lookup gives us
				// the highlighted markup.
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
		// Notify external slot-holders before any registered disposables
		// (including the emitter itself) get torn down by `super.dispose()`.
		this._onDidDispose.fire();
		this.viewStore.dispose();
		super.dispose();
	}
}

// -- Tokenization helpers -----------------------------------------------------

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
async function tokenizeFileLines(languageService: ILanguageService, text: string, languageId: string): Promise<string[]> {
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
function hasMultipleTokenClasses(lines: readonly string[]): boolean {
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
function regexTokenizeLines(text: string, languageId: string): string[] {
	if (!text) {
		return [''];
	}
	const lang: LangFamily = LANG_FAMILY[languageId] ?? 'generic';
	return text.split(/\r?\n/).map(line => regexTokenizeLine(line, lang));
}

// -- Unified diff hunk rendering ---------------------------------------------
// Uses the workbench's `linesDiffComputers` so we get the same diff quality as
// the diff editor — no in-tree diff algorithm to maintain.

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

	// Merge changes that are within 2*CONTEXT_LINES of each other into a
	// single hunk so consecutive edits aren't visually fragmented. Each
	// group keeps the list of underlying changes so that unchanged lines
	// between merged sub-changes can later be emitted as `context` rather
	// than `removed`/`added`.
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

		// Leading context (from original — identical to modified in unchanged regions).
		for (let i = origLeading; i < first.origStart; i++) {
			lines.push({ type: 'context', lineNum: i, text: origLines[i - 1] ?? '' });
		}

		// Walk each sub-change in the group. Emit removed/added for the
		// change itself, then context lines for the unchanged region
		// between this sub and the next.
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
				// Unchanged region between two merged sub-changes — these
				// must render as context. We display them with their
				// original-side line numbers because the gutter mirrors
				// the original side for context rows elsewhere in the file.
				for (let i = sub.origEnd; i < next.origStart; i++) {
					lines.push({ type: 'context', lineNum: i, text: origLines[i - 1] ?? '' });
				}
			}
		}

		// Trailing context.
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

/**
 * Opens a {@link MobileDiffView} for the given file diff.
 * Returns the view instance; dispose it to close.
 */
export function openMobileDiffView(
	workbenchContainer: HTMLElement,
	data: IMobileDiffViewData,
	textFileService: ITextFileService,
	languageService: ILanguageService,
): MobileDiffView {
	return new MobileDiffView(workbenchContainer, data, textFileService, languageService);
}
