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
import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';

const $ = DOM.$;

/** Returns whether the target belongs to a mobile picker sheet mounted at the workbench root. */
export function isMobilePickerSheetTarget(target: HTMLElement): boolean {
	return !!target.closest('.mobile-picker-sheet');
}

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
	 * When true, the row is rendered with a trailing chevron to signal
	 * that tapping it navigates deeper (drill-down) rather than selecting
	 * a final value. Navigational rows never show the radio checkmark and
	 * are excluded from the in-section radio toggle.
	 */
	readonly navigates?: boolean;
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
	 * `provider.setSessionConfigValue`).
	 *
	 * If the callback returns a string, that string is injected into
	 * the search input and a new query is triggered — use this for
	 * drill-down navigation where tapping a folder replaces the query
	 * with `folderName/` to list its children.
	 *
	 * If the callback returns {@link MOBILE_PICKER_SHEET_CONFIRM}, the
	 * tapped row is treated as confirmed: the sheet resolves with that
	 * row's id and closes immediately.
	 *
	 * Ignored when `stayOpenOnSelect` is false.
	 */
	readonly onDidSelect?: (id: string) => string | typeof MOBILE_PICKER_SHEET_CONFIRM | void;

	/**
	 * Optional override for the dismiss button label (defaults to "Done").
	 * Use "Cancel" for sheets where rows self-confirm on tap and the
	 * header button is purely a dismiss affordance.
	 */
	readonly doneLabel?: string;
}

/**
 * A pinned, single primary action rendered above the scrollable list.
 * Tapping it runs {@link run} and then closes the sheet. Produced by
 * {@link IMobilePickerSheetSearchSource.getPrimaryAction} for the current
 * query.
 */
export interface IMobilePickerSheetPrimaryAction {
	readonly label: string;
	readonly icon?: ThemeIcon;
	readonly run: () => void;
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
	/**
	 * Optional pinned primary action for the given query, rendered above
	 * the result list. Return `undefined` to hide it. Called on every
	 * query change, so the action can track the browse state (e.g. an
	 * "Open this folder" button that follows the folder being browsed).
	 */
	getPrimaryAction?(query: string): IMobilePickerSheetPrimaryAction | undefined;
}

/**
 * Renderer API passed into the {@link showMobileContentSheet} body
 * callback. The renderer fills {@link bodyContainer} with arbitrary DOM
 * and may call {@link close} to dismiss the sheet (e.g. after a confirm
 * button is tapped, or after a sub-view navigation completes).
 */
export interface IMobileContentSheetApi {
	/**
	 * The same element passed as the first argument to the body
	 * renderer; exposed here for convenience so callbacks can capture
	 * the API object without also closing over the body element.
	 */
	readonly bodyContainer: HTMLElement;

	/** Dismiss the sheet (plays the close animation). Idempotent. */
	close(): void;
}

/**
 * Options for {@link showMobileContentSheet}.
 */
export interface IMobileContentSheetOptions {
	/**
	 * Optional caption shown beneath the title (single-line, muted).
	 * Mirrors {@link IMobilePickerSheetOptions.caption}.
	 */
	readonly caption?: string;

	/**
	 * Optional set of icon buttons rendered in the sheet's title row
	 * to the left of the Done button. Tapping a header action resolves
	 * the promise (the same dismissal semantics as the Done button).
	 */
	readonly headerActions?: readonly IMobilePickerSheetHeaderAction[];

	/** Optional override for the Done button label (defaults to "Done"). */
	readonly doneLabel?: string;

	/**
	 * When true, the Done button is hidden. Use this for sheets where
	 * the body itself provides primary dismissal (e.g. a confirm widget
	 * with explicit Approve / Reject buttons that call `api.close()`).
	 * The user can still dismiss via the backdrop or Escape.
	 */
	readonly hideDoneButton?: boolean;
}

/**
 * Prefix used on the resolved id when a header action is invoked from a
 * mobile picker sheet, so callers can disambiguate header taps from
 * regular row selections.
 */
export const MOBILE_PICKER_SHEET_HEADER_ACTION_PREFIX = 'headerAction:';

/**
 * Return from `onDidSelect` to confirm the tapped row and close the sheet while `stayOpenOnSelect` is enabled.
 */
