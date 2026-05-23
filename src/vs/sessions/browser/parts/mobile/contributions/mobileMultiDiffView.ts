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
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { TokenizationRegistry } from '../../../../../editor/common/languages.js';
import { generateTokensCSSForColorMap } from '../../../../../editor/common/languages/supports/tokenization.js';
import { IFileDiffViewData } from './mobileDiffView.js';
import { computeUnifiedDiff, hasMultipleTokenClasses, type IDiffHunk, regexTokenizeLines, resolveMobileDiffLanguageId, tokenizeFileLines } from './mobileDiffHelpers.js';

const $ = DOM.$;

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
		chevronEl.setAttribute('aria-label', localize('multiDiffView.toggleFile', "Toggle {0}", fileName || localize('multiDiffView.fileFallback', "file")));

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

		const languageId = resolveMobileDiffLanguageId(this.languageService, diff);

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
