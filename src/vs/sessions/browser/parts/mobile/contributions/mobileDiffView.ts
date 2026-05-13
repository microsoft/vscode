/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/mobileOverlayViews.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Gesture, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ITextFileService } from '../../../../../workbench/services/textfile/common/textfiles.js';
import { URI } from '../../../../../base/common/uri.js';
import { basename } from '../../../../../base/common/resources.js';
import { linesDiffComputers } from '../../../../../editor/common/diff/linesDiffComputers.js';
import { showMobileFeedbackComposerSheet } from './mobileFeedbackComposerSheet.js';

const $ = DOM.$;

/**
 * Command ID for opening the {@link MobileDiffView}.
 *
 * Accepts {@link IFileDiffViewData} as the single argument. Phone-only.
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
	readonly modifiedURI: URI;
	readonly identical: boolean;
	readonly added: number;
	readonly removed: number;
}

/**
 * Minimal callback contract used by {@link MobileDiffView} to record an
 * agent feedback comment authored from the diff view's bottom action bar.
 *
 * Defined locally to avoid importing the full `IAgentFeedbackService`
 * interface from `vs/sessions/contrib` into `vs/sessions/browser`. The
 * `vs/sessions/contrib/sessions/browser/mobile/mobileOverlayContribution`
 * binds an `IAgentFeedbackService.addFeedback` adaptor here when running
 * the full sessions workbench.
 */
export interface IMobileDiffFeedbackHandler {
	/**
	 * Author a file-wide feedback comment for the given session/resource
	 * pair. Implementers are expected to forward the call to
	 * `IAgentFeedbackService.addFeedback`.
	 *
	 * @param sessionResource The session that owns the diff.
	 * @param resourceUri The modified resource the comment is anchored to.
	 * @param text The trimmed comment text (non-empty).
	 * @param diffHunks Optional rendered unified-diff string for the file
	 * (used as feedback context for the agent).
	 */
	addFileFeedback(sessionResource: URI, resourceUri: URI, text: string, diffHunks: string | undefined): void;
}

/**
 * Data passed to {@link MobileDiffView} when opening a diff view.
 */
export interface IMobileDiffViewData {
	readonly diff: IFileDiffViewData;
	/**
	 * The session this diff belongs to. When provided together with an
	 * {@link IMobileDiffFeedbackHandler}, the diff view shows a sticky
	 * bottom action bar with a "Comment" button that opens a composer
	 * sheet and records the comment as agent feedback for this session.
	 * Without it, the action bar is hidden.
	 */
	readonly sessionResource?: URI;
}

/**
 * Full-screen overlay for viewing file changes produced by a coding agent
 * session on phone viewports.
 *
 * Renders a unified diff with coloured +/- gutters and line numbers. Text is
 * read from the file service via the modified/original URIs stored in
 * {@link IFileDiffViewData}. This keeps the view lightweight — it avoids
 * embedding a full Monaco diff editor while still giving users a readable
 * view of what changed.
 *
 * Follows the account-sheet overlay pattern: appends to the workbench
 * container, disposes on back-button tap.
 */
export class MobileDiffView extends Disposable {

	private readonly viewStore = this._register(new DisposableStore());
	private disposed = false;
	private allHunks: IDiffHunk[] = [];

	constructor(
		private readonly workbenchContainer: HTMLElement,
		data: IMobileDiffViewData,
		private readonly textFileService: ITextFileService,
		private readonly feedbackHandler: IMobileDiffFeedbackHandler | undefined,
	) {
		super();
		this.render(workbenchContainer, data);
	}

	private render(workbenchContainer: HTMLElement, data: IMobileDiffViewData): void {
		const { diff, sessionResource } = data;
		const fileName = basename(diff.modifiedURI);

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
		DOM.append(info, $('div.mobile-overlay-header-title')).textContent = fileName;

		if (!diff.identical) {
			const sub = DOM.append(info, $('div.mobile-overlay-header-subtitle'));
			const parts: string[] = [];
			if (diff.added) {
				parts.push(`+${diff.added}`);
			}
			if (diff.removed) {
				parts.push(`-${diff.removed}`);
			}
			sub.textContent = parts.join('  ');
		}

		// -- Body -------------------------------------------------
		const body = DOM.append(overlay, $('div.mobile-overlay-body'));
		const scrollWrapper = DOM.append(body, $('div.mobile-overlay-scroll'));
		const contentArea = DOM.append(scrollWrapper, $('div.mobile-diff-output'));

		this.loadDiffContent(contentArea, diff);

		// -- Bottom action bar (only when scoped to a session and the
		//    feedback handler is available — i.e. on web/desktop sessions
		//    workbench, not in stripped-down test contexts). ------------
		if (sessionResource && this.feedbackHandler) {
			this.renderActionBar(overlay, sessionResource, diff);
		}
	}

	private renderActionBar(overlay: HTMLElement, sessionResource: URI, diff: IFileDiffViewData): void {
		const actions = DOM.append(overlay, $('div.mobile-diff-actions'));

		const commentBtn = DOM.append(actions, $('button.mobile-diff-action-btn', { type: 'button' })) as HTMLButtonElement;
		commentBtn.setAttribute('aria-label', localize('diffView.comment', "Comment"));
		DOM.append(commentBtn, $('span')).classList.add(...ThemeIcon.asClassNameArray(Codicon.comment));
		DOM.append(commentBtn, $('span')).textContent = localize('diffView.commentLabel', "Comment");

		const open = () => this.openCommentComposer(sessionResource, diff);
		this.viewStore.add(Gesture.addTarget(commentBtn));
		this.viewStore.add(DOM.addDisposableListener(commentBtn, DOM.EventType.CLICK, e => {
			e.preventDefault();
			open();
		}));
		this.viewStore.add(DOM.addDisposableListener(commentBtn, TouchEventType.Tap, () => open()));
	}