export const MOBILE_PICKER_SHEET_CONFIRM = Symbol('mobilePickerSheetConfirm');

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
		let resolved = false;

		const finish = (id: string | undefined) => {
			if (resolved) {
				return;
			}
			resolved = true;
			shell.close(() => resolve(id));
		};

		const shell: IMobileSheetShell = buildMobileSheetShell(workbenchContainer, title, {
			caption: options?.caption,
			headerActions: options?.headerActions,
			doneLabel: options?.doneLabel,
			onDismiss: () => finish(undefined),
			onHeaderAction: actionId => finish(`${MOBILE_PICKER_SHEET_HEADER_ACTION_PREFIX}${actionId}`),
		});
		const { sheet, disposables } = shell;

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

		// -- Pinned primary action -------------------------------------
		// Optional single, prominent confirm action that sits above the
		// scrollable list and stays put as the list scrolls. Refreshed
		// from `search.getPrimaryAction(query)` on every query change;
		// tapping it runs the action and closes the sheet.
		const pinnedContainer = DOM.append(sheet, $('div.mobile-picker-sheet-pinned'));
		pinnedContainer.style.display = 'none';
		const pinnedStore = disposables.add(new DisposableStore());
		const setPrimaryAction = (action: IMobilePickerSheetPrimaryAction | undefined) => {
			pinnedStore.clear();
			DOM.clearNode(pinnedContainer);
			if (!action) {
				pinnedContainer.style.display = 'none';
				return;
			}
			pinnedContainer.style.display = '';
			const btn = DOM.append(pinnedContainer, $('button.mobile-picker-sheet-primary-action', { type: 'button' })) as HTMLButtonElement;
			btn.setAttribute('aria-label', action.label);
			if (action.icon) {
				const iconSlot = DOM.append(btn, $('span.mobile-picker-sheet-primary-action-icon'));
				const iconGlyph = DOM.append(iconSlot, $('span.mobile-picker-sheet-primary-action-icon-glyph'));
				iconGlyph.classList.add(...ThemeIcon.asClassNameArray(action.icon));
			}
			const textCol = DOM.append(btn, $('span.mobile-picker-sheet-primary-action-text'));
			DOM.append(textCol, $('span.mobile-picker-sheet-primary-action-label')).textContent = action.label;
			// Plain `click` only (no Gesture/Tap) so the action runs
			// exactly once on touch-tap; `run` is not idempotent.
			pinnedStore.add(DOM.addDisposableListener(btn, DOM.EventType.CLICK, (e: MouseEvent) => {
				e.preventDefault();
				action.run();
				finish(undefined);
			}));
		};

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
		const rowsBySection = new Map<number, IMobilePickerSheetRowRef[]>();

		// Mutable reference so handleRowTap can trigger a search-query
		// update when onDidSelect returns a drill-down string. Populated
		// after the search section is created below.
		let setSearchQuery: ((query: string) => void) | undefined;

		const handleRowTap = options?.stayOpenOnSelect && options.onDidSelect
			? (id: string, _row: HTMLElement, sectionIndex: number) => {
				// Update visual: uncheck all rows in the same section,
				// then check the tapped row. Skipped for navigational
				// rows (drill-down) — they don't carry a radio checkmark.
				const sectionRows = rowsBySection.get(sectionIndex);
				const targetEntry = sectionRows?.find(entry => entry.id === id);
				if (sectionRows && !targetEntry?.navigates) {
					for (const entry of sectionRows) {
						if (!entry.checkSlot) {
							continue;
						}
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
				const selectResult = options.onDidSelect!(id);
				if (selectResult === MOBILE_PICKER_SHEET_CONFIRM) {
					finish(id);
				} else if (typeof selectResult === 'string' && searchInput && setSearchQuery) {
					searchInput.value = selectResult;
					setSearchQuery(selectResult);
				}
			}
			: (id: string, _row: HTMLElement, _sectionIndex: number) => { finish(id); };

		// Static items live in their own container so the search flow can
		// hide them while the user is browsing/searching (a non-empty
		// query), keeping recents from cluttering search results.
		const staticContainer = DOM.append(list, $('div.mobile-picker-sheet-static'));
		const renderState: IRenderState = { firstRow: undefined, firstCheckedRow: undefined, sectionCount: 0 };
		for (const item of items) {
			renderRow(staticContainer, item, renderState, handleRowTap, disposables, rowsBySection);
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
			const searchSectionBase = renderState.sectionCount + 1;
			const pruneSearchRows = () => {
				for (const key of [...rowsBySection.keys()]) {
					if (key >= searchSectionBase) {
						rowsBySection.delete(key);
					}
				}
			};
			// Row listeners for search results are scoped here (not to the
			// sheet-lifetime store) and cleared on each re-render so we
			// don't accumulate handlers bound to detached rows.
			const searchRowsStore = disposables.add(new DisposableStore());

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
				// Recents (static items) are only relevant at the root.
				// Once the user types or drills into a path, hide them so
				// the list shows just the search results.
				staticContainer.style.display = query ? 'none' : '';
				const tokens = new CancellationTokenSource();
				currentQueryTokens = tokens;
				DOM.clearNode(resultsContainer);
				pruneSearchRows();
				searchRowsStore.clear();
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
				// Refresh the pinned primary action for the live query
				// (only after the cancellation check so stale queries
				// don't leave a mismatched action behind).
				setPrimaryAction(search.getPrimaryAction?.(query));
				DOM.clearNode(resultsContainer);

				const localState: IRenderState = { firstRow: undefined, firstCheckedRow: undefined, sectionCount: searchSectionBase };
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
					renderRow(resultsContainer, item, localState, handleRowTap, searchRowsStore, rowsBySection);
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

		// Focus the search input if present, otherwise focus the first
		// checked row (or the first row) for keyboard users.
		if (searchInput) {
			searchInput.focus();
		} else {
			(renderState.firstCheckedRow ?? renderState.firstRow)?.focus();
		}
	});
}

