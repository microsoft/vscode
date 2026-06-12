/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { $, addDisposableListener, EventType, isHTMLInputElement } from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { IQuickInputService, IQuickPick, IQuickPickItem, IQuickPickSeparator, QuickInputHideReason } from '../../../../../platform/quickinput/common/quickInput.js';
import { BrowserEditorInput } from '../../common/browserEditorInput.js';
import {
	BrowserEditorContribution,
	BrowserWidgetLocation,
	IBrowserEditorWidget,
	IBrowserUrlPickerAction,
	IBrowserUrlPickerActionProvider,
	IBrowserUrlRenderer,
	IBrowserUrlSuggestion,
	IBrowserUrlSuggestionAction,
	IBrowserUrlSuggestionProvider,
} from '../browserEditor.js';

/**
 * Quick-pick item used by the URL picker. The built-in "Go to" fallback entry
 * leaves {@link apply} unset and is handled inline; host- and
 * provider-contributed items carry their own {@link apply} callback that runs
 * against the editor's input.
 */
export type IUrlPickerItem = IQuickPickItem & {
	apply?(input: BrowserEditorInput): void | Promise<void>;
};

/**
 * The minimal surface {@link BrowserUrlBarWidget} needs from its owning
 * editor: the current browser input (for the canonical URL, navigation, and
 * provider context) and a way to release focus back into the page.
 */
export interface IBrowserUrlBarHost {
	readonly input: BrowserEditorInput | undefined;
	ensureBrowserFocus(): void;
	/**
	 * Resolve the built-in primary picker item(s) for the given (trimmed,
	 * non-empty) text. The first item is treated as the default action when
	 * the user commits the text directly (e.g. presses Enter without picking a
	 * suggestion). Returning multiple items lets the bar offer a choice (e.g.
	 * Search then Go to for ambiguous input). When omitted or empty, the
	 * widget falls back to a plain "Go to {text}" entry.
	 */
	getPrimaryActions?(text: string): readonly IUrlPickerItem[];
	/**
	 * The placeholder shown in the URL display and picker. When omitted the
	 * widget uses a plain "Enter a URL" placeholder.
	 */
	getPlaceholder?(): string;
}

/**
 * The URL bar widget: a contenteditable display showing the current URL,
 * with a quick-pick overlay as the editing surface. Hosts pre/post-URL
 * widget slots, URL renderers (e.g. cert-error decoration), suggestion
 * providers, and per-picker chrome action providers.
 *
 * Editing model:
 *  - Steady state: {@link _urlDisplay} is a `contenteditable` div that hosts
 *    the URL renderers' rich rendering and accepts native input behaviors
 *    (caret, typing, backspace, paste).
 *  - Explicit user activation (click/Tab on the display, {@link openUrlPicker},
 *    typing into the focused display): the quick-pick editing surface opens,
 *    overlaying the URL container with suggestions.
 */
export class BrowserUrlBarWidget extends Disposable {
	readonly element: HTMLElement;
	private readonly _urlDisplay: HTMLElement;
	private readonly _preUrlWidgetsContainer: HTMLElement;
	private readonly _urlBarWidgetsContainer: HTMLElement;
	private readonly _urlRenderers: IBrowserUrlRenderer[] = [];
	private readonly _suggestionProviders: IBrowserUrlSuggestionProvider[] = [];
	private readonly _pickerActionProviders: IBrowserUrlPickerActionProvider[] = [];
	private readonly _picker = this._register(new MutableDisposable<IQuickPick<IUrlPickerItem, { useSeparators: true }>>());

	private _suppressFocusOpen = false;
	private _suppressBlurRevert = false;

	constructor(
		private readonly _host: IBrowserUrlBarHost,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
	) {
		super();

		this.element = $('.browser-url-container');
		this._preUrlWidgetsContainer = $('.browser-pre-url-widgets');

		// The URL display is a contenteditable div so it behaves like an input
		// (caret, typing, backspace, paste) while still permitting child spans for
		// URL renderer styling (e.g. red strikethrough on `https:` for cert errors).
		this._urlDisplay = $('div.browser-url-display');
		this._urlDisplay.contentEditable = 'plaintext-only';
		this._urlDisplay.spellcheck = false;
		this._urlDisplay.setAttribute('data-placeholder', this._placeholder);

		this._urlBarWidgetsContainer = $('.browser-url-bar-widgets');

		this.element.appendChild(this._preUrlWidgetsContainer);
		this.element.appendChild(this._urlDisplay);
		this.element.appendChild(this._urlBarWidgetsContainer);

		this._registerDisplayListeners();
	}

