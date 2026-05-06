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
import { autorun } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { URI } from '../../../../../base/common/uri.js';
import { comparePaths } from '../../../../../base/common/comparers.js';
import { basename, dirname } from '../../../../../base/common/resources.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionFileChange } from '../../../../services/sessions/common/session.js';
import { IFileDiffViewData } from './mobileDiffView.js';

const $ = DOM.$;

/**
 * Command id for opening the {@link MobileChangesView}.
 *
 * Takes no arguments. The view reads the active session's changes from
 * {@link ISessionsManagementService}. Phone-only.
 */
export const MOBILE_OPEN_CHANGES_VIEW_COMMAND_ID = 'sessions.mobile.openChangesView';

/**
 * Visual change-type for a mobile changes-list row.
 */
type MobileChangeType = 'added' | 'modified' | 'deleted';

/**
 * Normalised view-model for a single row in {@link MobileChangesView}. We
 * read the live `ISessionFileChange` observable on every render and reduce
 * each entry into this minimal shape so the row template stays pure DOM.
 */
interface IMobileChangesRow {
	readonly displayUri: URI;
	readonly originalUri: URI | undefined;
	readonly modifiedUri: URI | undefined;
	readonly changeType: MobileChangeType;
	readonly added: number;
	readonly removed: number;
}

/**
 * Callback invoked when the user taps a row. Receives the per-file
 * payload along with the full sibling list and the tapped index — these
 * are forwarded to the diff overlay so it can render prev/next chevrons.
 */
export type MobileChangesOpenHandler = (diff: IFileDiffViewData, siblings: readonly IFileDiffViewData[], index: number) => void;

export function toRow(change: ISessionFileChange): IMobileChangesRow {
	// `IChatSessionFileChange2` carries `uri` as the canonical identity; the
	// legacy `IChatSessionFileChange` only has `modifiedUri` (required, never
	// absent). We detect v2 by the presence of `uri` (it's a non-optional
	// field on v2 only). Avoiding the import of the type-guard keeps this
	// file inside the `vs/sessions/browser` layering rule — workbench/contrib
	// imports are not allowed here.
	const v2Uri = (change as { uri?: URI }).uri;
	const displayUri: URI = v2Uri ?? (change as { modifiedUri: URI }).modifiedUri;
	const originalUri = change.originalUri;
	const modifiedUri = (change as { modifiedUri?: URI }).modifiedUri;

	const changeType: MobileChangeType = originalUri === undefined
		? 'added'
		: modifiedUri === undefined
			? 'deleted'
			: 'modified';

	return {
		displayUri,
		originalUri,
		modifiedUri,
		changeType,
		added: change.insertions,
		removed: change.deletions,
	};
}

export function rowToDiffData(row: IMobileChangesRow): IFileDiffViewData {
	return {
		originalURI: row.originalUri,
		modifiedURI: row.modifiedUri,
		identical: row.added === 0 && row.removed === 0,
		added: row.added,
		removed: row.removed,
	};
}

function compareRows(a: IMobileChangesRow, b: IMobileChangesRow): number {
	return comparePaths(a.displayUri.fsPath, b.displayUri.fsPath);
}

/**
 * Full-screen overlay listing every file changed in the active session.
 *
 * Visually matches {@link MobileDiffView}: uses the same `mobile-overlay-*`
 * chrome (header with back button + title, scrollable body). Each row is
 * a tap target showing a themed file icon, filename, relative path,
 * change-type pill, and `+N -N` counters.
 *
 * Tapping a row invokes the supplied {@link MobileChangesOpenHandler}
 * with the row's diff payload along with the sibling list — used by the
 * diff overlay to support prev/next navigation.
 */
export class MobileChangesView extends Disposable {

	private readonly _onDidDispose = this._register(new Emitter<void>());
	/**
	 * Fires when this view has been disposed (either externally or because
	 * the user tapped Back). Used by the mobile overlay contribution to
	 * clear its `MutableDisposable<MobileChangesView>` slot so it doesn't
	 * keep a stale reference around — preserving the "value === undefined
	 * <=> no overlay open" invariant.
	 */
	readonly onDidDispose: Event<void> = this._onDidDispose.event;

	private readonly viewStore = this._register(new DisposableStore());
	/**
	 * Disposables that belong to the rows currently rendered in the list.
	 * `renderList` runs on every reactive change to the active session
	 * (potentially many times per session) — each render registers
	 * per-row gesture targets and click/tap listeners. We hold those in a
	 * dedicated store and `clear()` it at the top of every render so the
	 * disposable count and gesture-target list don't grow unbounded.
	 */
	private readonly rowsStore = this._register(new DisposableStore());
	private readonly listContainer: HTMLElement;
	private readonly subtitleEl: HTMLElement;
	private readonly emptyEl: HTMLElement;