/**
 * Show a phone-friendly bottom sheet that hosts arbitrary body content.
 *
 * Reuses the same shell as {@link showMobilePickerSheet} — translucent
 * backdrop, slide-up animation, drag handle, title row with Done button,
 * optional caption, optional icon header actions, iOS visual-viewport
 * keyboard avoidance, and `Escape` / backdrop dismissal — but leaves the
 * scrollable body to the caller. Use this for overlays that don't fit
 * the picker's row-list shape: tool-confirmation carousels, plan
 * reviews, anchor previews, code-block expand views, and so on.
 *
 * The {@link renderBody} callback is invoked once after the sheet shell
 * mounts. The caller fills the supplied `bodyElement` with whatever DOM
 * they like and may return an {@link IDisposable} whose `dispose()` runs
 * when the sheet closes (alongside the shell's own listeners).
 *
 * The body container has `overflow-y: auto`,
 * `-webkit-overflow-scrolling: touch`, and `touch-action: pan-y` applied
 * via the `.mobile-content-sheet-body` class so vertical scrolling works
 * correctly under iOS.
 *
 * The returned promise resolves with `void` when the sheet closes for
 * any reason: Done button, backdrop tap, Escape, a header action tap,
 * or an explicit `api.close()` from inside `renderBody`.
 *
 * @example
 * ```ts
 * await showMobileContentSheet(
 *     this._layoutService.mainContainer,
 *     localize('confirm.title', "Confirm Tool Use"),
 *     (body, api) => {
 *         const store = new DisposableStore();
 *         const summary = DOM.append(body, DOM.$('div.tool-confirm-summary'));
 *         summary.textContent = toolDescription;
 *
 *         const approve = DOM.append(body, DOM.$('button.tool-confirm-approve'));
 *         approve.textContent = localize('confirm.approve', "Approve");
 *         store.add(DOM.addDisposableListener(approve, 'click', () => {
 *             writeApproval();
 *             api.close();
 *         }));
 *
 *         return store;
 *     },
 *     { caption: localize('confirm.caption', "This will modify your workspace.") },
 * );
 * ```
 */
export function showMobileContentSheet(
	workbenchContainer: HTMLElement,
	title: string,
	renderBody: (bodyElement: HTMLElement, api: IMobileContentSheetApi) => IDisposable | void,
	options?: IMobileContentSheetOptions,
): Promise<void> {
	return new Promise<void>(resolve => {
		let resolved = false;

		const close = () => {
			if (resolved) {
				return;
			}
			resolved = true;
			shell.close(() => resolve());
		};

		const shell: IMobileSheetShell = buildMobileSheetShell(workbenchContainer, title, {
			caption: options?.caption,
			headerActions: options?.headerActions,
			doneLabel: options?.doneLabel,
			hideDoneButton: options?.hideDoneButton,
			onDismiss: close,
			onHeaderAction: () => close(),
		});

		const bodyContainer = DOM.append(shell.sheet, $('div.mobile-content-sheet-body'));

		const api: IMobileContentSheetApi = { bodyContainer, close };
		const bodyDisposable = renderBody(bodyContainer, api);
		if (bodyDisposable) {
			shell.disposables.add(bodyDisposable);
		}
	});
}

