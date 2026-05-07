/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/mobilePickerSheet.css';
import * as DOM from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';

const $ = DOM.$;

/**
 * One row in the {@link showMobilePickerSheet} bottom sheet.
 *
 * Shape mirrors the data the desktop action-widget pickers already produce
 * (icon + label + optional description + optional checked) so callers can
 * map their existing items list directly.
 */
export interface IMobilePickerSheetItem {
	readonly id: string;
	readonly label: string;
	readonly description?: string;
	readonly icon?: ThemeIcon;
	readonly checked?: boolean;
	readonly disabled?: boolean;
	/**
	 * Optional section title shown above this row. When set, a divider is
	 * inserted above the row (for sections after the first) and the title
	 * text is rendered as a small uppercase label. Pass an empty string
	 * (`''`) to insert a divider with no title — useful for translating
	 * action-list `Separator` items.
	 */
	readonly sectionTitle?: string;
}

export interface IMobilePickerSheetOptions {
	/**
	 * Optional caption shown beneath the title (single-line, muted). Useful
	 * for explaining what the picker controls (e.g. "Agents are pre-configured
	 * templates").
	 */
	readonly caption?: string;

	/**
	 * Optional set of icon buttons rendered in the sheet's title row to
	 * the left of the Done button. Use these for sheet-level actions
	 * (e.g. "browse for a folder") that aren't a single picker row.
	 *
	 * Each button resolves the sheet with `headerAction:<id>` so the
	 * caller can route header taps the same way it routes row taps.
	 */
	readonly headerActions?: readonly IMobilePickerSheetHeaderAction[];

	/**
	 * Optional inline-search section. When set, a search input is
	 * rendered below the title row and the result list is appended below
	 * the static items list, refreshed (with cancellation) as the user
	 * types. Tapping a result row resolves the sheet with that row's id,
	 * exactly like a static row.
	 */
	readonly search?: IMobilePickerSheetSearchSource;

	/**
	 * When true, row taps call {@link onDidSelect} instead of resolving
	 * the sheet. The sheet stays open until the user taps Done, the
	 * backdrop, or presses Escape (all resolve with `undefined`). Use
	 * this for multi-property sheets (e.g. Worktree + Branch) where the
	 * user adjusts several values before dismissing, or for drill-down
	 * navigation where a tap replaces the row list rather than picking
	 * a final value.
	 *
	 * When false (default), a row tap resolves the sheet with that
	 * row's id and closes immediately (the original behavior).
	 */
	readonly stayOpenOnSelect?: boolean;

	/**
	 * Called when a row is tapped and {@link stayOpenOnSelect} is true.
	 * Callers should write-through the selection (e.g.
	 * `provider.setSessionConfigValue`) and optionally update the
	 * sheet's visual state via {@link IMobilePickerSheetController}.
	 *
	 * If the callback returns a string, that string is injected into
	 * the search input and a new query is triggered — use this for
	 * drill-down navigation where tapping a folder replaces the query
	 * with `folderName/` to list its children.
	 *
	 * Ignored when `stayOpenOnSelect` is false.
	 */
	readonly onDidSelect?: (id: string) => string | void;
}

export interface IMobilePickerSheetHeaderAction {
	readonly id: string;
	readonly label: string;
	readonly icon: ThemeIcon;
}

/**
 * Backs the inline search section in {@link IMobilePickerSheetOptions.search}.
 * The sheet calls {@link loadItems} with the current input value (debounced)
 * and a cancellation token that fires when the user types again or the
 * sheet closes; implementations should honor it before yielding stale
 * results.
 */
export interface IMobilePickerSheetSearchSource {
	/** Placeholder text for the search input. */
	readonly placeholder: string;
	/** Section title shown above the result list. */
	readonly resultsSectionTitle?: string;
	/** Aria label for the search input (defaults to {@link placeholder}). */
	readonly ariaLabel?: string;
	/** Message rendered inside the result list when zero results are returned. */
	readonly emptyMessage?: string;
	/** Loads the result rows for the given query. */
	loadItems(query: string, token: CancellationToken): Promise<readonly IMobilePickerSheetItem[]>;
}

/**
 * Prefix used on the resolved id when a header action is invoked from a
 * mobile picker sheet, so callers can disambiguate header taps from
 * regular row selections.
 */
export const MOBILE_PICKER_SHEET_HEADER_ACTION_PREFIX = 'headerAction:';