	constructor(
		workbenchContainer: HTMLElement,
		private readonly onOpen: MobileChangesOpenHandler,
		@IInstantiationService _instantiationService: IInstantiationService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
	) {
		super();

		// -- Root overlay -----------------------------------------
		const overlay = DOM.append(workbenchContainer, $('div.mobile-overlay-view'));
		this.viewStore.add(DOM.addDisposableListener(overlay, DOM.EventType.CONTEXT_MENU, e => e.preventDefault()));
		this.viewStore.add(toDisposable(() => overlay.remove()));

		// -- Header -----------------------------------------------
		const header = DOM.append(overlay, $('div.mobile-overlay-header'));

		const backBtn = DOM.append(header, $('button.mobile-overlay-back-btn', { type: 'button' })) as HTMLButtonElement;
		backBtn.setAttribute('aria-label', localize('changesView.back', "Back"));
		DOM.append(backBtn, $('span')).classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronLeft));
		DOM.append(backBtn, $('span.back-btn-label')).textContent = localize('changesView.backLabel', "Back");
		this.viewStore.add(Gesture.addTarget(backBtn));
		this.viewStore.add(DOM.addDisposableListener(backBtn, DOM.EventType.CLICK, () => this.dispose()));
		this.viewStore.add(DOM.addDisposableListener(backBtn, TouchEventType.Tap, () => this.dispose()));

		const info = DOM.append(header, $('div.mobile-overlay-header-info'));
		DOM.append(info, $('div.mobile-overlay-header-title')).textContent = localize('changesView.title', "Session Changes");
		this.subtitleEl = DOM.append(info, $('div.mobile-overlay-header-subtitle'));

		// -- Body -------------------------------------------------
		const body = DOM.append(overlay, $('div.mobile-overlay-body'));
		const scrollWrapper = DOM.append(body, $('div.mobile-overlay-scroll'));
		this.listContainer = DOM.append(scrollWrapper, $('div.mobile-changes-list'));

		this.emptyEl = DOM.append(body, $('div.mobile-overlay-empty-state'));
		this.emptyEl.style.display = 'none';
		this.emptyEl.textContent = localize('changesView.empty', "No changes in this session yet.");

		// -- Subscribe to live changes -----------------------------
		this.viewStore.add(autorun(reader => {
			const session = this.sessionsManagementService.activeSession.read(reader);
			const rows = (session?.changes.read(reader) ?? []).map(toRow).sort(compareRows);
			this.renderList(rows);
		}));
	}

	private renderList(rows: readonly IMobileChangesRow[]): void {
		// Drop per-row disposables from the previous render before
		// detaching the DOM. `autorun` may re-fire many times during a
		// long agent session as files stream into the change list.
		this.rowsStore.clear();
		DOM.clearNode(this.listContainer);

		// Update subtitle counters from the full list.
		let totalAdded = 0;
		let totalRemoved = 0;
		for (const row of rows) {
			totalAdded += row.added;
			totalRemoved += row.removed;
		}
		if (rows.length === 0) {
			this.subtitleEl.textContent = '';
			this.emptyEl.style.display = '';
			this.listContainer.style.display = 'none';
			return;
		}
		this.emptyEl.style.display = 'none';
		this.listContainer.style.display = '';

		// Render the subtitle as styled spans so the +N / -N counters
		// pick up the same accent colours as the per-row counters. We
		// can't use the `localize` template here directly because it
		// returns a flat string — instead construct the DOM manually.
		DOM.clearNode(this.subtitleEl);
		const fileWord = rows.length === 1
			? localize('changesView.subtitleFileSingular', "1 file")
			: localize('changesView.subtitleFilePlural', "{0} files", rows.length);
		DOM.append(this.subtitleEl, $('span.mobile-overlay-header-subtitle-files')).textContent = fileWord;
		DOM.append(this.subtitleEl, $('span.mobile-overlay-header-subtitle-sep')).textContent = ' · ';
		DOM.append(this.subtitleEl, $('span.mobile-changes-row-added')).textContent = `+${totalAdded}`;
		DOM.append(this.subtitleEl, document.createTextNode(' '));
		DOM.append(this.subtitleEl, $('span.mobile-changes-row-removed')).textContent = `-${totalRemoved}`;

		// Build the sibling list once so each row passes the same
		// reference to the open-handler — keeps prev/next navigation
		// consistent regardless of which row was tapped.
		const siblings = rows.map(rowToDiffData);

		for (let i = 0; i < rows.length; i++) {
			this.renderRow(rows[i], siblings, i);
		}
	}

	private renderRow(row: IMobileChangesRow, siblings: readonly IFileDiffViewData[], index: number): void {
		const button = DOM.append(this.listContainer, $('button.mobile-changes-row', { type: 'button' })) as HTMLButtonElement;
		button.classList.add(`change-${row.changeType}`);
		button.setAttribute('aria-label', localize(
			'changesView.rowAria',
			"{0}, {1}, +{2} -{3}",
			row.displayUri.path,
			localizeChangeType(row.changeType),
			row.added,
			row.removed,
		));

		// File icon (codicon, varies by change type) + filename + directory path
		const labelHost = DOM.append(button, $('div.mobile-changes-row-label'));

		const iconEl = DOM.append(labelHost, $('span.mobile-changes-row-icon'));
		iconEl.classList.add(...ThemeIcon.asClassNameArray(changeTypeIcon(row.changeType)));

		const textHost = DOM.append(labelHost, $('div.mobile-changes-row-text'));
		DOM.append(textHost, $('span.mobile-changes-row-filename')).textContent = basename(row.displayUri);
		// Show only the directory portion relative to the tunnel root — strip
		// the scheme-specific `/file/-` prefix if present so the user sees a
		// clean path like `/Users/osvaldortega/project` rather than noise.
		const rawDir = dirname(row.displayUri).path.replace(/^\/file\/-/, '');
		if (rawDir && rawDir !== '/') {
			DOM.append(textHost, $('span.mobile-changes-row-dir')).textContent = rawDir;
		}

		// Trailing pill (A/M/D) + numeric counters.
		const meta = DOM.append(button, $('div.mobile-changes-row-meta'));
		const pill = DOM.append(meta, $('span.mobile-changes-row-pill'));
		pill.classList.add(`change-${row.changeType}`);
		pill.textContent = changeTypeGlyph(row.changeType);
		pill.setAttribute('aria-hidden', 'true');

		const counts = DOM.append(meta, $('span.mobile-changes-row-counts'));
		if (row.added > 0) {
			DOM.append(counts, $('span.mobile-changes-row-added')).textContent = `+${row.added}`;
		}
		if (row.removed > 0) {
			DOM.append(counts, $('span.mobile-changes-row-removed')).textContent = `-${row.removed}`;
		}

		// Activate via both click and tap so quick taps don't get
		// swallowed by the 300ms click delay on touch devices. Per-row
		// listeners go on `rowsStore` so they're cleared on the next
		// reactive re-render.
		this.rowsStore.add(Gesture.addTarget(button));
		const onActivate = () => this.onOpen(siblings[index], siblings, index);
		this.rowsStore.add(DOM.addDisposableListener(button, DOM.EventType.CLICK, onActivate));
		this.rowsStore.add(DOM.addDisposableListener(button, TouchEventType.Tap, onActivate));
	}

	override dispose(): void {
		// Fire before the registered emitter is itself disposed. Listeners
		// are notified that the view has gone away — see `onDidDispose`.
		this._onDidDispose.fire();
		super.dispose();
	}
}

function changeTypeGlyph(type: MobileChangeType): string {
	switch (type) {
		case 'added': return 'A';
		case 'modified': return 'M';
		case 'deleted': return 'D';
	}
}

function changeTypeIcon(type: MobileChangeType): ThemeIcon {
	switch (type) {
		case 'added': return Codicon.diffAdded;
		case 'modified': return Codicon.diffModified;
		case 'deleted': return Codicon.diffRemoved;
	}
}

function localizeChangeType(type: MobileChangeType): string {
	switch (type) {
		case 'added': return localize('changesView.changeAdded', "added");
		case 'modified': return localize('changesView.changeModified', "modified");
		case 'deleted': return localize('changesView.changeDeleted', "deleted");
	}
}

/**
 * Opens a {@link MobileChangesView}. Returns the view instance — dispose
 * to close (the view also disposes itself when the user taps Back).
 */
export function openMobileChangesView(
	instantiationService: IInstantiationService,
	workbenchContainer: HTMLElement,
	onOpen: MobileChangesOpenHandler,
): MobileChangesView {
	return instantiationService.createInstance(MobileChangesView, workbenchContainer, onOpen);
}
