/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Menu } from '../../../../base/browser/ui/menu/menu.js';
import { Action, Separator } from '../../../../base/common/actions.js';
import { Disposable, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { clamp } from '../../../../base/common/numbers.js';
import { autorun, constObservable, IObservable } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { editorSelectionBackground, editorSelectionForeground } from '../../../../platform/theme/common/colors/editorColors.js';
import { defaultMenuStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { FeedbackInputWidget } from '../../../browser/feedbackInputWidget.js';
import { IsSessionsWindowContext } from '../../../common/contextkeys.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IChatSideChatService } from '../common/chatSideChatService.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { ChatAgentLocation } from '../common/constants.js';
import { IChatWidget, IChatWidgetService, isChatContextMenuActionContext, isIChatResourceViewContext, isResponseSelectionSupported } from './chat.js';
import type { IChatWidgetContrib } from './widget/chatWidget.js';
import { IResolvedResponseSelection, resolveResponseSelection, resolveResponseSelectionFocus } from './responseSelectionResolver.js';

/**
 * Name of the CSS custom highlight that stands in for the native selection
 * once the browser collapses it.
 */
const selectionHighlightName = 'chat-response-selection';

export interface IResponseSelectionSideChatOptions {
	readonly useActionMenu: () => boolean;
	readonly showOnSelection?: boolean;
	readonly onAction?: (variant: 'askQuestionInput' | 'actionMenu', action: 'shown' | 'askQuestionOpened' | 'askQuestionSubmitted' | 'quote' | 'copy') => void;
}

// Highlight pseudo-elements inherit custom properties from the root element
// only, so they cannot see the `--vscode-*` theme variables (which are scoped
// to `.monaco-workbench`); the color has to be baked into the rule instead.
registerThemingParticipant((theme, collector) => {
	const background = theme.getColor(editorSelectionBackground);
	if (!background) {
		return;
	}
	// High contrast themes select with an opaque background and rely on the
	// paired foreground to keep the text readable.
	const foreground = theme.getColor(editorSelectionForeground);
	collector.addRule(`::highlight(${selectionHighlightName}) {
		background-color: ${background};
		${foreground ? `color: ${foreground};` : ''}
	}`);
});

/**
 * The highlight registry is per-window and shared by every chat view in it, so
 * all controllers contribute ranges to one registered {@link Highlight} rather
 * than overwriting each other's entry.
 */
function getSelectionHighlight(targetWindow: Window & typeof globalThis): Highlight | undefined {
	const registry = targetWindow.CSS?.highlights;
	if (!registry) {
		return undefined; // CSS Custom Highlight API unavailable
	}
	let highlight = registry.get(selectionHighlightName);
	if (!highlight) {
		highlight = new targetWindow.Highlight();
		registry.set(selectionHighlightName, highlight);
	}
	return highlight;
}

function getVisibleFocusRect(range: Range, focusEdge: IResolvedResponseSelection['focusEdge']): { top: number; bottom: number; left: number } | undefined {
	if (range.collapsed || range.startContainer.nodeType !== Node.TEXT_NODE || !range.startContainer.isConnected) {
		return undefined;
	}
	const characterRect = Array.from(range.getClientRects()).find(rect => rect.height > 0) ?? range.getBoundingClientRect();
	if (!characterRect.height) {
		return undefined;
	}
	return {
		top: characterRect.top,
		bottom: characterRect.bottom,
		left: focusEdge === 'left' ? characterRect.left : characterRect.right,
	};
}

/**
 * Owns actions and an anchored question input for text selected within one assistant response.
 */
export class ResponseSelectionSideChatController extends Disposable {

	private readonly _input: FeedbackInputWidget;
	private readonly _menuDomNode: HTMLElement;
	private readonly _menu: Menu;
	private readonly _askQuestionAction: Action;
	private readonly _quoteAction: Action;
	private readonly _chatInteractivity = this._register(new MutableDisposable());
	private readonly _selectionChangeScheduler: dom.AnimationFrameScheduler;
	private _pointerSelectionId: number | undefined;
	private _pointerSelectionChanged = false;
	private _verticalPlacement: 'above' | 'below' | undefined;
	private _lastFocusRect: { top: number; bottom: number; left: number } | undefined;
	private _lastTranscriptBounds: { top: number; bottom: number } | undefined;
	private _visibleSurface: 'input' | 'menu' | undefined;
	private _visibleVariant: 'askQuestionInput' | 'actionMenu' | undefined;
	private _resolved: IResolvedResponseSelection | undefined;
	/** Range currently painted via the CSS custom highlight, if any. */
	private _paintedRange: Range | undefined;
	/** Pins the transcript while a selection or the question input is active. */
	private readonly _autoScrollHold = this._register(new MutableDisposable<IDisposable>());
	private _chatResource: URI | undefined;
	private _isReadOnly: IObservable<boolean> = constObservable(true);
	/** Bumped on a genuine chat navigation/force-dismiss so a stale submission's completion/error handler can no-op. */
	private _generation = 0;

	constructor(
		private readonly _widget: IChatWidget,
		private readonly _responseSelectionSupported: boolean,
		private readonly _options: IResponseSelectionSideChatOptions,
		@IChatSideChatService private readonly _sideChatService: IChatSideChatService,
		@ILogService private readonly _logService: ILogService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
	) {
		super();

		this._selectionChangeScheduler = this._register(new dom.AnimationFrameScheduler(this._widget.domNode, () => this._applySelectionChange()));
		this._input = this._register(new FeedbackInputWidget({
			placeholder: localize('sessions.selectionSideChat.placeholder', "Ask Question"),
			ariaLabel: localize('sessions.selectionSideChat.ariaLabel', "Ask a question about the selected response text"),
			getMaxContentWidth: () => this._widget.domNode.clientWidth,
			primaryAction: {
				label: localize('sessions.selectionSideChat.ask', "Ask Question"),
				icon: Codicon.arrowUpCompact,
				keybindingLabel: localize('sessions.selectionSideChat.enter', "Enter"),
			},
		}));
		this._widget.domNode.appendChild(this._input.domNode);

		this._menuDomNode = dom.$('.context-view.chat-response-selection-menu');
		this._menuDomNode.style.position = 'absolute';
		this._menuDomNode.style.zIndex = '10000';
		this._menuDomNode.style.display = 'none';
		this._widget.domNode.appendChild(this._menuDomNode);

		this._askQuestionAction = this._register(new Action(
			'sessions.responseSelection.askWithBtw',
			localize('sessions.responseSelection.askWithBtw', "Ask in a Side Chat"),
			ThemeIcon.asClassName(Codicon.commentDiscussion),
			true,
			() => this._openQuestionInput(),
		));
		this._quoteAction = this._register(new Action(
			'sessions.responseSelection.quote',
			localize('sessions.responseSelection.quote', "Quote"),
			ThemeIcon.asClassName(Codicon.quote),
			false,
			() => this._quoteSelection(),
		));
		const copyAction = this._register(new Action(
			'sessions.responseSelection.copy',
			localize('sessions.responseSelection.copy', "Copy"),
			ThemeIcon.asClassName(Codicon.copy),
			true,
			() => this._copySelection(),
		));
		this._menu = this._register(new Menu(this._menuDomNode, [
			this._askQuestionAction,
			this._quoteAction,
			new Separator(),
			copyAction,
		], {
			ariaLabel: localize('sessions.responseSelection.menuAriaLabel', "Selected response text actions"),
		}, defaultMenuStyles));
		this._register(this._menu.onDidCancel(() => this._dismiss()));
		this._register(dom.addStandardDisposableListener(this._menuDomNode, 'mousedown', e => e.preventDefault()));

		this._register(this._input.onDidTriggerPrimary(() => this._submit()));
		this._register(dom.addStandardDisposableListener(this._input.inputElement, 'keydown', e => {
			if (e.keyCode === KeyCode.Escape) {
				e.preventDefault();
				e.stopPropagation();
				this._dismiss();
				return;
			}
			if (e.keyCode === KeyCode.Enter) {
				if (e.browserEvent.isComposing || e.shiftKey) {
					// Let IME composition finish, or Shift+Enter insert a newline.
					return;
				}
				e.preventDefault();
				e.stopPropagation();
				this._submit();
			}
		}));
		this._register(dom.addStandardDisposableListener(this._input.inputElement, 'keypress', e => {
			e.stopPropagation();
		}));
		this._register(dom.addStandardDisposableListener(this._input.inputElement, 'input', () => {
			this._input.autoSize();
			this._input.updateActionEnabled();
			this._reposition(true, false);
		}));

		const window = dom.getWindow(this._widget.domNode);
		this._register(dom.addDisposableListener(window.document, 'selectionchange', () => this._onSelectionChange()));
		this._register(dom.addDisposableListener(this._widget.transcriptDomNode, 'pointerdown', e => this._beginPointerSelection(e), true));
		this._register(dom.addDisposableListener(window, 'pointerup', e => this._finishPointerSelection(e.pointerId), true));
		this._register(dom.addDisposableListener(window, 'pointercancel', e => this._finishPointerSelection(e.pointerId), true));
		this._register(dom.addDisposableListener(window, 'blur', () => this._finishPointerSelection()));
		// The transcript is a virtualized list that scrolls by transform, so it
		// never fires a DOM scroll event; follow its own scroll event instead.
		// The capture-phase DOM listener additionally covers nested scrollers
		// (a scrollable code block within a response).
		this._register(this._widget.onDidScroll(() => this._reposition(true)));
		this._register(dom.addDisposableListener(this._widget.domNode, 'scroll', () => this._reposition(true), true));
		this._register(toDisposable(() => this._paintHighlight(undefined)));
		this._register(toDisposable(() => {
			this._generation++;
			this._input.domNode.remove();
			this._menuDomNode.remove();
		}));
		this._register(this._chatEntitlementService.onDidChangeSentiment(() => {
			if (this._chatEntitlementService.sentiment.hidden) {
				this._dismiss(true);
			}
		}));
	}

	/**
	 * Tracks which chat the current transcript belongs to, for side-chat
	 * creation. `ChatView` re-invokes this for the same chat on unrelated
	 * observable changes, so only force-dismiss on a genuine resource change.
	 */
	setChat(resource: URI | undefined, isReadOnly: IObservable<boolean>): void {
		const changedChat = !isEqual(this._chatResource, resource);
		this._chatResource = resource;
		this._isReadOnly = isReadOnly;
		this._chatInteractivity.value = autorun(reader => {
			this._quoteAction.enabled = !!resource && !isReadOnly.read(reader);
			this._askQuestionAction.enabled = this._canAskInSideChat();
			if (isReadOnly.read(reader) && this._visibleSurface === 'input') {
				this._dismiss(true);
			}
		});
		if (changedChat) {
			this._dismiss(true);
		}
	}

	private _beginPointerSelection(event: PointerEvent): void {
		if (event.button !== 0
			|| event.isPrimary === false
			|| this._input.isBusy) {
			return;
		}
		this._selectionChangeScheduler.cancel();
		this._pointerSelectionId = event.pointerId;
		this._pointerSelectionChanged = false;
	}

	private _finishPointerSelection(pointerId?: number): void {
		if (this._pointerSelectionId === undefined
			|| (pointerId !== undefined && this._pointerSelectionId !== pointerId)) {
			return;
		}
		this._pointerSelectionId = undefined;
		this._pointerSelectionChanged = false;
		this._selectionChangeScheduler.schedule();
	}

	private _onSelectionChange(): void {
		if (this._pointerSelectionId !== undefined) {
			this._updateAutoScrollHold();
			if (!this._pointerSelectionChanged && !this._hasAffordanceFocus()) {
				this._pointerSelectionChanged = true;
				this._dismiss();
			}
			return;
		}
		if (this._selectionChangeScheduler.isScheduled()) {
			this._updateAutoScrollHold();
			return;
		}
		this._applySelectionChange();
	}

	private _applySelectionChange(): void {
		// Reflect the new selection state first: every branch below (including
		// the early returns) needs the hold to match what is currently selected.
		this._updateAutoScrollHold();
		if (!this._responseSelectionSupported || !this._chatResource || this._chatEntitlementService.sentiment.hidden) {
			this._dismiss();
			return;
		}
		// The browser can collapse the document selection when focus moves into
		// the affordance. Keep the captured range until focus genuinely leaves.
		if (this._hasAffordanceFocus()) {
			this._syncHighlight();
			return;
		}
		// A pending submission owns the overlay until the view changes (see
		// `_dismiss`); don't let an incidental selection change reposition or
		// swap the captured selection out from under it.
		if (this._input.isBusy) {
			this._syncHighlight();
			return;
		}
		if (this._options.showOnSelection === false) {
			this._dismiss();
			return;
		}
		const resolved = resolveResponseSelection(this._widget);
		if (!resolved) {
			this._dismiss();
			return;
		}
		this._resolved = resolved;
		this._showFor();
	}

	/**
	 * Pins the transcript while the user is working with a selection: a growing
	 * response that scrolls itself to the bottom would otherwise drag the text
	 * out from under the selection (and the affordance anchored to it). Covers
	 * any selection in the transcript, not just ones that resolve to a single
	 * response, since auto-scrolling mid-drag is disruptive either way.
	 */
	private _updateAutoScrollHold(): void {
		const shouldHold = !!this._chatResource && (!!this._resolved || this._hasTranscriptSelection());
		if (shouldHold) {
			this._autoScrollHold.value ??= this._widget.holdAutoScroll();
		} else {
			this._autoScrollHold.clear();
		}
	}

	private _hasTranscriptSelection(): boolean {
		const selection = dom.getWindow(this._widget.domNode).getSelection();
		if (!selection || selection.isCollapsed || !selection.rangeCount || !selection.toString().trim()) {
			return false;
		}
		const range = selection.getRangeAt(0);
		// Scoped to the transcript specifically: selecting text elsewhere in the
		// chat view (a banner, the input) says nothing about wanting the
		// transcript to hold still.
		return this._widget.transcriptDomNode.contains(range.commonAncestorContainer);
	}

	/**
	 * Keeps the captured selection visible. The native selection disappears as
	 * soon as focus moves into the "Ask Question" input, so a CSS custom
	 * highlight takes over painting the range for as long as the affordance is
	 * open; while the native selection still covers it the browser paints it
	 * and the highlight stays off so the two never stack.
	 */
	private _syncHighlight(): void {
		const range = this._resolved?.range;
		const nativeSelection = dom.getWindow(this._widget.domNode).getSelection();
		const paintedNatively = !!nativeSelection && !nativeSelection.isCollapsed && !!nativeSelection.toString().trim();
		this._paintHighlight(range && !paintedNatively ? range : undefined);
	}

	private _paintHighlight(range: Range | undefined): void {
		if (this._paintedRange === range) {
			return;
		}
		const highlight = getSelectionHighlight(dom.getWindow(this._widget.domNode));
		if (!highlight) {
			return;
		}
		if (this._paintedRange) {
			highlight.delete(this._paintedRange);
		}
		if (range) {
			highlight.add(range);
		}
		this._paintedRange = range;
	}

	private _showFor(): void {
		const wasVisible = this._visibleSurface !== undefined;
		const variant = this._visibleVariant ?? this._getConfiguredVariant();
		this._visibleVariant = variant;
		this._askQuestionAction.enabled = this._canAskInSideChat();
		if ((variant === 'actionMenu' || !this._askQuestionAction.enabled) && this._visibleSurface !== 'input') {
			this._input.hide();
			this._menuDomNode.style.display = '';
			this._visibleSurface = 'menu';
		} else {
			this._menuDomNode.style.display = 'none';
			this._input.show();
			this._input.autoSize();
			this._input.updateActionEnabled();
			this._visibleSurface = 'input';
		}
		if (!wasVisible) {
			this._options.onAction?.(variant, 'shown');
		}
		this._syncHighlight();
		this._reposition();
	}

	private _openQuestionInput(): void {
		if (!this._resolved || !this._canAskInSideChat()) {
			return;
		}
		this._options.onAction?.(this._visibleVariant ?? this._getConfiguredVariant(), 'askQuestionOpened');
		this._menuDomNode.style.display = 'none';
		this._input.show();
		this._input.autoSize();
		this._input.updateActionEnabled();
		this._visibleSurface = 'input';
		this._reposition(true);
		this._input.inputElement.focus();
		this._syncHighlight();
	}

	openQuestionInput(selection: IResolvedResponseSelection): void {
		if (!this._responseSelectionSupported || !this._canAskInSideChat() || this._input.isBusy
			|| !isEqual(selection.response.sessionResource, this._chatResource) || !selection.range.startContainer.isConnected) {
			return;
		}
		this._resolved = selection;
		this._updateAutoScrollHold();
		this._openQuestionInput();
	}

	private _quoteSelection(): void {
		const resolved = this._resolved;
		if (!resolved || !this._chatResource || this._isReadOnly.get()) {
			return;
		}
		const variant = this._visibleVariant ?? this._getConfiguredVariant();
		const existingInput = this._widget.getInput();
		const separator = existingInput.length > 0 && !existingInput.endsWith('\n') ? '\n' : '';
		this._options.onAction?.(variant, 'quote');
		this._dismiss();
		this._widget.setInput(`${existingInput}${separator}${formatBlockquote(resolved.text)}`);
		this._widget.focusInput();
		status(localize('sessions.responseSelection.quoted', "Quoted selection inserted."));
	}

	private async _copySelection(): Promise<void> {
		const resolved = this._resolved;
		if (!resolved) {
			return;
		}
		const variant = this._visibleVariant ?? this._getConfiguredVariant();
		this._options.onAction?.(variant, 'copy');
		this._dismiss();
		try {
			await this._clipboardService.writeText(resolved.text);
			status(localize('sessions.responseSelection.copied', "Selected response text copied."));
		} catch (err) {
			this._logService.error('[responseSelection] Failed to copy selected response text', err);
			this._notificationService.error(localize('sessions.responseSelection.copyFailed', "The selected response text could not be copied."));
		}
	}

	private _getConfiguredVariant(): 'askQuestionInput' | 'actionMenu' {
		return this._options.useActionMenu() ? 'actionMenu' : 'askQuestionInput';
	}

	private _canAskInSideChat(): boolean {
		return !!this._chatResource && !this._isReadOnly.get()
			&& !this._chatEntitlementService.sentiment.hidden
			&& this._sideChatService.canAskInSideChat(this._chatResource);
	}

	private _hasAffordanceFocus(): boolean {
		return dom.isAncestorOfActiveElement(this._input.domNode) || dom.isAncestorOfActiveElement(this._menuDomNode);
	}

	/**
	 * Re-anchors the affordance to the (live) selection range. Called on every
	 * transcript scroll so the overlay tracks the text it belongs to instead of
	 * staying pinned where the selection used to be.
	 */
	private _reposition(preservePlacement = false, dismissIfAnchorMissing = true): void {
		let resolved = this._resolved;
		const surface = this._visibleSurface;
		if (!resolved || !surface) {
			return;
		}
		let focusRect = getVisibleFocusRect(resolved.focusRange, resolved.focusEdge);
		if (!focusRect) {
			// The transcript is virtualized, so scrolling far enough removes the
			// selected row. Removing a node re-homes any live range onto the
			// surviving parent, collapsing it, so the range still looks attached
			// but no longer covers anything. The anchored text cannot come back
			// — re-rendering builds new nodes — so dismiss rather than leave the
			// input pointing at nothing and the transcript pinned forever.
			const refreshedFocus = resolveResponseSelectionFocus(resolved.range, resolved.direction, this._widget.domNode);
			if (refreshedFocus) {
				resolved = this._resolved = { ...resolved, ...refreshedFocus };
				focusRect = getVisibleFocusRect(resolved.focusRange, resolved.focusEdge);
			}
			if (!focusRect) {
				if (dismissIfAnchorMissing) {
					this._dismiss();
				}
				return;
			}
		}
		const overlay = surface === 'menu' ? this._menuDomNode : this._input.domNode;
		overlay.style.display = '';

		// The overlay is a child of the widget, so its coordinates are relative
		// to that, but it is confined to the scrollable transcript: once the
		// selection scrolls past an edge the overlay parks at that edge instead
		// of drifting over the chat input or off the window.
		const originRect = this._widget.domNode.getBoundingClientRect();
		const bounds = this._transcriptBounds();
		const gap = 4;
		const overlayWidth = overlay.offsetWidth;
		const overlayHeight = overlay.offsetHeight;

		const minLeft = bounds.left - originRect.left;
		const maxLeft = Math.max(minLeft, minLeft + bounds.width - overlayWidth);
		const left = clamp(focusRect.left - originRect.left, minLeft, maxLeft);

		const minTop = bounds.top - originRect.top;
		const transcriptBottom = minTop + bounds.height;
		const maxTop = Math.max(minTop, transcriptBottom - overlayHeight);
		const aboveTop = focusRect.top - originRect.top - overlayHeight - gap;
		const belowTop = focusRect.bottom - originRect.top + gap;
		const preferBelow = resolved.direction === 'forward';
		const aboveFits = aboveTop >= minTop;
		const belowFits = belowTop <= maxTop;
		let placement = preservePlacement ? this._verticalPlacement : undefined;
		const focusMoved = !!this._lastFocusRect
			&& (Math.abs(this._lastFocusRect.top - focusRect.top) > 0.5
				|| Math.abs(this._lastFocusRect.bottom - focusRect.bottom) > 0.5
				|| Math.abs(this._lastFocusRect.left - focusRect.left) > 0.5);
		const transcriptBoundsMoved = !!this._lastTranscriptBounds
			&& (Math.abs(this._lastTranscriptBounds.top - minTop) > 0.5
				|| Math.abs(this._lastTranscriptBounds.bottom - transcriptBottom) > 0.5);
		if (preservePlacement && (focusMoved || transcriptBoundsMoved)) {
			placement = undefined;
		}
		placement ??= preferBelow
			? (belowFits || !aboveFits ? 'below' : 'above')
			: (aboveFits || !belowFits ? 'above' : 'below');
		this._verticalPlacement = placement;
		this._lastFocusRect = focusRect;
		this._lastTranscriptBounds = { top: minTop, bottom: transcriptBottom };
		const top = placement === 'below' ? belowTop : aboveTop;

		overlay.style.top = `${clamp(top, minTop, maxTop)}px`;
		overlay.style.left = `${left}px`;
	}

	/**
	 * Box the overlay is confined to, in viewport coordinates: the scrollable
	 * transcript, further clipped to the window so it can never render out of
	 * sight on a small window.
	 */
	private _transcriptBounds(): { top: number; left: number; width: number; height: number } {
		const rect = this._widget.transcriptDomNode.getBoundingClientRect();
		const viewport = dom.getWindow(this._widget.domNode);
		const top = Math.max(rect.top, 0);
		const left = Math.max(rect.left, 0);
		const bottom = Math.min(rect.top + rect.height, viewport.innerHeight);
		const right = Math.min(rect.left + rect.width, viewport.innerWidth);
		return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
	}

	/**
	 * Dismisses the input. While a submission is pending (`_input.isBusy`),
	 * only a genuine view change (`force`, from {@link setChat}) may dismiss
	 * it — outside interactions like Escape or selection invalidation must not
	 * race the in-flight create/open/send.
	 */
	private _dismiss(force = false): void {
		if (!force && this._input.isBusy) {
			return;
		}
		this._selectionChangeScheduler.cancel();
		if (force) {
			this._pointerSelectionId = undefined;
			this._pointerSelectionChanged = false;
			// A genuine navigation: bump the generation so a stale submission's completion/error handler no-ops.
			this._generation++;
		}
		const hadFocus = this._hasAffordanceFocus();
		this._resolved = undefined;
		this._paintHighlight(undefined);
		this._updateAutoScrollHold();
		this._input.setBusy(false);
		this._input.hide();
		this._menuDomNode.style.display = 'none';
		this._input.clearInput();
		this._visibleSurface = undefined;
		this._visibleVariant = undefined;
		this._verticalPlacement = undefined;
		this._lastFocusRect = undefined;
		this._lastTranscriptBounds = undefined;
		if (hadFocus) {
			// Hiding the focused affordance would otherwise leave focus stranded on
			// the body; return it to the transcript it was invoked from.
			this._widget.focusResponseItem(true);
		}
	}

	private _submit(): void {
		const resolved = this._resolved;
		const resource = this._chatResource;
		const query = this._input.inputElement.value.trim();
		if (!resolved || !resource || !query || this._input.isBusy) {
			return;
		}
		this._options.onAction?.(this._visibleVariant ?? this._getConfiguredVariant(), 'askQuestionSubmitted');

		if (!this._canAskInSideChat()) {
			this._notificationService.warn(localize('sessions.selectionSideChat.unsupported', "This conversation does not support side chats."));
			return;
		}

		// Keep the overlay visible with a busy state instead of eagerly
		// dismissing: opening the created side chat naturally dismisses it via
		// `setChat`; on failure the question and normal controls are restored
		// below so the user can retry.
		this._input.setBusy(true, localize('sessions.selectionSideChat.busy', "Asking question…"));
		this._reposition(true, false);
		const generation = this._generation;
		this._sideChatService.askInSideChat(resource, query, { text: resolved.text }, { sourceTurnId: resolved.response.requestId })
			.then(() => {
				// A stale completion after a genuine navigation force-dismissed this overlay must no-op.
				if (this._generation !== generation) {
					return;
				}
				this._dismiss(true);
			})
			.catch(err => {
				this._logService.error('[selectionSideChat] Failed to create side chat', err);
				if (this._generation !== generation) {
					return;
				}
				this._notificationService.error(localize('sessions.selectionSideChat.createFailed', "The side chat could not be created."));
				this._input.setBusy(false);
				this._input.inputElement.value = query;
				this._input.autoSize();
				this._input.updateActionEnabled();
				this._reposition(true, false);
				this._input.inputElement.focus();
			});
	}
}

/** Mounts the shared selection affordance on persistent editor-window chats. */
export class EditorResponseSelectionSideChatContribution extends Disposable implements IChatWidgetContrib {
	static readonly ID = 'chat.responseSelectionSideChat';
	readonly id = EditorResponseSelectionSideChatContribution.ID;
	private readonly _controller: ResponseSelectionSideChatController | undefined;

	constructor(
		widget: IChatWidget,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		if (environmentService.isSessionsWindow || widget.location !== ChatAgentLocation.Chat
			|| (isIChatResourceViewContext(widget.viewContext) && (widget.viewContext.isQuickChat || widget.viewContext.isInlineChat))) {
			return;
		}
		const controller = this._controller = this._register(instantiationService.createInstance(ResponseSelectionSideChatController, widget, isResponseSelectionSupported(), { useActionMenu: () => true, showOnSelection: false }));
		const bindModel = () => controller.setChat(widget.viewModel?.sessionResource, widget.viewModel?.model.isReadOnly ?? constObservable(true));
		this._register(widget.onDidChangeViewModel(bindModel));
		bindModel();
	}

	openQuestionInput(selection: IResolvedResponseSelection): void {
		this._controller?.openQuestionInput(selection);
	}
}

export class AskSelectionInSideChatAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.askSelectionInSideChat',
			title: localize2('chat.askInSideChat', "Ask in Side Chat..."),
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.readOnly.negate(), ChatContextKeys.chatSessionSupportsSideChat),
			menu: {
				id: MenuId.ChatContext,
				group: 'chat',
				when: ContextKeyExpr.and(IsSessionsWindowContext.negate(), ChatContextKeys.isResponse, ChatContextKeys.contextMenuHasResponseSelection),
			},
		});
	}

	run(accessor: ServicesAccessor, context: unknown): void {
		if (!isChatContextMenuActionContext(context) || !context.responseSelection) {
			return;
		}
		const selection = context.responseSelection;
		const widget = accessor.get(IChatWidgetService).getWidgetBySessionResource(selection.response.sessionResource);
		widget?.getContrib<EditorResponseSelectionSideChatContribution>(EditorResponseSelectionSideChatContribution.ID)?.openQuestionInput(selection);
	}
}

function formatBlockquote(text: string): string {
	return `${text.split('\n').map(line => `> ${line}`).join('\n')}\n\n`;
}