/**
 * Show a phone-friendly bottom sheet for picker-style choices.
 *
 * Renders as a fixed-position overlay docked at the bottom of the
 * viewport with a translucent backdrop, drag handle, header (title +
 * Done button), and a scrollable list of rows. Tapping a row resolves
 * with that row's id; tapping the backdrop, the Done button, or
 * pressing Escape resolves with `undefined`.
 *
 * The sheet is intended as the mobile replacement for the desktop
 * action-widget popups used by the workspace picker, session type
 * picker, and similar dropdowns. Build it as a reusable widget so other
 * picker callers can share it.
 */
export function showMobilePickerSheet(
	workbenchContainer: HTMLElement,
	title: string,
	items: readonly IMobilePickerSheetItem[],
	options?: IMobilePickerSheetOptions,
): Promise<string | undefined> {
	return new Promise<string | undefined>(resolve => {
		const disposables = new DisposableStore();
		let resolved = false;

		const finish = (id: string | undefined) => {
			if (resolved) {
				return;
			}
			resolved = true;
			sheet.classList.add('closing');
			backdrop.classList.add('closing');
			// Dispose all event listeners and inflight queries immediately
			// so nothing fires during the 180ms close animation. The DOM
			// node itself is removed at the end of the animation.
			disposables.dispose();
			DOM.getWindow(workbenchContainer).setTimeout(() => {
				overlay.remove();
				resolve(id);
			}, 180);
		};

		// -- DOM: backdrop + sheet -------------------------------------
		const overlay = DOM.append(workbenchContainer, $('div.mobile-picker-sheet-overlay'));
		const backdrop = DOM.append(overlay, $('div.mobile-picker-sheet-backdrop'));
		const sheet = DOM.append(overlay, $('div.mobile-picker-sheet'));
		sheet.setAttribute('role', 'dialog');
		sheet.setAttribute('aria-modal', 'true');
		sheet.setAttribute('aria-label', title);

		// -- Header (drag handle + title row + caption) ----------------
		DOM.append(sheet, $('div.mobile-picker-sheet-handle'));

		const titleRow = DOM.append(sheet, $('div.mobile-picker-sheet-title-row'));
		const titleEl = DOM.append(titleRow, $('div.mobile-picker-sheet-title'));
		titleEl.textContent = title;

		// Optional header actions (icon buttons) rendered between the
		// title and the Done button. Useful for sheet-level shortcuts
		// like "browse for a folder" that aren't a single picker row.
		if (options?.headerActions) {
			for (const action of options.headerActions) {
				const btn = DOM.append(titleRow, $('button.mobile-picker-sheet-header-action', { type: 'button' })) as HTMLButtonElement;
				btn.setAttribute('aria-label', action.label);
				btn.title = action.label;
				const iconHost = DOM.append(btn, $('span.mobile-picker-sheet-header-action-icon'));
				const iconEl = DOM.append(iconHost, $('span.mobile-picker-sheet-header-action-icon-glyph'));
				iconEl.classList.add(...ThemeIcon.asClassNameArray(action.icon));
				const btnGesture = Gesture.addTarget(btn);
				disposables.add(btnGesture);
				const onActivate = () => finish(`${MOBILE_PICKER_SHEET_HEADER_ACTION_PREFIX}${action.id}`);
				const btnClick = DOM.addDisposableListener(btn, DOM.EventType.CLICK, (e: MouseEvent) => {
					e.preventDefault();
					onActivate();
				});
				disposables.add(btnClick);
				const btnTap = DOM.addDisposableListener(btn, TouchEventType.Tap, onActivate);
				disposables.add(btnTap);
			}
		}

		const doneBtn = DOM.append(titleRow, $('button.mobile-picker-sheet-done', { type: 'button' })) as HTMLButtonElement;
		doneBtn.textContent = localize('mobilePickerSheet.done', "Done");
		doneBtn.setAttribute('aria-label', localize('mobilePickerSheet.doneAriaLabel', "Close {0}", title));
		const doneGesture = Gesture.addTarget(doneBtn);
		disposables.add(doneGesture);
		const doneClick = DOM.addDisposableListener(doneBtn, DOM.EventType.CLICK, (e: MouseEvent) => {
			e.preventDefault();
			finish(undefined);
		});
		disposables.add(doneClick);
		const doneTap = DOM.addDisposableListener(doneBtn, TouchEventType.Tap, () => finish(undefined));
		disposables.add(doneTap);

		if (options?.caption) {
			const caption = DOM.append(sheet, $('div.mobile-picker-sheet-caption'));
			caption.textContent = options.caption;
		}

		// -- Optional inline search input ------------------------------
		// Sits between the title row and the scrollable list. Its value
		// drives `options.search.loadItems` (debounced + cancellable),
		// and the results are appended below the static items list.
		let searchInput: HTMLInputElement | undefined;
		if (options?.search) {
			const searchRow = DOM.append(sheet, $('div.mobile-picker-sheet-search'));
			const iconHost = DOM.append(searchRow, $('span.mobile-picker-sheet-search-icon'));
			const iconEl = DOM.append(iconHost, $('span.mobile-picker-sheet-search-icon-glyph'));
			iconEl.classList.add(...ThemeIcon.asClassNameArray(Codicon.search));
			searchInput = DOM.append(searchRow, $('input.mobile-picker-sheet-search-input', { type: 'search', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false' })) as HTMLInputElement;
			searchInput.placeholder = options.search.placeholder;
			searchInput.setAttribute('aria-label', options.search.ariaLabel ?? options.search.placeholder);
		}

		// -- Items list ------------------------------------------------
		const list = DOM.append(sheet, $('div.mobile-picker-sheet-list'));
		list.setAttribute('role', 'list');

		// When `stayOpenOnSelect` is true, row taps call the caller's
		// `onDidSelect` callback and leave the sheet open. The visual
		// state (checkmark + aria) is updated immediately so the user
		// sees which option is now active. Within each section, only
		// one row can be checked at a time (radio-select semantics).
		// When false (default), taps resolve the sheet promise and close.

		// Registry of rendered rows keyed by section index, used to
		// toggle checkmarks within a section on tap.
		const rowsBySection = new Map<number, { row: HTMLButtonElement; checkSlot: HTMLElement; id: string }[]>();

		// Mutable reference so handleRowTap can trigger a search-query
		// update when onDidSelect returns a drill-down string. Populated
		// after the search section is created below.
		let setSearchQuery: ((query: string) => void) | undefined;

		const handleRowTap = options?.stayOpenOnSelect && options.onDidSelect
			? (id: string, _row: HTMLElement, sectionIndex: number) => {
				// Update visual: uncheck all rows in the same section,
				// then check the tapped row.
				const sectionRows = rowsBySection.get(sectionIndex);
				if (sectionRows) {
					for (const entry of sectionRows) {
						const isTarget = entry.id === id;
						entry.row.classList.toggle('checked', isTarget);
						entry.row.setAttribute('aria-current', isTarget ? 'true' : 'false');
						DOM.clearNode(entry.checkSlot);
						if (isTarget) {
							const checkGlyph = DOM.append(entry.checkSlot, $('span.mobile-picker-sheet-check-glyph'));
							checkGlyph.classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
						}
					}
				}
				const drillDown = options.onDidSelect!(id);
				if (typeof drillDown === 'string' && searchInput && setSearchQuery) {
					searchInput.value = drillDown;
					setSearchQuery(drillDown);
				}
			}
			: (id: string, _row: HTMLElement, _sectionIndex: number) => { finish(id); };

		const renderState: IRenderState = { firstRow: undefined, firstCheckedRow: undefined, sectionCount: 0 };
		for (const item of items) {
			renderRow(list, item, renderState, handleRowTap, disposables, rowsBySection);
		}

		// -- Dynamic search results -----------------------------------
		// When `options.search` is set, append a results section below
		// the static items. The section refreshes on every input change
		// (with a small debounce) and uses cancellation tokens so stale
		// queries don't surface after the user has typed more.
		const search = options?.search;
		if (search && searchInput) {
			const resultsContainer = DOM.append(list, $('div.mobile-picker-sheet-search-results'));
			let currentQueryTokens: CancellationTokenSource | undefined;
			let debounceTimer: ReturnType<typeof setTimeout> | undefined;

			const cancelInflight = () => {
				currentQueryTokens?.cancel();
				currentQueryTokens?.dispose();
				currentQueryTokens = undefined;
				if (debounceTimer !== undefined) {
					clearTimeout(debounceTimer);
					debounceTimer = undefined;
				}
			};
			disposables.add(toDisposable(cancelInflight));

			const renderResults = async (query: string): Promise<void> => {
				cancelInflight();
				const tokens = new CancellationTokenSource();
				currentQueryTokens = tokens;
				DOM.clearNode(resultsContainer);
				const status = DOM.append(resultsContainer, $('div.mobile-picker-sheet-search-status'));
				status.textContent = localize('mobilePickerSheet.searching', "Searching…");

				let results: readonly IMobilePickerSheetItem[];
				try {
					results = await search.loadItems(query, tokens.token);
				} catch {
					results = [];
				}
				if (tokens.token.isCancellationRequested || resolved) {
					return;
				}
				DOM.clearNode(resultsContainer);

				const localState: IRenderState = { firstRow: undefined, firstCheckedRow: undefined, sectionCount: 0 };
				if (search.resultsSectionTitle) {
					const sectionTitle = DOM.append(resultsContainer, $('div.mobile-picker-sheet-section-title'));
					sectionTitle.textContent = search.resultsSectionTitle;
				}
				if (results.length === 0) {
					const empty = DOM.append(resultsContainer, $('div.mobile-picker-sheet-search-empty'));
					empty.textContent = search.emptyMessage ?? localize('mobilePickerSheet.noResults', "No results");
					return;
				}
				for (const item of results) {
					renderRow(resultsContainer, item, localState, handleRowTap, disposables, rowsBySection);
				}
			};

			// Debounce input changes to avoid hammering the network on
			// every keystroke; cancellation handles the long tail of
			// in-flight requests when the user keeps typing.
			const onInput = () => {
				if (debounceTimer !== undefined) {
					clearTimeout(debounceTimer);
				}
				const value = searchInput!.value;
				debounceTimer = setTimeout(() => {
					debounceTimer = undefined;
					renderResults(value);
				}, 150);
			};
			const inputListener = DOM.addDisposableListener(searchInput, 'input', onInput);
			disposables.add(inputListener);

			// Initial population (empty query).
			renderResults('');

			// Expose a programmatic setter so handleRowTap can drive
			// drill-down navigation when onDidSelect returns a string.
			setSearchQuery = (query: string) => renderResults(query);
		}

		// -- Dismissal: backdrop + Escape ------------------------------
		const backdropClick = DOM.addDisposableListener(backdrop, DOM.EventType.CLICK, () => finish(undefined));
		disposables.add(backdropClick);
		const backdropGesture = Gesture.addTarget(backdrop);
		disposables.add(backdropGesture);
		const backdropTap = DOM.addDisposableListener(backdrop, TouchEventType.Tap, () => finish(undefined));
		disposables.add(backdropTap);

		const keyHandler = DOM.addDisposableListener(DOM.getWindow(workbenchContainer), DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				finish(undefined);
			}
		}, true);
		disposables.add(keyHandler);

		// -- iOS keyboard avoidance -----------------------------------
		// On iOS Safari, when the virtual keyboard opens the layout
		// viewport (`vh` units) does NOT shrink — only the visual
		// viewport changes. The sheet uses `position: fixed` which
		// positions against the layout viewport, so without correction
		// the keyboard covers the bottom portion of the sheet (including
		// the search input the user is actively typing into).
		//
		// `window.visualViewport` exposes the real visible area. We
		// listen for `resize` and `scroll` events on it and translate
		// the sheet upward by the keyboard height so the search input
		// remains visible.
		const win = DOM.getWindow(workbenchContainer);
		const vv = win.visualViewport;
		if (vv) {
			const adjustForKeyboard = () => {
				// The keyboard height is the difference between the
				// layout viewport height and the visual viewport height,
				// plus any scroll offset the browser applied.
				const keyboardHeight = win.innerHeight - vv.height;
				overlay.style.bottom = `${Math.max(0, keyboardHeight)}px`;
				overlay.style.height = `${vv.height}px`;
			};
			vv.addEventListener('resize', adjustForKeyboard);
			vv.addEventListener('scroll', adjustForKeyboard);
			disposables.add(toDisposable(() => {
				vv.removeEventListener('resize', adjustForKeyboard);
				vv.removeEventListener('scroll', adjustForKeyboard);
				overlay.style.bottom = '';
				overlay.style.height = '';
			}));
			// Run once immediately in case the keyboard is already
			// visible (e.g., sheet opened while another input had focus).
			adjustForKeyboard();
		}

		// Focus the search input if present, otherwise focus the first
		// checked row (or the first row) for keyboard users.
		if (searchInput) {
			searchInput.focus();
		} else {
			(renderState.firstCheckedRow ?? renderState.firstRow)?.focus();
		}
	});
}

/** Mutable bookkeeping passed through {@link renderRow} so we can track section dividers and the row to focus. */
interface IRenderState {
	firstRow: HTMLButtonElement | undefined;
	firstCheckedRow: HTMLButtonElement | undefined;
	sectionCount: number;
}

/**
 * Append a single picker row (and any preceding section divider) to the
 * given list element. Wires up touch/click handlers so taps invoke
 * {@link onTap}. Shared between the static items list and the dynamic
 * search-results renderer.
 */
function renderRow(
	list: HTMLElement,
	item: IMobilePickerSheetItem,
	state: IRenderState,
	onTap: (id: string, row: HTMLButtonElement, sectionIndex: number) => void,
	disposables: DisposableStore,
	rowsBySection?: Map<number, { row: HTMLButtonElement; checkSlot: HTMLElement; id: string }[]>,
): void {
	if (item.sectionTitle !== undefined) {
		if (state.sectionCount > 0) {
			DOM.append(list, $('div.mobile-picker-sheet-divider'));
		}
		if (item.sectionTitle) {
			const sectionTitle = DOM.append(list, $('div.mobile-picker-sheet-section-title'));
			sectionTitle.textContent = item.sectionTitle;
		}
		state.sectionCount++;
	}

	const row = DOM.append(list, $('button.mobile-picker-sheet-item', { type: 'button' })) as HTMLButtonElement;
	row.setAttribute('role', 'listitem');
	row.setAttribute('aria-current', item.checked ? 'true' : 'false');
	if (item.checked) {
		row.classList.add('checked');
	}
	if (item.disabled) {
		row.classList.add('disabled');
		row.disabled = true;
		row.setAttribute('aria-disabled', 'true');
	}
	state.firstRow ??= row;
	if (item.checked && !state.firstCheckedRow) {
		state.firstCheckedRow = row;
	}

	// Icon slot — square tile so rows align even when an item has no icon.
	// The codicon glyph lives on a child span so the slot's flex layout
	// can actually center it; codicon's own `display: inline-block` would
	// otherwise win on specificity and break vertical centering.
	if (item.icon) {
		const iconSlot = DOM.append(row, $('span.mobile-picker-sheet-icon'));
		const iconGlyph = DOM.append(iconSlot, $('span.mobile-picker-sheet-icon-glyph'));
		iconGlyph.classList.add(...ThemeIcon.asClassNameArray(item.icon));
	}

	// Text column — label on top, optional description beneath.
	const textCol = DOM.append(row, $('span.mobile-picker-sheet-text'));
	DOM.append(textCol, $('span.mobile-picker-sheet-label')).textContent = item.label;
	if (item.description) {
		DOM.append(textCol, $('span.mobile-picker-sheet-description')).textContent = item.description;
	}

	// Trailing checkmark for the currently-selected row. Same child-span
	// pattern as the icon slot so flex centering wins over codicon's
	// `display: inline-block`.
	const checkSlot = DOM.append(row, $('span.mobile-picker-sheet-check'));
	if (item.checked) {
		const checkGlyph = DOM.append(checkSlot, $('span.mobile-picker-sheet-check-glyph'));
		checkGlyph.classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
	}

	// Register this row so `stayOpenOnSelect` mode can toggle
	// checkmarks within the same section on tap.
	if (rowsBySection) {
		const sectionRows = rowsBySection.get(state.sectionCount);
		if (sectionRows) {
			sectionRows.push({ row, checkSlot, id: item.id });
		} else {
			rowsBySection.set(state.sectionCount, [{ row, checkSlot, id: item.id }]);
		}
	}

	const currentSectionIndex = state.sectionCount;
	if (!item.disabled) {
		// Use plain `click` only — NOT `Gesture.addTarget`. Monaco's
		// Gesture handler registers `touchmove` listeners that call
		// `event.preventDefault()`, which blocks native touch scrolling
		// inside the sheet's scrollable list container. The browser's
		// built-in `click` event fires on touch-tap in mobile Safari
		// and Chrome Android, so Gesture isn't needed here.
		const rowClick = DOM.addDisposableListener(row, DOM.EventType.CLICK, (e: MouseEvent) => {
			e.preventDefault();
			onTap(item.id, row, currentSectionIndex);
		});
		disposables.add(rowClick);
	}
}
