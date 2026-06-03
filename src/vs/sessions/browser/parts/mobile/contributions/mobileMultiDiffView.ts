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
import { computeUnifiedDiff, hasMultipleTokenClasses, type IDiffHunk, type IDiffLine, regexTokenizeLines, resolveMobileDiffLanguageId, tokenizeFileLines } from './mobileDiffHelpers.js';
import { computeMobileMultiDiffItemHeight, computeMobileMultiDiffVirtualLayout, type IMobileMultiDiffVirtualItem, type IMobileMultiDiffVirtualItemLayout, type IMobileMultiDiffVirtualizerMetrics } from './mobileMultiDiffVirtualizer.js';

const $ = DOM.$;

const VIRTUALIZER_METRICS: IMobileMultiDiffVirtualizerMetrics = {
	fileHeaderHeight: 44,
	hunkHeaderHeight: 26,
	rowHeight: 18,
	bodyVerticalPadding: 0,
	placeholderHeight: 76,
};
const MAX_CONCURRENT_FILE_LOADS = 2;
const MAX_CONCURRENT_PREFETCH_LOADS = 1;
const MIN_PREFETCH_DISTANCE = 2400;
const PREFETCH_VIEWPORT_MULTIPLIER = 4;

/**
 * Data passed to {@link MobileMultiDiffView}.
 */
export interface IMobileMultiDiffViewData {
	readonly diffs: readonly IFileDiffViewData[];
	/** Index of the file to scroll to initially. */
	readonly initialIndex?: number;
	/** Optional async diff computation override, used by test/demo hosts that can compute diffs off the UI thread. */
	readonly computeDiff?: (originalText: string, modifiedText: string) => Promise<readonly IDiffHunk[]>;
}

type MobileMultiDiffFileLoadState = 'idle' | 'loading' | 'loaded' | 'empty' | 'error';
type MobileMultiDiffFileLoadKind = 'visible' | 'prefetch';

type MobileMultiDiffBodyEntry = IMobileMultiDiffBodyHunkEntry | IMobileMultiDiffBodyLineEntry;

interface IMobileMultiDiffBodyBaseEntry {
	readonly top: number;
	readonly height: number;
}

interface IMobileMultiDiffBodyHunkEntry extends IMobileMultiDiffBodyBaseEntry {
	readonly type: 'hunk';
	readonly header: string;
}

interface IMobileMultiDiffBodyLineEntry extends IMobileMultiDiffBodyBaseEntry {
	readonly type: 'line';
	readonly line: IDiffLine;
}

interface IMobileMultiDiffFileRenderData {
	readonly bodyEntries: readonly MobileMultiDiffBodyEntry[];
	readonly bodyHeight: number;
	readonly maxLineCharacterCount: number;
	readonly origLines: readonly string[];
	readonly modLines: readonly string[];
	readonly hasRealTokens: boolean;
}

interface IMobileMultiDiffFileState {
	readonly index: number;
	readonly diff: IFileDiffViewData;
	section: HTMLElement | undefined;
	content: HTMLElement | undefined;
	sectionStore: DisposableStore | undefined;
	collapsed: boolean;
	loadState: MobileMultiDiffFileLoadState;
	loadKind: MobileMultiDiffFileLoadKind | undefined;
	loadRequestId: number;
	readonly estimatedHunkCount: number;
	readonly estimatedRowCount: number;
	hunkCount: number;
	rowCount: number;
	renderData: IMobileMultiDiffFileRenderData | undefined;
	bodyScrollTop: number;
	bodyViewportHeight: number;
	fileMessage: HTMLElement | undefined;
	bodyInner: HTMLElement | undefined;
	readonly renderedBodyRows: Map<number, HTMLElement>;
	renderedBodyStartIndex: number | undefined;
	renderedBodyEndIndex: number | undefined;
}

/**
 * Full-screen overlay for viewing **multiple** file diffs produced by a
 * coding agent session on phone viewports.
 *
 * Files are represented in a single virtual scroll range. Only visible
 * file sections are mounted while the user scrolls continuously through
 * the full set of changes.
 */
export class MobileMultiDiffView extends Disposable {

	private readonly _onDidDispose = this._register(new Emitter<void>());
	readonly onDidDispose: Event<void> = this._onDidDispose.event;