	/**
	 * Notify the URL bar that the canonical URL (model.url) has changed and
	 * the display should be re-rendered — unless the user is currently
	 * editing, in which case we leave the typed text alone. Also keeps an
	 * open picker in sync with the new URL.
	 */
	refreshUrl(): void {
		const isEditing = !!this._picker.value || this._urlDisplay.ownerDocument.activeElement === this._urlDisplay;
		if (!isEditing) {
			this._renderUrl();
		}
		// Keep the placeholder in sync with host state (e.g. search enablement).
		this._urlDisplay.setAttribute('data-placeholder', this._placeholder);
		const picker = this._picker.value;
		if (picker) {
			picker.value = this._canonicalUrl;
		}
	}

	/**
	 * Optimistically render the given URL in the display while a navigation
	 * is in flight. Skipped if the user is currently editing (picker open or
	 * display focused) so we don't clobber their in-progress text.
	 */
	previewUrl(url: string): void {
		const isEditing = !!this._picker.value || this._urlDisplay.ownerDocument.activeElement === this._urlDisplay;
		if (!isEditing) {
			this._renderUrl(url);
		}
	}

	/**
	 * Focus the URL display without opening the picker. Used for implicit/auto
	 * focus (e.g. landing on a newly opened tab) where the user hasn't asked
	 * to edit the URL yet.
	 */
	focusUrlInput(): void {
		this._suppressFocusOpen = true;
		this._urlDisplay.focus();
		this._selectAll();
	}

	/**
	 * Open the URL editing picker. Used when the user explicitly asks to
	 * edit the URL (e.g. the "Focus URL Input" command / Ctrl+L).
	 */
	openUrlPicker(): void {
		this._openPicker();
	}

	clear(): void {
		this._renderUrl();
		this._picker.value?.hide();
	}

	mountContributions(contributions: readonly BrowserEditorContribution[]): void {
		const preUrl: IBrowserEditorWidget[] = [];
		const postUrl: IBrowserEditorWidget[] = [];
		for (const contribution of contributions) {
			for (const widget of contribution.widgets) {
				if (widget.location === BrowserWidgetLocation.PreUrl) {
					preUrl.push(widget);
				} else if (widget.location === BrowserWidgetLocation.PostUrl) {
					postUrl.push(widget);
				}
			}
			for (const renderer of contribution.urlRenderers) {
				this._urlRenderers.push(renderer);
				this._register(renderer.onDidChange(() => this._renderUrl()));
			}
			this._suggestionProviders.push(...contribution.urlSuggestionProviders);
			this._pickerActionProviders.push(...contribution.urlPickerActionProviders);
		}
		for (const widget of preUrl.sort((a, b) => a.order - b.order)) {
			this._preUrlWidgetsContainer.appendChild(widget.element);
		}
		for (const widget of postUrl.sort((a, b) => a.order - b.order)) {
			this._urlBarWidgetsContainer.appendChild(widget.element);
		}
		this._suggestionProviders.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
		this._pickerActionProviders.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
		this._renderUrl();
	}

	/** The canonical URL: model.url if attached, else the input's initial URL. */
	private get _canonicalUrl(): string {
		return this._host.input?.url ?? '';
	}

	/** Placeholder text for the display and picker (host-provided or default). */
	private get _placeholder(): string {
		return this._host.getPlaceholder?.() ?? localize('browser.urlPlaceholder', "Enter a URL");
	}