/** Options consumed by {@link buildMobileSheetShell}. */
interface IMobileSheetShellOptions {
	readonly caption?: string;
	readonly headerActions?: readonly IMobilePickerSheetHeaderAction[];
	readonly doneLabel?: string;
	readonly hideDoneButton?: boolean;
	/**
	 * Called when the user dismisses the sheet via the Done button,
	 * backdrop tap, or Escape key. The shell does NOT close itself in
	 * response to dismissal — the caller is expected to invoke
	 * {@link IMobileSheetShell.close} from this callback.
	 */
	readonly onDismiss: () => void;
	/**
	 * Called when a header action button is tapped. If omitted, header
	 * action taps fall through to {@link onDismiss}.
	 */
	readonly onHeaderAction?: (actionId: string) => void;
}

/** Primitives returned by {@link buildMobileSheetShell}. */
interface IMobileSheetShell {
	readonly overlay: HTMLElement;
	readonly backdrop: HTMLElement;
	/** The sheet container — append body content here. */
	readonly sheet: HTMLElement;
	/** Disposable store tied to the sheet's lifetime; cleared on close. */
	readonly disposables: DisposableStore;
	/**
	 * Play the close animation, dispose listeners, and remove the DOM
	 * node after the animation completes. Idempotent — subsequent
	 * calls are no-ops. The optional callback fires once the node has
	 * been removed.
	 */
	close(onAnimationEnd?: () => void): void;
}

/**
 * Build the shared shell for {@link showMobilePickerSheet} and
 * {@link showMobileContentSheet}: overlay, backdrop, sheet (drag handle,
 * title row with Done button and optional header actions, optional
 * caption), backdrop / Escape dismissal, and iOS visual-viewport
 * keyboard avoidance. Callers append their own content children to
 * `sheet`.
 */