	private readonly viewStore = this._register(new DisposableStore());

	private disposed = false;
	private renderGeneration = 0;

	private scrollWrapper!: HTMLElement;
	private virtualContent!: HTMLElement;
	private layoutAnimationFrame: number | undefined;
	private loadVisibleAnimationFrame: number | undefined;
	private prefetchAnimationFrame: number | undefined;
	private currentLayout: ReturnType<typeof computeMobileMultiDiffVirtualLayout> | undefined;
	private readonly mountedIndexes = new Set<number>();
	private readonly fileStates: IMobileMultiDiffFileState[];

	constructor(
		workbenchContainer: HTMLElement,
		private readonly data: IMobileMultiDiffViewData,
		private readonly textFileService: ITextFileService,
		private readonly fileService: IFileService,
		private readonly languageService: ILanguageService,
	) {
		super();
		this.fileStates = data.diffs.map((diff, index) => ({
			index,
			diff,
			section: undefined,
			content: undefined,
			sectionStore: undefined,
			collapsed: false,
			loadState: 'idle',
			loadKind: undefined,
			loadRequestId: 0,
			estimatedHunkCount: diff.identical || diff.added + diff.removed === 0 ? 0 : 1,
			estimatedRowCount: diff.added + diff.removed,
			hunkCount: 0,
			rowCount: 0,
			renderData: undefined,
			bodyScrollTop: 0,
			bodyViewportHeight: 0,
			fileMessage: undefined,
			bodyInner: undefined,
			renderedBodyRows: new Map(),
			renderedBodyStartIndex: undefined,
			renderedBodyEndIndex: undefined,
		}));
		this.render(workbenchContainer);
		this.renderGeneration++;
		this.updateVirtualLayout();
		this.scrollToInitialIndex();
		this.scheduleLoadVisibleFiles();
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
		this.virtualContent = DOM.append(this.scrollWrapper, $('div.mobile-multi-diff-virtual-content'));
		this.viewStore.add(DOM.addDisposableListener(this.scrollWrapper, DOM.EventType.SCROLL, () => this.scheduleVirtualLayout(), { passive: true }));
	}

	private scrollToInitialIndex(): void {
		if (this.data.initialIndex === undefined || this.data.initialIndex <= 0) {
			return;
		}

		DOM.getWindow(this.scrollWrapper).requestAnimationFrame(() => {
			if (this.disposed) {
				return;
			}
			this.scrollWrapper.scrollTop = this.computeVirtualTop(this.data.initialIndex!);
			this.updateVirtualLayout();
			this.scheduleLoadVisibleFiles();
		});
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

	private renderFileSection(state: IMobileMultiDiffFileState): { section: HTMLElement; content: HTMLElement; store: DisposableStore } {
		const diff = state.diff;
		const store = new DisposableStore();
		const section = $('div.mobile-multi-diff-file-section');
		section.dataset.index = String(state.index);

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

		// Loading placeholder
		const loadingEl = DOM.append(content, $('div.mobile-diff-empty-state'));
		loadingEl.textContent = localize('multiDiffView.loading', "Loading…");

		const toggle = (e: UIEvent) => {
			e.stopPropagation();
			state.collapsed = !state.collapsed;
			section.classList.toggle('collapsed', state.collapsed);
			chevronEl.setAttribute('aria-expanded', state.collapsed ? 'false' : 'true');
			chevronEl.classList.remove(...ThemeIcon.asClassNameArray(state.collapsed ? Codicon.chevronDown : Codicon.chevronRight));
			chevronEl.classList.add(...ThemeIcon.asClassNameArray(state.collapsed ? Codicon.chevronRight : Codicon.chevronDown));
			this.scheduleVirtualLayout();
			if (!state.collapsed) {
				this.scheduleLoadVisibleFiles();
			}
		};
		store.add(Gesture.addTarget(header));
		store.add(DOM.addDisposableListener(header, DOM.EventType.CLICK, toggle));
		store.add(DOM.addDisposableListener(header, TouchEventType.Tap, e => { e.preventDefault(); toggle(e); }));
		store.add(DOM.addDisposableListener(chevronEl, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				toggle(e);
			}
		}));