	private _registerDisplayListeners(): void {
		// Display interaction state machine:
		//   - Keyboard focus (Tab) opens the picker immediately.
		//   - Mouse focus defers the decision to `click` so drag-select can complete.
		//   - Already-focused clicks open the picker through the same `click` handler
		//     (carrying the click's caret position into the picker).
		//   - Typing into the display promotes the edit into the picker via `input`.
		let pendingMouseFocus = false;
		this._register(addDisposableListener(this._urlDisplay, EventType.MOUSE_DOWN, () => {
			if (this._urlDisplay.ownerDocument.activeElement !== this._urlDisplay) {
				pendingMouseFocus = true;
			}
		}));
		this._register(addDisposableListener(this._urlDisplay, EventType.FOCUS, () => {
			if (this._suppressFocusOpen) {
				this._suppressFocusOpen = false;
				pendingMouseFocus = false;
				return;
			}
			if (pendingMouseFocus) {
				return;
			}
			this._openPicker();
		}));
		this._register(addDisposableListener(this._urlDisplay, EventType.BLUR, () => {
			pendingMouseFocus = false;
			// Snap the display back to the start of the URL so it doesn't stay
			// scrolled to wherever the caret was (e.g. after arrow-keying to
			// the end and then clicking away).
			this._urlDisplay.scrollLeft = 0;
			// Clear any text selection within the display so it doesn't stay
			// highlighted after focus moves away (e.g. into the browser).
			const sel = this._urlDisplay.ownerDocument.getSelection();
			if (sel && sel.anchorNode && this._urlDisplay.contains(sel.anchorNode)) {
				sel.removeAllRanges();
			}
			// If the picker is open it owns the value; leave the display alone.
			if (this._picker.value) {
				return;
			}
			// One-shot bypass after an Enter-commit on the display: keep the
			// typed value visible until the navigation commits.
			if (this._suppressBlurRevert) {
				this._suppressBlurRevert = false;
				return;
			}
			// User left the URL bar without navigating; discard any in-progress
			// edit and snap back to the canonical URL.
			if ((this._urlDisplay.textContent ?? '') !== this._canonicalUrl) {
				this._renderUrl();
			}
		}));
		this._register(addDisposableListener(this._urlDisplay, EventType.CLICK, () => {
			pendingMouseFocus = false;
			// Preserve drag-selection so users can copy parts of the URL.
			const selection = this._urlDisplay.ownerDocument.getSelection();
			if (selection && !selection.isCollapsed && selection.anchorNode && this._urlDisplay.contains(selection.anchorNode)) {
				return;
			}
			// Click without a drag opens the picker with the URL fully
			// selected (matches browser URL-bar convention: click → ready to
			// retype the whole thing).
			const value = this._urlDisplay.textContent ?? '';
			this._openPicker({ value, selection: [0, value.length] });
		}));

		this._register(addDisposableListener(this._urlDisplay, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.Enter) {
				// Prevent contenteditable from inserting a newline.
				e.preventDefault();
				const value = this._urlDisplay.textContent?.trim() ?? '';
				if (value) {
					// Suppress the next BLUR-revert: the user committed to
					// this value, so we don't want it discarded just because
					// `model.url` won't catch up until navigation commits.
					this._suppressBlurRevert = true;
					this._navigateText(value);
					this._host.ensureBrowserFocus();
				}
				return;
			}
			if (event.keyCode === KeyCode.Escape) {
				e.preventDefault();
				this._renderUrl(); // revert any in-progress edit
				this._host.ensureBrowserFocus();
				return;
			}
			// The workbench captures Ctrl/Cmd+A as a global command before
			// contenteditable can handle it, so do select-all ourselves.
			if (event.keyCode === KeyCode.KeyA && (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
				e.preventDefault();
				event.stopPropagation();
				this._selectAll();
				return;
			}
		}));