function buildMobileSheetShell(
	workbenchContainer: HTMLElement,
	title: string,
	options: IMobileSheetShellOptions,
): IMobileSheetShell {
	const disposables = new DisposableStore();
	let closed = false;

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
	if (options.headerActions) {
		for (const action of options.headerActions) {
			const btn = DOM.append(titleRow, $('button.mobile-picker-sheet-header-action', { type: 'button' })) as HTMLButtonElement;
			btn.setAttribute('aria-label', action.label);
			btn.title = action.label;
			const iconHost = DOM.append(btn, $('span.mobile-picker-sheet-header-action-icon'));
			const iconEl = DOM.append(iconHost, $('span.mobile-picker-sheet-header-action-icon-glyph'));
			iconEl.classList.add(...ThemeIcon.asClassNameArray(action.icon));
			const btnGesture = Gesture.addTarget(btn);
			disposables.add(btnGesture);
			const onActivate = () => {
				if (options.onHeaderAction) {
					options.onHeaderAction(action.id);
				} else {
					options.onDismiss();
				}
			};
			const btnClick = DOM.addDisposableListener(btn, DOM.EventType.CLICK, (e: MouseEvent) => {
				e.preventDefault();
				onActivate();
			});
			disposables.add(btnClick);
			const btnTap = DOM.addDisposableListener(btn, TouchEventType.Tap, onActivate);
			disposables.add(btnTap);
		}
	}

	if (!options.hideDoneButton) {
		const doneBtn = DOM.append(titleRow, $('button.mobile-picker-sheet-done', { type: 'button' })) as HTMLButtonElement;
		doneBtn.textContent = options.doneLabel ?? localize('mobilePickerSheet.done', "Done");
		doneBtn.setAttribute('aria-label', localize('mobilePickerSheet.doneAriaLabel', "Close {0}", title));
		const doneGesture = Gesture.addTarget(doneBtn);
		disposables.add(doneGesture);
		const doneClick = DOM.addDisposableListener(doneBtn, DOM.EventType.CLICK, (e: MouseEvent) => {
			e.preventDefault();
			options.onDismiss();
		});
		disposables.add(doneClick);
		const doneTap = DOM.addDisposableListener(doneBtn, TouchEventType.Tap, () => options.onDismiss());
		disposables.add(doneTap);
	}

	if (options.caption) {
		const caption = DOM.append(sheet, $('div.mobile-picker-sheet-caption'));
		caption.textContent = options.caption;
	}

	// -- Dismissal: backdrop + Escape ------------------------------
	const backdropClick = DOM.addDisposableListener(backdrop, DOM.EventType.CLICK, () => options.onDismiss());
	disposables.add(backdropClick);
	const backdropGesture = Gesture.addTarget(backdrop);
	disposables.add(backdropGesture);
	const backdropTap = DOM.addDisposableListener(backdrop, TouchEventType.Tap, () => options.onDismiss());
	disposables.add(backdropTap);

	const keyHandler = DOM.addDisposableListener(DOM.getWindow(workbenchContainer), DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			options.onDismiss();
		}
	}, true);
	disposables.add(keyHandler);

	// -- iOS keyboard avoidance -----------------------------------
	// On iOS Safari, when the virtual keyboard opens the layout
	// viewport (`vh` units) does NOT shrink — only the visual
	// viewport changes. The sheet uses `position: fixed` which
	// positions against the layout viewport, so without correction
	// the keyboard covers the bottom portion of the sheet (including
	// any input the user is actively typing into).
	//
	// `window.visualViewport` exposes the real visible area. We
	// listen for `resize` and `scroll` events on it and translate
	// the sheet upward by the keyboard height so the focused input
	// remains visible.
	const win = DOM.getWindow(workbenchContainer);
	const vv = win.visualViewport;
	if (vv) {
		const adjustForKeyboard = () => {
			// The keyboard height is the difference between the
			// layout viewport height and the visual viewport height.
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

	const close = (onAnimationEnd?: () => void) => {
		if (closed) {
			return;
		}
		closed = true;
		sheet.classList.add('closing');
		backdrop.classList.add('closing');
		// Dispose all event listeners and inflight queries immediately
		// so nothing fires during the 180ms close animation. The DOM
		// node itself is removed at the end of the animation.
		disposables.dispose();
		DOM.getWindow(workbenchContainer).setTimeout(() => {
			overlay.remove();
			onAnimationEnd?.();
		}, 180);
	};

	return { overlay, backdrop, sheet, disposables, close };
}

/** Mutable bookkeeping passed through {@link renderRow} so we can track section dividers and the row to focus. */
interface IRenderState {
	firstRow: HTMLButtonElement | undefined;
	firstCheckedRow: HTMLButtonElement | undefined;
	sectionCount: number;
}

/**
 * A rendered row registered per section so `stayOpenOnSelect` mode can
 * toggle the radio checkmark within a section on tap. Navigational rows
 * have no {@link checkSlot} and are skipped by the toggle.
 */
interface IMobilePickerSheetRowRef {
	readonly row: HTMLButtonElement;
	readonly checkSlot?: HTMLElement;
	readonly id: string;
	readonly navigates?: boolean;
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
	rowsBySection?: Map<number, IMobilePickerSheetRowRef[]>,
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

	// Trailing affordance. Navigational rows show a chevron (tap drills
	// deeper); selectable rows show a checkmark when active. Same
	// child-span pattern as the icon slot so flex centering wins over
	// codicon's `display: inline-block`.
	let checkSlot: HTMLElement | undefined;
	if (item.navigates && !item.checked) {
		const chevronSlot = DOM.append(row, $('span.mobile-picker-sheet-chevron'));
		const chevronGlyph = DOM.append(chevronSlot, $('span.mobile-picker-sheet-chevron-glyph'));
		chevronGlyph.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronRight));
	} else {
		checkSlot = DOM.append(row, $('span.mobile-picker-sheet-check'));
		if (item.checked) {
			const checkGlyph = DOM.append(checkSlot, $('span.mobile-picker-sheet-check-glyph'));
			checkGlyph.classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
		}
	}

	// Register this row so `stayOpenOnSelect` mode can toggle
	// checkmarks within the same section on tap.
	if (rowsBySection) {
		const entry: IMobilePickerSheetRowRef = { row, checkSlot, id: item.id, navigates: item.navigates };
		const sectionRows = rowsBySection.get(state.sectionCount);
		if (sectionRows) {
			sectionRows.push(entry);
		} else {
			rowsBySection.set(state.sectionCount, [entry]);
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