		return { section, content, store };
	}

	private ensureFileSection(state: IMobileMultiDiffFileState): HTMLElement {
		if (!state.section || !state.content) {
			const { section, content, store } = this.renderFileSection(state);
			state.section = section;
			state.content = content;
			state.sectionStore = store;
			this.renderCurrentFileContent(state);
		}

		return state.section;
	}

	private disposeFileSection(state: IMobileMultiDiffFileState): void {
		state.sectionStore?.dispose();
		state.sectionStore = undefined;
		state.section?.remove();
		state.section = undefined;
		state.content = undefined;
		this.resetBodyRenderState(state);
	}

	private scheduleVirtualLayout(): void {
		if (this.disposed) {
			return;
		}

		if (this.layoutAnimationFrame !== undefined) {
			return;
		}

		const targetWindow = DOM.getWindow(this.scrollWrapper);
		this.layoutAnimationFrame = targetWindow.requestAnimationFrame(() => {
			this.layoutAnimationFrame = undefined;
			this.updateVirtualLayout();
		});
	}

	private updateVirtualLayout(): void {
		if (this.disposed) {
			return;
		}

		const layout = this.computeCurrentVirtualLayout();
		this.currentLayout = layout;
		this.virtualContent.style.height = `${layout.totalHeight}px`;

		const visibleIndexes = new Set(layout.items.map(item => item.index));
		this.abandonOffscreenLoads(visibleIndexes);
		for (const index of Array.from(this.mountedIndexes)) {
			if (!visibleIndexes.has(index)) {
				this.disposeFileSection(this.fileStates[index]);
				this.mountedIndexes.delete(index);
			}
		}

		let previousSection: HTMLElement | undefined;
		for (const item of layout.items) {
			const state = this.fileStates[item.index];
			const section = this.ensureFileSection(state);
			this.applyVirtualLayout(section, state, item);
			if (!this.mountedIndexes.has(item.index)) {
				this.mountedIndexes.add(item.index);
			}
			this.ensureFileSectionDomOrder(section, previousSection);
			previousSection = section;
		}

		this.scheduleLoadVisibleFiles();
	}

	private ensureFileSectionDomOrder(section: HTMLElement, previousSection: HTMLElement | undefined): void {
		const referenceNode = previousSection ? previousSection.nextSibling : this.virtualContent.firstChild;
		if (section !== referenceNode) {
			this.virtualContent.insertBefore(section, referenceNode);
		}
	}

	private applyVirtualLayout(section: HTMLElement, state: IMobileMultiDiffFileState, item: IMobileMultiDiffVirtualItemLayout): void {
		section.style.top = `${item.renderTop}px`;
		section.style.height = `${item.renderHeight}px`;
		const bodyOffset = Math.max(0, item.innerOffset - VIRTUALIZER_METRICS.fileHeaderHeight);
		state.bodyScrollTop = bodyOffset;
		state.bodyViewportHeight = Math.max(0, this.scrollWrapper.clientHeight - VIRTUALIZER_METRICS.fileHeaderHeight);
		const content = state.content!;
		content.classList.toggle('mobile-multi-diff-file-content-placeholder', state.loadState !== 'loaded');
		if (state.loadState === 'loaded') {
			content.style.height = '';
			content.style.transform = '';
			this.renderLoadedFileContent(state);
		} else {
			const bodyHeight = Math.max(0, item.renderHeight - VIRTUALIZER_METRICS.fileHeaderHeight);
			const placeholderHeight = Math.min(
				bodyHeight || VIRTUALIZER_METRICS.placeholderHeight,
				Math.max(VIRTUALIZER_METRICS.placeholderHeight, state.bodyViewportHeight),
			);
			content.style.height = `${bodyHeight}px`;
			content.style.transform = '';
			this.updateFileMessageHeight(state, placeholderHeight);
		}
	}

	private renderCurrentFileContent(state: IMobileMultiDiffFileState): void {
		if (!state.content) {
			return;
		}

		switch (state.loadState) {
			case 'loaded':
				this.renderLoadedFileContent(state);
				break;
			case 'empty':
				this.renderFileMessage(state, localize('multiDiffView.noChanges', "No changes in this file."));
				break;
			case 'error':
				this.renderFileMessage(state, localize('multiDiffView.loadError', "Unable to load changes in this file."));
				break;
			case 'idle':
			case 'loading':
				this.renderFileMessage(state, localize('multiDiffView.loading', "Loading…"));
				break;
		}
	}

	private renderFileMessage(state: IMobileMultiDiffFileState, message: string): void {
		if (!state.content) {
			return;
		}

		DOM.clearNode(state.content);
		this.resetBodyRenderState(state);
		const empty = DOM.append(state.content, $('div.mobile-diff-empty-state'));
		state.fileMessage = empty;
		empty.textContent = message;
		this.updateFileMessageHeight(state);
	}

	private updateFileMessageHeight(state: IMobileMultiDiffFileState, placeholderHeight?: number): void {
		if (!state.content) {
			return;
		}

		const empty = state.fileMessage;
		if (!empty || empty.parentElement !== state.content) {
			return;
		}

		const bodyHeight = Number.parseFloat(state.content.style.height) || VIRTUALIZER_METRICS.placeholderHeight;
		const visibleHeight = placeholderHeight ?? Math.min(
			bodyHeight,
			Math.max(VIRTUALIZER_METRICS.placeholderHeight, state.bodyViewportHeight),
		);
		empty.style.height = `${visibleHeight}px`;
	}

	private renderLoadedFileContent(state: IMobileMultiDiffFileState): void {
		if (!state.content || !state.renderData) {
			return;
		}

		const bodyOverscan = Math.max(this.scrollWrapper.clientHeight, 480);
		const visibleTop = Math.max(0, state.bodyScrollTop - bodyOverscan);
		const visibleBottom = Math.min(
			state.renderData.bodyHeight,
			state.bodyScrollTop + state.bodyViewportHeight + bodyOverscan,
		);
		const { startIndex, endIndex } = this.computeVisibleBodyEntryRange(state.renderData.bodyEntries, visibleTop, visibleBottom);
		const inner = this.ensureBodyInner(state);
		if (state.renderedBodyStartIndex === startIndex && state.renderedBodyEndIndex === endIndex) {
			return;
		}

		inner.style.height = `${state.renderData.bodyHeight}px`;
		inner.style.minWidth = `calc(${state.renderData.maxLineCharacterCount + 8}ch + 64px)`;

		this.reconcileBodyEntries(state, startIndex, endIndex);
		state.renderedBodyStartIndex = startIndex;
		state.renderedBodyEndIndex = endIndex;
	}

	private toVirtualItem(state: IMobileMultiDiffFileState): IMobileMultiDiffVirtualItem {
		return {
			collapsed: state.collapsed,
			state: state.loadState === 'idle' ? 'unloaded' : state.loadState,
			estimatedHunkCount: state.estimatedHunkCount,
			estimatedRowCount: state.estimatedRowCount,
			hunkCount: state.hunkCount,
			rowCount: state.rowCount,
		};
	}

	private computeCurrentVirtualLayout(): ReturnType<typeof computeMobileMultiDiffVirtualLayout> {
		return computeMobileMultiDiffVirtualLayout(this.fileStates.map(state => this.toVirtualItem(state)), {
			viewportHeight: this.scrollWrapper.clientHeight,
			scrollTop: this.scrollWrapper.scrollTop,
			overscan: Math.max(this.scrollWrapper.clientHeight, 480),
			metrics: VIRTUALIZER_METRICS,
		});
	}

	private computeVirtualTop(index: number): number {
		let top = 0;
		const end = Math.min(index, this.fileStates.length);
		for (let i = 0; i < end; i++) {
			top += computeMobileMultiDiffItemHeight(this.toVirtualItem(this.fileStates[i]), VIRTUALIZER_METRICS);
		}
		return top;
	}

	private scheduleLoadVisibleFiles(): void {
		if (this.disposed || this.loadVisibleAnimationFrame !== undefined) {
			return;
		}

		const targetWindow = DOM.getWindow(this.scrollWrapper);
		this.loadVisibleAnimationFrame = targetWindow.requestAnimationFrame(() => {
			this.loadVisibleAnimationFrame = undefined;
			this.loadVisibleFiles();
			this.schedulePrefetchFile();
		});
	}

	private cancelScheduledLoadVisibleFiles(): void {
		if (this.loadVisibleAnimationFrame !== undefined) {
			DOM.getWindow(this.scrollWrapper).cancelAnimationFrame(this.loadVisibleAnimationFrame);
			this.loadVisibleAnimationFrame = undefined;
		}
	}

	private schedulePrefetchFile(): void {
		if (this.disposed || this.prefetchAnimationFrame !== undefined) {
			return;
		}

		const targetWindow = DOM.getWindow(this.scrollWrapper);
		this.prefetchAnimationFrame = targetWindow.requestAnimationFrame(() => {
			this.prefetchAnimationFrame = undefined;
			this.prefetchNearFile();
		});
	}

	private cancelScheduledPrefetchFile(): void {
		if (this.prefetchAnimationFrame !== undefined) {
			DOM.getWindow(this.scrollWrapper).cancelAnimationFrame(this.prefetchAnimationFrame);
			this.prefetchAnimationFrame = undefined;
		}
	}

	private loadVisibleFiles(): void {
		if (this.disposed) {
			return;
		}

		const loadingCount = this.fileStates.reduce((count, state) => count + (state.loadState === 'loading' ? 1 : 0), 0);
		if (loadingCount >= MAX_CONCURRENT_FILE_LOADS) {
			return;
		}

		const layout = this.currentLayout;
		if (!layout) {
			return;
		}

		const viewportTop = this.scrollWrapper.scrollTop;
		const viewportBottom = viewportTop + this.scrollWrapper.clientHeight;

		let nextState: IMobileMultiDiffFileState | undefined;
		let nextDistance = Number.POSITIVE_INFINITY;

		for (const item of layout.items) {
			const state = this.fileStates[item.index];
			if (state.loadState !== 'idle' || state.collapsed) {
				continue;
			}
			const itemTop = item.virtualTop;
			const itemBottom = item.virtualTop + item.virtualHeight;

			const distance = itemBottom < viewportTop
				? viewportTop - itemBottom
				: itemTop > viewportBottom
					? itemTop - viewportBottom
					: 0;

			if (distance < nextDistance) {
				nextState = state;
				nextDistance = distance;
			}
		}

		if (nextState) {
			this.ensureFileLoaded(nextState, 'visible');
		}
	}

	private prefetchNearFile(): void {
		if (this.disposed) {
			return;
		}

		const layout = this.currentLayout;
		if (!layout) {
			return;
		}

		const mountedIndexes = new Set(layout.items.map(item => item.index));
		if (layout.items.some(item => {
			const state = this.fileStates[item.index];
			return !state.collapsed && state.loadState === 'idle';
		})) {
			return;
		}

		const loadingCount = this.fileStates.reduce((count, state) => count + (state.loadState === 'loading' ? 1 : 0), 0);
		const prefetchLoadingCount = this.fileStates.reduce((count, state) => count + (state.loadState === 'loading' && state.loadKind === 'prefetch' ? 1 : 0), 0);
		if (loadingCount >= MAX_CONCURRENT_FILE_LOADS || prefetchLoadingCount >= MAX_CONCURRENT_PREFETCH_LOADS) {
			return;
		}

		const viewportTop = this.scrollWrapper.scrollTop;
		const viewportBottom = viewportTop + this.scrollWrapper.clientHeight;
		const prefetchDistance = Math.max(MIN_PREFETCH_DISTANCE, this.scrollWrapper.clientHeight * PREFETCH_VIEWPORT_MULTIPLIER);
		let virtualTop = 0;
		let nextState: IMobileMultiDiffFileState | undefined;
		let nextDistance = Number.POSITIVE_INFINITY;

		for (const state of this.fileStates) {
			const virtualHeight = computeMobileMultiDiffItemHeight(this.toVirtualItem(state), VIRTUALIZER_METRICS);
			const virtualBottom = virtualTop + virtualHeight;
			if (!mountedIndexes.has(state.index) && !state.collapsed && state.loadState === 'idle') {
				const distance = virtualBottom < viewportTop
					? viewportTop - virtualBottom
					: virtualTop > viewportBottom
						? virtualTop - viewportBottom
						: 0;

				if (distance <= prefetchDistance && distance < nextDistance) {
					nextState = state;
					nextDistance = distance;
				}
			}

			virtualTop = virtualBottom;
		}

		if (nextState) {
			this.ensureFileLoaded(nextState, 'prefetch');
		}
	}

	private ensureFileLoaded(state: IMobileMultiDiffFileState, loadKind: MobileMultiDiffFileLoadKind): void {
		if (state.loadState !== 'idle') {
			return;
		}
		state.loadState = 'loading';
		state.loadKind = loadKind;
		state.loadRequestId++;
		this.renderCurrentFileContent(state);
		const generation = this.renderGeneration;
		const loadRequestId = state.loadRequestId;
		void this.loadFileContent(state, generation, loadRequestId).catch(() => {
			if (!this.isActiveFileLoad(state, generation, loadRequestId)) {
				return;
			}
			state.loadState = 'error';
			state.loadKind = undefined;
			this.renderCurrentFileContent(state);
		}).finally(() => {
			if (!this.disposed && generation === this.renderGeneration && state.loadRequestId === loadRequestId) {
				this.scheduleVirtualLayout();
			}
		});
	}

	private isActiveFileLoad(state: IMobileMultiDiffFileState, generation: number, loadRequestId: number): boolean {
		return !this.disposed
			&& generation === this.renderGeneration
			&& state.loadRequestId === loadRequestId
			&& state.loadState === 'loading';
	}

	private abandonOffscreenLoads(visibleIndexes: ReadonlySet<number>): void {
		for (const state of this.fileStates) {
			if (state.loadState !== 'loading' || state.loadKind === 'prefetch' || visibleIndexes.has(state.index)) {
				continue;
			}

			state.loadRequestId++;
			state.loadState = 'idle';
			state.loadKind = undefined;
			state.renderData = undefined;
			state.hunkCount = 0;
			state.rowCount = 0;
			this.resetBodyRenderState(state);
			this.renderCurrentFileContent(state);
		}
	}

	private async loadFileContent(state: IMobileMultiDiffFileState, generation: number, loadRequestId: number): Promise<void> {
		const diff = state.diff;
		if (diff.identical) {
			if (!this.isActiveFileLoad(state, generation, loadRequestId)) {
				return;
			}
			state.loadState = 'empty';
			state.loadKind = undefined;
			state.renderData = undefined;
			state.hunkCount = 0;
			state.rowCount = 0;
			this.renderCurrentFileContent(state);
			return;
		}

		const languageId = resolveMobileDiffLanguageId(this.languageService, diff);

		const [originalText, modifiedText] = await Promise.all([
			this.readTextContent(diff.originalURI),
			this.readTextContent(diff.modifiedURI),
		]);

		if (!this.isActiveFileLoad(state, generation, loadRequestId)) {
			return;
		}

		const hunks = await (this.data.computeDiff?.(originalText, modifiedText) ?? Promise.resolve(computeUnifiedDiff(originalText, modifiedText)));
		if (!this.isActiveFileLoad(state, generation, loadRequestId)) {
			return;
		}

		if (hunks.length === 0) {
			state.loadState = 'empty';
			state.loadKind = undefined;
			state.renderData = undefined;
			state.hunkCount = 0;
			state.rowCount = 0;
			this.renderCurrentFileContent(state);
			return;
		}

		const [origLineHtml, modLineHtml] = await Promise.all([
			tokenizeFileLines(this.languageService, originalText, languageId),
			tokenizeFileLines(this.languageService, modifiedText, languageId),
		]);

		if (!this.isActiveFileLoad(state, generation, loadRequestId)) {
			return;
		}

		const hasRealTokens = hasMultipleTokenClasses(origLineHtml) || hasMultipleTokenClasses(modLineHtml);
		const origLines = hasRealTokens ? origLineHtml : regexTokenizeLines(originalText, languageId);
		const modLines = hasRealTokens ? modLineHtml : regexTokenizeLines(modifiedText, languageId);

		if (!this.isActiveFileLoad(state, generation, loadRequestId)) {
			return;
		}

		state.loadState = 'loaded';
		state.loadKind = undefined;
		state.hunkCount = hunks.length;
		state.rowCount = hunks.reduce((count, hunk) => count + hunk.lines.length, 0);
		const { bodyEntries, bodyHeight, maxLineCharacterCount } = this.createBodyEntries(hunks);
		state.renderData = { bodyEntries, bodyHeight, maxLineCharacterCount, origLines, modLines, hasRealTokens };
		this.resetBodyRenderState(state);
		this.renderCurrentFileContent(state);
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

	private createBodyEntries(hunks: readonly IDiffHunk[]): { bodyEntries: MobileMultiDiffBodyEntry[]; bodyHeight: number; maxLineCharacterCount: number } {
		const bodyEntries: MobileMultiDiffBodyEntry[] = [];
		let top = 0;
		let maxLineCharacterCount = 0;

		for (const hunk of hunks) {
			bodyEntries.push({
				type: 'hunk',
				header: hunk.header,
				top,
				height: VIRTUALIZER_METRICS.hunkHeaderHeight,
			});
			top += VIRTUALIZER_METRICS.hunkHeaderHeight;

			for (const line of hunk.lines) {
				maxLineCharacterCount = Math.max(maxLineCharacterCount, line.text.length);
				bodyEntries.push({
					type: 'line',
					line,
					top,
					height: VIRTUALIZER_METRICS.rowHeight,
				});
				top += VIRTUALIZER_METRICS.rowHeight;
			}
		}

		return { bodyEntries, bodyHeight: top, maxLineCharacterCount };
	}

	private computeVisibleBodyEntryRange(
		entries: readonly MobileMultiDiffBodyEntry[],
		visibleTop: number,
		visibleBottom: number,
	): { startIndex: number; endIndex: number } {
		if (entries.length === 0 || visibleBottom <= visibleTop) {
			return { startIndex: 0, endIndex: 0 };
		}

		const startIndex = this.findFirstBodyEntryEndingAfter(entries, visibleTop);
		const endIndex = this.findFirstBodyEntryStartingAtOrAfter(entries, visibleBottom);
		return { startIndex, endIndex: Math.max(startIndex, endIndex) };
	}

	private findFirstBodyEntryEndingAfter(entries: readonly MobileMultiDiffBodyEntry[], offset: number): number {
		let low = 0;
		let high = entries.length;
		while (low < high) {
			const mid = Math.floor((low + high) / 2);
			if (entries[mid].top + entries[mid].height <= offset) {
				low = mid + 1;
			} else {
				high = mid;
			}
		}
		return low;
	}

	private findFirstBodyEntryStartingAtOrAfter(entries: readonly MobileMultiDiffBodyEntry[], offset: number): number {
		let low = 0;
		let high = entries.length;
		while (low < high) {
			const mid = Math.floor((low + high) / 2);
			if (entries[mid].top < offset) {
				low = mid + 1;
			} else {
				high = mid;
			}
		}
		return low;
	}

	private ensureBodyInner(state: IMobileMultiDiffFileState): HTMLElement {
		if (state.bodyInner && state.bodyInner.parentElement === state.content) {
			return state.bodyInner;
		}

		if (!state.content || !state.renderData) {
			throw new Error('Cannot render a loaded mobile diff body without content and render data.');
		}

		DOM.clearNode(state.content);
		this.resetBodyRenderState(state);
		const inner = DOM.append(state.content, $('div.mobile-multi-diff-file-content-inner'));
		inner.style.height = `${state.renderData.bodyHeight}px`;
		inner.style.minWidth = `calc(${state.renderData.maxLineCharacterCount + 8}ch + 64px)`;

		const colorMap = TokenizationRegistry.getColorMap();
		if (colorMap && state.renderData.hasRealTokens) {
			const styleEl = document.createElement('style');
			styleEl.textContent = generateTokensCSSForColorMap(colorMap);
			inner.appendChild(styleEl);
		}

		state.bodyInner = inner;
		return inner;
	}

	private resetBodyRenderState(state: IMobileMultiDiffFileState): void {
		state.fileMessage = undefined;
		state.bodyInner = undefined;
		state.renderedBodyRows.clear();
		state.renderedBodyStartIndex = undefined;
		state.renderedBodyEndIndex = undefined;
	}

	private reconcileBodyEntries(state: IMobileMultiDiffFileState, startIndex: number, endIndex: number): void {
		if (!state.bodyInner || !state.renderData) {
			return;
		}

		for (const [index, element] of Array.from(state.renderedBodyRows)) {
			if (index < startIndex || index >= endIndex) {
				element.remove();
				state.renderedBodyRows.delete(index);
			}
		}

		let runStart: number | undefined;
		let runEnd = startIndex;
		for (let index = startIndex; index < endIndex; index++) {
			if (state.renderedBodyRows.has(index)) {
				if (runStart !== undefined) {
					this.insertBodyEntryRun(state, runStart, runEnd);
					runStart = undefined;
				}
				continue;
			}

			runStart ??= index;
			runEnd = index + 1;
		}

		if (runStart !== undefined) {
			this.insertBodyEntryRun(state, runStart, runEnd);
		}
	}

	private insertBodyEntryRun(state: IMobileMultiDiffFileState, startIndex: number, endIndex: number): void {
		if (!state.bodyInner || !state.renderData) {
			return;
		}

		const htmlParts: string[] = [];
		for (let index = startIndex; index < endIndex; index++) {
			htmlParts.push(this.renderBodyEntryHtml(index, state.renderData.bodyEntries[index], state.renderData.origLines, state.renderData.modLines));
		}

		const template = document.createElement('template');
		template.innerHTML = htmlParts.join('');
		const insertedElements = Array.from(template.content.children) as HTMLElement[];
		for (const element of insertedElements) {
			const index = Number(element.dataset.entryIndex);
			if (Number.isFinite(index)) {
				state.renderedBodyRows.set(index, element);
			}
		}

		state.bodyInner.insertBefore(template.content, this.findNextRenderedBodyRow(state, endIndex));
	}

	private findNextRenderedBodyRow(state: IMobileMultiDiffFileState, startIndex: number): HTMLElement | null {
		for (let index = startIndex; index < state.renderData!.bodyEntries.length; index++) {
			const element = state.renderedBodyRows.get(index);
			if (element) {
				return element;
			}
		}
		return null;
	}

	private renderBodyEntryHtml(
		index: number,
		entry: MobileMultiDiffBodyEntry,
		origLineHtml: readonly string[],
		modLineHtml: readonly string[],
	): string {
		const style = `top:${entry.top}px;height:${entry.height}px;`;
		if (entry.type === 'hunk') {
			return `<div class="mobile-diff-hunk-header mobile-multi-diff-body-entry" data-entry-index="${index}" style="${style}">${this.escapeHtml(entry.header)}</div>`;
		}

		const line = entry.line;
		const lineNumber = line.lineNum !== undefined ? String(line.lineNum) : '';
		const gutter = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
		const content = this.getLineHtml(line, origLineHtml, modLineHtml);

		return [
			`<div class="mobile-diff-line mobile-multi-diff-body-entry ${line.type}" data-entry-index="${index}" style="${style}">`,
			`<span class="mobile-diff-line-num">${this.escapeHtml(lineNumber)}</span>`,
			`<span class="mobile-diff-gutter">${this.escapeHtml(gutter)}</span>`,
			`<span class="mobile-diff-content">${content}</span>`,
			'</div>',
		].join('');
	}

	private getLineHtml(line: IDiffLine, origLineHtml: readonly string[], modLineHtml: readonly string[]): string {
		if (line.lineNum !== undefined) {
			const source = line.type === 'added' ? modLineHtml : origLineHtml;
			const html = source[line.lineNum - 1];
			if (html !== undefined) {
				return html;
			}
		}
		return this.escapeHtml(line.text);
	}

	private escapeHtml(value: string): string {
		return value.replace(/[&<>"']/g, char => {
			switch (char) {
				case '&': return '&amp;';
				case '<': return '&lt;';
				case '>': return '&gt;';
				case '"': return '&quot;';
				case '\'': return '&#39;';
				default: return char;
			}
		});
	}

	override dispose(): void {
		this.disposed = true;
		if (this.layoutAnimationFrame !== undefined) {
			DOM.getWindow(this.scrollWrapper).cancelAnimationFrame(this.layoutAnimationFrame);
			this.layoutAnimationFrame = undefined;
		}
		if (this.loadVisibleAnimationFrame !== undefined) {
			this.cancelScheduledLoadVisibleFiles();
		}
		if (this.prefetchAnimationFrame !== undefined) {
			this.cancelScheduledPrefetchFile();
		}
		for (const state of this.fileStates) {
			this.disposeFileSection(state);
		}
		this.mountedIndexes.clear();
		this._onDidDispose.fire();
		this.viewStore.dispose();
		super.dispose();
	}
}