		// Any direct edit promotes to the picker, carrying the value and caret.
		this._register(addDisposableListener(this._urlDisplay, 'input', () => {
			if (this._picker.value) {
				return;
			}
			const value = this._urlDisplay.textContent ?? '';
			const caret = this._getCaretOffset();
			this._openPicker({ value, selection: [caret, caret] });
		}));
	}

	private _selectAll(): void {
		const doc = this._urlDisplay.ownerDocument;
		const sel = doc.getSelection();
		if (!sel) {
			return;
		}
		const range = doc.createRange();
		range.selectNodeContents(this._urlDisplay);
		sel.removeAllRanges();
		sel.addRange(range);
	}

	/** Character offset of the selection start within the display's text. */
	private _getCaretOffset(): number {
		const doc = this._urlDisplay.ownerDocument;
		const sel = doc.getSelection();
		const total = this._urlDisplay.textContent?.length ?? 0;
		if (!sel || sel.rangeCount === 0) {
			return total;
		}
		const range = sel.getRangeAt(0);
		if (!this._urlDisplay.contains(range.startContainer)) {
			return total;
		}
		const pre = doc.createRange();
		pre.selectNodeContents(this._urlDisplay);
		pre.setEnd(range.startContainer, range.startOffset);
		return pre.toString().length;
	}

	/** Place the selection at the given character range within the display. */
	private _setSelection(start: number, end: number, direction: 'forward' | 'backward' = 'forward'): void {
		const doc = this._urlDisplay.ownerDocument;
		const sel = doc.getSelection();
		if (!sel) {
			return;
		}
		const total = this._urlDisplay.textContent?.length ?? 0;
		const s = Math.max(0, Math.min(start, total));
		const e = Math.max(0, Math.min(end, total));
		const startPos = this._offsetToPosition(s);
		const endPos = this._offsetToPosition(e);
		if (direction === 'backward') {
			sel.setBaseAndExtent(endPos.node, endPos.offset, startPos.node, startPos.offset);
		} else {
			sel.setBaseAndExtent(startPos.node, startPos.offset, endPos.node, endPos.offset);
		}
	}

	/** Walks the display's text nodes to map a character offset to a (node, offset) DOM position. */
	private _offsetToPosition(offset: number): { node: Node; offset: number } {
		const walker = this._urlDisplay.ownerDocument.createTreeWalker(this._urlDisplay, NodeFilter.SHOW_TEXT);
		let remaining = offset;
		let lastNode: Text | null = null;
		for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
			lastNode = node;
			if (remaining <= node.data.length) {
				return { node, offset: remaining };
			}
			remaining -= node.data.length;
		}
		if (lastNode) {
			return { node: lastNode, offset: lastNode.data.length };
		}
		return { node: this._urlDisplay, offset: 0 };
	}

	/**
	 * Render the given URL (defaults to the canonical URL from the model)
	 * into the display. URL renderers are given a chance to decorate it
	 * (e.g. red strikethrough on `https:` for cert errors); the first one to
	 * claim the render wins. Passing an override lets callers preview an
	 * in-progress edit (e.g. the picker mirroring its typed value).
	 */
	private _renderUrl(override?: string): void {
		const url = override ?? this._canonicalUrl;

		this._urlDisplay.textContent = '';

		for (const renderer of this._urlRenderers) {
			if (renderer.render(url, this._urlDisplay)) {
				return;
			}
		}

		if (url) {
			this._urlDisplay.textContent = url;
		}
		// When empty, leave textContent blank; CSS `:empty::before` shows the placeholder.
	}

	/**
	 * Build the synchronous primary picker item(s) for the current value: the
	 * host's contextual items (e.g. Search and/or Go to), or a plain
	 * "Go to <value>" fallback. Provider-contributed suggestions are loaded
	 * asynchronously by {@link _loadProviderSuggestions} and appended below.
	 */
	private _buildSuggestionItems(value: string): (IUrlPickerItem | IQuickPickSeparator)[] {
		const items: (IUrlPickerItem | IQuickPickSeparator)[] = [];
		const trimmed = value.trim();
		if (trimmed) {
			const primaryItems = this._host.getPrimaryActions?.(trimmed) ?? [];
			if (primaryItems.length > 0) {
				items.push(...primaryItems);
			} else {
				items.push({
					id: trimmed,
					label: localize('browser.goTo', "Go to {0}", trimmed),
					iconClass: ThemeIcon.asClassName(Codicon.arrowRight),
				});
			}
		}
		return items;
	}

	/**
	 * Navigate from raw text the user committed directly (e.g. Enter on the
	 * display, or accepting with no suggestion selected). Routes through the
	 * host's default primary item so search-vs-URL resolution stays in the nav
	 * bar; falls back to navigating the text as a URL when the host has no
	 * primary items.
	 */
	private _navigateText(text: string): void {
		const input = this._host.input;
		const trimmed = text.trim();
		if (!trimmed || !input) {
			return;
		}
		const primaryItems = this._host.getPrimaryActions?.(trimmed);
		const defaultItem = primaryItems?.[0];
		if (defaultItem?.apply) {
			void Promise.resolve(defaultItem.apply(input));
		} else {
			input.navigate(trimmed);
		}
	}

	/** Convert a provider suggestion to its picker-item representation. */
	private _toPickerItem(s: IBrowserUrlSuggestion): IUrlPickerItem {
		const item: IUrlPickerItem = {
			id: s.id,
			label: s.label,
			description: s.description,
			apply: s.apply,
		};
		if (s.iconPath) {
			item.iconPath = s.iconPath;
		} else if (s.icon) {
			item.iconClass = ThemeIcon.asClassName(s.icon);
		}
		if (s.actions && s.actions.length > 0) {
			// Per-item buttons. We pass the action objects through directly
			// so onDidTriggerItemButton hands them back to us as the IBrowserUrlSuggestionAction.
			item.buttons = s.actions;
		}
		return item;
	}

	/**
	 * Open the URL editing picker anchored to the URL container. While open,
	 * the display is hidden (visibility:hidden, to preserve layout) so only
	 * the picker is visible.
	 *
	 * @param initial If provided, the picker opens with this value and caret
	 * selection instead of the current URL (which is shown fully selected).
	 * Used to carry an in-progress edit from the display into the picker.
	 */
	private _openPicker(initial?: { value: string; selection: [number, number] }): void {
		if (this._picker.value) {
			return;
		}

		// Hide the display while the picker is the editing UI (visibility:hidden
		// keeps the navbar layout stable while the picker overlays).
		this._urlDisplay.style.visibility = 'hidden';

		const picker = this._quickInputService.createQuickPick<IUrlPickerItem>({ useSeparators: true });
		picker.placeholder = this._placeholder;
		picker.ignoreFocusOut = false;
		// Preserve the order produced by _buildSuggestionItems (Go to first, then
		// tabs in known-view order) so the "Go to" entry is always the picker's
		// natural active item and tab entries are never auto-selected.
		picker.sortByLabel = false;
		picker.matchOnDescription = true;
		picker.anchor = this.element;
		picker.anchorPosition = 'overlay';
		if (initial !== undefined) {
			picker.value = initial.value;
			picker.valueSelection = initial.selection;
		} else {
			picker.value = this._canonicalUrl;
			picker.valueSelection = [0, this._canonicalUrl.length];
		}
		const disposables = new DisposableStore();

		// Each provider keeps its own cached suggestions + cancellation so a
		// single provider's onDidChange (or a per-provider re-fetch) updates
		// just that group, without recomputing the rest. Cancellation tokens
		// (not just disposal) are needed so an in-flight `.then` for the
		// previous request doesn't overwrite newer cached results.
		type ProviderState = {
			suggestions: readonly IBrowserUrlSuggestion[];
			cts: MutableDisposable<CancellationTokenSource>;
		};
		const providerStates = new Map<IBrowserUrlSuggestionProvider, ProviderState>();
		// Register the cancellation hook before the per-provider MutableDisposables
		// so it runs first on picker close. `CancellationTokenSource.dispose()`
		// only releases internal state — it does NOT cancel — so without this,
		// in-flight provider requests would keep running after the picker is gone.
		disposables.add(toDisposable(() => {
			for (const state of providerStates.values()) {
				state.cts.value?.cancel();
			}
		}));
		for (const provider of this._suggestionProviders) {
			providerStates.set(provider, {
				suggestions: [],
				cts: disposables.add(new MutableDisposable<CancellationTokenSource>()),
			});
		}

		let currentValue = picker.value;

		// Rebuild `picker.items` from the synchronous "Go to" entry plus each
		// provider's current cached suggestions, in provider sort order.
		//
		// `preserveSelection` distinguishes the two re-render triggers:
		//  - User typing (`false`): reset the active item to the default
		//    "Go to" entry. Starting/continuing a query should always default
		//    back to "Go to" rather than sticking on a streamed-in suggestion.
		//  - Background provider refresh (`true`): keep the user's current
		//    selection (e.g. an arrow-keyed suggestion) so updating one
		//    provider's results (a tab opening/closing) doesn't yank focus
		//    back to "Go to".
		//
		// The active item is set explicitly rather than relying on the quick
		// pick's implicit first-row selection, which can otherwise land on a
		// suggestion as asynchronous results stream in.
		const render = (preserveSelection: boolean) => {
			const previousActiveId = preserveSelection ? picker.activeItems[0]?.id : undefined;
			const defaultItems = this._buildSuggestionItems(currentValue);
			const items: (IUrlPickerItem | IQuickPickSeparator)[] = [...defaultItems];
			for (const provider of this._suggestionProviders) {
				const state = providerStates.get(provider);
				if (!state || state.suggestions.length === 0) {
					continue;
				}
				if (provider.label) {
					// `buttons: []` opts the separator into being rendered as
					// its own row (a separator without buttons is otherwise
					// collapsed into the first item below it as a header).
					items.push({
						type: 'separator',
						label: provider.label,
						description: provider.description,
						buttons: provider.actions,
					});
				}
				for (const s of state.suggestions) {
					items.push(this._toPickerItem(s));
				}
			}
			picker.items = items;

			// Only the synchronous items from `_buildSuggestionItems` (e.g. the
			// "Go to" entry) are eligible for default focus; provider suggestions
			// are never auto-focused. Restore the prior selection on a background
			// refresh; otherwise (typing, or the prior item disappeared) fall back
			// to the first default item, or to nothing when there are none.
			const defaultActive = defaultItems.find((i): i is IUrlPickerItem => i.type !== 'separator');
			const restored = previousActiveId !== undefined
				? items.find((i): i is IUrlPickerItem => i.type !== 'separator' && i.id === previousActiveId)
				: undefined;
			const active = restored ?? defaultActive;
			picker.activeItems = active ? [active] : [];
		};

		// Re-fetch a single provider against the current value, cancelling
		// any in-flight request for it. On success, update its cached
		// suggestions and re-render. Errors are swallowed (leave prior
		// cached results in place) so one failing provider can't blank the
		// picker.
		const refreshProvider = (provider: IBrowserUrlSuggestionProvider) => {
			const state = providerStates.get(provider);
			const input = this._host.input;
			if (!state || !input) {
				return;
			}
			state.cts.value?.cancel();
			const cts = new CancellationTokenSource();
			state.cts.value = cts;
			void provider.getSuggestions({ text: currentValue, input }, cts.token).then(
				results => {
					if (cts.token.isCancellationRequested || this._picker.value !== picker) {
						return;
					}
					state.suggestions = results;
					render(true);
				},
				() => { /* keep prior cached suggestions on error */ }
			);
		};

		const refreshAllProviders = () => {
			for (const provider of this._suggestionProviders) {
				refreshProvider(provider);
			}
		};

		render(false);
		refreshAllProviders();

		// Per-provider state change: refresh only that provider so unrelated
		// groups keep their cached suggestions and selection.
		for (const provider of this._suggestionProviders) {
			if (provider.onDidChange) {
				disposables.add(provider.onDidChange(() => refreshProvider(provider)));
			}
		}

		// Capture the picker's selection just before it hides so we can restore it
		// on the display when focus returns there (e.g. Escape).
		let selectionAtHide: { start: number; end: number; direction: 'forward' | 'backward' } | undefined;
		disposables.add(picker.onWillHide(() => {
			const active = this._urlDisplay.ownerDocument.activeElement;
			if (isHTMLInputElement(active) && active.selectionStart !== null && active.selectionEnd !== null) {
				selectionAtHide = {
					start: active.selectionStart,
					end: active.selectionEnd,
					direction: active.selectionDirection === 'backward' ? 'backward' : 'forward',
				};
			}
		}));
		disposables.add(picker.onDidChangeValue(value => {
			currentValue = value;
			render(false);
			refreshAllProviders();
			// Mirror the picker's typed value into the display continuously,
			// running URL renderers so decorations stay live. The picker is
			// the source of truth while it's open.
			this._renderUrl(value);
		}));

		// Mount provider-contributed picker actions.
		// Re-build buttons whenever any provider reports a state change so
		// dynamic actions (toggles, conditional buttons) stay in sync.
		const refreshButtons = () => {
			const input = this._host.input;
			if (!input) {
				picker.buttons = [];
				return;
			}
			const buttons: IBrowserUrlPickerAction[] = [];
			for (const provider of this._pickerActionProviders) {
				buttons.push(...provider.getActions(input));
			}
			picker.buttons = buttons;
		};
		refreshButtons();
		for (const provider of this._pickerActionProviders) {
			if (provider.onDidChange) {
				disposables.add(provider.onDidChange(refreshButtons));
			}
		}
		// Track whether an action was taken inside the picker (accept / button
		// click). On hide we use this to decide between "persist the typed
		// value to the display" (no action — user dismissed mid-edit) and
		// "let the canonical URL stand" (action ran — either a navigation
		// preemptively rendered the destination, or a button mutated state).
		let actionTaken = false;
		disposables.add(picker.onDidTriggerButton(button => {
			actionTaken = true;
			const action = button as IBrowserUrlPickerAction;
			const input = this._host.input;
			if (typeof action.run === 'function' && input) {
				void Promise.resolve(action.run(input));
			}
		}));

		// Per-item button. We attached the IBrowserUrlSuggestionAction directly
		// as the picker button, so the event hands it back to us by reference.
		// Unlike onDidTriggerButton this does NOT count as "the user accepted the suggestion"
		// — the picker stays open and the action runs in-place.
		disposables.add(picker.onDidTriggerItemButton(({ button }) => {
			const action = button as IBrowserUrlSuggestionAction;
			const input = this._host.input;
			if (typeof action.run === 'function' && input) {
				void Promise.resolve(action.run(input));
			}
		}));
		// Per-group separator button. Routed the same way as per-item buttons
		// (the IBrowserUrlSuggestionAction was attached directly to the separator).
		disposables.add(picker.onDidTriggerSeparatorButton(({ button }) => {
			const action = button as IBrowserUrlSuggestionAction;
			const input = this._host.input;
			if (typeof action.run === 'function' && input) {
				void Promise.resolve(action.run(input));
			}
		}));
		disposables.add(picker.onDidAccept(() => {
			actionTaken = true;
			const active = picker.activeItems[0];
			const fallbackUrl = picker.value;
			const input = this._host.input;
			picker.hide();
			if (active?.apply) {
				if (input) {
					void Promise.resolve(active.apply(input));
				}
				return;
			}
			this._navigateText(active?.id ?? fallbackUrl);
		}));
		disposables.add(picker.onDidHide(({ reason }) => {
			this._urlDisplay.style.visibility = '';
			// Decide whether to keep the user in the URL bar (refocus the
			// display so they can keep editing) or release it. We only keep
			// it for a plain dismissal (e.g. Escape): not when an action ran
			// (navigation/button), not when the user focused elsewhere
			// (Blur), and not when another picker took over (replaced).
			const replaced = this._quickInputService.currentQuickInput !== undefined
				&& this._quickInputService.currentQuickInput !== picker;
			const refocusDisplay = !actionTaken && reason !== QuickInputHideReason.Blur && !replaced;

			if (refocusDisplay) {
				// Preserve the in-progress edit + caret/selection so the
				// user can continue typing in the display.
				this._suppressFocusOpen = true;
				this._urlDisplay.focus();
				if (selectionAtHide !== undefined) {
					this._setSelection(selectionAtHide.start, selectionAtHide.end, selectionAtHide.direction);
				}
			} else {
				// The URL bar is being released — always show the canonical
				// URL (run renderers) so any in-progress mirror text doesn't
				// linger after focus has moved away.
				this._renderUrl();
				if (actionTaken) {
					// Move focus to the browser content so the user can
					// interact with the page.
					this._host.ensureBrowserFocus();
				} else if (replaced) {
					// When the replacement picker eventually hides, the
					// QuickInputController restores focus to the element that
					// was focused before our picker opened — usually the URL
					// display. Suppress the next FOCUS-driven picker reopen
					// so the URL picker doesn't auto-reopen on top of that
					// restoration.
					this._suppressFocusOpen = true;
				}
			}
			disposables.dispose();
			this._picker.clear();
		}));
		disposables.add(picker);

		this._picker.value = picker;
		picker.show();
	}
}