	private async openCommentComposer(sessionResource: URI, diff: IFileDiffViewData): Promise<void> {
		if (!this.feedbackHandler) {
			return;
		}
		const fileName = basename(diff.modifiedURI);
		const text = await showMobileFeedbackComposerSheet(this.workbenchContainer, {
			title: localize('feedbackComposer.titleForFile', "Comment on {0}", fileName),
			placeholder: localize('feedbackComposer.placeholder', "Add a comment for the agent…"),
			sendLabel: localize('feedbackComposer.send', "Send"),
		});
		if (this.disposed || !text) {
			return;
		}

		const diffHunksText = this.allHunks.length > 0 ? renderHunksAsUnifiedDiff(this.allHunks) : undefined;
		this.feedbackHandler.addFileFeedback(sessionResource, diff.modifiedURI, text, diffHunksText);
	}

	private loadDiffContent(container: HTMLElement, diff: IFileDiffViewData): void {
		if (diff.identical) {
			const empty = DOM.append(container, $('div.mobile-diff-empty-state'));
			empty.textContent = localize('diffView.noChanges', "No changes in this file.");
			return;
		}

		const loadingEl = DOM.append(container, $('div.mobile-diff-empty-state'));
		loadingEl.textContent = localize('diffView.loading', "Loading…");

		Promise.all([
			diff.originalURI
				? this.textFileService.read(diff.originalURI, { acceptTextOnly: true }).then(m => m.value).catch(() => '')
				: Promise.resolve(''),
			this.textFileService.read(diff.modifiedURI, { acceptTextOnly: true }).then(m => m.value).catch(() => ''),
		]).then(([originalText, modifiedText]) => {
			if (this.disposed) {
				return;
			}
			DOM.clearNode(container);
			const hunks = computeUnifiedDiff(originalText, modifiedText);
			this.allHunks = hunks;
			if (hunks.length === 0) {
				const empty = DOM.append(container, $('div.mobile-diff-empty-state'));
				empty.textContent = localize('diffView.noChanges', "No changes in this file.");
				return;
			}
			this.renderHunks(container, hunks);
		});
	}

	private renderHunks(container: HTMLElement, hunks: IDiffHunk[]): void {
		for (const hunk of hunks) {
			// Hunk header
			const headerEl = DOM.append(container, $('span.mobile-diff-hunk-header'));
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
				content.textContent = line.text;
			}
		}
	}

	override dispose(): void {
		this.disposed = true;
		this.viewStore.dispose();
		super.dispose();
	}
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
	// single hunk so consecutive edits aren't visually fragmented.
	type Group = { origStart: number; origEnd: number; modStart: number; modEnd: number };
	const groups: Group[] = [];
	for (const change of result.changes) {
		const g: Group = {
			origStart: change.original.startLineNumber,
			origEnd: change.original.endLineNumberExclusive,
			modStart: change.modified.startLineNumber,
			modEnd: change.modified.endLineNumberExclusive,
		};
		const last = groups[groups.length - 1];
		if (last && g.origStart - last.origEnd <= CONTEXT_LINES * 2) {
			last.origEnd = g.origEnd;
			last.modEnd = g.modEnd;
		} else {
			groups.push(g);
		}
	}

	const hunks: IDiffHunk[] = [];
	for (const group of groups) {
		const origLeading = Math.max(1, group.origStart - CONTEXT_LINES);
		const modLeading = Math.max(1, group.modStart - CONTEXT_LINES);
		const origTrailing = Math.min(origLines.length + 1, group.origEnd + CONTEXT_LINES);
		const modTrailing = Math.min(modLines.length + 1, group.modEnd + CONTEXT_LINES);

		const lines: IDiffLine[] = [];

		// Leading context (taken from original — same as modified in unchanged regions).
		for (let i = origLeading; i < group.origStart; i++) {
			lines.push({ type: 'context', lineNum: i, text: origLines[i - 1] ?? '' });
		}

		// Removed lines (from original).
		for (let i = group.origStart; i < group.origEnd; i++) {
			lines.push({ type: 'removed', lineNum: i, text: origLines[i - 1] ?? '' });
		}

		// Added lines (from modified).
		for (let i = group.modStart; i < group.modEnd; i++) {
			lines.push({ type: 'added', lineNum: i, text: modLines[i - 1] ?? '' });
		}

		// Trailing context.
		for (let i = group.origEnd; i < origTrailing; i++) {
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
	feedbackHandler?: IMobileDiffFeedbackHandler,
): MobileDiffView {
	return new MobileDiffView(workbenchContainer, data, textFileService, feedbackHandler);
}

/**
 * Format an array of {@link IDiffHunk} as a unified-diff string. Used as
 * the `diffHunks` field on agent feedback context, giving the agent the
 * surrounding context for a file-wide mobile comment (analogous to the
 * desktop selection-scoped hunks).
 */
function renderHunksAsUnifiedDiff(hunks: IDiffHunk[]): string {
	const out: string[] = [];
	for (const hunk of hunks) {
		out.push(hunk.header);
		for (const line of hunk.lines) {
			const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
			out.push(`${prefix}${line.text}`);
		}
	}
	return out.join('\n');
}
